CREATE TABLE public.monthly_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  month TEXT NOT NULL,
  stats JSONB NOT NULL,
  report JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX monthly_reports_user_month_idx ON public.monthly_reports(user_id, month DESC, created_at DESC);
ALTER TABLE public.monthly_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Reports own select" ON public.monthly_reports FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Reports own insert" ON public.monthly_reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Reports own delete" ON public.monthly_reports FOR DELETE TO authenticated USING (auth.uid() = user_id);