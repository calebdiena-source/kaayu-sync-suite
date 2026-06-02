ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auth read rates" ON public.exchange_rates;
DROP POLICY IF EXISTS "Auth insert rates" ON public.exchange_rates;
DROP POLICY IF EXISTS "Admin update rates" ON public.exchange_rates;
DROP POLICY IF EXISTS "Admin delete rates" ON public.exchange_rates;
DROP POLICY IF EXISTS "exchange_rates_select" ON public.exchange_rates;
DROP POLICY IF EXISTS "exchange_rates_insert" ON public.exchange_rates;
DROP POLICY IF EXISTS "exchange_rates_update" ON public.exchange_rates;
DROP POLICY IF EXISTS "exchange_rates_delete" ON public.exchange_rates;

CREATE POLICY "exchange_rates_select"
ON public.exchange_rates FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

CREATE POLICY "exchange_rates_insert"
ON public.exchange_rates FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = updated_by);

CREATE POLICY "exchange_rates_update"
ON public.exchange_rates FOR UPDATE
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() = updated_by);

CREATE POLICY "exchange_rates_delete"
ON public.exchange_rates FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));