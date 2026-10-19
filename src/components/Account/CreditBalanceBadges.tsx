import { Clock, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { CreditBalance } from "@/lib/database.types";

/** The monthly and purchased credit counts, each shown only when above zero. */
export function CreditBalanceBadges({ credits }: { credits: Pick<CreditBalance, "monthly_credits" | "purchased_credits"> | null | undefined }) {
  const monthly = credits?.monthly_credits ?? 0;
  const purchased = credits?.purchased_credits ?? 0;
  return (
    <>
      {monthly > 0 && (
        <Badge variant="info">
          <Clock /> {monthly.toLocaleString()} monthly credits
        </Badge>
      )}
      {purchased > 0 && (
        <Badge variant="credit">
          <Zap /> {purchased.toLocaleString()} purchased credits
        </Badge>
      )}
    </>
  );
}
