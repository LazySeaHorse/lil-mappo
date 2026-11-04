import { useRef, type ChangeEvent } from 'react';
import type { DemoMissingModel, DemoRunSettings, DemoRunState } from '../protocol';
import { SHARE_QUARTER, SHARE_THIRD } from './layout';
import { SPEED_MAX, SPEED_MIN, TIMING_FIELDS, ZOOM_MAX, ZOOM_MIN } from './settings';

/** The save formats the app's own "Open project" accepts. */
export const PROJECT_ACCEPT = '.lilmap,.json';

const SHARE_OPTIONS = [
  { share: SHARE_QUARTER, label: '¼' },
  { share: SHARE_THIRD, label: '⅓' },
];

export type LoadStatus =
  | { kind: 'none' }
  | { kind: 'loading'; fileName: string }
  | { kind: 'loaded'; fileName: string; title: string }
  | { kind: 'error'; fileName: string; message: string };

export interface Progress {
  step: number;
  total: number;
  label: string;
}

interface WidgetProps {
  frameReady: boolean;
  load: LoadStatus;
  missingModels: DemoMissingModel[];
  settings: DemoRunSettings;
  runState: DemoRunState;
  progress: Progress | null;
  countingDown: boolean;
  shortcut: string;
  onOpenFile: (file: File) => void;
  onRelink: (modelId: string, file: File) => void;
  onSettings: (next: DemoRunSettings) => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
  onClose: () => void;
}

function pickFile(e: ChangeEvent<HTMLInputElement>): File | null {
  const file = e.target.files?.[0] ?? null;
  e.target.value = '';
  return file;
}

