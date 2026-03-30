#!/bin/bash
set -euo pipefail

STAGE="${1:?stage is required}"
REGION="${2:?region is required}"
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

cat >/tmp/vebgenix-ec2-init.sql <<'SQL'
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'auth') THEN
    EXECUTE 'DROP SCHEMA auth CASCADE';
  END IF;
END $$;

ALTER TABLE IF EXISTS public.employees DROP CONSTRAINT IF EXISTS employees_auth_user_id_key;
ALTER TABLE IF EXISTS public.employees DROP CONSTRAINT IF EXISTS employees_auth_user_id_fkey;
DROP INDEX IF EXISTS public.employees_auth_user_id_key;

ALTER TABLE IF EXISTS public.user_campus_access DROP CONSTRAINT IF EXISTS user_campus_access_user_id_campus_id_key;
ALTER TABLE IF EXISTS public.user_campus_access DROP CONSTRAINT IF EXISTS user_campus_access_user_id_fkey;
DROP INDEX IF EXISTS public.user_campus_access_user_id_campus_id_key;
DROP INDEX IF EXISTS public.idx_user_campus_access_user_id;

DROP TABLE IF EXISTS public.bootstrap_sql_migrations;
SQL

docker exec -i vebgenix-postgres \
  psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" \
  < /tmp/vebgenix-ec2-init.sql
