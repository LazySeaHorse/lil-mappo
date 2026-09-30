/**
 * Style registration index.
 *
 * Import this module once (e.g. in App.tsx or main.tsx) to register
 * all annotation styles with the registry.
 */

import { registerStyle } from '../registry';
import { bigNumberStyle } from './big-number';
import { editorialStyle } from './editorial';
import { flagStyle } from './flag';
import { handDrawnStyle } from './hand-drawn';
import { leaderLineStyle } from './leader-line';
import { mapLabelStyle } from './map-label';
import { polaroidStyle } from './polaroid';
import { radiusRingStyle } from './radius-ring';
import { roadSignStyle } from './road-sign';
import { stampStyle } from './stamp';
import { targetLockStyle } from './target-lock';
import { waypointStyle } from './waypoint';

// Registration order is the order the style picker lists them in.
registerStyle(leaderLineStyle);
registerStyle(mapLabelStyle);
registerStyle(targetLockStyle);
registerStyle(editorialStyle);
registerStyle(stampStyle);
registerStyle(flagStyle);
registerStyle(polaroidStyle);
registerStyle(bigNumberStyle);
registerStyle(handDrawnStyle);
registerStyle(radiusRingStyle);
registerStyle(waypointStyle);
registerStyle(roadSignStyle);
