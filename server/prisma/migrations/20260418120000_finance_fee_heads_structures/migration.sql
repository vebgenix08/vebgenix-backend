-- Extend fee_heads with description, isActive, timestamps
ALTER TABLE "fee_heads"
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Extend fee_structures with academic_year, program, totals, timestamps
ALTER TABLE "fee_structures"
  ADD COLUMN IF NOT EXISTS "academic_year_id" UUID REFERENCES "academic_years"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "program_id" UUID REFERENCES "programs"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "total_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- New fee_structure_components table
CREATE TABLE IF NOT EXISTS "fee_structure_components" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "fee_structure_id" UUID NOT NULL,
  "fee_head_id" UUID NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "due_date" DATE,
  "is_optional" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fee_structure_components_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fsc_structure_fk" FOREIGN KEY ("fee_structure_id") REFERENCES "fee_structures"("id") ON DELETE CASCADE,
  CONSTRAINT "fsc_head_fk" FOREIGN KEY ("fee_head_id") REFERENCES "fee_heads"("id")
);

CREATE INDEX IF NOT EXISTS "fsc_structure_idx" ON "fee_structure_components"("fee_structure_id");
CREATE INDEX IF NOT EXISTS "fsc_head_idx" ON "fee_structure_components"("fee_head_id");
