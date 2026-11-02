/**
 * Dynamic import() call sites for on-demand chunks.
 *
 * Excluded from the production obfuscator (see vite.config.ts): string-array encoding can turn an
 * import() specifier into a runtime expression Rollup cannot split into a chunk. Keep this file to
 * bare loaders; anything that enforces limits belongs elsewhere and calls through these.
 */

export const loadVideoExport = () => import('@/services/videoExport');
export const loadAirportsData = () => import('@/data/airportsData');
export const loadModelConvert = () => import('@/models/modelConvert');
export const loadModelPreview = () => import('@/models/modelPreview');
export const loadFflate = () => import('fflate');

// Demo mode only (VITE_DEMO=1); unused in other builds, so their chunks are never built.
export const loadDemoShell = () => import('@/demo/shell/DemoShell');
export const loadDemoFrame = () => import('@/demo/frame/DemoFrame');
export const loadDemoFrameSetup = () => import('@/demo/frame/setup');
export const loadDemoFakeExport = () => import('@/demo/frame/fakeExport');
