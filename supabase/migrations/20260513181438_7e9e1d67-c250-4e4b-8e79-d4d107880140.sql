ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS storage_provider text NOT NULL DEFAULT 'supabase',
  ADD COLUMN IF NOT EXISTS google_file_id text;