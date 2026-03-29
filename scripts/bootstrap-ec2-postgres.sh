#!/bin/bash
set -euo pipefail

STAGE="${1:?stage is required}"
REGION="${2:?region is required}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/server/src/migrations"

DB_SECRET_ARN=$(aws ssm get-parameter \
  --name "/vebgenix/$STAGE/rest/DB_SECRET_ARN" \
  --region "$REGION" \
  --query 'Parameter.Value' \
  --output text)

SECRET_JSON=$(aws secretsmanager get-secret-value \
  --secret-id "$DB_SECRET_ARN" \
  --region "$REGION" \
  --query 'SecretString' \
  --output text)

export SECRET_JSON
DB_USER=$(python3 -c 'import json, os; print(json.loads(os.environ["SECRET_JSON"])["username"])')
DB_PASS=$(python3 -c 'import json, os; print(json.loads(os.environ["SECRET_JSON"])["password"])')
DB_NAME=$(python3 -c 'import json, os; print(json.loads(os.environ["SECRET_JSON"])["dbname"])')

dnf update -y || true
if ! command -v docker >/dev/null 2>&1; then
  dnf install -y docker
fi

systemctl enable docker
systemctl start docker

mkdir -p /var/lib/vebgenix-postgres
chmod 700 /var/lib/vebgenix-postgres

if docker ps -a --format '{{.Names}}' | grep -q '^vebgenix-postgres$'; then
  docker start vebgenix-postgres || true
else
  docker run -d \
    --name vebgenix-postgres \
    --restart unless-stopped \
    -e POSTGRES_USER="$DB_USER" \
    -e POSTGRES_PASSWORD="$DB_PASS" \
    -e POSTGRES_DB="$DB_NAME" \
    -p 5432:5432 \
    -v /var/lib/vebgenix-postgres:/var/lib/postgresql/data \
    postgres:16
fi

for _ in $(seq 1 30); do
  if docker exec vebgenix-postgres pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
    break
  fi
  sleep 5
done
docker exec vebgenix-postgres pg_isready -U "$DB_USER" -d "$DB_NAME"

cat >/tmp/vebgenix-ec2-compat.sql <<'SQL'
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY,
  email TEXT,
  raw_user_meta_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID,
  email TEXT UNIQUE,
  full_name TEXT,
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'ACCOUNTANT', 'STAFF', 'TEACHER', 'STUDENT', 'PARENT')),
  campus_scope TEXT CHECK (campus_scope IN ('SCHOOL', 'PU', 'ALL')),
  all_campuses_access BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tenant_id UUID,
  ADD COLUMN IF NOT EXISTS all_campuses_access BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$ SELECT NULL::uuid $$;

CREATE TABLE IF NOT EXISTS public.bootstrap_sql_migrations (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
SQL

docker exec -i vebgenix-postgres \
  psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" \
  < /tmp/vebgenix-ec2-compat.sql

for file in "$MIGRATIONS_DIR"/*.sql; do
  name="$(basename "$file")"
  applied=$(docker exec vebgenix-postgres \
    psql -tA -U "$DB_USER" -d "$DB_NAME" \
    -c "SELECT 1 FROM public.bootstrap_sql_migrations WHERE name = '$name' LIMIT 1;")

  if [ "$applied" = "1" ]; then
    continue
  fi

  if [ "$name" = "005_add_tenant_constraints.sql" ]; then
    docker exec vebgenix-postgres \
      psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" \
      -c "INSERT INTO public.bootstrap_sql_migrations(name) VALUES ('$name');"
    continue
  fi

  docker exec -i vebgenix-postgres \
    psql -v ON_ERROR_STOP=1 -1 -U "$DB_USER" -d "$DB_NAME" \
    < "$file"

  docker exec vebgenix-postgres \
    psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" \
    -c "INSERT INTO public.bootstrap_sql_migrations(name) VALUES ('$name');"
done
