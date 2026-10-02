import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STAFF_ROLES, USER_TYPES, inviteStaff } from "@/lib/staff-access.functions";

export function InviteStaffForm() {
  const qc = useQueryClient();
  const invite = useServerFn(inviteStaff);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company] = useState("Harmonious");
  const [userType, setUserType] = useState<string>("operations");
  const [perms, setPerms] = useState<string[]>([]);

  const typeRole = USER_TYPES.find((t) => t.value === userType)!.role;

  const m = useMutation({
    mutationFn: async () => {
      const roles = Array.from(new Set([typeRole, ...perms]));
      const failures: string[] = [];
      for (const role of roles) {
        try {
          await invite({ data: { email, name, role } });
        } catch (e) {
          failures.push(`${role}: ${(e as Error).message}`);
        }
      }
      if (failures.length === roles.length) throw new Error(failures.join("; "));
      return failures;
    },
    onSuccess: (failures) => {
      toast.success(`Invitation saved for ${email}. Access applies when they first sign in.`);
      if (failures.length) toast.warning(`Some permissions were not added: ${failures.join("; ")}`);
      setName(""); setEmail(""); setPerms([]);
      qc.invalidateQueries();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="max-w-2xl space-y-6">
      <p className="text-sm text-muted-foreground">Invite a Harmonious team member. No email is sent automatically; access applies on their first sign-in with this email.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>User details</CardTitle>
          <CardDescription>Only administrators can add users.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1"><Label htmlFor="n">Name</Label><Input id="n" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="e">Email</Label><Input id="e" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="space-y-1"><Label>Company name</Label><Input value={company} disabled /></div>
          <div className="space-y-1">
            <Label>User type</Label>
            <Select value={userType} onValueChange={setUserType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {USER_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Permissions</CardTitle>
          <CardDescription>Add extra access on top of the user type. Tax can only be granted by a super administrator.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {STAFF_ROLES.filter((r) => r.value !== typeRole).map((r) => (
            <label key={r.value} className="flex items-start gap-3">
              <Checkbox
                checked={perms.includes(r.value)}
                onCheckedChange={(v) => setPerms((p) => (v ? [...p, r.value] : p.filter((x) => x !== r.value)))}
              />
              <span><span className="block text-sm font-medium">{r.label}</span><span className="block text-xs text-muted-foreground">{r.note}</span></span>
            </label>
          ))}
        </CardContent>
      </Card>
      <Button disabled={!name.trim() || !email.includes("@") || m.isPending} onClick={() => m.mutate()}>
        {m.isPending ? "Saving..." : "Add user"}
      </Button>
    </div>
  );
}
