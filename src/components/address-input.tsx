/**
 * The shared Harmonious address field.
 *
 * Search first, structured fields always visible, unit kept separate, and a
 * manual path that is never blocked — if the lookup provider is unavailable or
 * cannot find the address, the user still gets through and the address is
 * marked for validation later.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { resolveAddressSuggestion, suggestAddress } from "@/lib/address.functions";

export interface AddressValue {
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  /** Set by the component; forms should pass it through when saving. */
  entryMethod?: "autocomplete" | "manual";
  providerPlaceId?: string | null;
  formatted?: string | null;
}

export const EMPTY_ADDRESS: AddressValue = {
  line1: "",
  line2: "",
  city: "",
  region: "",
  postalCode: "",
  country: "",
  entryMethod: "manual",
  providerPlaceId: null,
  formatted: null,
};

interface Props {
  value: AddressValue;
  onChange: (value: AddressValue) => void;
  label?: string;
  /** Shown above the search box, e.g. "Registered address". */
  description?: string;
  disabled?: boolean;
  idPrefix?: string;
}

function newSessionToken() {
  try {
    return crypto.randomUUID();
  } catch {
    return String(Date.now());
  }
}

export function AddressInput({
  value,
  onChange,
  label = "Address",
  description,
  disabled,
  idPrefix = "addr",
}: Props) {
  const suggest = useServerFn(suggestAddress);
  const resolve = useServerFn(resolveAddressSuggestion);

  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Array<{ id: string; description: string }>>([]);
  const [searching, setSearching] = useState(false);
  const [lookupAvailable, setLookupAvailable] = useState(true);
  const [manual, setManual] = useState(false);
  const session = useRef(newSessionToken());
  const requestSeq = useRef(0);

  const set = useCallback(
    (patch: Partial<AddressValue>) => onChange({ ...value, ...patch }),
    [onChange, value],
  );

  useEffect(() => {
    if (manual || disabled || query.trim().length < 3) {
      setItems([]);
      return;
    }
    const seq = ++requestSeq.current;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await suggest({
          data: {
            query,
            country: value.country && value.country.length === 2 ? value.country : null,
            sessionToken: session.current,
          },
        });
        if (seq !== requestSeq.current) return;
        setLookupAvailable(Boolean(res?.autocomplete));
        setItems(res?.suggestions ?? []);
      } catch {
        if (seq === requestSeq.current) {
          setLookupAvailable(false);
          setItems([]);
        }
      } finally {
        if (seq === requestSeq.current) setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, manual, disabled, value.country, suggest]);

  async function choose(placeId: string, description: string) {
    setItems([]);
    setQuery(description);
    try {
      const parts = await resolve({ data: { placeId, sessionToken: session.current } });
      session.current = newSessionToken();
      if (parts) {
        onChange({
          ...value,
          line1: parts.line1 ?? value.line1,
          // The unit stays the user's to edit.
          line2: parts.line2 ?? value.line2,
          city: parts.city ?? "",
          region: parts.region ?? "",
          postalCode: parts.postalCode ?? "",
          country: (parts.country ?? value.country ?? "").toUpperCase(),
          formatted: parts.formatted ?? description,
          providerPlaceId: placeId,
          entryMethod: "autocomplete",
        });
        setManual(true);
        return;
      }
    } catch {
      /* fall through to manual entry */
    }
    setManual(true);
    set({ entryMethod: "manual", formatted: description });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-search`}>{label}</Label>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>

      {!manual ? (
        <div className="space-y-2">
          <Input
            id={`${idPrefix}-search`}
            placeholder="Search for your address"
            value={query}
            disabled={disabled}
            autoComplete="off"
            onChange={(e) => setQuery(e.target.value)}
          />
          {searching ? <p className="text-xs text-muted-foreground">Searching…</p> : null}
          {items.length > 0 ? (
            <ul className="rounded-md border border-border divide-y divide-border">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => void choose(item.id, item.description)}
                  >
                    {item.description}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {!lookupAvailable ? (
            <p className="text-xs text-muted-foreground">
              Address search is unavailable right now — you can enter your address below.
            </p>
          ) : null}
          <Button
            type="button"
            variant="link"
            className="h-auto p-0 text-xs"
            onClick={() => {
              setManual(true);
              set({ entryMethod: "manual" });
            }}
          >
            Can&apos;t find your address? Enter manually
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2 space-y-1">
            <Label htmlFor={`${idPrefix}-line1`}>Street address</Label>
            <Input
              id={`${idPrefix}-line1`}
              value={value.line1}
              disabled={disabled}
              onChange={(e) => set({ line1: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2 space-y-1">
            <Label htmlFor={`${idPrefix}-line2`}>Apartment / suite / unit</Label>
            <Input
              id={`${idPrefix}-line2`}
              value={value.line2}
              disabled={disabled}
              onChange={(e) => set({ line2: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-city`}>City</Label>
            <Input
              id={`${idPrefix}-city`}
              value={value.city}
              disabled={disabled}
              onChange={(e) => set({ city: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-region`}>State / province / region</Label>
            <Input
              id={`${idPrefix}-region`}
              value={value.region}
              disabled={disabled}
              onChange={(e) => set({ region: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-postal`}>Postal code</Label>
            <Input
              id={`${idPrefix}-postal`}
              value={value.postalCode}
              disabled={disabled}
              onChange={(e) => set({ postalCode: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-country`}>Country (2-letter code)</Label>
            <Input
              id={`${idPrefix}-country`}
              value={value.country}
              maxLength={2}
              disabled={disabled}
              onChange={(e) => set({ country: e.target.value.toUpperCase() })}
            />
          </div>
          <div className="sm:col-span-2">
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 text-xs"
              onClick={() => setManual(false)}
            >
              Search for a different address
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default AddressInput;
