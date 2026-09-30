/**
 * Style registration index.
 *
 * Import this module once (e.g. in App.tsx or main.tsx) to register
 * all annotation styles with the registry.
 */

import { registerStyle } from '../registry';
import { leaderLineStyle } from './leader-line';
import { handDrawnStyle } from './hand-drawn';
import { stampStyle } from './stamp';
import { polaroidStyle } from './polaroid';
import { radiusRingStyle } from './radius-ring';

registerStyle(leaderLineStyle);
registerStyle(handDrawnStyle);
registerStyle(stampStyle);
registerStyle(polaroidStyle);
registerStyle(radiusRingStyle);
