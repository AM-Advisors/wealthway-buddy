import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getInvestorNotices } from "@/lib/investor-reporting.functions";

export const Route = createFileRoute("/_authenticated/activity")({
  head: () => ({
    meta: [
      { title: "Activity — Harmonious" },
      { name: "description", content: "Recent activity across your investments with Harmonious." },
      { property: "og:title", content: "Activity — Harmonious" },
      {
        property: "og:description",
        content: "Recent activity across your investments with Harmonious.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ActivityPage,
});

function ActivityPage() {
  const noticesFn = useServerFn(getInvestorNotices);
  const { data, isLoading } = useQuery({
    queryKey: ["investor-activity"],
    queryFn: () => noticesFn({ data: {} }) as Promise<any>,
  });

  const notices: any[] = Array.isArray(data) ? data : (data?.notices ?? []);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Activity</h1>
        <p className="text-sm text-muted-foreground">
          Everything Harmonious has recorded on your investments, newest first.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading && <p className="text-sm text-muted-foreground">Loading your activity…</p>}
          {!isLoading && notices.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nothing to show yet. Activity appears here as your investments progress.
            </p>
          )}
          {notices.map((notice: any, index: number) => (
            <div key={notice.id ?? index} className="rounded-md border p-3">
              <p className="text-sm font-medium">
                {notice.title ?? notice.notice_type ?? notice.kind ?? "Update"}
              </p>
              {notice.summary && (
                <p className="text-sm text-muted-foreground">{notice.summary}</p>
              )}
              {(notice.created_at || notice.issued_at) && (
                <p className="text-xs text-muted-foreground">
                  {new Date(notice.created_at ?? notice.issued_at).toLocaleDateString()}
                </p>
              )}
            </div>
          ))}
          <div className="pt-2 text-sm">
            <Link to="/investor-reporting" className="underline">
              Go to your reports
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
