package training

import (
	"bufio"
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

type ManualDatasetRow struct {
	Text  string `json:"text"`
	Label int    `json:"label"`
}

type ManualDatasetRequest struct {
	Name        string             `json:"name"`
	Description string             `json:"description"`
	Type        string             `json:"type"`
	Labels      []string           `json:"labels"`
	Rows        []ManualDatasetRow `json:"rows"`
}

type HFImportRequest struct {
	RepoID      string `json:"repo_id"`
	Split       string `json:"split"`
	TextField   string `json:"text_field"`
	LabelField  string `json:"label_field"`
	MaxSamples  int    `json:"max_samples"`
	Name        string `json:"name"`
	Description string `json:"description"`
}

type DiscordExportRequest struct {
	ChannelIDs  []string `json:"channel_ids"`
	MaxMessages int      `json:"max_messages"`
	AutoLabel   bool     `json:"auto_label"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
}

// ── API Handler ────────────────────────────────────────────────────────────────

type API struct {
	db      *sql.DB
	dataDir string
}

func NewAPI(databaseURL, dataDir string) (*API, error) {
	db, err := sql.Open("postgres", databaseURL)
	if err != nil {
		return nil, fmt.Errorf("connexion PostgreSQL: %w", err)
	}
	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("ping PostgreSQL: %w", err)
	}
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return nil, fmt.Errorf("création dataDir: %w", err)
	}
	return &API{db: db, dataDir: dataDir}, nil
}

func (a *API) RegisterRoutes(r *mux.Router) {
	// Datasets — routes statiques AVANT les routes avec {id}
	r.HandleFunc("/api/training/datasets/import-hf", a.importHuggingFace).Methods("POST")
	r.HandleFunc("/api/training/datasets/manual", a.createManualDataset).Methods("POST")
	r.HandleFunc("/api/training/datasets/discord-export", a.exportDiscordDataset).Methods("POST")
	r.HandleFunc("/api/training/datasets", a.listDatasets).Methods("GET")
	r.HandleFunc("/api/training/datasets", a.uploadDataset).Methods("POST")
	r.HandleFunc("/api/training/datasets/{id}", a.deleteDataset).Methods("DELETE")
	r.HandleFunc("/api/training/datasets/{id}/rows", a.getDatasetRows).Methods("GET")
	r.HandleFunc("/api/training/datasets/{id}/rows", a.appendDatasetRows).Methods("POST")
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
	samples := countLines(dstPath)

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

func (a *API) getDatasetRows(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	var filePath string
	if err := a.db.QueryRowContext(r.Context(), `SELECT COALESCE(file_path,'') FROM datasets WHERE id=$1`, id).Scan(&filePath); err != nil {
		jsonResponse(w, http.StatusNotFound, map[string]string{"error": "dataset non trouvé"})
		return
	}
	if filePath == "" {
		jsonResponse(w, http.StatusOK, []interface{}{})
		return
	}
	f, err := os.Open(filePath)
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	defer f.Close()

	var rows []map[string]interface{}
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.TrimSpace(line) == "" {
			continue
		}
		var row map[string]interface{}
		if err := json.Unmarshal([]byte(line), &row); err != nil {
			continue
		}
		if _, isMeta := row["_meta"]; isMeta {
			continue
		}
		rows = append(rows, row)
	}
	if rows == nil {
		rows = []map[string]interface{}{}
	}
	jsonResponse(w, http.StatusOK, rows)
}

func (a *API) appendDatasetRows(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	var rows []ManualDatasetRow
	if err := json.NewDecoder(r.Body).Decode(&rows); err != nil {
		jsonResponse(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	var filePath string
	if err := a.db.QueryRowContext(r.Context(), `SELECT COALESCE(file_path,'') FROM datasets WHERE id=$1`, id).Scan(&filePath); err != nil {
		jsonResponse(w, http.StatusNotFound, map[string]string{"error": "dataset non trouvé"})
		return
	}
	if filePath == "" {
		jsonResponse(w, http.StatusBadRequest, map[string]string{"error": "dataset sans fichier"})
		return
	}
	f, err := os.OpenFile(filePath, os.O_APPEND|os.O_WRONLY|os.O_CREATE, 0644)
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	defer f.Close()
	for _, row := range rows {
		record := map[string]interface{}{"text": row.Text, "label": row.Label}
		line, _ := json.Marshal(record)
		f.Write(line)
		f.WriteString("\n")
	}
	samples := countLines(filePath)
	info, _ := os.Stat(filePath)
	var sizeBytes int64
	if info != nil {
		sizeBytes = info.Size()
	}
	a.db.ExecContext(r.Context(), `UPDATE datasets SET samples=$1, size_bytes=$2 WHERE id=$3`, samples, sizeBytes, id)
	jsonResponse(w, http.StatusOK, map[string]interface{}{
		"id": id, "appended": len(rows), "total_samples": samples,
	})
}

func (a *API) createManualDataset(w http.ResponseWriter, r *http.Request) {
	var req ManualDatasetRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonResponse(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if req.Name == "" {
		jsonResponse(w, http.StatusBadRequest, map[string]string{"error": "name requis"})
		return
	}
	if len(req.Rows) == 0 {
		jsonResponse(w, http.StatusBadRequest, map[string]string{"error": "au moins une ligne requise"})
		return
	}
	if req.Type == "" {
		req.Type = "moderation"
	}

	dstPath := filepath.Join(a.dataDir, "datasets", req.Name+".jsonl")
	if err := os.MkdirAll(filepath.Dir(dstPath), 0755); err != nil {
		jsonResponse(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	dst, err := os.Create(dstPath)
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if len(req.Labels) > 0 {
		meta := map[string]interface{}{"_meta": true, "labels": req.Labels, "type": req.Type}
		line, _ := json.Marshal(meta)
		dst.Write(line)
		dst.WriteString("\n")
	}
	for _, row := range req.Rows {
		record := map[string]interface{}{"text": row.Text, "label": row.Label}
		line, _ := json.Marshal(record)
		dst.Write(line)
		dst.WriteString("\n")
	}
	dst.Close()

	info, _ := os.Stat(dstPath)
	var sizeBytes int64
	if info != nil {
		sizeBytes = info.Size()
	}

	var id string
	err = a.db.QueryRowContext(r.Context(), `
		INSERT INTO datasets (name, description, type, format, samples, size_bytes, quality, file_path)
		VALUES ($1, $2, $3, 'jsonl', $4, $5, 'high', $6)
		ON CONFLICT (name) DO UPDATE SET
			samples=EXCLUDED.samples, size_bytes=EXCLUDED.size_bytes,
			file_path=EXCLUDED.file_path, updated_at=NOW()
		RETURNING id
	`, req.Name, req.Description, req.Type, len(req.Rows), sizeBytes, dstPath).Scan(&id)
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	jsonResponse(w, http.StatusCreated, map[string]interface{}{
		"id": id, "name": req.Name, "samples": len(req.Rows), "size_bytes": sizeBytes,
	})
}

func (a *API) importHuggingFace(w http.ResponseWriter, r *http.Request) {
	var req HFImportRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonResponse(w, http.StatusBadRequest, map[string]string{"error": "JSON invalide: " + err.Error()})
		return
	}
	if req.RepoID == "" {
		jsonResponse(w, http.StatusBadRequest, map[string]string{"error": "repo_id requis"})
		return
	}
	if req.Split == "" {
		req.Split = "train"
	}
	if req.TextField == "" {
		req.TextField = "text"
	}
	if req.LabelField == "" {
		req.LabelField = "label"
	}
	if req.MaxSamples == 0 {
		req.MaxSamples = 2000
	}
	if req.Name == "" {
		req.Name = strings.ReplaceAll(req.RepoID, "/", "-") + "-" + req.Split
	}

	hfToken := os.Getenv("HF_TOKEN")
	apiURL := fmt.Sprintf(
		"https://datasets-server.huggingface.co/rows?dataset=%s&config=default&split=%s&offset=0&length=%d",
		req.RepoID, req.Split, req.MaxSamples,
	)
	httpReq, _ := http.NewRequestWithContext(r.Context(), "GET", apiURL, nil)
	if hfToken != "" {
		httpReq.Header.Set("Authorization", "Bearer "+hfToken)
	}

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		jsonResponse(w, http.StatusBadGateway, map[string]string{"error": "impossible de contacter HuggingFace: " + err.Error()})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		n := len(body)
		if n > 300 {
			n = 300
		}
		jsonResponse(w, http.StatusBadGateway, map[string]string{
			"error": fmt.Sprintf("HuggingFace API %d: %s", resp.StatusCode, string(body[:n])),
		})
		return
	}

	var hfResp struct {
		Rows []struct {
			Row map[string]interface{} `json:"row"`
		} `json:"rows"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&hfResp); err != nil {
		jsonResponse(w, http.StatusInternalServerError, map[string]string{"error": "parsing HF: " + err.Error()})
		return
	}

	dstPath := filepath.Join(a.dataDir, "datasets", req.Name+".jsonl")
	if err := os.MkdirAll(filepath.Dir(dstPath), 0755); err != nil {
		jsonResponse(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	dst, err := os.Create(dstPath)
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	samples := 0
	for _, row := range hfResp.Rows {
		textVal, ok := row.Row[req.TextField]
		if !ok {
			continue
		}
		text := fmt.Sprintf("%v", textVal)
		if strings.TrimSpace(text) == "" {
			continue
		}
		record := map[string]interface{}{"text": text}
		if labelVal, ok := row.Row[req.LabelField]; ok {
			record["label"] = labelVal
		}
		line, _ := json.Marshal(record)
		dst.Write(line)
		dst.WriteString("\n")
		samples++
	}
	dst.Close()

	info, _ := os.Stat(dstPath)
	var sizeBytes int64
	if info != nil {
		sizeBytes = info.Size()
	}

	var id string
	err = a.db.QueryRowContext(r.Context(), `
		INSERT INTO datasets (name, description, type, format, samples, size_bytes, quality, file_path)
		VALUES ($1, $2, 'hf_import', 'jsonl', $3, $4, 'medium', $5)
		ON CONFLICT (name) DO UPDATE SET
			samples=EXCLUDED.samples, size_bytes=EXCLUDED.size_bytes,
			file_path=EXCLUDED.file_path, updated_at=NOW()
		RETURNING id
	`, req.Name, req.Description, samples, sizeBytes, dstPath).Scan(&id)
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	jsonResponse(w, http.StatusCreated, map[string]interface{}{
		"id": id, "name": req.Name, "samples": samples,
		"size_bytes": sizeBytes, "source": req.RepoID,
	})
}

func (a *API) exportDiscordDataset(w http.ResponseWriter, r *http.Request) {
	var req DiscordExportRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonResponse(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if req.MaxMessages == 0 {
		req.MaxMessages = 1000
	}
	if req.Name == "" {
		req.Name = fmt.Sprintf("discord-export-%s", time.Now().Format("2006-01-02"))
	}

	rows, err := a.db.QueryContext(r.Context(), `
		SELECT COALESCE(message,''), COALESCE(response,''), COALESCE(agent_id,''), created_at
		FROM conversations
		ORDER BY created_at DESC
		LIMIT $1
	`, req.MaxMessages)
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, map[string]string{"error": "lecture conversations: " + err.Error()})
		return
	}
	defer rows.Close()

	dstPath := filepath.Join(a.dataDir, "datasets", req.Name+".jsonl")
	if err := os.MkdirAll(filepath.Dir(dstPath), 0755); err != nil {
		jsonResponse(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	dst, err := os.Create(dstPath)
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	samples := 0
	for rows.Next() {
		var message, response, agentID string
		var createdAt time.Time
		if err := rows.Scan(&message, &response, &agentID, &createdAt); err != nil {
			continue
		}
		if strings.TrimSpace(message) == "" {
			continue
		}
		record := map[string]interface{}{
			"instruction": message,
			"response":    response,
			"agent":       agentID,
			"timestamp":   createdAt.Format(time.RFC3339),
		}
		if req.AutoLabel {
			record["text"] = message
			record["label"] = 0
		}
		line, _ := json.Marshal(record)
		dst.Write(line)
		dst.WriteString("\n")
		samples++
	}
	dst.Close()

	if samples == 0 {
		os.Remove(dstPath)
		jsonResponse(w, http.StatusOK, map[string]interface{}{
			"samples": 0, "message": "Aucune conversation trouvée en base",
		})
		return
	}

	info, _ := os.Stat(dstPath)
	var sizeBytes int64
	if info != nil {
		sizeBytes = info.Size()
	}

	var id string
	err = a.db.QueryRowContext(r.Context(), `
		INSERT INTO datasets (name, description, type, format, samples, size_bytes, quality, file_path)
		VALUES ($1, $2, 'discord_export', 'jsonl', $3, $4, 'high', $5)
		ON CONFLICT (name) DO UPDATE SET
			samples=EXCLUDED.samples, size_bytes=EXCLUDED.size_bytes,
			file_path=EXCLUDED.file_path, updated_at=NOW()
		RETURNING id
	`, req.Name, req.Description, samples, sizeBytes, dstPath).Scan(&id)
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	jsonResponse(w, http.StatusCreated, map[string]interface{}{
		"id": id, "name": req.Name, "samples": samples, "size_bytes": sizeBytes,
	})
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
	if req.Method == "" {
		req.Method = "lora"
	}
	if req.Epochs == 0 {
		req.Epochs = 3
	}
	if req.BatchSize == 0 {
		req.BatchSize = 1
	}
	if req.LearningRate == 0 {
		req.LearningRate = 2e-5
	}
	if req.MaxLength == 0 {
		req.MaxLength = 128
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
