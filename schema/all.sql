-- Extensions
CREATE EXTENSION IF NOT EXISTS ltree;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Ensure schema
CREATE SCHEMA IF NOT EXISTS data;

-- Users in data schema (as required)
CREATE TABLE IF NOT EXISTS data.users (
  user_id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

-- Sessions
CREATE TABLE IF NOT EXISTS data.sessions (
  id SERIAL PRIMARY KEY,
  guid_id uuid NOT NULL DEFAULT public.uuid_generate_v4(),
  user_id INTEGER NOT NULL REFERENCES data.users(user_id) ON DELETE CASCADE,
  session_data JSONB NOT NULL,
  data_created TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  data_expired TIMESTAMP WITHOUT TIME ZONE
);

GRANT USAGE ON SCHEMA data TO datanator;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA data TO datanator;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA data TO datanator;

------- projects table -------
CREATE TABLE IF NOT EXISTS data.projects (
  project_id UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
  owner_user_id INTEGER NOT NULL REFERENCES data.users(user_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

-- Members (required by API joins)
CREATE TABLE IF NOT EXISTS data.project_members (
  project_id UUID NOT NULL REFERENCES data.projects(project_id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES data.users(user_id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'owner', -- owner|editor|viewer
  PRIMARY KEY (project_id, user_id)
);

-- Files (datasets) inside projects
CREATE TABLE IF NOT EXISTS data.project_files (
  file_id UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES data.projects(project_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  original_filename TEXT,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

-- Operation log per file (append-only)
CREATE TABLE IF NOT EXISTS data.file_ops (
  op_id BIGSERIAL PRIMARY KEY,
  file_id UUID NOT NULL REFERENCES data.project_files(file_id) ON DELETE CASCADE,
  seq BIGINT NOT NULL,
  op_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  inverse JSONB,
  author_user_id INTEGER REFERENCES data.users(user_id),
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  UNIQUE (file_id, seq)
);

-- Snapshots
CREATE TABLE IF NOT EXISTS data.file_snapshots (
  file_id UUID NOT NULL REFERENCES data.project_files(file_id) ON DELETE CASCADE,
  seq BIGINT NOT NULL,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  PRIMARY KEY (file_id, seq)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_project_files_project ON data.project_files(project_id);
CREATE INDEX IF NOT EXISTS idx_file_ops_file_seq ON data.file_ops(file_id, seq);
CREATE INDEX IF NOT EXISTS idx_file_snapshots_file_seq ON data.file_snapshots(file_id, seq);


-- =========================
-- Visualizations (D3 spec)
-- =========================
CREATE TABLE IF NOT EXISTS data.visualizations (
  viz_id UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES data.projects(project_id) ON DELETE CASCADE,
  -- Optional link to a dataset tab; allows templates if NULL
  file_id UUID REFERENCES data.project_files(file_id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  -- D3-friendly chart spec (your normalized ChartSpec)
  spec JSONB NOT NULL,
  -- Optional small preview image (PNG recommended)
  thumbnail BYTEA,
  thumbnail_mime TEXT,
  is_template BOOLEAN NOT NULL DEFAULT FALSE,
  version INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES data.users(user_id) ON DELETE SET NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()
);

-- Optional versioned history of specs (keeps past edits)
CREATE TABLE IF NOT EXISTS data.visualization_revisions (
  revision_id BIGSERIAL PRIMARY KEY,
  viz_id UUID NOT NULL REFERENCES data.visualizations(viz_id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  spec JSONB NOT NULL,
  comment TEXT,
  created_by INTEGER REFERENCES data.users(user_id) ON DELETE SET NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (viz_id, version)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_visualizations_project ON data.visualizations(project_id);
CREATE INDEX IF NOT EXISTS idx_visualizations_file ON data.visualizations(file_id);
CREATE INDEX IF NOT EXISTS idx_visualizations_created_by ON data.visualizations(created_by);
-- If you plan to query inside spec (e.g., spec->'mark'), add a GIN index:
CREATE INDEX IF NOT EXISTS idx_visualizations_spec_gin ON data.visualizations USING GIN (spec);
