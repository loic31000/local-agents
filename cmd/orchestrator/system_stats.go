package main

import (
	"encoding/json"
	"io"
	"net/http"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

// SystemStats contient les stats GPU + RAM + tokens/sec
type SystemStats struct {
	GPU struct {
		Name      string  `json:"name"`
		UtilPct   int     `json:"util_pct"`
		VRAMUsed  float64 `json:"vram_used_gb"`
		VRAMTotal float64 `json:"vram_total_gb"`
		TempC     int     `json:"temp_c"`
	} `json:"gpu"`
	RAM struct {
		UsedGB  float64 `json:"used_gb"`
		TotalGB float64 `json:"total_gb"`
	} `json:"ram"`
	LLM struct {
		TokensPerSec float64 `json:"tokens_per_sec"`
		PromptTPS    float64 `json:"prompt_tps"`
		KVCachePct   float64 `json:"kv_cache_pct"`
	} `json:"llm"`
	Timestamp int64 `json:"timestamp"`
}

// handleSystemStats GET /api/system/stats
func (o *Orchestrator) handleSystemStats(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	stats := &SystemStats{Timestamp: time.Now().Unix()}

	// ── GPU via nvidia-smi ────────────────────────────────────────────────
	gpuOut, err := exec.Command("nvidia-smi",
		"--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu",
		"--format=csv,noheader,nounits",
	).Output()
	if err == nil {
		parts := strings.Split(strings.TrimSpace(string(gpuOut)), ",")
		if len(parts) >= 5 {
			stats.GPU.Name = strings.TrimSpace(parts[0])
			if v, e := strconv.Atoi(strings.TrimSpace(parts[1])); e == nil {
				stats.GPU.UtilPct = v
			}
			if v, e := strconv.ParseFloat(strings.TrimSpace(parts[2]), 64); e == nil {
				stats.GPU.VRAMUsed = v / 1024 // MiB → GiB
			}
			if v, e := strconv.ParseFloat(strings.TrimSpace(parts[3]), 64); e == nil {
				stats.GPU.VRAMTotal = v / 1024
			}
			if v, e := strconv.Atoi(strings.TrimSpace(parts[4])); e == nil {
				stats.GPU.TempC = v
			}
		}
	}

	// ── RAM via wmic ──────────────────────────────────────────────────────
	ramOut, err := exec.Command("wmic", "OS", "get",
		"TotalVisibleMemorySize,FreePhysicalMemory", "/format:csv",
	).Output()
	if err == nil {
		lines := strings.Split(strings.TrimSpace(string(ramOut)), "\n")
		for _, line := range lines {
			line = strings.TrimSpace(line)
			if line == "" || strings.HasPrefix(line, "Node") {
				continue
			}
			parts := strings.Split(line, ",")
			if len(parts) >= 3 {
				freeKB, e1 := strconv.ParseFloat(strings.TrimSpace(parts[1]), 64)
				totalKB, e2 := strconv.ParseFloat(strings.TrimSpace(parts[2]), 64)
				if e1 == nil && e2 == nil && totalKB > 0 {
					stats.RAM.TotalGB = totalKB / 1024 / 1024
					stats.RAM.UsedGB = (totalKB - freeKB) / 1024 / 1024
					break
				}
			}
		}
	}

	// ── llama-server /metrics (Prometheus) ───────────────────────────────
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get("http://127.0.0.1:8081/metrics")
	if err == nil {
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		for _, line := range strings.Split(string(body), "\n") {
			line = strings.TrimSpace(line)
			if strings.HasPrefix(line, "#") || line == "" {
				continue
			}
			// llamacpp:prompt_tokens_seconds
			if strings.HasPrefix(line, "llamacpp:prompt_tokens_seconds") {
				if val := extractMetricValue(line); val >= 0 {
					stats.LLM.PromptTPS = val
				}
			}
			// llamacpp:predicted_tokens_seconds
			if strings.HasPrefix(line, "llamacpp:predicted_tokens_seconds") {
				if val := extractMetricValue(line); val >= 0 {
					stats.LLM.TokensPerSec = val
				}
			}
			// llamacpp:kv_cache_usage_ratio
			if strings.HasPrefix(line, "llamacpp:kv_cache_usage_ratio") {
				if val := extractMetricValue(line); val >= 0 {
					stats.LLM.KVCachePct = val * 100
				}
			}
		}
	}

	json.NewEncoder(w).Encode(stats)
}

// handleGetTPS GET /api/llm/tps — retourne uniquement le tokens/sec
func (o *Orchestrator) handleGetTPS(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get("http://127.0.0.1:8081/metrics")
	if err != nil {
		json.NewEncoder(w).Encode(map[string]float64{"tps": 0})
		return
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	var tps float64
	for _, line := range strings.Split(string(body), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "#") || line == "" {
			continue
		}
		if strings.HasPrefix(line, "llamacpp:predicted_tokens_seconds") {
			if v := extractMetricValue(line); v > 0 {
				tps = v
				break
			}
		}
	}
	json.NewEncoder(w).Encode(map[string]float64{"tps": tps})
}
// ex: "llamacpp:predicted_tokens_seconds 4.27" → 4.27
func extractMetricValue(line string) float64 {
	parts := strings.Fields(line)
	if len(parts) < 2 {
		return -1
	}
	val, err := strconv.ParseFloat(parts[len(parts)-1], 64)
	if err != nil {
		return -1
	}
	return val
}