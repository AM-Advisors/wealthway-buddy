import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Harmonious — Investor Onboarding" },
      {
        name: "description",
        content:
          "Complete KYC identity verification, AML screening, accreditation, document signing and funding for your Harmonious fund subscription.",
      },
      { property: "og:title", content: "Harmonious — Investor Onboarding" },
      {
        property: "og:description",
        content: "A guided, compliant subscription process for qualified investors.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const { session } = useAuth();

  return (
    <main className="paper-grid min-h-screen">
      <section className="mx-auto max-w-3xl px-4 py-24">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Private placement · Qualified investors
        </p>
        <h1 className="mt-6 text-5xl leading-tight">Harmonious</h1>
        <p className="mt-6 max-w-xl text-muted-foreground">
          Subscribe in one guided flow: identity verification, anti-money-laundering screening,
          accreditation under Rule 506(b) or 506(c), fund document review and e-signature, then wire
          or ACH funding.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link to={session ? "/onboarding/kyc" : "/auth"}>Begin your application</Link>
          </Button>
          {session && (
            <>
              <Button asChild size="lg" variant="outline">
                <Link to="/dashboard">View application status</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/portal">Investor portal</Link>
              </Button>
            </>
          )}
        </div>
        <ol className="mt-16 grid gap-6 sm:grid-cols-2">
          {[
            ["01", "Identity (KYC)", "Legal name, address, tax ID and government identification."],
            ["02", "AML questionnaire", "Source of funds and wealth, PEP and sanctions declarations."],
            ["03", "Accreditation", "506(b) self-certification or 506(c) verified evidence."],
            ["04", "Documents & funding", "Review, sign, then fund by wire or ACH."],
          ].map(([num, title, body]) => (
            <li key={num} className="border-t pt-4">
              <span className="font-mono text-xs text-muted-foreground">{num}</span>
              <h2 className="mt-1 text-lg">{title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{body}</p>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
