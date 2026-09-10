import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { assignFundToClient, listClients, saveClient } from "@/lib/contracts.functions";

export function ClientsBoard() {
  const load = useServerFn(listClients);
  const create = useServerFn(saveClient);
  const assign = useServerFn(assignFundToClient);
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["clients"],
    queryFn: () => load(),
    retry: false,
  });

  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [signedOn, setSignedOn] = useState("");

  const add = useMutation({
    mutationFn: () =>
      create({
        data: {
          name,
          status: "active",
          primary_contact_email: contact,
          msa_signed_on: signedOn,
        } as any,
      }),
    onSuccess: () => {
      toast.success("Client added.");
      setName("");
      setContact("");
      setSignedOn("");
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "That didn't save."),
  });

  const link = useMutation({
    mutationFn: (vars: { offeringId: string; clientId: string }) => assign({ data: vars }),
    onSuccess: () => {
      toast.success("Fund assigned.");
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "That didn't save."),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (isError) {
    return (
      <p className="text-sm text-muted-foreground">
        {(error as any)?.message ?? "This area is for the Harmonious team."}
      </p>
    );
  }

  const clients = data?.clients ?? [];
  const unassigned = data?.unassignedFunds ?? [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Add a client</CardTitle>
          <CardDescription>
            The client signs the master agreement. Each engagement then has its own statement of
            work.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <Label htmlFor="client-name">Client name</Label>
            <Input id="client-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="client-contact">Main contact email</Label>
            <Input
              id="client-contact"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="client-signed">Agreement signed</Label>
            <Input
              id="client-signed"
              type="date"
              value={signedOn}
              onChange={(e) => setSignedOn(e.target.value)}
            />
          </div>
          <div className="sm:col-span-4">
            <Button disabled={name.trim().length < 2 || add.isPending} onClick={() => add.mutate()}>
              Add client
            </Button>
          </div>
        </CardContent>
      </Card>

      {unassigned.length ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Funds with no client yet</CardTitle>
            <CardDescription>
              Until a fund belongs to a client, no scope is recorded for it and every service page
              keeps working as before.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {unassigned.map((fund: any) => (
              <div key={fund.id} className="flex flex-wrap items-center gap-2 rounded-md border p-3">
                <span className="text-sm">{fund.name}</span>
                <div className="ml-auto w-56">
                  <Select
                    onValueChange={(clientId) => link.mutate({ offeringId: fund.id, clientId })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Assign to client" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        {clients.map((client: any) => (
          <Card key={client.id}>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base">{client.name}</CardTitle>
                  <CardDescription>
                    {client.msa_signed_on
                      ? `Agreement signed ${client.msa_signed_on}`
                      : "Agreement date not recorded"}
                  </CardDescription>
                </div>
                <Badge variant={client.status === "active" ? "default" : "secondary"}>
                  {client.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              <p className="text-xs text-muted-foreground">
                {client.sows.length} statement{client.sows.length === 1 ? "" : "s"} of work ·{" "}
                {client.funds.length} fund{client.funds.length === 1 ? "" : "s"}
              </p>
              <div className="flex flex-wrap gap-1">
                {client.funds.map((f: any) => (
                  <Badge key={f.id} variant="outline">
                    {f.name}
                  </Badge>
                ))}
              </div>
              <Button asChild size="sm" variant="outline">
                <Link to="/admin/contracts/$clientId" params={{ clientId: client.id }}>
                  Open scope
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
