import { useProjectStore } from '@/store/useProjectStore';
import { click, key, query, type DemoContext } from './actions';
import { isPhoneLayout, type Locators } from './locators';

/**
 * The extra taps the phone layout asks for. The collapsed toolbar shows one
 * bar at a time (main, Add tools, Map Display), and the inspector is a drawer
 * that covers the timeline and the toolbar until it is closed. Every helper
 * does nothing on the desktop layout, whose controls are all on screen.
 */

/** How long to wait for the drawer to be gone after a tap, in real ms. */
const CLOSE_WAIT_MS = 1200;

const isOpen = () => useProjectStore.getState().isInspectorOpen;

async function untilClosed(ctx: DemoContext): Promise<boolean> {
  for (let waited = 0; isOpen() && waited < CLOSE_WAIT_MS; waited += 50) await ctx.clock.realDelay(50);
  return !isOpen();
}

/**
 * Closes the inspector drawer the way a person does: a tap on the map above
 * it. Escape, then the store, are the fallbacks, so a run never stays behind it.
 */
export async function closeInspectorDrawer(ctx: DemoContext, L: Locators): Promise<void> {
  if (!isPhoneLayout() || !isOpen()) return;
  // The drawer rests below the top third of the screen, under the toolbar.
  const aboveDrawer = () => ({ x: window.innerWidth * 0.5, y: window.innerHeight * 0.17 });
  if (query(L.inspectorBackdrop)) await click(ctx, L.inspectorBackdrop, { at: aboveDrawer });
  if (await untilClosed(ctx)) return;
  const drawer = query(L.inspectorDrawer);
  if (drawer) key(drawer, 'Escape');
  if (await untilClosed(ctx)) return;
  useProjectStore.getState().setIsInspectorOpen(false);
}

/** On the collapsed toolbar: back to the main bar from the Add or Map Display bar. */
export async function showMainBar(ctx: DemoContext, L: Locators): Promise<void> {
  await closeInspectorDrawer(ctx, L);
  if (!query(L.addMenuButton) && query(L.toolbarBackButton)) await click(ctx, L.toolbarBackButton);
}

/** On the collapsed toolbar: the Add tools bar, with the route, boundary, callout, camera view and model buttons. */
export async function showAddBar(ctx: DemoContext, L: Locators): Promise<void> {
  await closeInspectorDrawer(ctx, L);
  if (!query(L.addMenuButton) && !query(L.toolbarBackButton)) return;
  if (query(L.addRouteButton)) return;
  await showMainBar(ctx, L);
  await click(ctx, L.addMenuButton);
}
