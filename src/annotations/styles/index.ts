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
import { leaderLineStyle } from './leader-line';
import { mapLabelStyle } from './map-label';
import { roadSignStyle } from './road-sign';
import { targetLockStyle } from './target-lock';
import { waypointStyle } from './waypoint';

// Registration order is the order the style picker lists them in.
registerStyle(leaderLineStyle);
registerStyle(mapLabelStyle);
registerStyle(targetLockStyle);
registerStyle(editorialStyle);
registerStyle(flagStyle);
registerStyle(bigNumberStyle);
registerStyle(waypointStyle);
registerStyle(roadSignStyle);
