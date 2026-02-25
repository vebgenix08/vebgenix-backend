-- Migration: Add UUID v7 support
-- UUID v7 provides time-ordered UUIDs that improve database performance
-- compared to random UUID v4 by reducing index fragmentation

-- Create UUID v7 generation function
-- Based on draft RFC: https://datatracker.ietf.org/doc/html/draft-peabody-dispatch-new-uuid-format
CREATE OR REPLACE FUNCTION uuid_generate_v7()
RETURNS uuid
AS $$
DECLARE
  unix_ts_ms bytea;
  uuid_bytes bytea;
BEGIN
  unix_ts_ms = substring(int8send(floor(extract(epoch from clock_timestamp()) * 1000)::bigint) from 3);
  
  -- Construct UUID v7: 48 bits timestamp + 12 bits random + 2 bits version + 62 bits random
  uuid_bytes = unix_ts_ms || gen_random_bytes(10);
  
  -- Set version (0111) and variant (10)
  uuid_bytes = set_byte(uuid_bytes, 6, (get_byte(uuid_bytes, 6) & 15) | 112);
  uuid_bytes = set_byte(uuid_bytes, 8, (get_byte(uuid_bytes, 8) & 63) | 128);
  
  RETURN encode(uuid_bytes, 'hex')::uuid;
END
$$
LANGUAGE plpgsql
VOLATILE;

-- Comment for documentation
COMMENT ON FUNCTION uuid_generate_v7() IS 'Generate time-ordered UUID v7 for better database performance';
