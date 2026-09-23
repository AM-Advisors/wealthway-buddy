import { Link, createFileRoute, notFound } from "@tanstack/react-router";

import { Breadcrumbs } from "@/components/marketing/marketing-blocks";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getArticle } from "@/lib/marketing/articles";
import { marketingHead } from "@/lib/marketing/seo";
import { EDUCATIONAL_DISCLOSURE, RESOURCE_CATEGORIES } from "@/lib/marketing/site-config";

/** Preserves the Wix article URL shape: /post/<original-slug>. */
export const Route = createFileRoute("/post/$slug")({
  loader: ({ params }) => {
    const article = getArticle(params.slug);
    if (!article) throw notFound();
    return { article };
  },
  head: ({ loaderData, params }) => {
    if (!loaderData) return { meta: [{ title: "Article not found — Harmonious" }, { name: "robots", content: "noindex" }] };
    const a = loaderData.article;
    
    return marketingHead({
      path: `/post/${params.slug}`,
      title: a.metaTitle ?? `${a.title} | Harmonious`,
      description: a.metaDescription ?? a.title,
      ogTitle: a.ogTitle,
      ogDescription: a.ogDescription,
      image: a.ogImage ?? a.heroImage?.src,
      type: "article",
      breadcrumbs: [
        { name: "Home", path: "/" },
        { name: "Resources", path: "/harmoniousclassroom" },
        { name: a.title, path: `/post/${params.slug}` },
      ],
      article: {
        headline: a.title,
        author: a.author,
        datePublished: a.publishedAt,
        dateModified: a.updatedAt,
        image: a.heroImage?.src,
      },
    });
  },
  notFoundComponent: ArticleNotFound,
  component: ArticlePage,
});

function ArticlePage() {
  const { article: a } = Route.useLoaderData();
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-12">
        <Breadcrumbs
          crumbs={[
            { name: "Home", path: "/" },
            { name: "Resources", path: "/harmoniousclassroom" },
            { name: a.title, path: `/post/${a.slug}` },
          ]}
        />
        <h1 className="mt-6 text-3xl leading-tight sm:text-4xl">{a.title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {a.author ? `${a.author} · ` : ""}
          <time dateTime={a.publishedAt}>{new Date(a.publishedAt).toLocaleDateString("en-US", { dateStyle: "long" })}</time>
        </p>
        {a.heroImage && (
          <img src={a.heroImage.src} alt={a.heroImage.alt} className="mt-8 w-full rounded-xl" loading="eager" />
        )}
        <article className="prose prose-neutral mt-8 max-w-none" dangerouslySetInnerHTML={{ __html: a.contentHtml }} />
        {EDUCATIONAL_DISCLOSURE && <p className="mt-10 text-xs text-muted-foreground">{EDUCATIONAL_DISCLOSURE.text}</p>}
      </main>
      <SiteFooter />
    </div>
  );
}

function ArticleNotFound() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-20 text-center">
        <h1 className="text-3xl">Article not found</h1>
        <Link to="/harmoniousclassroom" className="mt-6 inline-block underline">Browse the Classroom</Link>
      </main>
      <SiteFooter />
    </div>
  );
}
