CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TYPE user_role AS ENUM ('RECRUITER', 'CANDIDATE', 'ADMIN');
CREATE TYPE job_status AS ENUM ('DRAFT', 'OPEN', 'CLOSED', 'ARCHIVED');
CREATE TYPE job_type AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP');
CREATE TYPE requirement_importance AS ENUM ('MANDATORY', 'IMPORTANT', 'OPTIONAL');
CREATE TYPE resume_status AS ENUM ('UPLOADED', 'PARSING', 'PARSED', 'FAILED');
CREATE TYPE relationship_type AS ENUM ('PARENT', 'SYNONYM', 'RELATED', 'TRANSFER');
CREATE TYPE ranking_stage AS ENUM ('INITIAL', 'RERANKED');

CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  plan TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  role user_role NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status job_status NOT NULL DEFAULT 'DRAFT',
  job_type job_type NOT NULL,
  domain TEXT NOT NULL,
  min_experience INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  canonical_name TEXT NOT NULL,
  category TEXT NOT NULL,
  aliases TEXT[] NOT NULL DEFAULT '{}',
  embedding vector(384),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (canonical_name)
);

CREATE TABLE skill_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  relationship_type relationship_type NOT NULL,
  UNIQUE (parent_id, child_id, relationship_type)
);

CREATE TABLE job_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  skill_id UUID REFERENCES skills(id) ON DELETE SET NULL,
  importance requirement_importance NOT NULL,
  requirement_type TEXT NOT NULL,
  raw_text TEXT NOT NULL,
  weight NUMERIC(5, 4) NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  blind_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE resumes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL,
  status resume_status NOT NULL DEFAULT 'UPLOADED',
  raw_text TEXT,
  parsed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE candidate_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  evidence_text TEXT NOT NULL,
  evidence_level TEXT NOT NULL,
  proficiency_score NUMERIC(5, 4) NOT NULL DEFAULT 0,
  years_used NUMERIC(6, 2) NOT NULL DEFAULT 0,
  source_section TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE candidate_experience (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  company TEXT NOT NULL,
  title TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  duration_months INTEGER NOT NULL DEFAULT 0,
  responsibilities TEXT[] NOT NULL DEFAULT '{}',
  domain TEXT NOT NULL,
  is_current BOOLEAN NOT NULL DEFAULT FALSE,
  relevance_score NUMERIC(5, 4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE candidate_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  tech_stack TEXT[] NOT NULL DEFAULT '{}',
  impact TEXT,
  url TEXT,
  relevance_score NUMERIC(5, 4) NOT NULL DEFAULT 0,
  skills_demonstrated TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE candidate_education (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  institution TEXT NOT NULL,
  degree TEXT NOT NULL,
  field TEXT NOT NULL,
  gpa TEXT,
  year INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE candidate_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  overall_score NUMERIC(5, 4) NOT NULL,
  skill_score NUMERIC(5, 4) NOT NULL,
  experience_score NUMERIC(5, 4) NOT NULL,
  project_score NUMERIC(5, 4) NOT NULL,
  education_score NUMERIC(5, 4) NOT NULL,
  semantic_score NUMERIC(5, 4) NOT NULL,
  mandatory_score NUMERIC(5, 4) NOT NULL,
  evidence_score NUMERIC(5, 4) NOT NULL,
  confidence_score NUMERIC(5, 4) NOT NULL,
  mandatory_met INTEGER NOT NULL DEFAULT 0,
  mandatory_total INTEGER NOT NULL DEFAULT 0,
  scoring_version TEXT NOT NULL,
  weights_used JSONB NOT NULL DEFAULT '{}'::jsonb,
  ranked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, job_id, scoring_version)
);

CREATE TABLE score_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  score_id UUID NOT NULL REFERENCES candidate_scores(id) ON DELETE CASCADE,
  component_name TEXT NOT NULL,
  raw_score NUMERIC(5, 4) NOT NULL,
  weight NUMERIC(5, 4) NOT NULL,
  weighted_score NUMERIC(5, 4) NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE score_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  score_id UUID NOT NULL REFERENCES candidate_scores(id) ON DELETE CASCADE,
  requirement_id UUID REFERENCES job_requirements(id) ON DELETE SET NULL,
  skill_id UUID REFERENCES skills(id) ON DELETE SET NULL,
  evidence_text TEXT NOT NULL,
  match_type TEXT NOT NULL,
  evidence_level TEXT NOT NULL,
  raw_score NUMERIC(5, 4) NOT NULL,
  weight NUMERIC(5, 4) NOT NULL,
  contribution NUMERIC(5, 4) NOT NULL
);

CREATE TABLE ranking_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL,
  score_id UUID NOT NULL REFERENCES candidate_scores(id) ON DELETE CASCADE,
  stage ranking_stage NOT NULL DEFAULT 'INITIAL',
  rerank_score NUMERIC(5, 4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, candidate_id, stage)
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  old_value JSONB,
  new_value JSONB,
  ip_address TEXT,
  model_version TEXT,
  scoring_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_org_id ON users(org_id);
CREATE INDEX idx_jobs_org_id ON jobs(org_id);
CREATE INDEX idx_job_requirements_job_id ON job_requirements(job_id);
CREATE INDEX idx_resumes_candidate_job ON resumes(candidate_id, job_id);
CREATE INDEX idx_candidate_scores_job ON candidate_scores(job_id);
CREATE INDEX idx_candidate_scores_candidate ON candidate_scores(candidate_id);
CREATE INDEX idx_ranking_results_job ON ranking_results(job_id, stage, rank);