-- ============================================================
-- Jarvis AI Platform — Schéma PostgreSQL
-- ============================================================

-- Extension UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Datasets ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS datasets (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    type        VARCHAR(50)  NOT NULL DEFAULT 'chat',  -- chat, code, security, vision
    format      VARCHAR(50)  NOT NULL DEFAULT 'jsonl', -- jsonl, alpaca, chatml
    samples     INTEGER      NOT NULL DEFAULT 0,
    size_bytes  BIGINT       NOT NULL DEFAULT 0,
    quality     VARCHAR(20)  NOT NULL DEFAULT 'medium', -- low, medium, high
    file_path   TEXT,        -- chemin dans le volume training_data
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Training Jobs ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS training_jobs (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name          VARCHAR(255) NOT NULL,
    status        VARCHAR(50)  NOT NULL DEFAULT 'pending', -- pending, running, completed, failed, cancelled
    base_model    VARCHAR(255) NOT NULL,
    method        VARCHAR(50)  NOT NULL DEFAULT 'qlora',   -- lora, qlora, full
    dataset_id    UUID REFERENCES datasets(id) ON DELETE SET NULL,
    -- Hyperparamètres
    epochs        INTEGER      NOT NULL DEFAULT 3,
    batch_size    INTEGER      NOT NULL DEFAULT 1,
    learning_rate FLOAT        NOT NULL DEFAULT 2e-4,
    max_length    INTEGER      NOT NULL DEFAULT 512,
    -- Résultats
    progress      INTEGER      NOT NULL DEFAULT 0,  -- 0-100
    output_model  VARCHAR(255),  -- nom du modèle exporté
    loss_final    FLOAT,
    error_msg     TEXT,
    -- Métriques
    gpu_usage     FLOAT,
    ram_usage     FLOAT,
    -- Timestamps
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    started_at    TIMESTAMPTZ,
    completed_at  TIMESTAMPTZ
);

-- ── Training Logs ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS training_logs (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id     UUID NOT NULL REFERENCES training_jobs(id) ON DELETE CASCADE,
    step       INTEGER      NOT NULL DEFAULT 0,
    epoch      FLOAT        NOT NULL DEFAULT 0,
    loss       FLOAT,
    grad_norm  FLOAT,
    lr         FLOAT,
    logged_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Conversations (pour dataset collection) ───────────────────────────────────

CREATE TABLE IF NOT EXISTS conversations (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id   VARCHAR(100) NOT NULL,
    user_msg   TEXT         NOT NULL,
    agent_msg  TEXT         NOT NULL,
    model      VARCHAR(255),
    feedback   INTEGER,     -- 1-5 (pour RLHF)
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Index ─────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_training_jobs_status    ON training_jobs(status);
CREATE INDEX IF NOT EXISTS idx_training_logs_job_id    ON training_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_conversations_agent_id  ON conversations(agent_id);
CREATE INDEX IF NOT EXISTS idx_conversations_feedback  ON conversations(feedback);

-- ── Données exemple ───────────────────────────────────────────────────────────

INSERT INTO datasets (name, description, type, format, samples, size_bytes, quality)
VALUES
    ('jarvis-chat-v1',     'Conversations générales Jarvis',      'chat',     'jsonl', 0, 0, 'medium'),
    ('jarvis-code-v1',     'Questions et réponses code',          'code',     'jsonl', 0, 0, 'medium'),
    ('jarvis-security-v1', 'Événements et réponses sécurité',     'security', 'jsonl', 0, 0, 'medium')
ON CONFLICT (name) DO NOTHING;