-- Make exchange_rates per-user with unique (user_id, rate_date)
ALTER TABLE public.exchange_rates ADD COLUMN IF NOT EXISTS user_id uuid;

-- Backfill user_id from updated_by where possible
UPDATE public.exchange_rates SET user_id = updated_by WHERE user_id IS NULL AND updated_by IS NOT NULL;

-- Delete any rows without an owner (cannot attribute)
DELETE FROM public.exchange_rates WHERE user_id IS NULL;

ALTER TABLE public.exchange_rates ALTER COLUMN user_id SET NOT NULL;

-- Drop old unique on rate_date if it exists
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.exchange_rates'::regclass
      AND contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE public.exchange_rates DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

-- Drop any unique indexes on rate_date alone
DROP INDEX IF EXISTS public.exchange_rates_rate_date_key;
DROP INDEX IF EXISTS public.exchange_rates_rate_date_idx;

ALTER TABLE public.exchange_rates
  ADD CONSTRAINT exchange_rates_user_date_unique UNIQUE (user_id, rate_date);

-- Update RLS policies to scope per-user
DROP POLICY IF EXISTS exchange_rates_select ON public.exchange_rates;
DROP POLICY IF EXISTS exchange_rates_insert ON public.exchange_rates;
DROP POLICY IF EXISTS exchange_rates_update ON public.exchange_rates;
DROP POLICY IF EXISTS exchange_rates_delete ON public.exchange_rates;

CREATE POLICY exchange_rates_select ON public.exchange_rates
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY exchange_rates_insert ON public.exchange_rates
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND auth.uid() = updated_by);

CREATE POLICY exchange_rates_update ON public.exchange_rates
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND auth.uid() = updated_by);

CREATE POLICY exchange_rates_delete ON public.exchange_rates
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
