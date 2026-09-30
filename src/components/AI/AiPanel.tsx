import { Sparkles, X } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { IconButton } from '@/components/ui/icon-button';
import { useProjectStore } from '@/store/useProjectStore';
import { useResponsive } from '@/hooks/useResponsive';
import {
  INSPECTOR_WIDTH_DESKTOP, INSPECTOR_WIDTH_TABLET,
  PANEL_MARGIN, RIGHT_RESERVED_DESKTOP, RIGHT_RESERVED_TABLET,
} from '@/constants/layout';
import { ConnectTab } from './ConnectTab';
import { ActivityTab } from './ActivityTab';
import { belowToolbarTop } from './aiUtils';
import { useAiPanelStore, type AiPanelTab } from './useAiPanelStore';

export function ExperimentalBadge() {
  return (
    <span className="text-[8px] bg-amber-500/15 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-full font-medium tracking-wider uppercase shrink-0">
      Experimental
    </span>
  );
}

/**
 * Floating island under the toolbar. Sits left of the Inspector instead of
 * competing with it: it is intentionally not part of the one-tool-at-a-time
 * surfaces (its state lives in useAiPanelStore, not the project store).
 */
export function AiPanel() {
  const open = useAiPanelStore((s) => s.open);
  const tab = useAiPanelStore((s) => s.tab);
  const setTab = useAiPanelStore((s) => s.setTab);
  const closePanel = useAiPanelStore((s) => s.closePanel);
  const isInspectorOpen = useProjectStore((s) => s.isInspectorOpen);
  const { isMobile, isTablet } = useResponsive();

  if (!open) return null;

  const width = isTablet ? INSPECTOR_WIDTH_TABLET : INSPECTOR_WIDTH_DESKTOP;
  const right = isMobile ? 8 : isInspectorOpen ? (isTablet ? RIGHT_RESERVED_TABLET : RIGHT_RESERVED_DESKTOP) : PANEL_MARGIN;

  return (
    <div
      data-testid="ai-panel"
      data-walkthrough="ai-panel"
      className="absolute z-40 flex flex-col overflow-hidden rounded-2xl border border-border/50 bg-background/85 backdrop-blur-xl shadow-2xl pointer-events-auto transition-all duration-300"
      style={{
        top: belowToolbarTop(isMobile),
        right,
        ...(isMobile ? { left: 8 } : { width }),
        maxHeight: isMobile ? '55dvh' : 'calc(100dvh - 88px - 240px)',
        minHeight: 240,
      }}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border/40 bg-background/50 p-3.5 px-4 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles size={14} className="text-primary shrink-0" />
          <h2 className="text-xs font-medium tracking-tight">AI</h2>
          <ExperimentalBadge />
        </div>
        <IconButton variant="ghost" size="xs" aria-label="Close AI panel" onClick={closePanel}>
          <X size={14} />
        </IconButton>
      </div>
      <Tabs value={tab} onValueChange={(v) => setTab(v as AiPanelTab)} className="flex flex-col min-h-0 flex-1">
        <div className="px-3 pt-3 shrink-0">
          <TabsList className="w-full">
            <TabsTrigger value="connect" className="text-xs">Connect</TabsTrigger>
            <TabsTrigger value="activity" className="text-xs">Activity</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="connect" className="overflow-y-auto min-h-0 flex-1 mt-0">
          <ConnectTab />
        </TabsContent>
        <TabsContent value="activity" className="flex flex-col min-h-0 flex-1 mt-0">
          <ActivityTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
