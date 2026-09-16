import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Item = { title: string; description: string; to: string };

export function FundWorkspaceSection({ title, description, items }: { title: string; description: string; items: Item[] }) {
  return <section><h2 className="text-xl">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{description}</p><div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{items.map((item) => <Card key={item.title} className="transition-colors hover:border-primary/50"><CardHeader><CardTitle className="text-base">{item.title}</CardTitle><CardDescription>{item.description}</CardDescription></CardHeader><CardContent><Link to={item.to as never} className="inline-flex items-center gap-1 text-sm font-medium text-primary">Open <ArrowUpRight className="h-4 w-4" aria-hidden /></Link></CardContent></Card>)}</div></section>;
}