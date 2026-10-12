import { lazy, Suspense, useEffect, useState } from "react";
import { loadAccountSettingsModal, loadAuthModal, loadCreditsModal, loadRendersModal, loadUpgradeModal } from "@/lib/lazyModules";
import { useAuthStore } from "@/store/useAuthStore";

const AuthModal = lazy(() => loadAuthModal().then((m) => ({ default: m.AuthModal })));
const AccountSettingsModal = lazy(() =>
  loadAccountSettingsModal().then((m) => ({ default: m.AccountSettingsModal })),
);
const CreditsModal = lazy(() => loadCreditsModal().then((m) => ({ default: m.CreditsModal })));
const UpgradeModal = lazy(() => loadUpgradeModal().then((m) => ({ default: m.UpgradeModal })));
const RendersModal = lazy(() => loadRendersModal().then((m) => ({ default: m.RendersModal })));

/**
 * True from the first time `open` is seen true onwards. Modals mount lazily on first open,
 * then stay mounted so Radix can play its close animation and keep its local state.
 */
function useOpenedOnce(open: boolean): boolean {
  const [opened, setOpened] = useState(open);
  useEffect(() => {
    if (open) setOpened(true);
  }, [open]);
  return opened || open;
}

/** Account, billing and auth dialogs, loaded the first time one is opened. Renders nothing until then. */
export function LazyAccountModals() {
  const authOpen = useOpenedOnce(useAuthStore((s) => s.showAuthModal));
  const settingsOpen = useOpenedOnce(useAuthStore((s) => s.showSettingsModal));
  const creditsOpen = useOpenedOnce(useAuthStore((s) => s.showCreditsModal));
  const upgradeOpen = useOpenedOnce(useAuthStore((s) => s.showUpgradeModal));
  const rendersOpen = useOpenedOnce(useAuthStore((s) => s.showRendersModal));

  return (
    <Suspense fallback={null}>
      {authOpen && <AuthModal />}
      {settingsOpen && <AccountSettingsModal />}
      {creditsOpen && <CreditsModal />}
      {upgradeOpen && <UpgradeModal />}
      {rendersOpen && <RendersModal />}
    </Suspense>
  );
}
