import { recordAiConsent, hideBridgeGuide } from '@/components/AI/aiPrefs';
import { storeMobileWarningStatus, storeStatus } from '@/components/Onboarding/useWalkthroughStore';
import { installInputBlocker } from './inputBlocker';

/**
 * Runs in the frame before the app renders: quiets everything that pops up on
 * its own on a fresh load (it would show in the recording), then blocks real input.
 * The working draft restore and the AI bridge are skipped by IS_DEMO_FRAME guards
 * in `useWorkingProjectDraft` and `AgentToolRegistrar`.
 */
export function setupDemoFrame(): void {
  // The app's own "seen it" flags: no tour invitation or coachmarks, no mobile
  // warning, no AI first-enable confirmation, no bridge setup guide offer.
  storeStatus('dismissed');
  storeMobileWarningStatus();
  recordAiConsent();
  hideBridgeGuide();

  // No toasts.
  const style = document.createElement('style');
  style.textContent = '[data-sonner-toaster] { display: none !important; }';
  document.head.appendChild(style);

  installInputBlocker();
}
