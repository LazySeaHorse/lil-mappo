import { useEffect, useRef, useState } from 'react';
import { nanoid } from 'nanoid';
import { toast } from 'sonner';
import { saveProjectToLibrary } from '@/services/projectLibrary';
import {
  buildRouteDeepLinkProject,
  hasProjectContent,
  isSameDeepLinkContent,
  type RouteDeepLinkRequest,
  type RouteDeepLinkResult,
} from '@/services/routeDeepLink';
import { toProjectDocument } from '@/store/projectDocument';
import { useProjectStore } from '@/store/useProjectStore';

export interface RouteDeepLinkState {
  /** False until the arrival has been applied (or rejected); the editor should not render before then. */
  ready: boolean;
  /** True when the URL named a valid airport route, so this load is an exempt handoff entry. */
  isEntry: boolean;
}

/**
 * Opens the editor on the project a `/routes/{from}-to-{to}` link describes.
 *
 * Runs once, after the working draft has been restored, so the deep-linked
 * project is the one autosave keeps. It replaces the draft the same way the
 * New Project dialog does, but first copies a draft with unsaved work to the
 * project library, so a shared link never silently destroys it. A bad link
 * toasts and leaves whatever the editor already holds (the normal editor).
 * `onSettled` fires either way so the caller can drop the one-shot URL; the
 * request is captured on first render and never re-read.
 */
export function useRouteDeepLink(
  request: RouteDeepLinkRequest | null,
  draftReady: boolean,
  onSettled: () => void,
): RouteDeepLinkState {
  const [result] = useState<RouteDeepLinkResult | null>(() =>
    request ? buildRouteDeepLinkProject(request) : null,
  );
  const [settled, setSettled] = useState(request === null);
  const startedRef = useRef(false);
  // Toasts wait for the editor: its <Sonner /> only mounts once `settled`, and earlier toasts are dropped.
  const toastsRef = useRef<Array<() => void>>([]);
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;

  useEffect(() => {
    if (!result || !draftReady || startedRef.current) return;
    startedRef.current = true;

    if (!('message' in result)) {
      const store = useProjectStore.getState();
      const current = toProjectDocument(store);
      const hasWork = hasProjectContent(current) && !isSameDeepLinkContent(current, result.project);

      if (hasWork) {
        // Keep a copy under a new id so the library entry the draft came from is not overwritten.
        const backup = saveProjectToLibrary({ ...current, id: nanoid(), name: `${current.name} (backup)` })
          .then(() => 'Your previous project was saved to your project library.')
          .catch(() => null);
        toastsRef.current.push(() => {
          void backup.then((message) =>
            message ? toast.info(message) : toast.warning("Couldn't back up your previous project."),
          );
        });
      }

      store.loadFullProject(result.project);
      toastsRef.current.push(() => toast.success(`Opened ${result.fromCode} to ${result.toCode}`));
    } else {
      toastsRef.current.push(() => toast.error(result.message));
    }

    setSettled(true);
    onSettledRef.current();
  }, [result, draftReady]);

  useEffect(() => {
    if (!settled) return;
    toastsRef.current.splice(0).forEach((show) => show());
  }, [settled]);

  return { ready: settled, isEntry: result?.ok === true };
}
