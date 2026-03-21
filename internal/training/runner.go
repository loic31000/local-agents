package training

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"sync"

	"github.com/gorilla/mux"
	"github.com/rs/zerolog/log"
)

// TrainEvent parsé depuis stdout du script Python
type TrainEvent struct {
	Event         string   `json:"event"`
	Step          int      `json:"step"`
	Loss          *float64 `json:"loss"`
	GradNorm      *float64 `json:"grad_norm"`
	LearningRate  *float64 `json:"learning_rate"`
	Epoch         float64  `json:"epoch"`
	Progress      int      `json:"progress"`
	OutputDir     string   `json:"output_dir"`
	Report        string   `json:"report"`
	Error         string   `json:"error"`
	NextBatchSize int      `json:"next_batch_size"`
	// Eval metrics
	EvalLoss     *float64 `json:"eval_loss"`
	EvalAccuracy *float64 `json:"eval_accuracy"`
	EvalF1       *float64 `json:"eval_f1"`
}

type Runner struct {
	db          *sql.DB
	dataDir     string
	dockerImage string
	dbURL       string
	// Live log streaming par job_id
	mu      sync.RWMutex
	streams map[string][]chan string
}

func NewRunner(db *sql.DB, dataDir, dbURL string) *Runner {
	return &Runner{
		db:          db,
		dataDir:     dataDir,
		dockerImage: "config-trainer",
		dbURL:       dbURL,
		streams:     make(map[string][]chan string),
	}
}

// hasGPU détecte si un GPU NVIDIA est disponible via Docker
func (r *Runner) hasGPU() bool {
	cmd := exec.Command("docker", "run", "--rm", "--gpus", "all",
		"--entrypoint", "nvidia-smi", "nvidia/cuda:12.3.0-base-ubuntu22.04")
	cmd.Stdout = io.Discard
	cmd.Stderr = io.Discard
	return cmd.Run() == nil
}

// hostDataDir retourne le chemin HOST du volume training_data
// (nécessaire pour docker run -v depuis l'intérieur d'un container)
func (r *Runner) hostDataDir() string {
	if h := os.Getenv("TRAINING_DATA_HOST_PATH"); h != "" {
		return h
	}
	return r.dataDir
}

func (r *Runner) broadcast(jobID, line string) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	for _, ch := range r.streams[jobID] {
		select {
		case ch <- line:
		default:
		}
	}
}

func (r *Runner) subscribe(jobID string) chan string {
	ch := make(chan string, 200)
	r.mu.Lock()
	r.streams[jobID] = append(r.streams[jobID], ch)
	r.mu.Unlock()
	return ch
}

func (r *Runner) unsubscribe(jobID string, ch chan string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	list := r.streams[jobID]
	for i, c := range list {
		if c == ch {
			r.streams[jobID] = append(list[:i], list[i+1:]...)
			break
		}
	}
	close(ch)
}

