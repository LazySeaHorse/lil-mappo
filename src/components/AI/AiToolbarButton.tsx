import { Sparkles } from 'lucide-react';
import { ToolbarButton } from '@/components/Toolbar/ToolbarPrimitives';
import { ProBadge } from '@/components/ui/pro-badge';
import { useAuthStore } from '@/store/useAuthStore';
import { useAiAccess } from './useAiAccess';
import { useAiPanelStore } from './useAiPanelStore';

/** Toolbar entry for the Experimental AI panel. Non-Pro users are sent to sign in / upgrade. */
export function AiToolbarButton({ iconSize = 16 }: { iconSize?: number }) {
  const { signedIn, isPro } = useAiAccess();
  const openAuthModal = useAuthStore((s) => s.openAuthModal);
  const openUpgradeModal = useAuthStore((s) => s.openUpgradeModal);
  const open = useAiPanelStore((s) => s.open);
  const openPanel = useAiPanelStore((s) => s.openPanel);
  const closePanel = useAiPanelStore((s) => s.closePanel);

  const handleClick = () => {
    if (!signedIn) openAuthModal();
    else if (!isPro) openUpgradeModal();
    else if (open) closePanel();
    else openPanel();
  };

  return (
    <ToolbarButton
      icon={
        <span className="relative inline-flex">
          <Sparkles size={iconSize} />
          {!isPro && <ProBadge className="absolute -top-2 -right-4 px-1 py-0 text-[7px]" />}
        </span>
      }
      label="AI (Experimental)"
      hideLabel
      onClick={handleClick}
      walkthroughTarget="ai"
      className={open && isPro ? 'text-primary bg-primary/10' : undefined}
    />
  );
}