/** The demo's control panel, over the top of the viewport. Dismissed before recording. */
export function Widget(props: WidgetProps) {
  const { frameReady, load, missingModels, settings, runState, progress, countingDown, shortcut } = props;
  const fileInput = useRef<HTMLInputElement>(null);
  const loaded = load.kind === 'loaded';
  const idle = runState === 'empty' || runState === 'ready';
  const set = (patch: Partial<DemoRunSettings>) => props.onSettings({ ...settings, ...patch });

  let status: string;
  if (!frameReady) status = 'Starting the app…';
  else if (load.kind === 'loading') status = `Loading ${load.fileName}…`;
  else if (load.kind === 'loaded') status = load.title || load.fileName;
  else if (load.kind === 'error') status = load.message;
  else status = 'Open or drop a .lilmap / .json save';

  return (
    <div className="ds-widget" role="dialog" aria-label="Demo controls">
      <div className="ds-widget__head">
        <span className="ds-widget__title">Demo</span>
        <span className="ds-widget__hint">
          <kbd>{shortcut}</kbd> hides
        </span>
        <button type="button" className="ds-widget__close" onClick={props.onClose} aria-label="Hide controls">
          ×
        </button>
      </div>

      <div className="ds-widget__row">
        <button type="button" className="ds-btn" disabled={!frameReady || !idle || countingDown} onClick={() => fileInput.current?.click()}>
          Open file…
        </button>
        <span className="ds-widget__status" data-tone={load.kind === 'error' ? 'error' : loaded ? 'ok' : undefined} title={status}>
          {status}
        </span>
        <input
          ref={fileInput}
          type="file"
          accept={PROJECT_ACCEPT}
          hidden
          onChange={(e) => {
            const file = pickFile(e);
            if (file) props.onOpenFile(file);
          }}
        />
      </div>

      {missingModels.length > 0 && (
        <div className="ds-widget__section">
          <div className="ds-widget__label">3D models to relink</div>
          {missingModels.map((m) => (
            <label key={m.modelId} className="ds-widget__model">
              <span className="ds-widget__model-name" title={m.name}>
                {m.name}
              </span>
              <span className="ds-btn ds-btn--small">Choose .glb</span>
              <input
                type="file"
                accept=".glb,model/gltf-binary"
                hidden
                onChange={(e) => {
                  const file = pickFile(e);
                  if (file) props.onRelink(m.modelId, file);
                }}
              />
            </label>
          ))}
        </div>
      )}

      <div className="ds-widget__section">
        <div className="ds-widget__label">Timing (ms)</div>
        <div className="ds-widget__timing">
          {TIMING_FIELDS.map(({ key, label }) => (
            <label key={key} className="ds-field">
              <span>{label}</span>
              <input
                type="number"
                min={0}
                step={10}
                value={settings.timing[key]}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  set({ timing: { ...settings.timing, [key]: Number.isFinite(v) && v >= 0 ? Math.round(v) : 0 } });
                }}
              />
            </label>
          ))}
        </div>
        <label className="ds-widget__speed">
          <span>Speed</span>
          <input
            type="range"
            min={SPEED_MIN}
            max={SPEED_MAX}
            step={0.25}
            value={settings.speed}
            onChange={(e) => set({ speed: Number(e.target.value) })}
          />
          <output>{settings.speed}×</output>
        </label>
      </div>

      <div className="ds-widget__section">
        <label className="ds-widget__toggle">
          <input type="checkbox" checked={settings.autoZoom} onChange={(e) => set({ autoZoom: e.target.checked })} />
          <span>Auto zoom</span>
        </label>
        <label className="ds-widget__speed">
          <span>Max zoom</span>
          <input
            type="range"
            min={ZOOM_MIN}
            max={ZOOM_MAX}
            step={0.1}
            value={settings.maxZoom}
            disabled={!settings.autoZoom}
            onChange={(e) => set({ maxZoom: Number(e.target.value) })}
          />
          <output>{settings.maxZoom.toFixed(1)}×</output>
        </label>
      </div>

      <div className="ds-widget__section">
        <label className="ds-widget__toggle">
          <input type="checkbox" checked={settings.fullScreen} onChange={(e) => set({ fullScreen: e.target.checked })} />
          <span>Full screen (landscape)</span>
        </label>
        <div className="ds-widget__speed" role="radiogroup" aria-label="Claude width">
          <span>Claude width</span>
          <div className="ds-seg">
            {SHARE_OPTIONS.map(({ share, label }) => (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={settings.terminalShare === share}
                data-active={settings.terminalShare === share || undefined}
                onClick={() => set({ terminalShare: share })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="ds-widget__section">
        <label className="ds-widget__toggle">
          <input type="checkbox" checked={settings.mockAi} disabled={!idle} onChange={(e) => set({ mockAi: e.target.checked })} />
          <span>Mock AI (Claude Code drives the app)</span>
        </label>
        {settings.mockAi && (
          <textarea
            className="ds-widget__prompt"
            rows={3}
            value={settings.aiPrompt}
            disabled={!idle}
            placeholder="The prompt typed into Claude Code"
            onChange={(e) => set({ aiPrompt: e.target.value })}
          />
        )}
      </div>

      <div className="ds-widget__foot">
        {countingDown ? (
          <button type="button" className="ds-btn ds-btn--primary" disabled>
            Starting…
          </button>
        ) : (
          <>
            {idle && (
              <button type="button" className="ds-btn ds-btn--primary" disabled={!frameReady || !loaded} onClick={props.onStart}>
                Start
              </button>
            )}
            {runState === 'running' && (
              <button type="button" className="ds-btn ds-btn--primary" onClick={props.onPause}>
                Pause
              </button>
            )}
            {runState === 'paused' && (
              <button type="button" className="ds-btn ds-btn--primary" onClick={props.onResume}>
                Resume
              </button>
            )}
            {!idle && (
              <button type="button" className="ds-btn" onClick={props.onReset}>
                Reset
              </button>
            )}
          </>
        )}
        {progress && !idle && (
          <span className="ds-widget__progress" title={progress.label}>
            <span className="ds-widget__step">
              {progress.step}/{progress.total}
            </span>
            {progress.label}
          </span>
        )}
      </div>
      {progress && !idle && (
        <div className="ds-widget__bar" aria-hidden>
          <span style={{ width: `${progress.total ? (100 * progress.step) / progress.total : 0}%` }} />
        </div>
      )}
    </div>
  );
}
