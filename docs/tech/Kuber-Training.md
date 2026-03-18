# JARVIS-K8S.md

## Jarvis AI Platform – Kubernetes Manifests & Architecture

Version : 1.0
Date : Mars 2026

---

# 1. Namespace Structure

Recommandation de namespaces pour isolation :

```text
Namespaces
│
├── jarvis-core        # API, Orchestrator, Agents permanents
├── jarvis-llm         # LLM backend (Mock, Ollama, GGUF)
├── jarvis-training    # Jobs GPU pour fine-tuning
└── jarvis-data        # Redis, PostgreSQL, ChromaDB
```

---

# 2. PostgreSQL (StatefulSet)

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: jarvis-data
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: postgres-pvc
  namespace: jarvis-data
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 20Gi
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
  namespace: jarvis-data
spec:
  serviceName: "postgres"
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
        image: postgres:16
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
        volumeMounts:
        - name: postgres-data
          mountPath: /var/lib/postgresql/data
  volumeClaimTemplates:
  - metadata:
      name: postgres-data
    spec:
      accessModes: [ "ReadWriteOnce" ]
      resources:
        requests:
          storage: 20Gi
```

---

# 3. Redis (Deployment)

```yaml
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
        image: redis:7
        ports:
        - containerPort: 6379
        resources:
          requests:
            memory: "1Gi"
          limits:
            memory: "2Gi"
        volumeMounts:
        - name: redis-data
          mountPath: /data
      volumes:
      - name: redis-data
        emptyDir: {}
```

---

# 4. Core Jarvis API (Deployment)

```yaml
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
        - name: REDIS_URL
          value: redis.jarvis-data.svc.cluster.local:6379
        - name: POSTGRES_URL
          value: postgres.jarvis-data.svc.cluster.local:5432
```

---

# 5. LLM Backends (Ollama / GGUF)

```yaml
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
      nodeSelector:
        accelerator: nvidia-gpu
      containers:
      - name: ollama
        image: jarvis/ollama:latest
        resources:
          limits:
            nvidia.com/gpu: 1
            memory: "24Gi"
```

---

# 6. Vision Agent GPU

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: vision-agent
  namespace: jarvis-core
spec:
  replicas: 1
  selector:
    matchLabels:
      app: vision-agent
  template:
    metadata:
      labels:
        app: vision-agent
    spec:
      nodeSelector:
        accelerator: nvidia-gpu
      containers:
      - name: vision
        image: jarvis/vision-agent:latest
        resources:
          limits:
            nvidia.com/gpu: 1
            memory: "24Gi"
        env:
        - name: REDIS_URL
          value: redis.jarvis-data.svc.cluster.local:6379
        - name: POSTGRES_URL
          value: postgres.jarvis-data.svc.cluster.local:5432
        volumeMounts:
        - name: models
          mountPath: /models
      volumes:
      - name: models
        persistentVolumeClaim:
          claimName: vision-models-pvc
```

---

# 7. Training Pipeline (Jobs)

### Dataset Collector CronJob

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: dataset-collector
  namespace: jarvis-training
spec:
  schedule: "0 2 * * *"
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: collector
            image: jarvis/dataset-collector:latest
            command: ["python", "collect.py", "--output=/data/raw"]
            volumeMounts:
            - name: training-data
              mountPath: /data
          restartPolicy: Never
          volumes:
          - name: training-data
            persistentVolumeClaim:
              claimName: training-pvc
```

### Dataset Builder Job

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: dataset-builder
  namespace: jarvis-training
spec:
  template:
    spec:
      containers:
      - name: builder
        image: jarvis/dataset-builder:latest
        command: ["python", "build_dataset.py", "--output=/data/dataset"]
        volumeMounts:
        - name: training-data
          mountPath: /data
      restartPolicy: Never
      volumes:
      - name: training-data
        persistentVolumeClaim:
          claimName: training-pvc
```

### Fine-tuning Job

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: finetune-job
  namespace: jarvis-training
spec:
  template:
    spec:
      nodeSelector:
        accelerator: nvidia-gpu
      containers:
      - name: trainer
        image: jarvis/trainer:latest
        resources:
          limits:
            nvidia.com/gpu: 1
            memory: "32Gi"
        command: ["python", "-m", "axolotl.cli.train", "config/qwen2.5-coder-lora.yaml"]
        volumeMounts:
        - name: training-data
          mountPath: /data
        - name: model-output
          mountPath: /models
      restartPolicy: Never
      volumes:
      - name: training-data
        persistentVolumeClaim:
          claimName: training-pvc
      - name: model-output
        persistentVolumeClaim:
          claimName: model-pvc
```

---

# 8. Volumes et PVCs recommandés

| Volume            | Usage                        | Taille |
| ----------------- | ---------------------------- | ------ |
| training-pvc      | Dataset collecté             | 50Gi   |
| model-pvc         | Modèles fine-tunés           | 50Gi   |
| vision-models-pvc | Modèles vision pré-entraînés | 20Gi   |

---

# 9. Services ClusterIP

Exposer les services internes pour communication entre pods :

```yaml
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
  name: postgres
  namespace: jarvis-data
spec:
  selector:
    app: postgres
  ports:
    - port: 5432
      targetPort: 5432
---
apiVersion: v1
kind: Service
metadata:
  name: vision-agent
  namespace: jarvis-core
spec:
  selector:
    app: vision-agent
  ports:
    - port: 8081
      targetPort: 8081
```

---

# 10. Notes importantes

* Tous les pods GPU doivent utiliser `nodeSelector: accelerator: nvidia-gpu`
* Fine-tuning Jobs sont éphémères et consomment GPU uniquement pendant l’exécution
* Orchestrator et agents doivent communiquer via **services ClusterIP + Redis pub/sub**
* PVCs assurent la persistance de données critiques et modèles

