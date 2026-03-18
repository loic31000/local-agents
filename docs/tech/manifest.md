# JARVIS AI PLATFORM — Manifest Unique (Compact)
## Kubernetes local (k3s/minikube) - GPU ready

Ce document remplace les blocs eclates par un seul manifest operationnel.

## Prerequis

```bash
# k3s
curl -sfL https://get.k3s.io | sh -
kubectl get nodes

# GPU NVIDIA (optionnel)
kubectl create -f https://raw.githubusercontent.com/NVIDIA/k8s-device-plugin/v0.14.0/nvidia-device-plugin.yml

# Ingress NGINX (k3s)
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/k3s/deploy.yaml
```

## Deploiement

```bash
# Extraire le bloc YAML unique depuis ce fichier Markdown
awk '/^```yaml$/{f=1;next}/^```$/{if(f){f=0;exit}}f' manifest.md > manifest.yaml

# Appliquer le manifest genere
kubectl apply -f manifest.yaml
kubectl get pods -A
kubectl get svc -A
kubectl get pvc -A
```

## Manifest YAML unique

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: jarvis-data
  labels:
    app.kubernetes.io/part-of: jarvis
---
apiVersion: v1
kind: Namespace
metadata:
  name: jarvis-core
  labels:
    app.kubernetes.io/part-of: jarvis
---
apiVersion: v1
kind: Namespace
metadata:
  name: jarvis-llm
  labels:
    app.kubernetes.io/part-of: jarvis
---
apiVersion: v1
kind: Namespace
metadata:
  name: jarvis-training
  labels:
    app.kubernetes.io/part-of: jarvis
---
apiVersion: v1
kind: Secret
metadata:
  name: jarvis-secrets
  namespace: jarvis-data
type: Opaque
data:
  postgres-password: REPLACE_BASE64
  redis-password: REPLACE_BASE64
---
apiVersion: v1
kind: Secret
metadata:
  name: jarvis-secrets
  namespace: jarvis-core
type: Opaque
data:
  postgres-password: REPLACE_BASE64
  redis-password: REPLACE_BASE64
  jwt-secret: REPLACE_BASE64
---
apiVersion: v1
kind: Secret
metadata:
  name: jarvis-secrets
  namespace: jarvis-llm
type: Opaque
data:
  postgres-password: REPLACE_BASE64
  redis-password: REPLACE_BASE64
---
apiVersion: v1
kind: Secret
metadata:
  name: jarvis-secrets
  namespace: jarvis-training
type: Opaque
data:
  postgres-password: REPLACE_BASE64
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: jarvis-trainer
  namespace: jarvis-training
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: jarvis-llm-restarter
  namespace: jarvis-llm
rules:
- apiGroups: ["apps"]
  resources: ["deployments"]
  verbs: ["get", "list", "patch", "update"]
