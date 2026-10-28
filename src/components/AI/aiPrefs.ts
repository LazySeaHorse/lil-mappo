/** What the AI panel remembers in this browser. Storage can be blocked, so every read and write is guarded. */

const CONSENT_KEY = 'lilmappo.ai.consent.v1';

/** Whether the user already accepted the experimental-feature confirmation in this browser. */
export function hasAiConsent(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) === '1';
  } catch {
    return false;
  }
}

export function recordAiConsent(): void {
  try {
    localStorage.setItem(CONSENT_KEY, '1');
  } catch {
    // Storage unavailable: the dialog simply shows again next time.
  }
}

const GUIDE_HIDDEN_KEY = 'lilmappo.ai.bridgeGuide.hidden.v1';

/** Whether the user chose "Don't show again" on the bridge guide. It still opens from the panel's help button. */
export function isBridgeGuideHidden(): boolean {
  try {
    return localStorage.getItem(GUIDE_HIDDEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function hideBridgeGuide(): void {
  try {
    localStorage.setItem(GUIDE_HIDDEN_KEY, '1');
  } catch {
    // Storage unavailable: the guide simply shows again next time.
  }
}
