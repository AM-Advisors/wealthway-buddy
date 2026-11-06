ALTER TABLE public.bank_statement_lines ADD COLUMN IF NOT EXISTS matched_asset_id uuid REFERENCES public.portfolio_assets(id) ON DELETE SET NULL;
ALTER TABLE public.bank_statement_lines ADD COLUMN IF NOT EXISTS matched_vendor text CHECK (matched_vendor IS NULL OR char_length(matched_vendor) BETWEEN 1 AND 120);
ALTER TABLE public.fund_transaction_tags ADD COLUMN IF NOT EXISTS portfolio_asset_id uuid REFERENCES public.portfolio_assets(id) ON DELETE SET NULL;
ALTER TABLE public.fund_transaction_tags ADD COLUMN IF NOT EXISTS vendor_name text;