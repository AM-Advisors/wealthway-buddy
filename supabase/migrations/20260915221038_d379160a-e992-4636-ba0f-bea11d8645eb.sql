INSERT INTO public.policy_documents (kind, title, body, version, effective_date, published)
VALUES
  ('cap_privacy', 'CapTable Privacy Notice',
   'CapTable Privacy Notice — effective September 15, 2026. This notice supplements the Harmonious Capital Administration LLC Privacy Policy and applies to the CapTable service: the company, stakeholder, holding, certificate and shareholder-access information recorded there, where it comes from, how it is used, who can see it, how long it is kept and how to contact us. The full text is published at /cap-table-privacy and is shown in the portal when you accept it.',
   1, DATE '2026-09-15', true),
  ('cap_terms', 'CapTable Terms of Service',
   'CapTable Terms of Service — effective September 15, 2026. These terms govern use of the Harmonious CapTable service and supplement the Master Service Agreement and Statement of Work: what the service is and is not, founder responsibilities, required setup, certificates, transfers, shareholder access, plans and fees, data and export, suspension and termination, limitation of liability and changes to these terms. The full text is published at /cap-table-terms and is shown in the portal when you accept it.',
   1, DATE '2026-09-15', true)
ON CONFLICT (kind, version) DO NOTHING;