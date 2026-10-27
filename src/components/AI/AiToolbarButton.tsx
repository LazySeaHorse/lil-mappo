import { Sparkles } from 'lucide-react';
import { ToolbarButton } from '@/components/Toolbar/ToolbarPrimitives';
import { useAiPanelStore } from './useAiPanelStore';

/** Toolbar entry for the Experimental AI panel. Open to everyone so the feature is discoverable; turning it on needs an account. */
export function AiToolbarButton({ iconSize = 16 }: { iconSize?: number }) {
  const open = useAiPanelStore((s) => s.open);
  const openPanel = useAiPanelStore((s) => s.openPanel);
  const closePanel = useAiPanelStore((s) => s.closePanel);

  const handleClick = () => (open ? closePanel() : openPanel());

  return (
    <ToolbarButton
      icon={<Sparkles size={iconSize} />}
      label="AI (Experimental)"
      hideLabel
      onClick={handleClick}
      walkthroughTarget="ai"
      className={open ? 'text-primary bg-primary/10' : undefined}
    />
  );
}
