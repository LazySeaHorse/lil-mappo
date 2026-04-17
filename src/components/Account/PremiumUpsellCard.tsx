import React from "react";
import { Crown } from "lucide-react";

interface PremiumUpsellCardProps {
  onClick: () => void;
}

export function PremiumUpsellCard({ onClick }: PremiumUpsellCardProps) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-secondary/30 hover:bg-secondary/50 rounded-xl p-4 flex items-start gap-4 transition-all group border border-border/10 hover:border-primary/20"
    >
      <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20 shadow-sm group-hover:scale-110 transition-transform">
        <Crown size={24} className="text-primary" />
      </div>
      <div>
        <p className="text-base font-bold tracking-tight">Expand your horizons</p>
        <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
          Get cloud renders, parallel exports, and unlimited cloud saves with a
          premium plan.
        </p>
      </div>
    </button>
  );
}
