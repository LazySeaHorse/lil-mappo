/**
 * Style registration index.
 *
 * Import this module once (e.g. in App.tsx or main.tsx) to register
 * all annotation styles with the registry.
 */

import { registerStyle } from '../registry';

// Backward-compatible styles (migrated from old callout variants)
import { standardCardStyle } from './standard-card';
import { modernPillStyle } from './modern-pill';
import { newsSlugStyle } from './news-slug';
import { topoLabelStyle } from './topo-label';

// New marker styles
import { blinkingDotStyle } from './blinking-dot';
import { rippleMarkerStyle } from './ripple-marker';
import { imageCircleStyle } from './image-circle';
import { pinMarkerStyle } from './pin-marker';

// Register all styles
registerStyle(standardCardStyle);
registerStyle(modernPillStyle);
registerStyle(newsSlugStyle);
registerStyle(topoLabelStyle);
registerStyle(blinkingDotStyle);
registerStyle(rippleMarkerStyle);
registerStyle(imageCircleStyle);
registerStyle(pinMarkerStyle);
