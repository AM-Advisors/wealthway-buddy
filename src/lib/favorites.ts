import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Favorite = { id: string; url: string; label: string; icon: string | null; position: number };
const KEY = ["user-favorites"];
const db = () => supabase as any;
export const MAX_FAVORITES = 25;

/** Same-app paths only; never external links. */
export function safeFavoriteUrl(url: string) {
  return url.startsWith("/") && !url.startsWith("//") && url.length <= 500;
}

export function useFavorites() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<Favorite[]> => {
      const { data, error } = await db().from("user_favorites").select("id, url, label, icon, position").order("position").order("created_at");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });
  const list = q.data ?? [];
  const done = () => qc.invalidateQueries({ queryKey: KEY });

  const add = useMutation({
    mutationFn: async (f: { url: string; label: string; icon?: string | null }) => {
      if (!safeFavoriteUrl(f.url)) throw new Error("Only pages in this app can be saved.");
      if (list.length >= MAX_FAVORITES) throw new Error(`You can save up to ${MAX_FAVORITES} favorites.`);
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Sign in first.");
      const pos = list.reduce((m, x) => Math.max(m, x.position), 0) + 1;
      const { error } = await db().from("user_favorites").insert({ user_id: u.user.id, url: f.url, label: f.label.slice(0, 80) || "Page", icon: f.icon ?? null, position: pos });
      if (error) throw error;
    },
    onSettled: done,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await db().from("user_favorites").delete().eq("id", id); if (error) throw error; },
    onMutate: (id) => qc.setQueryData<Favorite[]>(KEY, (o) => (o ?? []).filter((x) => x.id !== id)),
    onSettled: done,
  });
  const rename = useMutation({
    mutationFn: async ({ id, label }: { id: string; label: string }) => { const { error } = await db().from("user_favorites").update({ label: label.slice(0, 80) }).eq("id", id); if (error) throw error; },
    onSettled: done,
  });
  const move = useMutation({
    mutationFn: async ({ id, dir }: { id: string; dir: -1 | 1 }) => {
      const i = list.findIndex((x) => x.id === id), j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return;
      const a = list[i]!, b = list[j]!;
      await db().from("user_favorites").update({ position: j }).eq("id", a.id);
      await db().from("user_favorites").update({ position: i }).eq("id", b.id);
    },
    onSettled: done,
  });

  const find = (url: string) => list.find((x) => x.url === url);
  const toggle = (f: { url: string; label: string; icon?: string | null }) => {
    const ex = find(f.url);
    return ex ? remove.mutateAsync(ex.id) : add.mutateAsync(f);
  };
  return { list, isLoading: q.isLoading, find, toggle, add, remove, rename, move };
}
