import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check, Copy, Download, ExternalLink } from 'lucide-react';
import { useAgentStore } from '@/agent';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { PinDropHero, PopupActions, PopupBody } from '@/components/ui/pin-drop';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BRIDGE_TARGETS, bridgeDownloadUrl, bridgeRunCommand, codingClients, detectBridgeTarget, refineBridgeTarget,
  type BridgeTarget, type CodingClient,
} from './bridgeSetup';
import { hideBridgeGuide, useAiPanelStore } from './useAiPanelStore';

/** Text to paste somewhere, with a copy button. */
function CopyBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <div className="relative rounded-lg border border-border bg-muted/50">
      <pre className="overflow-x-auto whitespace-pre-wrap break-words py-2 pl-3 pr-10 font-mono text-xs leading-relaxed text-foreground">{text}</pre>
      <IconButton
        variant="ghost"
        size="xs"
        aria-label={copied ? 'Copied' : 'Copy'}
        className="absolute right-1.5 top-1.5"
        onClick={() => {
          navigator.clipboard?.writeText(text).then(() => setCopied(true), () => {});
        }}
      >
        {copied ? <Check className="text-emerald-600" /> : <Copy />}
      </IconButton>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="flex gap-3">
      <span className="mt-px grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{n}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        {children}
      </div>
    </section>
  );
}

const text = 'text-sm leading-relaxed text-muted-foreground';

function RunSteps({ target }: { target: BridgeTarget }) {
  const command = bridgeRunCommand(target);
  if (!command) {
    return (
      <p className={text}>
        Open the file you downloaded. If your browser warns about it, choose Keep. If Windows says it protected your PC,
        click More info, then Run anyway. Keep the window that opens running while you use AI.
      </p>
    );
  }
  return (
    <>
      <p className={text}>
        {target.startsWith('darwin')
          ? 'Open Terminal (press ⌘ Space and type Terminal), paste this and press Return:'
          : 'Open a terminal, paste this and press Enter:'}
      </p>
      <CopyBlock text={command} />
      <p className={text}>Keep the terminal open while you use AI.</p>
    </>
  );
}

function ClientPanel({ client }: { client: CodingClient }) {
  const [variantId, setVariantId] = useState(client.variants[0].id);
  const variant = client.variants.find((v) => v.id === variantId) ?? client.variants[0];
  return (
    <div className="flex flex-col gap-2 pt-2">
      {client.variants.length > 1 && (
        <SegmentedControl
          options={client.variants.map((v) => ({ value: v.id, label: v.label }))}
          value={variant.id}
          onValueChange={setVariantId}
        />
      )}
      {variant.steps.map((step) => (
        <div key={step.text} className="flex flex-col gap-1.5">
          <p className={text}>{step.text}</p>
          {step.copy && <CopyBlock text={step.copy} />}
          {step.link && (
            <Button asChild variant="outline" size="sm" className="self-start">
              <a href={step.link.href}>
                <ExternalLink size={14} aria-hidden="true" /> {step.link.label}
              </a>
            </Button>
          )}
        </div>
      ))}
      {client.note && <p className="text-xs leading-relaxed text-muted-foreground">{client.note}</p>}
    </div>
  );
}

function ConnectionStatus() {
  const enabled = useAgentStore((s) => s.enabled);
  const bridged = useAiPanelStore((s) => s.bridgeConnected);
  const [message, tone] = bridged
    ? ['The bridge is connected. Ask your agent to make a map.', 'text-emerald-600']
    : enabled
      ? ['Waiting for the bridge. This updates once it’s running.', 'text-muted-foreground']
      : ['AI control is off. Turn it on in the AI panel to connect.', 'text-muted-foreground'];
  return (
    <p data-testid="bridge-guide-status" role="status" className={`flex items-center gap-2 text-xs ${tone}`}>
      <span className={`size-2 shrink-0 rounded-full ${bridged ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
      {message}
    </p>
  );
}

/**
 * Walks someone through using a local coding agent: download the bridge for their computer,
 * start it, and add it to their agent. Opens on its own when AI control is switched on without a
 * bridge (until "Don't show again"), and from the help button in the AI panel.
 */
export function BridgeGuideDialog() {
  const open = useAiPanelStore((s) => s.guideOpen);
  const setOpen = useAiPanelStore((s) => s.setGuideOpen);
  const [target, setTarget] = useState<BridgeTarget>(() => detectBridgeTarget());
  const clients = useMemo(() => codingClients(), []);

  useEffect(() => {
    let live = true;
    refineBridgeTarget(detectBridgeTarget()).then((t) => live && setTarget(t));
    return () => { live = false; };
  }, []);

  const targetLabel = BRIDGE_TARGETS.find((t) => t.id === target)?.label;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent size="md" className="max-h-[90vh] overflow-y-auto" data-testid="bridge-guide">
        <PinDropHero mood="plug" scene="bridge" size="compact" tag="AI bridge" />
        <PopupBody className="gap-4">
          <div className="flex flex-col gap-2">
            <DialogTitle>Connect your coding agent</DialogTitle>
            <DialogDescription>
              A small app on your computer, the bridge, lets the AI tool you already use work on this project. You only set
              it up once.
            </DialogDescription>
          </div>

          <Step n={1} title="Download the bridge">
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild>
                <a href={bridgeDownloadUrl(target)}>
                  <Download size={14} aria-hidden="true" /> Download for {targetLabel}
                </a>
              </Button>
              <Select value={target} onValueChange={(v) => setTarget(v as BridgeTarget)}>
                <SelectTrigger size="sm" className="w-auto" aria-label="Computer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BRIDGE_TARGETS.map((t) => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </Step>

          <Step n={2} title="Start it">
            <RunSteps target={target} />
          </Step>

          <Step n={3} title="Add it to your AI tool">
            <Tabs defaultValue={clients[0].id}>
              <TabsList className="w-full overflow-x-auto">
                {clients.map((c) => <TabsTrigger key={c.id} value={c.id} className="min-w-fit text-xs">{c.label}</TabsTrigger>)}
              </TabsList>
              {clients.map((c) => (
                <TabsContent key={c.id} value={c.id}>
                  <ClientPanel client={c} />
                </TabsContent>
              ))}
            </Tabs>
          </Step>

          <ConnectionStatus />

          <PopupActions className="mt-0">
            <Button
              variant="subtle"
              onClick={() => {
                hideBridgeGuide();
                setOpen(false);
              }}
            >
              Don’t show again
            </Button>
            <Button onClick={() => setOpen(false)}>Done</Button>
          </PopupActions>
        </PopupBody>
      </DialogContent>
    </Dialog>
  );
}
