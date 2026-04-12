import { useState } from "react";
import { toast } from "sonner";

interface UseCancelSubscriptionOptions {
  accessToken: string | null;
  renewalDate: string | null;
  onSuccess: () => void;
}

export function useCancelSubscription({
  accessToken,
  renewalDate,
  onSuccess,
}: UseCancelSubscriptionOptions) {
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [justCancelled, setJustCancelled] = useState(false);

  const handleCancel = async () => {
    if (!accessToken) return;
    setCancelling(true);
    try {
      const res = await fetch("/api/dodo-cancel-subscription", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Cancellation failed");
      }
      setJustCancelled(true);
      setConfirmCancel(false);
      onSuccess();
      toast.success(
        "Subscription cancelled. Access continues until " +
          (renewalDate ?? "the end of your billing period") +
          "."
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not cancel";
      toast.error(message);
    } finally {
      setCancelling(false);
    }
  };

  return { cancelling, confirmCancel, setConfirmCancel, justCancelled, handleCancel };
}
