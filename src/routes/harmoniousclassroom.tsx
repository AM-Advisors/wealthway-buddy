import { Link, createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { listPublishedClassroom } from "@/lib/classroom-public.functions";
import { marketingHead } from "@/lib/marketing/seo";
import { RESOURCE_CATEGORIES } from "@/lib/marketing/site-config";

const publishedQuery = queryOptions({ queryKey: ["classroom-published"], queryFn: () => listPublishedClassroom() });

export const Route = createFileRoute("/harmoniousclassroom")({
  loader: ({ context }) => context.queryClient.ensureQueryData(publishedQuery),
  head: ({ loaderData }) =>
    marketingHead({
      path: "/harmoniousclassroom",
      title: "Harmonious Classroom - Guides on SPVs, Funds & Cap Tables",
      description:
        "Guides on SPVs, fund administration, investor onboarding, cap tables, compliance and private markets from the Harmonious team.",
      // Indexed only once at least one article is published here.
      noindex: !loaderData || loaderData.length === 0,
      breadcrumbs: [
        { name: "Home", path: "/" },
        { name: "Resources", path: "/harmoniousclassroom" },
      ],
    }),
  errorComponent: () => <p className="p-10 text-center">The Classroom couldn't load. Please refresh.</p>,
  notFoundComponent: () => <p className="p-10 text-center">Not found.</p>,
  component: ClassroomPage,
});

function ClassroomPage() {
  const { data: articles } = useSuspenseQuery(publishedQuery);
  const cats = RESOURCE_CATEGORIES.map((c) => ({ ...c, articles: articles.filter((a) => a.category === c.slug) })).filter(
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
                  <li key={a.slug} className="overflow-hidden rounded-xl border bg-card">
                    {a.heroImage && <img src={a.heroImage.src} alt={a.heroImage.alt} className="aspect-video w-full object-cover" loading="lazy" />}
                    <div className="p-5">
                      <Link to="/post/$slug" params={{ slug: a.slug }} className="font-medium hover:underline">
                        {a.title}
                      </Link>
                    </div>
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