func (r *Runner) StartJob(ctx context.Context, jobID string) error {
	var name, baseModel, method string
	var epochs, batchSize, maxLength int
	var learningRate float64
	var datasetPath sql.NullString

	err := r.db.QueryRowContext(ctx, `
		SELECT j.name, j.base_model, j.method, j.epochs, j.batch_size,
			j.learning_rate, j.max_length, COALESCE(d.file_path,'')
		FROM training_jobs j LEFT JOIN datasets d ON d.id=j.dataset_id
		WHERE j.id=$1
	`, jobID).Scan(&name, &baseModel, &method, &epochs, &batchSize,
		&learningRate, &maxLength, &datasetPath)
	if err != nil {
		return fmt.Errorf("job non trouvé: %w", err)
	}
	_ = name
	_ = method

	// Chemins dans le container trainer
	outputDir := fmt.Sprintf("/app/training_data/models/%s", jobID)
	logsDir := fmt.Sprintf("/app/training_data/logs/%s", jobID)

	trainFile := "/data/dataset/train.jsonl"
	if datasetPath.Valid && datasetPath.String != "" {
		trainFile = "/app/training_data/datasets/" + jobID
	}

	hostPath := r.hostDataDir()
	useGPU := r.hasGPU()

	// Construction des arguments Docker
	args := []string{
		"run", "--rm",
		"--name", fmt.Sprintf("jarvis-trainer-%s", jobID[:8]),
		"-v", fmt.Sprintf("%s:/app/training_data", hostPath),
	}
	if useGPU {
		args = append(args, "--gpus", "all")
	}
	args = append(args,
		r.dockerImage,
		"--model-id", baseModel,
		"--output-dir", outputDir,
		"--train-file", trainFile,
		"--logs-dir", logsDir,
		"--epochs", fmt.Sprintf("%d", epochs),
		"--batch-size", fmt.Sprintf("%d", batchSize),
		"--learning-rate", fmt.Sprintf("%f", learningRate),
		"--max-length", fmt.Sprintf("%d", maxLength),
		"--device", "cpu",
	)
	if useGPU {
		args[len(args)-1] = "cuda" // remplace cpu par cuda
	}

	log.Info().Str("job_id", jobID).Str("model", baseModel).
		Bool("gpu", useGPU).Msg("Lancement du trainer")

	r.db.ExecContext(ctx, `
		UPDATE training_jobs SET status='running', started_at=NOW() WHERE id=$1
	`, jobID)

	go r.runAndMonitor(jobID, args, epochs)
	return nil
}

func (r *Runner) runAndMonitor(jobID string, dockerArgs []string, totalEpochs int) {
	ctx := context.Background()
	cmd := exec.CommandContext(ctx, "docker", dockerArgs...)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		r.markFailed(jobID, fmt.Sprintf("stdout pipe: %v", err))
		return
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		r.markFailed(jobID, fmt.Sprintf("stderr pipe: %v", err))
		return
	}

	if err := cmd.Start(); err != nil {
		r.markFailed(jobID, fmt.Sprintf("docker run: %v", err))
		return
	}

	// Lire stderr en live et broadcaster
	go func() {
		buf := make([]byte, 4096)
		var sb strings.Builder
		for {
			n, err := stderr.Read(buf)
			if n > 0 {
				chunk := string(buf[:n])
				sb.WriteString(chunk)
				// Broadcaster chaque ligne stderr
				for _, line := range strings.Split(chunk, "\n") {
					if line != "" {
						r.broadcast(jobID, `{"type":"stderr","line":`+
							jsonStr(line)+`}`)
					}
				}
			}
			if err != nil {
				break
			}
		}
		full := sb.String()
		if len(full) > 500 {
			full = full[:500]
		}
		if full != "" {
			log.Debug().Str("job_id", jobID).Str("stderr", full).Msg("Trainer stderr")
		}
	}()

	decoder := json.NewDecoder(stdout)
	for {
		var event TrainEvent
		if err := decoder.Decode(&event); err != nil {
			if err == io.EOF {
				break
			}
			continue
		}

		// Broadcaster l'event brut au frontend
		if raw, err := json.Marshal(event); err == nil {
			r.broadcast(jobID, string(raw))
		}

		switch event.Event {
		case "log":
			progress := 0
			if totalEpochs > 0 {
				progress = int(event.Epoch / float64(totalEpochs) * 100)
				if progress > 99 {
					progress = 99
				}
			}
			r.db.ExecContext(ctx,
				`UPDATE training_jobs SET progress=$1 WHERE id=$2`,
				progress, jobID)

			if event.Loss != nil {
				r.db.ExecContext(ctx, `
					INSERT INTO training_logs (job_id, step, epoch, loss, grad_norm, lr)
					VALUES ($1,$2,$3,$4,$5,$6)
					ON CONFLICT DO NOTHING
				`, jobID, event.Step, event.Epoch,
					event.Loss, event.GradNorm, event.LearningRate)
			}
			log.Debug().Str("job_id", jobID).
				Int("step", event.Step).
				Float64("epoch", event.Epoch).
				Msg("step")

		case "training_start":
			log.Info().Str("job_id", jobID).Msg("Entraînement démarré")

		case "eval":
			// Sauvegarder les métriques d'éval
			if event.EvalLoss != nil {
				r.db.ExecContext(ctx, `
					UPDATE training_jobs SET
						eval_loss=$1, eval_accuracy=$2, eval_f1=$3
					WHERE id=$4
				`, event.EvalLoss, event.EvalAccuracy, event.EvalF1, jobID)
			}

		case "complete":
			var lastLoss *float64
			r.db.QueryRowContext(ctx, `
				SELECT loss FROM training_logs WHERE job_id=$1 ORDER BY step DESC LIMIT 1
			`, jobID).Scan(&lastLoss)

			r.db.ExecContext(ctx, `
				UPDATE training_jobs SET
					status='completed', progress=100,
					output_model=$1, loss_final=$2, completed_at=NOW()
				WHERE id=$3
			`, event.OutputDir, lastLoss, jobID)
			log.Info().Str("job_id", jobID).
				Str("output", event.OutputDir).Msg("Job terminé ✓")

		case "training_error":
			r.markFailed(jobID, event.Error)

		case "oom_retry":
			log.Warn().Str("job_id", jobID).
				Int("next_batch", event.NextBatchSize).
				Msg("OOM — retry batch réduit")
			r.db.ExecContext(ctx,
				`UPDATE training_jobs SET batch_size=$1 WHERE id=$2`,
				event.NextBatchSize, jobID)
		}
	}

	if err := cmd.Wait(); err != nil {
		var status string
		r.db.QueryRowContext(ctx,
			`SELECT status FROM training_jobs WHERE id=$1`, jobID).Scan(&status)
		if status == "running" {
			r.markFailed(jobID, fmt.Sprintf("container exit: %v", err))
		}
	}
}

