import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PARTNER_BANKS, bankLabel } from "@/lib/fund-request-extras";
import { listBankPackets, retireBankPacket, uploadBankPacket } from "@/lib/fund-request-extras.functions";

export const Route = createFileRoute("/_authenticated/admin/bank-packets")({
  head: () => ({
    meta: [
      { title: "Bank setup packets - Harmonious" },
      { name: "description", content: "Manage the bank account setup paperwork clients receive when Harmonious coordinates banking." },
      { property: "og:title", content: "Bank setup packets - Harmonious" },
      { property: "og:description", content: "Manage partner bank setup paperwork for new funds and SPVs." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BankPacketsPage,
});

function BankPacketsPage() {
  const qc = useQueryClient();
  const list = useServerFn(listBankPackets);
  const upload = useServerFn(uploadBankPacket);
  const retire = useServerFn(retireBankPacket);
  const q = useQuery({ queryKey: ["bank-packets-admin"], queryFn: () => list({ data: {} }) });
  const [bank, setBank] = useState<string>("mercury");
  const [title, setTitle] = useState("");
  const [checklist, setChecklist] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  const add = useMutation({
    mutationFn: async (file: File) => {
      const buf = new Uint8Array(await file.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return upload({ data: { bank: bank as any, title: title.trim() || file.name, checklist, fileName: file.name, contentType: file.type || "application/pdf", base64: btoa(bin) } });
    },
    onSuccess: () => { toast.success("Packet added."); setTitle(""); setChecklist(""); void qc.invalidateQueries({ queryKey: ["bank-packets-admin"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Upload failed."),
    onSettled: () => { if (ref.current) ref.current.value = ""; },
  });
  const ret = useMutation({
    mutationFn: (id: string) => retire({ data: { id } }),
    onSuccess: () => { toast.success("Packet retired."); void qc.invalidateQueries({ queryKey: ["bank-packets-admin"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Could not retire."),
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Bank setup packets</h1>
        <p className="text-sm text-muted-foreground">Clients see the current packet when they choose that bank on a new fund request. Retired packets are kept, not deleted.</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Add a packet</CardTitle><CardDescription>PDF, Word or ZIP, up to 20 MB.</CardDescription></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Bank</Label>
            <Select value={bank} onValueChange={setBank}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PARTNER_BANKS.map((b) => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Business account application" /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>What the client needs to provide</Label><Textarea value={checklist} onChange={(e) => setChecklist(e.target.value)} placeholder={"Certificate of formation\nEIN letter\nOperating agreement\nID for each beneficial owner"} /></div>
          <div className="sm:col-span-2">
            <input ref={ref} type="file" className="hidden" accept=".pdf,.doc,.docx,.zip" onChange={(e) => { const f = e.target.files?.[0]; if (f) add.mutate(f); }} />
            <Button disabled={add.isPending} onClick={() => ref.current?.click()}>{add.isPending ? "Uploading…" : "Choose file and add"}</Button>
          </div>
        </CardContent>
      </Card>
      {PARTNER_BANKS.map((b) => {
        const rows = (q.data?.packets ?? []).filter((p) => p.bank === b.value);
        return (
          <Card key={b.value}>
            <CardHeader><CardTitle className="text-base">{bankLabel(b.value)}</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {rows.length === 0 ? <p className="text-muted-foreground">No packet yet - clients are told Harmonious will send paperwork.</p> : rows.map((p) => (
                <div key={p.id} className="flex items-start justify-between gap-3 rounded-md border p-3">
                  <div>
                    <p className="font-medium">{p.title}</p>
                    {p.url && <a className="text-primary underline" href={p.url} target="_blank" rel="noreferrer">{p.fileName}</a>}
                    {p.checklist && <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">{p.checklist}</p>}
                  </div>
                  <Button size="sm" variant="outline" disabled={ret.isPending} onClick={() => ret.mutate(p.id)}>Retire</Button>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
