import type { CSSProperties, RefObject } from 'react';
import { Phone } from './kit/phone';
import { CORNER, superellipsePath } from './kit/phoneGeometry';
import { Window } from './kit/window';
import { BAR_HEIGHT, PHONE_EDGE, PHONE_OUTER, PHONE_SCREEN, STATUS_HEIGHT, type StageLayout } from './layout';

const SCREEN_CLIP = `path('${superellipsePath(PHONE_SCREEN.width, PHONE_SCREEN.height, CORNER.a, CORNER.n)}')`;

interface AppDeviceProps {
  layout: StageLayout;
  iframeRef: RefObject<HTMLIFrameElement>;
  src: string;
}

function Lock() {
  return (
    <svg className="ds-browser__lock" width="8" height="10" viewBox="0 0 8 10" aria-hidden>
      <path d="M2 4.2V3a2 2 0 0 1 4 0v1.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <rect x="0.5" y="4.2" width="7" height="5.3" rx="1.3" fill="currentColor" />
    </svg>
  );
}

/**
 * The real app in its device: a Mac browser window (landscape) or an iPhone (portrait). The chrome
 * is drawn; the iframe sits over it in a node that never moves in the tree, so switching device or
 * opening the AI panel never reloads the app. Landscape: the iframe is its real on-screen size, so
 * the app lays out as desktop. Portrait: the iframe stays phone-sized and the whole screen is scaled.
 */
export function AppDevice({ layout, iframeRef, src }: AppDeviceProps) {
  const { app, portrait, phoneScale } = layout;
  const viewport: CSSProperties = portrait
    ? {
        left: app.left + PHONE_EDGE * phoneScale,
        top: app.top + PHONE_EDGE * phoneScale,
        width: PHONE_SCREEN.width,
        height: PHONE_SCREEN.height,
        transform: `scale(${phoneScale})`,
        clipPath: SCREEN_CLIP,
      }
    : { left: app.left, top: app.top + BAR_HEIGHT, width: app.width, height: Math.max(0, app.height - BAR_HEIGHT) };

  return (
    <div className="ds-device" data-portrait={portrait || undefined}>
      {portrait ? (
        <div className="ds-phone" style={{ left: app.left, top: app.top, transform: `scale(${phoneScale})` }}>
          <Phone width={PHONE_OUTER.width} frame="pro" />
        </div>
      ) : (
        <Window
          className="ds-browser"
          lightsSize="large"
          urlShape="pill"
          url={
            <>
              <Lock />
              app.lilmappo.tech
            </>
          }
          style={{ left: app.left, top: app.top, width: app.width, height: app.height }}
        />
      )}
      <div className="ds-viewport" style={viewport}>
        <iframe ref={iframeRef} title="li'l Mappo" src={src} style={portrait ? { top: STATUS_HEIGHT, height: PHONE_SCREEN.height - STATUS_HEIGHT } : undefined} />
        {portrait && <span className="ss-phone__home ds-viewport__home" />}
      </div>
    </div>
  );
}
