import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Most tab bars show at most this many tabs; the rest go under "More". */
export const MAX_VISIBLE_TABS = 5;

type TabsCtx = { value: string | undefined; setValue: (v: string) => void };
const TabsValueContext = React.createContext<TabsCtx | null>(null);

const Tabs = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root>
>(({ value, defaultValue, onValueChange, ...props }, ref) => {
  const [inner, setInner] = React.useState<string | undefined>(defaultValue);
  const current = value ?? inner;
  const setValue = React.useCallback(
    (v: string) => {
      if (value === undefined) setInner(v);
      onValueChange?.(v);
    },
    [value, onValueChange],
  );
  const ctx = React.useMemo(() => ({ value: current, setValue }), [current, setValue]);
  return (
    <TabsValueContext.Provider value={ctx}>
      <TabsPrimitive.Root ref={ref} value={current} onValueChange={setValue} {...props} />
    </TabsValueContext.Provider>
  );
});
Tabs.displayName = TabsPrimitive.Root.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

type TriggerEl = React.ReactElement<React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>>;

function flatten(children: React.ReactNode): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  React.Children.forEach(children, (c) => {
    if (React.isValidElement(c) && c.type === React.Fragment) {
      out.push(...flatten((c.props as { children?: React.ReactNode }).children));
    } else if (c !== null && c !== undefined && c !== false) {
      out.push(c);
    }
  });
  return out;
}

const isTrigger = (n: React.ReactNode): n is TriggerEl =>
  React.isValidElement(n) && n.type === TabsTrigger;

/** Pick which triggers stay visible: the first ones, always including the active tab. */
export function splitTabs(values: string[], active: string | undefined, max = MAX_VISIBLE_TABS) {
  if (values.length <= max) return { visible: values, more: [] as string[] };
  const keep = max - 1;
  const visible = values.slice(0, keep);
  if (active && !visible.includes(active) && values.includes(active)) {
    visible[keep - 1] = active;
  }
  return { visible, more: values.filter((v) => !visible.includes(v)) };
}

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & { condense?: boolean }
>(({ className, children, condense = true, ...props }, ref) => {
  const ctx = React.useContext(TabsValueContext);
  const items = flatten(children);
  const triggers = items.filter(isTrigger);
  const listClass = cn(
    "scrollbar-none flex h-9 w-full max-w-full items-center justify-start gap-1 overflow-x-auto rounded-lg bg-muted p-1 text-muted-foreground sm:inline-flex sm:w-auto",
    className,
  );

  if (!condense || !ctx || triggers.length <= MAX_VISIBLE_TABS || triggers.length !== items.length) {
    return (
      <TabsPrimitive.List ref={ref} className={listClass} {...props}>
        {children}
      </TabsPrimitive.List>
    );
  }

  const byValue = new Map(triggers.map((t) => [t.props.value, t]));
  const { visible, more } = splitTabs(
    triggers.map((t) => t.props.value),
    ctx.value,
  );
  const activeInMore = !!ctx.value && more.includes(ctx.value);

  return (
    <TabsPrimitive.List ref={ref} className={cn(listClass, "overflow-visible")} {...props}>
      {visible.map((v) => byValue.get(v))}
      {/* Hidden triggers keep keyboard/ARIA wiring for tabs in the More menu. */}
      {more.map((v) => {
        const t = byValue.get(v)!;
        return React.cloneElement(t, { key: v, className: cn(t.props.className, "hidden") });
      })}
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            activeInMore && "bg-background text-foreground shadow",
          )}
        >
          More <ChevronDown className="h-3.5 w-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {more.map((v) => {
            const t = byValue.get(v)!;
            return (
              <DropdownMenuItem
                key={v}
                disabled={t.props.disabled}
                onSelect={() => ctx.setValue(v)}
                className={cn(ctx.value === v && "font-semibold")}
              >
                {t.props.children}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </TabsPrimitive.List>
  );
});
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
