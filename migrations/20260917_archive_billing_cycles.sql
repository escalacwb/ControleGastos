-- Archive legacy invoices without deleting their financial history.
ALTER TABLE public.billing_cycles ADD COLUMN IF NOT EXISTS archived_at timestamptz;
