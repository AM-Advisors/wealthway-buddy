import { useQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { resolveHelp, type HelpEntry } from "@/lib/help-content";
import { PROFESSIONAL_DETERMINATION_NOTE } from "@/lib/client-portal-model";

function usePublishedHelp() {
  return useQuery({
    queryKey: ["help-content"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("help_content")
        .select("help_key, title, short_description, long_description, learn_more_url, version")
        .eq("status", "published");
      return (data ?? []) as Partial<HelpEntry>[];
    },
  });
}

/**
 * Three levels of help from one registry key: tap/click/keyboard opens a short
 * definition; "Learn more" opens a drawer with the longer explanation.
 * Popover (not hover-only tooltip) so it works on phones and with the keyboard.
 */
export function HelpTip({ helpKey, label }: { helpKey: string; label?: string }) {
  const published = usePublishedHelp();
  const entry = resolveHelp(helpKey, published.data ?? []);
  const [drawer, setDrawer] = useState(false);
  if (!entry) return null;
  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`What is ${label ?? entry.title}?`}
            className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full align-middle text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Info className="h-3.5 w-3.5" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 text-sm" side="top" align="start">
          <p className="font-medium">{entry.title}</p>
          <p className="mt-1 text-muted-foreground">{entry.short_description}</p>
          {entry.professional ? <p className="mt-2 text-xs text-muted-foreground">{PROFESSIONAL_DETERMINATION_NOTE}</p> : null}
          {entry.long_description || entry.learn_more_url ? (
            <button type="button" className="mt-2 text-xs font-medium text-primary underline-offset-2 hover:underline" onClick={() => setDrawer(true)}>
              Learn more
            </button>
          ) : null}
        </PopoverContent>
      </Popover>
      <Sheet open={drawer} onOpenChange={setDrawer}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{entry.title}</SheetTitle>
            <SheetDescription>{entry.short_description}</SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-3 text-sm">
            {entry.long_description ? <p>{entry.long_description}</p> : null}
            {entry.professional ? <p className="text-muted-foreground">{PROFESSIONAL_DETERMINATION_NOTE}</p> : null}
            {entry.learn_more_url ? (
              <a href={entry.learn_more_url} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                Read more
              </a>
            ) : null}
            <p className="text-xs text-muted-foreground">This explains what the term means in Harmonious. It isn't legal, tax or investment advice.</p>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
