import React from "react";
import { Mappo } from "@/components/Mappo/Mappo";

interface PremiumUpsellCardProps {
  onClick: () => void;
}

export function PremiumUpsellCard({ onClick }: PremiumUpsellCardProps) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-secondary/30 hover:bg-secondary/50 rounded-xl p-4 flex items-start gap-4 transition-all group border border-border/10 hover:border-primary/20"
    >
      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20 shadow-sm">
        <Mappo
          mood="explorer"
          className="h-8 w-auto mt-2 origin-bottom transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:-rotate-6"
        />
      </div>
      <div>
        <p className="text-base font-medium tracking-tight">Upgrade to Wanderer</p>
        <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
          Get unlimited cloud projects, higher-quality exports, and no watermark.
        </p>
      </div>
    </button>
  );
}
