import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { getAgentTools, isWebMcpSupported, useAgentStore } from '@/agent';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PinDropHero, PopupActions, PopupBody } from '@/components/ui/pin-drop';
import { useAuthStore } from '@/store/useAuthStore';
import { useAiAccess } from './useAiAccess';
import { hasAiConsent, recordAiConsent } from './aiPrefs';
import { useAiPanelStore } from './useAiPanelStore';

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
  const bridged = useAiPanelStore((s) => s.bridgeStatus === 'connected');
  const followAi = useAiPanelStore((s) => s.followAi);
  const setGuideOpen = useAiPanelStore((s) => s.setGuideOpen);
  const setFollowAi = useAiPanelStore((s) => s.setFollowAi);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const supported = isWebMcpSupported();
  const { signedIn, allowed } = useAiAccess();
  const openAuthModal = useAuthStore((s) => s.openAuthModal);
  const tools = useMemo(() => getAgentTools(), []);

  const turnOn = () => {
    setEnabled(true);
    useAiPanelStore.getState().offerBridgeGuide();
  };

  const handleToggle = (next: boolean) => {
    // Everyone sees the explanation; people who cannot turn it on yet are sent to sign in / upgrade from the dialog.
    if (next && (!allowed || !hasAiConsent())) {
      setConfirmOpen(true);
      return;
    }
    if (next) turnOn();
    else setEnabled(false);
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
        <p data-testid="ai-signin-note" className="text-xs text-muted-foreground leading-relaxed">
          Create and edit animations by chatting with an AI agent. This is an experimental feature; sign in to turn it on.
        </p>
      )}

      <AiStatusLine enabled={enabled} supported={supported} count={count} bridged={bridged} />
      <p className="text-2xs text-muted-foreground leading-relaxed">
        Using Claude Code, Codex, Cursor or another coding agent?{' '}
        <Button variant="link" size="inline" onClick={() => setGuideOpen(true)}>
          Set up the bridge
        </Button>
      </p>

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
        <AlertDialogContent size="md" className="max-h-[90vh] overflow-y-auto">
          <PinDropHero mood="inquisitive" scene="connect" size="compact" />
          <PopupBody>
            <AlertDialogTitle>Let AI agents control this project?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 [&_strong]:text-foreground [&_strong]:font-medium">
                <p>This is an experimental feature. An AI agent you connect will be able to change this project.</p>
                <p><strong>To connect one</strong>, use Gemini in Chrome (with WebMCP enabled), or run the small lil-mappo bridge app on your computer to use Claude Code, Codex and other local agents.</p>
                <p><strong>It can:</strong> add and edit routes, boundaries and callouts, edit the camera and project settings, and render preview frames.</p>
                <p><strong>It cannot:</strong> export video, save or delete projects, or modify your account.</p>
                <p>Every AI change is one undo step. Use Undo, or &ldquo;Undo last AI change&rdquo; in the Activity tab.</p>
                {!allowed && <p className="text-muted-foreground">Sign in to turn it on.</p>}
              </div>
            </AlertDialogDescription>
          <PopupActions>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!signedIn) return openAuthModal();
                recordAiConsent();
                turnOn();
              }}
            >
              {allowed ? 'Turn on' : 'Sign in'}
            </AlertDialogAction>
          </PopupActions>
          </PopupBody>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
