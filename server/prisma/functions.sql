-- Custom PostgreSQL functions (idempotent - safe to run on every deploy)

-- Sequence for registration numbers
CREATE SEQUENCE IF NOT EXISTS reg_number_seq START 1001;

-- Generate unique student registration numbers: YYYY-NNNNNN
CREATE OR REPLACE FUNCTION generate_reg_number()
RETURNS TEXT AS $$
DECLARE
  year_prefix TEXT;
  seq_val BIGINT;
BEGIN
  year_prefix := TO_CHAR(NOW(), 'YYYY');
  seq_val := nextval('reg_number_seq');
  RETURN year_prefix || '-' || LPAD(seq_val::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;
