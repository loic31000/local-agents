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
}

type Runner struct {
	db          *sql.DB
	dataDir     string
	dockerImage string
	dbURL       string
}

func NewRunner(db *sql.DB, dataDir, dbURL string) *Runner {
	return &Runner{db: db, dataDir: dataDir, dockerImage: "config-trainer", dbURL: dbURL}
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

	// Chemins dans le container
	outputDir := fmt.Sprintf("/app/training_data/models/%s", jobID)
	logsDir := fmt.Sprintf("/app/training_data/logs/%s", jobID)

	// dataset path dans le container
	trainFile := "/data/dataset/train.jsonl" // défaut intégré au script
	if datasetPath.Valid && datasetPath.String != "" {
		trainFile = "/app/training_data/datasets/" + jobID
	}

	args := []string{
		"run", "--rm",
		"--name", fmt.Sprintf("jarvis-trainer-%s", jobID[:8]),
		"-v", fmt.Sprintf("%s:/app/training_data", r.dataDir),
		r.dockerImage,
		"python", "-u", "scripts/train.py",
		"--model-id", baseModel,
		"--output-dir", outputDir,
		"--train-file", trainFile,
		"--logs-dir", logsDir,
		"--epochs", fmt.Sprintf("%d", epochs),
		"--batch-size", fmt.Sprintf("%d", batchSize),
		"--learning-rate", fmt.Sprintf("%f", learningRate),
		"--max-length", fmt.Sprintf("%d", maxLength),
	}

	log.Info().Str("job_id", jobID).Str("model", baseModel).Msg("Lancement du trainer")

	r.db.ExecContext(ctx, `UPDATE training_jobs SET status='running', started_at=NOW() WHERE id=$1`, jobID)

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

	go func() {
		buf, _ := io.ReadAll(stderr)
		if len(buf) > 0 {
			n := len(buf)
			if n > 500 {
				n = 500
			}
			log.Debug().Str("job_id", jobID).Str("stderr", string(buf[:n])).Msg("Trainer stderr")
		}
	}()

	stepCount := 0
	decoder := json.NewDecoder(stdout)
	for {
		var event TrainEvent
		if err := decoder.Decode(&event); err != nil {
			if err == io.EOF {
				break
			}
			continue // ligne non-JSON (tqdm, etc.)
		}

		switch event.Event {
		case "log":
			// Calculer progression approximative depuis epoch
			progress := 0
			if totalEpochs > 0 {
				progress = int(event.Epoch / float64(totalEpochs) * 100)
				if progress > 99 {
					progress = 99
				}
			}
			stepCount++
			r.db.ExecContext(ctx, `UPDATE training_jobs SET progress=$1 WHERE id=$2`, progress, jobID)

			// Insérer log en base
			if event.Loss != nil {
				r.db.ExecContext(ctx, `
					INSERT INTO training_logs (job_id, step, epoch, loss, grad_norm, lr)
					VALUES ($1,$2,$3,$4,$5,$6)
				`, jobID, event.Step, event.Epoch, event.Loss, event.GradNorm, event.LearningRate)
			}
			log.Debug().Str("job_id", jobID).Int("step", event.Step).
				Float64("epoch", event.Epoch).Msg("Training step")

		case "training_start":
			log.Info().Str("job_id", jobID).Msg("Entraînement démarré")

		case "complete":
			// Récupérer la dernière loss
			var lastLoss *float64
			row := r.db.QueryRowContext(ctx, `
				SELECT loss FROM training_logs WHERE job_id=$1 ORDER BY step DESC LIMIT 1
			`, jobID)
			row.Scan(&lastLoss)

			r.db.ExecContext(ctx, `
				UPDATE training_jobs SET
					status='completed', progress=100,
					output_model=$1, loss_final=$2, completed_at=NOW()
				WHERE id=$3
			`, event.OutputDir, lastLoss, jobID)
			log.Info().Str("job_id", jobID).Str("output", event.OutputDir).Msg("Job terminé ✓")

		case "training_error":
			r.markFailed(jobID, event.Error)

		case "oom_retry":
			log.Warn().Str("job_id", jobID).Int("next_batch", event.NextBatchSize).Msg("OOM — retry batch réduit")
		}
	}

	if err := cmd.Wait(); err != nil {
		var status string
		r.db.QueryRowContext(ctx, `SELECT status FROM training_jobs WHERE id=$1`, jobID).Scan(&status)
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
	r.db.Exec(`UPDATE training_jobs SET status='failed', error_msg=$1, completed_at=NOW() WHERE id=$2`,
		errMsg[:n], jobID)
}

// startJob — handler REST POST /api/training/jobs/{id}/start
func (a *API) startJob(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	var status string
	err := a.db.QueryRowContext(r.Context(), `SELECT status FROM training_jobs WHERE id=$1`, id).Scan(&status)
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
