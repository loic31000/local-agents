package training

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gorilla/mux"
	_ "github.com/lib/pq"
)

// ── Types ──────────────────────────────────────────────────────────────────────

type Dataset struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Type        string    `json:"type"`
	Format      string    `json:"format"`
	Samples     int       `json:"samples"`
	SizeBytes   int64     `json:"size_bytes"`
	Quality     string    `json:"quality"`
	FilePath    string    `json:"file_path,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
}

type TrainingJob struct {
	ID           string     `json:"id"`
	Name         string     `json:"name"`
	Status       string     `json:"status"`
	BaseModel    string     `json:"base_model"`
	Method       string     `json:"method"`
	DatasetID    *string    `json:"dataset_id"`
	DatasetName  string     `json:"dataset_name,omitempty"`
	Epochs       int        `json:"epochs"`
	BatchSize    int        `json:"batch_size"`
	LearningRate float64    `json:"learning_rate"`
	MaxLength    int        `json:"max_length"`
	Progress     int        `json:"progress"`
	OutputModel  *string    `json:"output_model"`
	LossFinal    *float64   `json:"loss_final"`
	ErrorMsg     *string    `json:"error_msg,omitempty"`
	GPUUsage     *float64   `json:"gpu_usage"`
	CreatedAt    time.Time  `json:"created_at"`
	StartedAt    *time.Time `json:"started_at"`
	CompletedAt  *time.Time `json:"completed_at"`
}

type TrainingLog struct {
	ID       string    `json:"id"`
	JobID    string    `json:"job_id"`
	Step     int       `json:"step"`
	Epoch    float64   `json:"epoch"`
	Loss     *float64  `json:"loss"`
	GradNorm *float64  `json:"grad_norm"`
	LR       *float64  `json:"lr"`
	LoggedAt time.Time `json:"logged_at"`
}

// ── API Handler ────────────────────────────────────────────────────────────────

type API struct {
	db      *sql.DB
	dataDir string // chemin vers training_data volume
}

func NewAPI(databaseURL, dataDir string) (*API, error) {
	db, err := sql.Open("postgres", databaseURL)
	if err != nil {
		return nil, fmt.Errorf("connexion PostgreSQL: %w", err)
	}
	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("ping PostgreSQL: %w", err)
	}
	// Créer le dossier de données si absent
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return nil, fmt.Errorf("création dataDir: %w", err)
	}
	return &API{db: db, dataDir: dataDir}, nil
}

func (a *API) RegisterRoutes(r *mux.Router) {
	// Datasets
	r.HandleFunc("/api/training/datasets", a.listDatasets).Methods("GET")
	r.HandleFunc("/api/training/datasets", a.uploadDataset).Methods("POST")
	r.HandleFunc("/api/training/datasets/{id}", a.deleteDataset).Methods("DELETE")
	// Jobs
	r.HandleFunc("/api/training/jobs", a.listJobs).Methods("GET")
	r.HandleFunc("/api/training/jobs", a.createJob).Methods("POST")
	r.HandleFunc("/api/training/jobs/{id}", a.getJob).Methods("GET")
	r.HandleFunc("/api/training/jobs/{id}/start", a.startJob).Methods("POST")
	r.HandleFunc("/api/training/jobs/{id}/cancel", a.cancelJob).Methods("POST")
	r.HandleFunc("/api/training/jobs/{id}/logs", a.getJobLogs).Methods("GET")
	// Stats
	r.HandleFunc("/api/training/stats", a.getStats).Methods("GET")
}

func jsonResponse(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

// ── Datasets ───────────────────────────────────────────────────────────────────

func (a *API) listDatasets(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.QueryContext(r.Context(), `
		SELECT id, name, description, type, format, samples, size_bytes, quality, COALESCE(file_path,''), created_at
		FROM datasets ORDER BY created_at DESC
	`)
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	defer rows.Close()

	datasets := []Dataset{}
	for rows.Next() {
		var d Dataset
		if err := rows.Scan(&d.ID, &d.Name, &d.Description, &d.Type, &d.Format,
			&d.Samples, &d.SizeBytes, &d.Quality, &d.FilePath, &d.CreatedAt); err != nil {
			continue
		}
		datasets = append(datasets, d)
	}
	jsonResponse(w, http.StatusOK, datasets)
}

func (a *API) uploadDataset(w http.ResponseWriter, r *http.Request) {
	// Limite 100MB
	r.ParseMultipartForm(100 << 20)

	file, header, err := r.FormFile("file")
	if err != nil {
		jsonResponse(w, http.StatusBadRequest, map[string]string{"error": "fichier manquant"})
		return
	}
	defer file.Close()

	name := r.FormValue("name")
	description := r.FormValue("description")
	dsType := r.FormValue("type")
	format := r.FormValue("format")

	if name == "" {
		name = strings.TrimSuffix(header.Filename, filepath.Ext(header.Filename))
	}
	if dsType == "" {
		dsType = "chat"
	}
	if format == "" {
		format = "jsonl"
	}

	// Sauvegarder le fichier
	dstPath := filepath.Join(a.dataDir, "datasets", header.Filename)
	if err := os.MkdirAll(filepath.Dir(dstPath), 0755); err != nil {
		jsonResponse(w, http.StatusInternalServerError, map[string]string{"error": "impossible de créer le dossier"})
		return
	}

	dst, err := os.Create(dstPath)
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	defer dst.Close()
	size, _ := io.Copy(dst, file)

	// Compter les lignes (samples)
	samples := countLines(dstPath)

	// Insérer en base
	var id string
	err = a.db.QueryRowContext(r.Context(), `
		INSERT INTO datasets (name, description, type, format, samples, size_bytes, quality, file_path)
		VALUES ($1, $2, $3, $4, $5, $6, 'medium', $7)
		ON CONFLICT (name) DO UPDATE SET
			samples=EXCLUDED.samples, size_bytes=EXCLUDED.size_bytes,
			file_path=EXCLUDED.file_path, updated_at=NOW()
		RETURNING id
	`, name, description, dsType, format, samples, size, dstPath).Scan(&id)
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	jsonResponse(w, http.StatusCreated, map[string]interface{}{
		"id": id, "name": name, "samples": samples, "size_bytes": size,
	})
}

func (a *API) deleteDataset(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	var filePath string
	a.db.QueryRowContext(r.Context(), `SELECT COALESCE(file_path,'') FROM datasets WHERE id=$1`, id).Scan(&filePath)
	a.db.ExecContext(r.Context(), `DELETE FROM datasets WHERE id=$1`, id)
	if filePath != "" {
		os.Remove(filePath)
	}
	jsonResponse(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// ── Jobs ───────────────────────────────────────────────────────────────────────

func (a *API) listJobs(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.QueryContext(r.Context(), `
		SELECT j.id, j.name, j.status, j.base_model, j.method,
			j.dataset_id, COALESCE(d.name,''), j.epochs, j.batch_size,
			j.learning_rate, j.max_length, j.progress,
			j.output_model, j.loss_final, j.error_msg,
			j.gpu_usage, j.created_at, j.started_at, j.completed_at
		FROM training_jobs j
		LEFT JOIN datasets d ON d.id = j.dataset_id
		ORDER BY j.created_at DESC
		LIMIT 50
	`)
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	defer rows.Close()

	jobs := []TrainingJob{}
	for rows.Next() {
		var j TrainingJob
		if err := rows.Scan(
			&j.ID, &j.Name, &j.Status, &j.BaseModel, &j.Method,
			&j.DatasetID, &j.DatasetName, &j.Epochs, &j.BatchSize,
			&j.LearningRate, &j.MaxLength, &j.Progress,
			&j.OutputModel, &j.LossFinal, &j.ErrorMsg,
			&j.GPUUsage, &j.CreatedAt, &j.StartedAt, &j.CompletedAt,
		); err != nil {
			continue
		}
		jobs = append(jobs, j)
	}
	jsonResponse(w, http.StatusOK, jobs)
}

func (a *API) createJob(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name         string  `json:"name"`
		BaseModel    string  `json:"base_model"`
		Method       string  `json:"method"`
		DatasetID    string  `json:"dataset_id"`
		Epochs       int     `json:"epochs"`
		BatchSize    int     `json:"batch_size"`
		LearningRate float64 `json:"learning_rate"`
		MaxLength    int     `json:"max_length"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonResponse(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	// Valeurs par défaut
	if req.Method == "" {
		req.Method = "qlora"
	}
	if req.Epochs == 0 {
		req.Epochs = 3
	}
	if req.BatchSize == 0 {
		req.BatchSize = 1
	}
	if req.LearningRate == 0 {
		req.LearningRate = 2e-4
	}
	if req.MaxLength == 0 {
		req.MaxLength = 512
	}
	if req.Name == "" {
		req.Name = fmt.Sprintf("Job %s", time.Now().Format("2006-01-02 15:04"))
	}

	var datasetID interface{} = nil
	if req.DatasetID != "" {
		datasetID = req.DatasetID
	}

	var id string
	err := a.db.QueryRowContext(r.Context(), `
		INSERT INTO training_jobs (name, base_model, method, dataset_id, epochs, batch_size, learning_rate, max_length)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id
	`, req.Name, req.BaseModel, req.Method, datasetID,
		req.Epochs, req.BatchSize, req.LearningRate, req.MaxLength,
	).Scan(&id)
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	jsonResponse(w, http.StatusCreated, map[string]interface{}{
		"id": id, "status": "pending", "name": req.Name,
	})
}

