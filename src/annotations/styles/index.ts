/**
 * Style registration index.
 *
 * Import this module once (e.g. in App.tsx or main.tsx) to register
 * all annotation styles with the registry.
 */

import { registerStyle } from '../registry';
import { leaderLineStyle } from './leader-line';
import { mapLabelStyle } from './map-label';
import { targetLockStyle } from './target-lock';

registerStyle(leaderLineStyle);
registerStyle(mapLabelStyle);
registerStyle(targetLockStyle);
