import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell, BellOff } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getAlertPreference, setAlertPreference } from "@/lib/notification-preferences.functions";

export function AlertPreferenceToggle() {
  const queryClient = useQueryClient();
  const fetchPref = useServerFn(getAlertPreference);
  const savePref = useServerFn(setAlertPreference);

  const { data } = useQuery({
    queryKey: ["alert-preference"],
    queryFn: () => fetchPref(),
  });

  const mutation = useMutation({
    mutationFn: (alertsEnabled: boolean) => savePref({ data: { alertsEnabled } }),
    onSuccess: (result) => {
      queryClient.setQueryData(["alert-preference"], { alertsEnabled: result.alertsEnabled });
      toast.success(result.alertsEnabled ? "Fund alert emails are on." : "Fund alert emails are off.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const enabled = data?.alertsEnabled ?? true;

  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-4 py-4">
        <div className="flex items-start gap-3">
          {enabled ? (
            <Bell className="mt-0.5 h-5 w-5 text-primary" />
          ) : (
            <BellOff className="mt-0.5 h-5 w-5 text-muted-foreground" />
          )}
          <div>
            <Label htmlFor="alert-emails" className="text-sm font-semibold">
              Email me about fund activity
            </Label>
            <p className="text-sm text-muted-foreground">
              New applications, status changes and wire confirmations on your funds, sent as they happen.
            </p>
          </div>
        </div>
        <Switch
          id="alert-emails"
          checked={enabled}
          disabled={mutation.isPending}
          onCheckedChange={(checked) => mutation.mutate(checked)}
        />
      </CardContent>
    </Card>
  );
}
