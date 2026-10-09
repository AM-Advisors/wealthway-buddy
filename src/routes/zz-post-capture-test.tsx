import { createFileRoute } from "@tanstack/react-router";
import { PostBrandLayout } from "@/components/marketing/post-brand-layout";
export const Route = createFileRoute("/zz-post-capture-test")({ ssr: false, component: () => <div className="p-4"><PostBrandLayout title="The Fund Manager Pain Scale" body="Your fund operations shouldn't require detective work. Bring investor onboarding together." onAdd={() => {}} /></div> });
