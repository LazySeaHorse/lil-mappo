import { Sparkles } from 'lucide-react';
import { ToolbarButton } from '@/components/Toolbar/ToolbarPrimitives';
import { ProBadge } from '@/components/ui/pro-badge';
import { useAiAccess } from './useAiAccess';
import { useAiPanelStore } from './useAiPanelStore';

/** Toolbar entry for the Experimental AI panel. Open to everyone so the feature is discoverable; turning it on is gated in the panel. */
export function AiToolbarButton({ iconSize = 16 }: { iconSize?: number }) {
  const { isPro } = useAiAccess();
  const open = useAiPanelStore((s) => s.open);
  const openPanel = useAiPanelStore((s) => s.openPanel);
  const closePanel = useAiPanelStore((s) => s.closePanel);

  const handleClick = () => (open ? closePanel() : openPanel());

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
      className={open ? 'text-primary bg-primary/10' : undefined}
    />
  );
}
