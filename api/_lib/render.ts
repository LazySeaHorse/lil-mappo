/**
 * api/_lib/render.ts
 *
 * Self-contained copy of the render-credit helpers needed by Vercel API routes.
 *
 * WHY THIS FILE EXISTS:
 * Vercel compiles `api/` TypeScript files independently from Vite. The `src/`
 * directory is only bundled into the Vite frontend (`dist/`), so any import
 * like `import { ... } from '../src/types/render'` resolves to a file that
 * doesn't exist in the Vercel serverless function environment at runtime,
 * producing ERR_MODULE_NOT_FOUND.
 *
 * Keep this in sync with `src/types/render.ts`. If you change the credit
 * formula there, update it here too.
 */

export type ExportResolution = '480p' | '720p' | '1080p' | '1440p' | '2160p';

const RESOLUTION_CREDIT_MULTIPLIERS: Record<ExportResolution, number> = {
  '480p': 1,
  '720p': 2,
  '1080p': 4,
  '1440p': 8,
  '2160p': 16,
};

/**
 * Credit billing formula:
 *   Base unit = 480p · 30s · 30fps = 1 credit
 *   Resolution: each tier up doubles (480p=1, 720p=2, 1080p=4, 1440p=8, 2160p=16)
 *   Duration: rounded UP to nearest 30-second chunk
 *   FPS: 60fps doubles the credit cost
 */
export function calculateRenderCredits(
  resolution: ExportResolution,
  durationSec: number,
  fps: 30 | 60,
): number {
  const resMult = RESOLUTION_CREDIT_MULTIPLIERS[resolution];
  const timeChunks = Math.ceil(durationSec / 30);
  const fpsMult = fps === 60 ? 2 : 1;
  return resMult * timeChunks * fpsMult;
}
