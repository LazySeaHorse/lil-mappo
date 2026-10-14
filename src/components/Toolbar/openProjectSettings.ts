import { useProjectStore } from '@/store/useProjectStore';

/** `data-section` value of the Map section in the project settings (see `InspectorSection`). */
const MAP_SECTION_SELECTOR = '[data-section="project-env"]';

/** The panel mounts after the store change, so wait a few frames for the section. */
function scrollToMapSection(framesLeft = 20) {
  const section = document.querySelector(MAP_SECTION_SELECTOR);
  if (section) {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    section.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
    return;
  }
  if (framesLeft > 0) requestAnimationFrame(() => scrollToMapSection(framesLeft - 1));
}

/**
 * Shows the project settings panel: nothing selected, inspector open. With
 * `scrollTo: 'map'` the panel also scrolls to the map settings.
 */
export function openProjectSettings(options: { scrollTo?: 'map' } = {}) {
  useProjectStore.getState().selectItem(null);
  if (options.scrollTo === 'map') scrollToMapSection();
}
