ALTER TABLE public.folders ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'document';
CREATE INDEX IF NOT EXISTS idx_folders_user_kind ON public.folders(user_id, kind);