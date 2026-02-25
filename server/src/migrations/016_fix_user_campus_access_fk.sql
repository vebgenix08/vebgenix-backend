-- 016_fix_user_campus_access_fk.sql
BEGIN;

ALTER TABLE public.user_campus_access
  DROP CONSTRAINT IF EXISTS user_campus_access_user_id_fkey;

ALTER TABLE public.user_campus_access
  ADD CONSTRAINT user_campus_access_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

COMMIT;
