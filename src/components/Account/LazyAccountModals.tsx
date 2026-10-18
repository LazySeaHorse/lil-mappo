import { useEffect, useState } from "react";
import { AuthModal } from "./AuthModal";
import { AccountSettingsModal } from "./AccountSettingsModal";
import { CreditsModal } from "./CreditsModal";
import { UpgradeModal } from "./UpgradeModal";
import { RendersModal } from "./RendersModal";
import { useAuthStore } from "@/store/useAuthStore";

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

/** Account, billing and auth dialogs, mounted the first time one is opened. Renders nothing until then. */
export function LazyAccountModals() {
  const authOpen = useOpenedOnce(useAuthStore((s) => s.showAuthModal));
  const settingsOpen = useOpenedOnce(useAuthStore((s) => s.showSettingsModal));
  const creditsOpen = useOpenedOnce(useAuthStore((s) => s.showCreditsModal));
  const upgradeOpen = useOpenedOnce(useAuthStore((s) => s.showUpgradeModal));
  const rendersOpen = useOpenedOnce(useAuthStore((s) => s.showRendersModal));

  return (
    <>
      {authOpen && <AuthModal />}
      {settingsOpen && <AccountSettingsModal />}
      {creditsOpen && <CreditsModal />}
      {upgradeOpen && <UpgradeModal />}
      {rendersOpen && <RendersModal />}
    </>
  );
}
