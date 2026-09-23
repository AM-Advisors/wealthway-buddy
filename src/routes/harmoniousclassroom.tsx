import { Link, createFileRoute } from "@tanstack/react-router";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ARTICLES, articlesInCategory } from "@/lib/marketing/articles";
import { marketingHead } from "@/lib/marketing/seo";
import { RESOURCE_CATEGORIES } from "@/lib/marketing/site-config";

export const Route = createFileRoute("/harmoniousclassroom")({
  head: () =>
    marketingHead({
      path: "/harmoniousclassroom",
      title: "Harmonious Classroom — Guides on SPVs, Funds & Cap Tables",
      description:
        "Guides on SPVs, fund administration, investor onboarding, cap tables, compliance and private markets from the Harmonious team.",
      // Not indexed here until the Wix articles are imported; the live Wix page keeps ranking meanwhile.
      noindex: ARTICLES.length === 0,
      breadcrumbs: [
        { name: "Home", path: "/" },
        { name: "Resources", path: "/harmoniousclassroom" },
      ],
    }),
  component: ClassroomPage,
});

function ClassroomPage() {
  const cats = RESOURCE_CATEGORIES.map((c) => ({ ...c, articles: articlesInCategory(c.slug) })).filter(
    (c) => c.articles.length > 0,
  );
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-14 lg:py-20">
        <h1 className="text-3xl leading-tight sm:text-4xl">Harmonious Classroom</h1>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          Practical guides on SPVs, fund administration, investor onboarding, cap tables and private markets.
        </p>
        {cats.length === 0 ? (
          <p className="mt-10 text-muted-foreground">Articles are being moved here.</p>
        ) : (
          cats.map((c) => (
            <section key={c.slug} className="mt-12">
              <h2 className="text-xl">{c.label}</h2>
              <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {c.articles.map((a) => (
                  <li key={a.slug} className="rounded-xl border bg-card p-5">
                    <Link to="/post/$slug" params={{ slug: a.slug }} className="font-medium hover:underline">
                      {a.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
