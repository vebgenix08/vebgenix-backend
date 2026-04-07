-- Create sequence for registration numbers (starts at 1001 to keep numbers > 1000)
CREATE SEQUENCE IF NOT EXISTS reg_number_seq START 1001;

-- Create function to generate a unique registration number
-- Format: YYYY-NNNNNN (e.g., 2026-001001)
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
