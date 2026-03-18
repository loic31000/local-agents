#!/usr/bin/env bash

set -euo pipefail

namespace="${1:-jarvis-training}"
job_name="${2:-finetune-job-lite}"
logs_pvc="${3:-logs-pvc}"
output_dir="${4:-doc/training}"
log_subdir="${5:-$job_name}"
export_pod="${job_name}-logs-export"

mkdir -p "$output_dir"

stdout_target="$output_dir/logs.txt"
job_report_target="$output_dir/${job_name}-kubectl.log"

pods=$(kubectl get pods -n "$namespace" -l "job-name=$job_name" -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}')

{
  printf 'Training job: %s\n' "$job_name"
  printf 'Namespace: %s\n' "$namespace"
  printf 'Exported at: %s\n\n' "$(date -Iseconds)"
  if [[ -z "$pods" ]]; then
    printf 'No pods found for job %s.\n' "$job_name"
  else
    while IFS= read -r pod; do
      [[ -z "$pod" ]] && continue
      printf '===== kubectl logs: %s =====\n' "$pod"
      kubectl logs -n "$namespace" "$pod" --timestamps || true
      printf '\n'
    done <<< "$pods"
  fi
} > "$job_report_target"

cp "$job_report_target" "$stdout_target"

cleanup() {
  kubectl delete pod "$export_pod" -n "$namespace" --ignore-not-found >/dev/null 2>&1 || true
}

trap cleanup EXIT

cat <<EOF | kubectl apply -f - >/dev/null 2>/dev/null
apiVersion: v1
kind: Pod
metadata:
  name: $export_pod
  namespace: $namespace
spec:
  restartPolicy: Never
  containers:
  - name: exporter
    image: busybox:1.36
    command: ["sh", "-lc", "sleep 300"]
    volumeMounts:
    - name: logs
      mountPath: /logs
  volumes:
  - name: logs
    persistentVolumeClaim:
      claimName: $logs_pvc
EOF

kubectl wait -n "$namespace" --for=condition=Ready "pod/$export_pod" --timeout=60s >/dev/null 2>/dev/null

kubectl exec -n "$namespace" "$export_pod" -- sh -lc "if [ -d '/logs/$log_subdir' ]; then find '/logs/$log_subdir' -maxdepth 1 -type f | sort; fi" 2>/dev/null | while IFS= read -r remote_file; do
  [[ -z "$remote_file" ]] && continue
  local_name=$(basename "$remote_file")
  kubectl cp "$namespace/$export_pod:$remote_file" "$output_dir/$local_name" >/dev/null 2>/dev/null
done

if [[ -f "$output_dir/stdout.log" ]]; then
  cp "$output_dir/stdout.log" "$stdout_target"
fi

printf 'Exported logs to %s\n' "$output_dir"