func (r *Runner) markFailed(jobID, errMsg string) {
	n := len(errMsg)
	if n > 500 {
		n = 500
	}
	log.Error().Str("job_id", jobID).Msg("Job échoué: " + errMsg[:n])
	r.db.Exec(`
		UPDATE training_jobs SET status='failed', error_msg=$1, completed_at=NOW()
		WHERE id=$2
	`, errMsg[:n], jobID)
	r.broadcast(jobID, fmt.Sprintf(`{"event":"failed","error":%s}`, jsonStr(errMsg[:n])))
}

// ── Handlers REST ─────────────────────────────────────────────────────────────

func (a *API) startJob(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	var status string
	err := a.db.QueryRowContext(r.Context(),
		`SELECT status FROM training_jobs WHERE id=$1`, id).Scan(&status)
	if err == sql.ErrNoRows {
		jsonResponse(w, http.StatusNotFound, map[string]string{"error": "job non trouvé"})
		return
	}
	if status != "pending" {
		jsonResponse(w, http.StatusBadRequest, map[string]string{
			"error": fmt.Sprintf("job en statut '%s', attendu 'pending'", status),
		})
		return
	}
	runner := NewRunner(a.db, a.dataDir, os.Getenv("DATABASE_URL"))
	if err := runner.StartJob(r.Context(), id); err != nil {
		jsonResponse(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	jsonResponse(w, http.StatusOK, map[string]interface{}{"job_id": id, "status": "running"})
}

// GET /api/training/jobs/{id}/logs — SSE live stream
func (a *API) streamLogs(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	runner := NewRunner(a.db, a.dataDir, os.Getenv("DATABASE_URL"))
	ch := runner.subscribe(id)
	defer runner.unsubscribe(id, ch)

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "SSE not supported", 500)
		return
	}

	for {
		select {
		case line, open := <-ch:
			if !open {
				return
			}
			fmt.Fprintf(w, "data: %s\n\n", line)
			flusher.Flush()
		case <-r.Context().Done():
			return
		}
	}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func jsonStr(s string) string {
	b, _ := json.Marshal(s)
	return string(b)
}
