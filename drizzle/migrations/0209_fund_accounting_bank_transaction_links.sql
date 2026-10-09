ALTER TABLE public.fund_investment_transactions ADD COLUMN IF NOT EXISTS bank_transaction_id uuid REFERENCES public.bank_transactions(id);
ALTER TABLE public.fund_expense_records ADD COLUMN IF NOT EXISTS bank_transaction_id uuid REFERENCES public.bank_transactions(id);
ALTER TABLE public.fund_payable_settlements ADD COLUMN IF NOT EXISTS bank_transaction_id uuid REFERENCES public.bank_transactions(id);
CREATE UNIQUE INDEX IF NOT EXISTS fund_investment_tx_bank_tx_uq ON public.fund_investment_transactions(bank_transaction_id) WHERE bank_transaction_id IS NOT NULL AND status <> 'rejected';
CREATE UNIQUE INDEX IF NOT EXISTS fund_expense_bank_tx_uq ON public.fund_expense_records(bank_transaction_id) WHERE bank_transaction_id IS NOT NULL AND status <> 'rejected';
CREATE UNIQUE INDEX IF NOT EXISTS fund_settlement_bank_tx_uq ON public.fund_payable_settlements(bank_transaction_id) WHERE bank_transaction_id IS NOT NULL AND status <> 'rejected';