func (a *API) getJob(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	var j TrainingJob
	err := a.db.QueryRowContext(r.Context(), `
		SELECT j.id, j.name, j.status, j.base_model, j.method,
			j.dataset_id, COALESCE(d.name,''), j.epochs, j.batch_size,
			j.learning_rate, j.max_length, j.progress,
			j.output_model, j.loss_final, j.error_msg,
			j.gpu_usage, j.created_at, j.started_at, j.completed_at
		FROM training_jobs j
		LEFT JOIN datasets d ON d.id = j.dataset_id
		WHERE j.id = $1
	`, id).Scan(
		&j.ID, &j.Name, &j.Status, &j.BaseModel, &j.Method,
		&j.DatasetID, &j.DatasetName, &j.Epochs, &j.BatchSize,
		&j.LearningRate, &j.MaxLength, &j.Progress,
		&j.OutputModel, &j.LossFinal, &j.ErrorMsg,
		&j.GPUUsage, &j.CreatedAt, &j.StartedAt, &j.CompletedAt,
	)
	if err == sql.ErrNoRows {
		jsonResponse(w, http.StatusNotFound, map[string]string{"error": "job non trouvé"})
		return
	}
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	jsonResponse(w, http.StatusOK, j)
}

func (a *API) cancelJob(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	_, err := a.db.ExecContext(r.Context(), `
		UPDATE training_jobs SET status='cancelled', completed_at=NOW()
		WHERE id=$1 AND status IN ('pending','running')
	`, id)
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	jsonResponse(w, http.StatusOK, map[string]string{"status": "cancelled"})
}

