/**
 * Style registration index.
 *
 * Import this module once (e.g. in App.tsx or main.tsx) to register
 * all annotation styles with the registry.
 */

import { registerStyle } from '../registry';
import { flagStyle } from './flag';
import { leaderLineStyle } from './leader-line';
import { waypointStyle } from './waypoint';

registerStyle(leaderLineStyle);
registerStyle(flagStyle);
registerStyle(waypointStyle);
