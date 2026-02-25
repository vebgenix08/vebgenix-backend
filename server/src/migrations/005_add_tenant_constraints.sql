-- Migration 005: Add Tenant Constraints (Run AFTER backfill)
-- This should only be run after seed script has backfilled data

-- Add NOT NULL constraints to enquiries
ALTER TABLE enquiries ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE enquiries ALTER COLUMN campus_id SET NOT NULL;
ALTER TABLE enquiries ADD CONSTRAINT fk_enquiries_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE enquiries ADD CONSTRAINT fk_enquiries_campus FOREIGN KEY (campus_id) REFERENCES campuses(id) ON DELETE CASCADE;

-- Add NOT NULL constraints to applications
ALTER TABLE applications ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE applications ALTER COLUMN campus_id SET NOT NULL;
ALTER TABLE applications ADD CONSTRAINT fk_applications_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE applications ADD CONSTRAINT fk_applications_campus FOREIGN KEY (campus_id) REFERENCES campuses(id) ON DELETE CASCADE;

-- Add NOT NULL constraints to students
ALTER TABLE students ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE students ALTER COLUMN campus_id SET NOT NULL;
ALTER TABLE students ADD CONSTRAINT fk_students_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE students ADD CONSTRAINT fk_students_campus FOREIGN KEY (campus_id) REFERENCES campuses(id) ON DELETE CASCADE;

-- Update unique constraints to be tenant-scoped
-- Drop old unique constraints if they exist
ALTER TABLE students DROP CONSTRAINT IF EXISTS students_reg_no_key;
ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_application_id_key;
ALTER TABLE enquiries DROP CONSTRAINT IF EXISTS enquiries_enquiry_id_key;

-- Add new tenant-scoped unique constraints
ALTER TABLE students ADD CONSTRAINT students_tenant_reg_no_unique UNIQUE(tenant_id, reg_no);
ALTER TABLE applications ADD CONSTRAINT applications_tenant_application_id_unique UNIQUE(tenant_id, application_id);
ALTER TABLE enquiries ADD CONSTRAINT enquiries_tenant_enquiry_id_unique UNIQUE(tenant_id, enquiry_id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_enquiries_tenant_id ON enquiries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_enquiries_campus_id ON enquiries(campus_id);
CREATE INDEX IF NOT EXISTS idx_applications_tenant_id ON applications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_applications_campus_id ON applications(campus_id);
CREATE INDEX IF NOT EXISTS idx_students_tenant_id ON students(tenant_id);
CREATE INDEX IF NOT EXISTS idx_students_campus_id ON students(campus_id);
