import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveOffering, saveOfferingDocument, WIRE_FIELDS } from "@/lib/offerings.functions";
import { listAccessDirectory, assignFundAccess } from "@/lib/access.functions";
import { FundEntityCard } from "@/components/fund-entity-card";
import { inviteToFund } from "@/lib/invitations.functions";
import { listFundSetupAgreements } from "@/lib/fund-sow.functions";
import { REG_TYPES, regTypeDescription, type RegTypeValue } from "@/lib/reg-types";

export const Route = createFileRoute("/_authenticated/admin/setup")({
  head: () => ({
    meta: [
      { title: "Set Up a Fund | Harmonious Admin" },
      {
        name: "description",
        content:
          "Guided Harmonious setup: create a fund, add its offering documents, then assign fund managers and investors.",
      },
      { property: "og:title", content: "Set Up a Fund | Harmonious Admin" },
      {
        property: "og:description",
        content: "Create a fund, add documents and grant access in a few guided steps.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SetupPage,
});

const WIRE_LABELS: Record<string, string> = {
  bank_name: "Bank name",
  bank_address: "Bank address",
  account_name: "Account name",
  account_number: "Account number",
  routing_number: "Routing number",
  swift: "SWIFT / BIC",
  memo: "Reference / memo instructions",
};

const STEPS = ["Fund details", "Entity and banking", "Documents", "Access"] as const;

type WireForm = Record<string, string>;

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function dollarsToCents(value: string) {
  const n = Number(String(value).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function SetupPage() {
  const createFund = useServerFn(saveOffering);
  const addDocument = useServerFn(saveOfferingDocument);
  const loadDirectory = useServerFn(listAccessDirectory);
  const assign = useServerFn(assignFundAccess);
  const invite = useServerFn(inviteToFund);
  const queryClient = useQueryClient();

  const [step, setStep] = useState(0);
  const [clientId, setClientId] = useState("");
  const [sowId, setSowId] = useState("");
  const [fundId, setFundId] = useState<string | null>(null);

  const [fund, setFund] = useState({
    name: "",
    slug: "",
    summary: "",
    reg_type: "506b" as RegTypeValue,
    min_investment: "50000",
    target_raise: "",
    is_open: true,
  });
  const [wire, setWire] = useState<WireForm>(
    Object.fromEntries(WIRE_FIELDS.map((f) => [f, ""])) as WireForm,
  );

  const [docForm, setDocForm] = useState({
    title: "",
    doc_type: "agreement",
    requires_signature: true,
    body: "",
  });
  const [documents, setDocuments] = useState<
    { id: string; title: string; doc_type: string; requires_signature: boolean }[]
  >([]);

  const [grants, setGrants] = useState<{ email: string; kind: "manager" | "investor" }[]>([]);
  const [assignKind, setAssignKind] = useState<"manager" | "investor">("manager");
  const [existingUserId, setExistingUserId] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");

  const loadAgreements = useServerFn(listFundSetupAgreements);
  const agreementsQuery = useQuery({
    queryKey: ["fund-setup-agreements"],
    queryFn: () => loadAgreements(),
    retry: false,
  });
  const clientList = ((agreementsQuery.data as any)?.clients ?? []) as {
    id: string;
    name: string;
    status: string;
  }[];
  const allSows = ((agreementsQuery.data as any)?.sows ?? []) as {
    id: string;
    clientId: string;
    title: string;
    sowType: string;
    status: string;
    signedOn: string | null;
    signed: boolean;
    reason: string | null;
  }[];
  const clientSows = allSows.filter((s) => s.clientId === clientId);
  const chosenSow = allSows.find((s) => s.id === sowId) ?? null;

  const directoryQuery = useQuery({
    queryKey: ["access-directory"],
    queryFn: () => loadDirectory(),
    enabled: step === 3,
    retry: false,
  });

  const users = useMemo(() => (directoryQuery.data?.users ?? []) as any[], [directoryQuery.data]);

  const fundMutation = useMutation({
    mutationFn: () =>
      createFund({
        data: {
          ...(fundId ? { id: fundId } : {}),
          ...(fundId ? {} : { client_id: clientId, sow_id: sowId }),
          name: fund.name.trim(),
          slug: fund.slug.trim() || slugify(fund.name),
          summary: fund.summary.trim(),
          reg_type: fund.reg_type,
          min_investment_cents: dollarsToCents(fund.min_investment),
          target_raise_cents: fund.target_raise.trim() ? dollarsToCents(fund.target_raise) : null,
          is_open: fund.is_open,
          wire_instructions: wire,
        } as any,
      }),
    onSuccess: (result: any) => {
      setFundId(result.id as string);
      toast.success("Fund saved.");
      setStep(1);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not save the fund."),
  });

  const documentMutation = useMutation({
    mutationFn: () =>
      addDocument({
        data: {
          offering_id: fundId!,
          title: docForm.title.trim(),
          doc_type: docForm.doc_type.trim(),
          body: docForm.body.trim(),
          requires_signature: docForm.requires_signature,
          sort_order: documents.length,
        } as any,
      }),
    onSuccess: (result: any) => {
      setDocuments((prev) => [
        ...prev,
        {
          id: result.id as string,
          title: docForm.title.trim(),
          doc_type: docForm.doc_type.trim(),
          requires_signature: docForm.requires_signature,
        },
      ]);
      setDocForm({ title: "", doc_type: "agreement", requires_signature: true, body: "" });
      toast.success("Document added.");
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Could not add that document."),
  });

  const assignMutation = useMutation({
    mutationFn: async () => {
      if (existingUserId) {
        await assign({ data: { userId: existingUserId, offeringId: fundId!, kind: assignKind } });
        const person = users.find((u) => u.userId === existingUserId);
        return { email: person?.email ?? "That person", created: false };
      }
      const result: any = await invite({
        data: {
          email: inviteEmail.trim(),
          name: inviteName.trim(),
          offeringIds: [fundId!],

          role: assignKind === "manager" ? "fund_manager" : "investor",
          sendEmail: true,
        },
      });
      return { email: result.email as string, created: Boolean(result.created) };
    },
    onSuccess: (result) => {
      setGrants((prev) => [...prev, { email: result.email, kind: assignKind }]);
      setExistingUserId("");
      setInviteEmail("");
      setInviteName("");
      toast.success(
        result.created ? `Account created for ${result.email}.` : `Access granted to ${result.email}.`,
      );
      void queryClient.invalidateQueries({ queryKey: ["access-directory"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not grant access."),
  });

  const canSaveFund =
    fund.name.trim().length >= 2 &&
    (fund.slug.trim() || slugify(fund.name)).length >= 2 &&
    (Boolean(fundId) || Boolean(chosenSow?.signed));
  const canAddDoc = docForm.title.trim().length >= 2 && docForm.body.trim().length >= 10;
  const canAssign = Boolean(existingUserId) || /\S+@\S+\.\S+/.test(inviteEmail.trim());

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl">Set up a fund</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Create the fund, add the paperwork investors will read and sign, then choose who can see it.
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to="/admin/access">Fund access</Link>
        </Button>
      </div>

      <ol className="mt-6 grid gap-2 sm:grid-cols-3">
        {STEPS.map((label, index) => (
          <li
            key={label}
            className={`rounded-md border px-3 py-2 text-sm ${
              index === step
                ? "border-primary bg-primary/5 font-medium"
                : index < step
                  ? "text-muted-foreground"
                  : "text-muted-foreground/70"
            }`}
          >
            {index + 1}. {label}
            {index < step && <span className="ml-2 text-xs">done</span>}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Fund details</CardTitle>
            <p className="text-sm text-muted-foreground">
              Bank details are stored privately and only shown to people with access to this fund.
            </p>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="rounded-md border p-4">
              <p className="text-sm font-medium">Client and signed statement of work</p>
              <p className="mt-1 text-xs text-muted-foreground">
                A fund can only be created once its client has signed the statement of work that
                covers it. That agreement sets the services, fees and terms for this fund.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Client</Label>
                  <Select
                    value={clientId}
                    onValueChange={(v) => {
                      setClientId(v);
                      setSowId("");
                    }}
                    disabled={Boolean(fundId)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a client" />
                    </SelectTrigger>
                    <SelectContent>
                      {clientList.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Statement of work</Label>
                  <Select
                    value={sowId}
                    onValueChange={setSowId}
                    disabled={Boolean(fundId) || !clientId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a signed agreement" />
                    </SelectTrigger>
                    <SelectContent>
                      {clientSows.map((s) => (
                        <SelectItem key={s.id} value={s.id} disabled={!s.signed}>
                          {s.title}
                          {s.signed ? "" : ` — ${s.reason}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {clientId && clientSows.length === 0 && (
                <p className="mt-3 text-xs text-destructive">
                  This client has no statement of work yet. Create and sign one under Pricing and
                  agreements first.
                </p>
              )}
              {chosenSow?.signed && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Signed on{" "}
                  {chosenSow.signedOn
                    ? new Date(chosenSow.signedOn).toLocaleDateString("en-US")
                    : "—"}
                  . Creating the fund attaches it to this agreement.
                </p>
              )}
              {!fundId && !chosenSow?.signed && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Choose a signed agreement to continue.
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="name">Fund name</Label>
              <Input
                id="name"
                value={fund.name}
                onChange={(e) =>
                  setFund((prev) => ({
                    ...prev,
                    name: e.target.value,
                    slug: prev.slug ? prev.slug : slugify(e.target.value),
                  }))
                }
                placeholder="Harmonious Growth Fund I"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="slug">Web address name</Label>
              <Input
                id="slug"
                value={fund.slug}
                onChange={(e) => setFund({ ...fund, slug: slugify(e.target.value) })}
                placeholder="harmonious-growth-fund-i"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="summary">Description</Label>
              <Textarea
                id="summary"
                rows={4}
                value={fund.summary}
                onChange={(e) => setFund({ ...fund, summary: e.target.value })}
                placeholder="What this fund invests in and who it is for."
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label>Exemption</Label>
                <Select
                  value={fund.reg_type}
                  onValueChange={(v) => setFund({ ...fund, reg_type: v as RegTypeValue })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REG_TYPES.map((rt) => (
                      <SelectItem key={rt.value} value={rt.value}>
                        {rt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{regTypeDescription(fund.reg_type)}</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="min">Minimum investment ($)</Label>
                <Input
                  id="min"
                  inputMode="decimal"
                  value={fund.min_investment}
                  onChange={(e) => setFund({ ...fund, min_investment: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="target">Target raise ($)</Label>
                <Input
                  id="target"
                  inputMode="decimal"
                  value={fund.target_raise}
                  onChange={(e) => setFund({ ...fund, target_raise: e.target.value })}
                  placeholder="Optional"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={fund.is_open}
                onCheckedChange={(v) => setFund({ ...fund, is_open: Boolean(v) })}
              />
              Open for new commitments
            </label>

            <div className="mt-2 rounded-md border p-4">
              <p className="text-sm font-medium">Wire details</p>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                {WIRE_FIELDS.map((field) => (
                  <div key={field} className="grid gap-2">
                    <Label htmlFor={field}>{WIRE_LABELS[field] ?? field}</Label>
                    <Input
                      id={field}
                      value={wire[field] ?? ""}
                      onChange={(e) => setWire({ ...wire, [field]: e.target.value })}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                onClick={() => fundMutation.mutate()}
                disabled={!canSaveFund || fundMutation.isPending}
              >
                {fundMutation.isPending ? "Saving…" : fundId ? "Save and continue" : "Create fund"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 1 && fundId && (
        <div className="mt-8 grid gap-4">
          <FundEntityCard fundId={fundId} />
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep(0)}>
              Back
            </Button>
            <Button onClick={() => setStep(2)}>Continue to documents</Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Offering documents</CardTitle>
            <p className="text-sm text-muted-foreground">
              Add each document investors will read. Mark the ones they must sign before funding.
            </p>
          </CardHeader>
          <CardContent className="grid gap-4">
            {documents.length > 0 && (
              <ul className="grid gap-2">
                {documents.map((d) => (
                  <li key={d.id} className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <p className="text-sm font-medium">{d.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {d.doc_type.replace(/_/g, " ")}
                      </p>
                    </div>
                    <Badge variant={d.requires_signature ? "default" : "secondary"}>
                      {d.requires_signature ? "Signature required" : "For reading"}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}

            <div className="grid gap-4 rounded-md border p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="doc-title">Title</Label>
                  <Input
                    id="doc-title"
                    value={docForm.title}
                    onChange={(e) => setDocForm({ ...docForm, title: e.target.value })}
                    placeholder="Subscription Agreement"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="doc-kind">Kind</Label>
                  <Input
                    id="doc-kind"
                    value={docForm.doc_type}
                    onChange={(e) => setDocForm({ ...docForm, doc_type: e.target.value })}
                    placeholder="agreement, ppm, operating_agreement…"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="doc-body">Document text</Label>
                <Textarea
                  id="doc-body"
                  rows={10}
                  value={docForm.body}
                  onChange={(e) => setDocForm({ ...docForm, body: e.target.value })}
                  placeholder="Paste the full text of the document."
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={docForm.requires_signature}
                  onCheckedChange={(v) =>
                    setDocForm({ ...docForm, requires_signature: Boolean(v) })
                  }
                />
                Investors must sign this document
              </label>
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  onClick={() => documentMutation.mutate()}
                  disabled={!canAddDoc || documentMutation.isPending}
                >
                  {documentMutation.isPending ? "Adding…" : "Add document"}
                </Button>
              </div>
            </div>

            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button onClick={() => setStep(3)} disabled={documents.length === 0}>
                Continue to access
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Fund managers and investors</CardTitle>
            <p className="text-sm text-muted-foreground">
              Managers see the investor roster for this fund. Investors can view the offering and start
              onboarding.
            </p>
          </CardHeader>
          <CardContent className="grid gap-4">
            {grants.length > 0 && (
              <ul className="grid gap-2">
                {grants.map((g, i) => (
                  <li
                    key={`${g.email}-${i}`}
                    className="flex items-center justify-between rounded-md border p-3 text-sm"
                  >
                    <span>{g.email}</span>
                    <Badge variant="secondary">
                      {g.kind === "manager" ? "Fund manager" : "Investor"}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}

            <div className="grid gap-4 rounded-md border p-4">
              <div className="grid gap-2">
                <Label>Role</Label>
                <Select
                  value={assignKind}
                  onValueChange={(v) => setAssignKind(v as "manager" | "investor")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manager">Fund manager</SelectItem>
                    <SelectItem value="investor">Investor</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label>Existing person</Label>
                <Select
                  value={existingUserId || "none"}
                  onValueChange={(v) => setExistingUserId(v === "none" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose someone" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Invite by email instead</SelectItem>
                    {users.map((u) => (
                      <SelectItem key={u.userId} value={u.userId}>
                        {u.email}
                        {u.legalName ? ` — ${u.legalName}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {!existingUserId && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="invite-email">Email</Label>
                    <Input
                      id="invite-email"
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="person@example.com"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="invite-name">Full name (optional)</Label>
                    <Input
                      id="invite-name"
                      value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <Button
                  variant="outline"
                  onClick={() => assignMutation.mutate()}
                  disabled={!canAssign || assignMutation.isPending}
                >
                  {assignMutation.isPending ? "Granting…" : "Grant access"}
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap justify-between gap-2">
              <Button variant="ghost" onClick={() => setStep(2)}>
                Back
              </Button>
              <div className="flex gap-2">
                <Button asChild variant="outline">
                  <Link to="/admin/access">Manage access</Link>
                </Button>
                {fundId && (
                  <Button asChild>
                    <Link to="/admin/fund/$fundId" params={{ fundId }}>
                      Open the fund page
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
