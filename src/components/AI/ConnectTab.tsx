import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { getAgentTools, isWebMcpSupported, useAgentStore } from '@/agent';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PinDropHero, PopupActions, PopupBody } from '@/components/ui/pin-drop';
import { pinDropContentClass, popupTextClass, popupTitleClass } from '@/components/ui/popup-variants';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/useAuthStore';
import { useAiAccess } from './useAiAccess';
import { hasAiConsent, recordAiConsent, useAiPanelStore } from './useAiPanelStore';

export const BRIDGE_DOCS_HINT = 'Using Claude Code, Codex or another local agent? Run the lil-mappo-bridge app on this computer and follow the commands it prints.';

export function AiStatusLine({ enabled, supported, count, bridged }: { enabled: boolean; supported: boolean; count: number; bridged: boolean }) {
  let text: string;
  if (!enabled) {
    text = 'Off. Turn it on to let an agent see this project’s tools.';
  } else if (count === 0 && !bridged) {
    text = supported
      ? 'Enabled, waiting for the tools to register.'
      : 'This browser does not support WebMCP (try Chrome with WebMCP enabled, then an agent such as Gemini in Chrome). To use a local agent instead, start the bridge.';
  } else {
    const via = [count > 0 && 'this browser (for example Gemini in Chrome)', bridged && 'the local bridge'].filter(Boolean).join(' and ');
    text = `${count || getAgentTools().length} tools available through ${via}.`;
  }
  return <p data-testid="ai-status" className="text-xs text-muted-foreground leading-relaxed">{text}</p>;
}

export function ConnectTab() {
  const enabled = useAgentStore((s) => s.enabled);
  const setEnabled = useAgentStore((s) => s.setEnabled);
  const count = useAiPanelStore((s) => s.registeredCount);
  const bridged = useAiPanelStore((s) => s.bridgeConnected);
  const followAi = useAiPanelStore((s) => s.followAi);
  const setFollowAi = useAiPanelStore((s) => s.setFollowAi);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const supported = isWebMcpSupported();
  const { signedIn, allowed } = useAiAccess();
  const openAuthModal = useAuthStore((s) => s.openAuthModal);
  const openUpgradeModal = useAuthStore((s) => s.openUpgradeModal);
  const tools = useMemo(() => getAgentTools(), []);

  const handleToggle = (next: boolean) => {
    // Everyone sees the explanation; people who cannot turn it on yet are sent to sign in / upgrade from the dialog.
    if (next && (!allowed || !hasAiConsent())) {
      setConfirmOpen(true);
      return;
    }
    setEnabled(next);
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <label htmlFor="ai-enable" className="text-xs font-medium">Allow AI agents to control this project</label>
          <p className="text-2xs text-muted-foreground mt-0.5">Resets to off when you close the editor.</p>
        </div>
        <Switch id="ai-enable" checked={enabled} onCheckedChange={handleToggle} aria-label="Allow AI agents to control this project" />
      </div>

      {!allowed && (
        <p data-testid="ai-pro-note" className="text-xs text-muted-foreground leading-relaxed">
          Create and edit animations by chatting with an AI agent. This is an experimental Wanderer (Pro) feature.
        </p>
      )}

      <AiStatusLine enabled={enabled} supported={supported} count={count} bridged={bridged} />
      <p className="text-2xs text-muted-foreground leading-relaxed">{BRIDGE_DOCS_HINT}</p>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <label htmlFor="ai-follow" className="text-xs font-medium">Follow AI</label>
          <p className="text-2xs text-muted-foreground mt-0.5">Move the map to what the agent changes.</p>
        </div>
        <Switch id="ai-follow" checked={followAi} onCheckedChange={setFollowAi} aria-label="Follow AI" />
      </div>

      <Collapsible>
        <CollapsibleTrigger className="group flex w-full items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground">
          <span>Tools an agent can use ({tools.length})</span>
          <ChevronDown size={14} className="transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ul className="mt-2 space-y-1 text-2xs text-muted-foreground">
            {tools.map((t) => (
              <li key={t.name} className="flex items-center justify-between gap-2">
                <span>{t.title}</span>
                {!t.annotations.readOnlyHint && <span className="text-micro uppercase tracking-wider opacity-70">edits</span>}
              </li>
            ))}
          </ul>
        </CollapsibleContent>
      </Collapsible>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className={cn(pinDropContentClass, 'w-[calc(100vw-2rem)] sm:max-w-lg max-h-[90vh] overflow-y-auto')}>
          <PinDropHero mood="inquisitive" scene="connect" size="compact" />
          <PopupBody>
            <AlertDialogTitle className={popupTitleClass}>Let AI agents control this project?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm leading-relaxed text-muted-foreground [&_strong]:text-foreground [&_strong]:font-medium">
                <p>This is an experimental feature. An AI agent you connect will be able to change this project.</p>
                <p><strong>To connect one</strong>, use Gemini in Chrome (with WebMCP enabled), or run the small lil-mappo bridge app on your computer to use Claude Code, Codex and other local agents.</p>
                <p><strong>It can:</strong> add and edit routes, boundaries and callouts, edit the camera and project settings, and render preview frames.</p>
                <p><strong>It cannot:</strong> export video, save or delete projects, or modify your account.</p>
                <p>Every AI change is one undo step. Use Undo, or &ldquo;Undo last AI change&rdquo; in the Activity tab.</p>
                {!allowed && <p className="text-muted-foreground">{signedIn ? 'AI control is part of the Wanderer plan.' : 'Sign in with a Wanderer account to turn it on.'}</p>}
              </div>
            </AlertDialogDescription>
          <PopupActions>
            <AlertDialogCancel className="mt-0 h-10 rounded-[10px] px-4">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="h-10 rounded-[10px] px-4"
              onClick={() => {
                if (!signedIn) return openAuthModal();
                if (!allowed) return openUpgradeModal('ai');
                recordAiConsent();
                setEnabled(true);
              }}
            >
              {!signedIn ? 'Sign in' : !allowed ? 'See Wanderer plan' : 'Turn on'}
            </AlertDialogAction>
          </PopupActions>
          </PopupBody>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
