
CREATE TABLE public.google_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  google_email text,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  token_expires_at timestamptz NOT NULL,
  scope text,
  calendar_id text DEFAULT 'primary',
  sync_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.google_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Google integration own select"
  ON public.google_integrations FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Google integration own insert"
  ON public.google_integrations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Google integration own update"
  ON public.google_integrations FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Google integration own delete"
  ON public.google_integrations FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER google_integrations_set_updated_at
  BEFORE UPDATE ON public.google_integrations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS google_event_id text,
  ADD COLUMN IF NOT EXISTS google_synced_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_calendar_events_google ON public.calendar_events(user_id, google_event_id);
