
ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS color TEXT;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS due_time TEXT,
  ADD COLUMN IF NOT EXISTS google_event_id TEXT,
  ADD COLUMN IF NOT EXISTS google_synced_at TIMESTAMPTZ;
