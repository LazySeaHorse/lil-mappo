/**
 * Dynamic import() call sites for on-demand chunks.
 *
 * Excluded from the production obfuscator (see vite.config.ts): string-array encoding can turn an
 * import() specifier into a runtime expression Rollup cannot split into a chunk. Keep this file to
 * bare loaders; anything that enforces limits belongs elsewhere and calls through these.
 */

export const loadVideoExport = () => import('@/services/videoExport');
export const loadFileImport = () => import('@/services/fileImport');
export const loadAirportsData = () => import('@/data/airportsData');
export const loadExportModal = () => import('@/components/ExportModal/ExportModal');
export const loadAiPanel = () => import('@/components/AI/AiPanel');
export const loadAuthModal = () => import('@/components/Account/AuthModal');
export const loadAccountSettingsModal = () => import('@/components/Account/AccountSettingsModal');
export const loadCreditsModal = () => import('@/components/Account/CreditsModal');
export const loadUpgradeModal = () => import('@/components/Account/UpgradeModal');
export const loadRendersModal = () => import('@/components/Account/RendersModal');