- apiGroups: [""]
  resources: ["pods"]
  verbs: ["get", "list"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: jarvis-trainer-can-restart-llm
  namespace: jarvis-llm
subjects:
- kind: ServiceAccount
  name: jarvis-trainer
  namespace: jarvis-training
roleRef:
  kind: Role
  name: jarvis-llm-restarter
  apiGroup: rbac.authorization.k8s.io
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: jarvis-pvc-access
  namespace: jarvis-training
rules:
- apiGroups: [""]
  resources: ["persistentvolumeclaims"]
  verbs: ["get", "list"]
- apiGroups: ["batch"]
  resources: ["jobs"]
  verbs: ["get", "list", "create", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: jarvis-trainer-pvc-access
  namespace: jarvis-training
subjects:
- kind: ServiceAccount
  name: jarvis-trainer
  namespace: jarvis-training
roleRef:
  kind: Role
  name: jarvis-pvc-access
  apiGroup: rbac.authorization.k8s.io
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: postgres-pvc
  namespace: jarvis-data
spec:
  accessModes: ["ReadWriteOnce"]
  storageClassName: local-path
  resources:
    requests:
      storage: 20Gi
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: redis-pvc
  namespace: jarvis-data
spec:
  accessModes: ["ReadWriteOnce"]
  storageClassName: local-path
  resources:
    requests:
      storage: 5Gi
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: chroma-pvc
  namespace: jarvis-data
spec:
  accessModes: ["ReadWriteOnce"]
  storageClassName: local-path
  resources:
    requests:
      storage: 10Gi
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: ollama-models-pvc
  namespace: jarvis-llm
spec:
  accessModes: ["ReadWriteOnce"]
  storageClassName: local-path
  resources:
    requests:
      storage: 50Gi
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: training-pvc
  namespace: jarvis-training
spec:
  accessModes: ["ReadWriteOnce"]
  storageClassName: local-path
  resources:
    requests:
      storage: 50Gi
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: model-pvc
  namespace: jarvis-training
spec:
  accessModes: ["ReadWriteOnce"]
  storageClassName: local-path
  resources:
    requests:
      storage: 50Gi
---
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: jarvis-training-priority
value: 1000
globalDefault: false
description: "Priorite haute pour les jobs training"
---
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: jarvis-runtime-priority
value: 100
globalDefault: false
description: "Priorite runtime"
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
  namespace: jarvis-data
spec:
  serviceName: postgres
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
      - name: postgres
        image: postgres:16-alpine
        ports:
        - containerPort: 5432
        env:
        - name: POSTGRES_DB
          value: jarvis
        - name: POSTGRES_USER
          value: jarvis_user
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: jarvis-secrets
              key: postgres-password
        - name: PGDATA
          value: /var/lib/postgresql/data/pgdata
        volumeMounts:
        - name: postgres-data
          mountPath: /var/lib/postgresql/data
      volumes:
      - name: postgres-data
        persistentVolumeClaim:
          claimName: postgres-pvc
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: redis
  namespace: jarvis-data
spec:
  replicas: 1
  selector:
    matchLabels:
      app: redis
  template:
    metadata:
      labels:
        app: redis
    spec:
      containers:
      - name: redis
        image: redis:7-alpine
        command: ["redis-server", "--requirepass", "$(REDIS_PASSWORD)", "--appendonly", "yes"]
        env:
        - name: REDIS_PASSWORD
          valueFrom:
            secretKeyRef:
              name: jarvis-secrets
              key: redis-password
        ports:
        - containerPort: 6379
        volumeMounts:
        - name: redis-data
          mountPath: /data
      volumes:
      - name: redis-data
        persistentVolumeClaim:
          claimName: redis-pvc
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: chromadb
  namespace: jarvis-data
spec:
  serviceName: chromadb
  replicas: 1
  selector:
    matchLabels:
      app: chromadb
  template:
    metadata:
      labels:
        app: chromadb
    spec:
      containers:
      - name: chromadb
        image: chromadb/chroma:latest
        ports:
        - containerPort: 8000
        env:
        - name: IS_PERSISTENT
          value: "TRUE"
        - name: PERSIST_DIRECTORY
          value: /chroma/data
        volumeMounts:
        - name: chroma-data
          mountPath: /chroma/data
      volumes:
      - name: chroma-data
        persistentVolumeClaim:
          claimName: chroma-pvc
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ollama-backend
  namespace: jarvis-llm
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ollama
  template:
    metadata:
      labels:
        app: ollama
    spec:
      priorityClassName: jarvis-runtime-priority
      tolerations:
      - key: nvidia.com/gpu
        operator: Exists
        effect: NoSchedule
      containers:
      - name: ollama
        image: ollama/ollama:latest
        ports:
        - containerPort: 11434
        env:
        - name: OLLAMA_HOST
          value: 0.0.0.0
        - name: OLLAMA_MODELS
          value: /models
        resources:
          limits:
            nvidia.com/gpu: 1
            memory: 24Gi
            cpu: "4"
          requests:
            memory: 4Gi
            cpu: "1"
        volumeMounts:
        - name: ollama-models
          mountPath: /models
      volumes:
      - name: ollama-models
        persistentVolumeClaim:
          claimName: ollama-models-pvc
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: jarvis-api
  namespace: jarvis-core
spec:
  replicas: 1
  selector:
    matchLabels:
      app: jarvis-api
  template:
    metadata:
      labels:
        app: jarvis-api
    spec:
      containers:
      - name: api
        image: jarvis/api:latest
        ports:
        - containerPort: 8080
        env:
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: jarvis-secrets
              key: postgres-password
        - name: REDIS_PASSWORD
          valueFrom:
            secretKeyRef:
              name: jarvis-secrets
              key: redis-password
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: jarvis-secrets
              key: jwt-secret
        - name: POSTGRES_URL
          value: postgres://jarvis_user:$(POSTGRES_PASSWORD)@postgres.jarvis-data.svc.cluster.local:5432/jarvis
        - name: REDIS_URL
          value: redis://:$(REDIS_PASSWORD)@redis.jarvis-data.svc.cluster.local:6379
        - name: CHROMA_URL
          value: http://chromadb.jarvis-data.svc.cluster.local:8000
        - name: OLLAMA_URL
          value: http://ollama-backend.jarvis-llm.svc.cluster.local:11434
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: jarvis-worker
  namespace: jarvis-core
spec:
  replicas: 1
  selector:
    matchLabels:
      app: jarvis-worker
  template:
    metadata:
      labels:
        app: jarvis-worker
    spec:
      containers:
      - name: worker
        image: jarvis/worker:latest
        env:
        - name: REDIS_PASSWORD
          valueFrom:
            secretKeyRef:
              name: jarvis-secrets
              key: redis-password
        - name: QUEUE_URL
          value: redis://:$(REDIS_PASSWORD)@redis.jarvis-data.svc.cluster.local:6379
        - name: LLM_URL
          value: http://ollama-backend.jarvis-llm.svc.cluster.local:11434
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: axolotl-config
  namespace: jarvis-training
data:
  qwen2.5-coder-lora.yaml: |
    base_model: Qwen/Qwen2.5-Coder-7B-Instruct
    load_in_4bit: true
    adapter: lora
    lora_r: 16
    lora_alpha: 32
    lora_dropout: 0.05
    datasets:
      - path: /data/dataset/train.jsonl
        type: chatml
    val_set_path: /data/dataset/eval.jsonl
    sequence_len: 2048
    micro_batch_size: 2
    gradient_accumulation_steps: 4
    num_epochs: 3
    learning_rate: 2e-4
    output_dir: /models/jarvis-qwen2.5-ft
    bf16: true
---
apiVersion: batch/v1
kind: Job
metadata:
  name: finetune-job
  namespace: jarvis-training
spec:
  backoffLimit: 1
  template:
    spec:
      serviceAccountName: jarvis-trainer
      restartPolicy: Never
      priorityClassName: jarvis-training-priority
      tolerations:
      - key: nvidia.com/gpu
        operator: Exists
        effect: NoSchedule
      containers:
      - name: trainer
        image: jarvis/trainer:latest
        command: ["python", "-m", "axolotl.cli.train", "/config/qwen2.5-coder-lora.yaml"]
        resources:
          limits:
            nvidia.com/gpu: 1
            memory: 32Gi
            cpu: "4"
          requests:
            nvidia.com/gpu: 1
            memory: 12Gi
            cpu: "2"
        volumeMounts:
        - name: training-data
          mountPath: /data
        - name: model-output
          mountPath: /models
        - name: axolotl-config
          mountPath: /config
      volumes:
      - name: training-data
        persistentVolumeClaim:
          claimName: training-pvc
      - name: model-output
        persistentVolumeClaim:
          claimName: model-pvc
      - name: axolotl-config
        configMap:
          name: axolotl-config
---
apiVersion: v1
kind: Service
metadata:
  name: postgres
  namespace: jarvis-data
spec:
  selector:
    app: postgres
  ports:
  - port: 5432
    targetPort: 5432
  clusterIP: None
---
apiVersion: v1
kind: Service
metadata:
  name: redis
  namespace: jarvis-data
spec:
  selector:
    app: redis
  ports:
  - port: 6379
    targetPort: 6379
---
apiVersion: v1
kind: Service
metadata:
  name: chromadb
  namespace: jarvis-data
spec:
  selector:
    app: chromadb
  ports:
  - port: 8000
    targetPort: 8000
---
apiVersion: v1
kind: Service
metadata:
  name: ollama-backend
  namespace: jarvis-llm
spec:
  selector:
    app: ollama
  ports:
  - port: 11434
    targetPort: 11434
---
apiVersion: v1
kind: Service
metadata:
  name: jarvis-api
  namespace: jarvis-core
spec:
  selector:
    app: jarvis-api
  ports:
  - name: http
    port: 8080
    targetPort: 8080
  - name: websocket
    port: 8081
    targetPort: 8081
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: jarvis-ingress
  namespace: jarvis-core
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
    nginx.ingress.kubernetes.io/websocket-services: jarvis-api
spec:
  ingressClassName: nginx
  rules:
  - host: jarvis.local
    http:
      paths:
      - path: /api
        pathType: Prefix
        backend:
          service:
            name: jarvis-api
            port:
              number: 8080
      - path: /ws
        pathType: Prefix
        backend:
          service:
            name: jarvis-api
            port:
              number: 8081
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: data-access-policy
  namespace: jarvis-data
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          app.kubernetes.io/part-of: jarvis
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: training-isolation
  namespace: jarvis-training
spec:
  podSelector: {}
  policyTypes:
  - Egress
  egress:
  - to:
    - namespaceSelector:
        matchLabels:
          kubernetes.io/metadata.name: jarvis-data
    ports:
    - port: 5432
  - ports:
    - port: 53
      protocol: UDP
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: jarvis-version
  namespace: jarvis-core
data:
  version: "2.0"
  deployed: "2026-03-17"
  description: "Jarvis AI Platform compact monolith manifest"
```

## Verification rapide

```bash
kubectl get pods -A
kubectl get svc -A
kubectl get pvc -A
kubectl get events -A --sort-by=.metadata.creationTimestamp
curl http://jarvis.local/api/v1/health
```

## Pipeline GPU (1 GPU)

```bash
# Liberer le GPU pour le training
kubectl scale deployment ollama-backend -n jarvis-llm --replicas=0

# Lancer le fine-tuning
kubectl apply -f manifest.yaml
kubectl wait --for=condition=complete job/finetune-job -n jarvis-training --timeout=7200s

# Rallumer Ollama
kubectl scale deployment ollama-backend -n jarvis-llm --replicas=1
```

## Backup / Cleanup

```bash
# Backup PostgreSQL
kubectl exec -n jarvis-data postgres-0 -- pg_dump -U jarvis_user jarvis > backup.sql

# Cleanup
kubectl delete -f manifest.yaml
```