func (a *API) getJobLogs(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	rows, err := a.db.QueryContext(r.Context(), `
		SELECT id, job_id, step, epoch, loss, grad_norm, lr, logged_at
		FROM training_logs WHERE job_id=$1 ORDER BY step ASC
	`, id)
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	defer rows.Close()

	logs := []TrainingLog{}
	for rows.Next() {
		var l TrainingLog
		if err := rows.Scan(&l.ID, &l.JobID, &l.Step, &l.Epoch, &l.Loss, &l.GradNorm, &l.LR, &l.LoggedAt); err != nil {
			continue
		}
		logs = append(logs, l)
	}
	jsonResponse(w, http.StatusOK, logs)
}

func (a *API) getStats(w http.ResponseWriter, r *http.Request) {
	var totalJobs, runningJobs, completedJobs, totalDatasets, totalSamples int
	a.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM training_jobs`).Scan(&totalJobs)
	a.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM training_jobs WHERE status='running'`).Scan(&runningJobs)
	a.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM training_jobs WHERE status='completed'`).Scan(&completedJobs)
	a.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM datasets`).Scan(&totalDatasets)
	a.db.QueryRowContext(r.Context(), `SELECT COALESCE(SUM(samples),0) FROM datasets`).Scan(&totalSamples)

	jsonResponse(w, http.StatusOK, map[string]interface{}{
		"total_jobs":     totalJobs,
		"running_jobs":   runningJobs,
		"completed_jobs": completedJobs,
		"total_datasets": totalDatasets,
		"total_samples":  totalSamples,
	})
}

// ── Utilitaires ────────────────────────────────────────────────────────────────

func countLines(path string) int {
	f, err := os.Open(path)
	if err != nil {
		return 0
	}
	defer f.Close()
	buf := make([]byte, 32*1024)
	count := 0
	for {
		n, err := f.Read(buf)
		for i := 0; i < n; i++ {
			if buf[i] == '\n' {
				count++
			}
		}
		if err != nil {
			break
		}
	}
	return count
}
