import { useCallback, useEffect, useMemo, useRef } from 'react';

/**
 * For a download the user can change their mind about (picking another place
 * or period). `start()` cancels the one before and returns the signal of the
 * new one; after an await, `signal.aborted` says the answer is stale and must
 * be dropped. Leaving the component cancels too.
 */
export function useLatestRequest() {
  const current = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    current.current?.abort();
    current.current = null;
  }, []);

  const start = useCallback((): AbortSignal => {
    current.current?.abort();
    const controller = new AbortController();
    current.current = controller;
    return controller.signal;
  }, []);

  useEffect(() => cancel, [cancel]);

  return useMemo(() => ({ start, cancel }), [start, cancel]);
}
