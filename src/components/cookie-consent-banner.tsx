import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { COOKIE_CATEGORIES, OPEN_SETTINGS_EVENT, readConsent, saveConsent, type CookieCategory } from "@/lib/cookie-consent";

type Choices = Record<CookieCategory, boolean>;
const NONE: Choices = { functional: false, analytics: false, marketing: false };
const ALL: Choices = { functional: true, analytics: true, marketing: true };

export function CookieConsentBanner() {
  const [showBanner, setShowBanner] = useState(false);
  const [open, setOpen] = useState(false);
  const [choices, setChoices] = useState<Choices>(NONE);

  useEffect(() => {
    const saved = readConsent();
    if (saved) setChoices({ functional: saved.functional, analytics: saved.analytics, marketing: saved.marketing });
    else setShowBanner(true);
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_SETTINGS_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, onOpen);
  }, []);

  const commit = (c: Choices) => {
    saveConsent(c);
    setChoices(c);
    setShowBanner(false);
    setOpen(false);
  };

  return (
    <>
      {showBanner && (
        <div role="region" aria-label="Cookie consent" className="fixed inset-x-0 bottom-0 z-50 border-t bg-background p-4 shadow-lg">
          <div className="mx-auto flex max-w-5xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-foreground">
              We use necessary cookies to run this site. With your permission we'd also use optional cookies for preferences, analytics and marketing.{" "}
              <Link to="/privacy" className="text-primary underline">Privacy policy</Link>
            </p>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setOpen(true)}>Settings</Button>
              <Button variant="outline" size="sm" onClick={() => commit(NONE)}>Reject optional</Button>
              <Button size="sm" onClick={() => commit(ALL)}>Accept all</Button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cookie settings</DialogTitle>
            <DialogDescription>Choose which optional cookies Harmonious may use. You can change this anytime from the site footer.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {COOKIE_CATEGORIES.map((c) => (
              <div key={c.id} className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-foreground">{c.label}</p>
                  <p className="text-xs text-muted-foreground">{c.description}</p>
                </div>
                <Switch
                  aria-label={c.label}
                  checked={c.id === "necessary" ? true : choices[c.id]}
                  disabled={c.id === "necessary"}
                  onCheckedChange={(v) => c.id !== "necessary" && setChoices((p) => ({ ...p, [c.id]: v }))}
                />
              </div>
            ))}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => commit(NONE)}>Reject optional</Button>
            <Button onClick={() => commit(choices)}>Save choices</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
