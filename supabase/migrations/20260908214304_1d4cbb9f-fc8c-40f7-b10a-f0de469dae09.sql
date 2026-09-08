REVOKE ALL ON FUNCTION public.can_read_wire_instructions(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_wire_instructions(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_wire_instructions() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_wire_instructions(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_wire_instructions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_wire_instructions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_wire_instructions(uuid, jsonb) TO authenticated;