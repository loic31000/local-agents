package main

import (
	"bufio"
	"encoding/json"
	"net/http"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

type SystemMetrics struct {
	CPUPercent    float64  `json:"cpu_percent"`
	RAMPercent    float64  `json:"ram_percent"`
	RAMUsedGB     float64  `json:"ram_used_gb"`
	RAMTotalGB    float64  `json:"ram_total_gb"`
	GPUPercent    *float64 `json:"gpu_percent,omitempty"`
	GPUMemPercent *float64 `json:"gpu_mem_percent,omitempty"`
	GPUName       *string  `json:"gpu_name,omitempty"`
}

func (o *Orchestrator) handleSystemMetrics(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	m := &SystemMetrics{}
	readCPULinux(m)
	readRAMLinux(m)
	readGPUNvidia(m)
	json.NewEncoder(w).Encode(m)
}

type cpuStat struct{ idle, total uint64 }

func parseProcStat() (*cpuStat, error) {
	f, err := os.Open("/proc/stat")
	if err != nil {
		return nil, err
	}
	defer f.Close()
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "cpu ") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 5 {
			break
		}
		var vals [10]uint64
		for i := 1; i < len(fields) && i <= 10; i++ {
			vals[i-1], _ = strconv.ParseUint(fields[i], 10, 64)
		}
		idle := vals[3] + vals[4]
		var total uint64
		for _, v := range vals {
			total += v
		}
		return &cpuStat{idle: idle, total: total}, nil
	}
	return nil, nil
}

func readCPULinux(m *SystemMetrics) {
	s1, err := parseProcStat()
	if err != nil || s1 == nil {
		return
	}
	time.Sleep(200 * time.Millisecond)
	s2, err := parseProcStat()
	if err != nil || s2 == nil {
		return
	}
	deltaIdle := float64(s2.idle - s1.idle)
	deltaTotal := float64(s2.total - s1.total)
	if deltaTotal == 0 {
		return
	}
	m.CPUPercent = (1 - deltaIdle/deltaTotal) * 100
}

func readRAMLinux(m *SystemMetrics) {
	f, err := os.Open("/proc/meminfo")
	if err != nil {
		return
	}
	defer f.Close()
	var totalKB, availKB uint64
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) < 2 {
			continue
		}
		val, _ := strconv.ParseUint(fields[1], 10, 64)
		switch fields[0] {
		case "MemTotal:":
			totalKB = val
		case "MemAvailable:":
			availKB = val
		}
		if totalKB > 0 && availKB > 0 {
			break
		}
	}
	if totalKB == 0 {
		return
	}
	usedKB := totalKB - availKB
	m.RAMTotalGB = float64(totalKB) / 1024 / 1024
	m.RAMUsedGB = float64(usedKB) / 1024 / 1024
	m.RAMPercent = float64(usedKB) / float64(totalKB) * 100
}

func readGPUNvidia(m *SystemMetrics) {
	out, err := exec.Command(
		"nvidia-smi",
		"--query-gpu=utilization.gpu,utilization.memory,name",
		"--format=csv,noheader,nounits",
	).Output()
	if err != nil {
		return
	}
	line := strings.TrimSpace(string(out))
	if idx := strings.Index(line, "\n"); idx >= 0 {
		line = line[:idx]
	}
	parts := strings.SplitN(line, ",", 3)
	if len(parts) < 2 {
		return
	}
	if v, err := strconv.ParseFloat(strings.TrimSpace(parts[0]), 64); err == nil {
		m.GPUPercent = &v
	}
	if v, err := strconv.ParseFloat(strings.TrimSpace(parts[1]), 64); err == nil {
		m.GPUMemPercent = &v
	}
	if len(parts) >= 3 {
		name := strings.TrimSpace(parts[2])
		if name != "" {
			m.GPUName = &name
		}
	}
}
