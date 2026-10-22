CREATE OR REPLACE FUNCTION public.save_linked_quote_draft(p_quote_id uuid, p_actor_id uuid, p_expected_at timestamptz, p_row jsonb, p_lines jsonb, p_sow_lines jsonb, p_services text, p_pricing text, p_sow_patch jsonb DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE q public.sales_quotes%ROWTYPE; s public.client_sows%ROWTYPE; r public.sales_quotes%ROWTYPE; sp public.client_sows%ROWTYPE; snap uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=p_actor_id AND role::text IN ('account_executive','sales','sales_management','cro','executive','super_admin')) THEN RAISE EXCEPTION 'Quote editing authority required'; END IF;
  SELECT * INTO q FROM public.sales_quotes WHERE id=p_quote_id FOR UPDATE;
  IF NOT FOUND OR q.status NOT IN ('draft','rejected') OR q.updated_at IS DISTINCT FROM p_expected_at THEN RAISE EXCEPTION 'Quote changed. Refresh before saving'; END IF;
  IF q.sow_id IS NOT NULL THEN
    SELECT * INTO s FROM public.client_sows WHERE id=q.sow_id FOR UPDATE;
    IF NOT FOUND OR s.client_id IS DISTINCT FROM q.client_id OR s.status <> 'draft' OR coalesce(s.stage,'draft') <> 'draft' OR s.locked OR s.client_signed_at IS NOT NULL OR s.executed_at IS NOT NULL OR s.signed_on IS NOT NULL THEN RAISE EXCEPTION 'SOW under review or signed. Create a new version or amendment'; END IF;
    IF EXISTS (SELECT 1 FROM public.agreement_signatures WHERE sow_id=s.id) OR EXISTS (SELECT 1 FROM public.sow_section_approvals WHERE sow_id=s.id) OR EXISTS (SELECT 1 FROM public.sow_pricing_snapshots WHERE sow_id=s.id AND locked) THEN RAISE EXCEPTION 'SOW has recorded approval or signature. Create a new version'; END IF;
    IF EXISTS (SELECT 1 FROM public.sales_quotes WHERE sow_id=s.id AND id<>q.id AND status<>'superseded') THEN RAISE EXCEPTION 'SOW has multiple current quotes. Resolve its links first'; END IF;
  END IF;
  r := jsonb_populate_record(q,p_row);
  IF q.sow_id IS NOT NULL AND r.client_id IS DISTINCT FROM q.client_id THEN RAISE EXCEPTION 'A linked agreement cannot move to another client'; END IF;
  IF jsonb_array_length(p_lines)=0 THEN RAISE EXCEPTION 'Add at least one service'; END IF;
  UPDATE public.sales_quotes SET title=r.title, client_id=r.client_id, contact_id=r.contact_id, deal_id=r.deal_id, offering_id=r.offering_id, valid_until=r.valid_until, notes=r.notes, sections=coalesce(r.sections, sales_quotes.sections), total_cents=r.total_cents, baseline_cents=r.baseline_cents, needs_exec_approval=r.needs_exec_approval, pricing_version_id=r.pricing_version_id, status='draft', approved_by=NULL, approved_at=NULL, updated_at=clock_timestamp() WHERE id=q.id;
  DELETE FROM public.sales_quote_lines WHERE quote_id=q.id;
  INSERT INTO public.sales_quote_lines (quote_id,service_key,label,quantity,unit_cents,baseline_unit_cents,line_cents,sort_order,billing_frequency,first_bill_on,bookkeeping_snapshot,service_details)
    SELECT q.id,x.service_key,x.label,x.quantity,x.unit_cents,x.baseline_unit_cents,x.line_cents,x.sort_order,x.billing_frequency,x.first_bill_on,x.bookkeeping_snapshot,x.service_details FROM jsonb_to_recordset(p_lines) AS x(service_key text,label text,quantity numeric,unit_cents bigint,baseline_unit_cents bigint,line_cents bigint,sort_order integer,billing_frequency text,first_bill_on date,bookkeeping_snapshot jsonb,service_details jsonb);
  IF q.sow_id IS NOT NULL THEN
    sp := jsonb_populate_record(s,coalesce(p_sow_patch,'{}'));
    IF sp.client_id IS DISTINCT FROM s.client_id OR sp.status <> 'draft' OR sp.signed_on IS NOT NULL THEN RAISE EXCEPTION 'Signing and activation use the agreement approval flow'; END IF;
    UPDATE public.client_sows SET title=r.title, offering_id=r.offering_id, generated_lines=p_sow_lines,
      effective_date=sp.effective_date,termination_date=sp.termination_date,notice_days=sp.notice_days,eligibility=sp.eligibility,
      notes=CASE WHEN p_sow_patch IS NULL THEN s.notes ELSE sp.notes END,updated_at=clock_timestamp() WHERE id=s.id;
    UPDATE public.sow_sections SET body=CASE key WHEN 'services' THEN p_services ELSE p_pricing END,updated_at=clock_timestamp() WHERE sow_id=s.id AND key IN ('services','pricing');
    SELECT id INTO snap FROM public.sow_pricing_snapshots WHERE sow_id=s.id;
    IF snap IS NOT NULL THEN
      DELETE FROM public.sow_pricing_lines WHERE snapshot_id=snap;
      INSERT INTO public.sow_pricing_lines(snapshot_id,service_key,label,pricing_model,standard_cents,final_cents,sort_order)
        SELECT snap,x.service_key,x.label,x.billing_frequency,round(x.quantity*x.baseline_unit_cents),x.line_cents,x.sort_order FROM jsonb_to_recordset(p_lines) AS x(service_key text,label text,quantity numeric,baseline_unit_cents bigint,line_cents bigint,sort_order integer,billing_frequency text);
    END IF;
    INSERT INTO public.contract_audit_events(actor_id,client_id,area,action,target,previous_value,new_value,source) VALUES(p_actor_id,s.client_id,'sow','quote_sow_synchronized',s.id::text,jsonb_build_object('title',s.title,'generated_lines',s.generated_lines),jsonb_build_object('title',r.title,'generated_lines',p_sow_lines),'linked_edit');
  END IF;
  INSERT INTO public.sales_quote_events(quote_id,event,actor_id,note) VALUES(q.id,'edited',p_actor_id,CASE WHEN q.sow_id IS NULL THEN 'Draft saved' ELSE 'Quote and SOW synchronized' END);
  RETURN q.id;
END $$;
REVOKE ALL ON FUNCTION public.save_linked_quote_draft(uuid,uuid,timestamptz,jsonb,jsonb,jsonb,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_linked_quote_draft(uuid,uuid,timestamptz,jsonb,jsonb,jsonb,text,text,jsonb) TO service_role;