import { useCallback, useEffect, useState } from 'react';

interface PanelState<T> { data: T | null; loading: boolean; error: string | null }
interface CachedPanel { scope: string; data: unknown; updatedAt: number; generation: number; inFlight?: Promise<unknown> }
// One current identity per panel; keep only short-lived in-memory values, never browser storage.
const panels = new Map<unknown, CachedPanel>();
function panel(fetcher: unknown, scope: string) {
  let value = panels.get(fetcher);
  if (!value || value.scope !== scope || (!value.inFlight && Date.now() - value.updatedAt > 300000)) {
    value = { scope, data: null, updatedAt: Date.now(), generation: 0 }; panels.set(fetcher, value);
  }
  return value;
}

export function usePanelData<T>(fetcher: () => Promise<T>, scopeKey: string, listenBusinessChanges = true): PanelState<T> & { reload: () => void } {
  const [state, setState] = useState<PanelState<T> & { scope: string }>(() => ({
    data: panel(fetcher, scopeKey).data as T | null, loading: true, error: null, scope: scopeKey,
  }));
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => {
    const cached = panel(fetcher, scopeKey);
    cached.generation++; cached.inFlight = undefined;
    setTick(value => value + 1);
  }, [fetcher, scopeKey]);
  useEffect(() => {
    if (!listenBusinessChanges) return;
    window.addEventListener('business-data-changed', reload);
    return () => window.removeEventListener('business-data-changed', reload);
  }, [listenBusinessChanges, reload]);
  useEffect(() => {
    let cancelled = false;
    const cached = panel(fetcher, scopeKey), generation = cached.generation;
    setState(previous => ({ data: (previous.scope === scopeKey ? previous.data : null) ?? cached.data as T | null,
      scope: scopeKey, loading: true, error: null }));
    if (!cached.inFlight) {
      const request = fetcher().then(data => {
        if (panels.get(fetcher) === cached && cached.generation === generation) { cached.data = data; cached.updatedAt = Date.now(); }
        return data;
      });
      cached.inFlight = request;
      void request.finally(() => { if (cached.inFlight === request) cached.inFlight = undefined; }).catch(() => {});
    }
    cached.inFlight.then(data => {
      if (!cancelled && panels.get(fetcher) === cached && cached.generation === generation)
        setState({ data: data as T, scope: scopeKey, loading: false, error: null });
    }).catch((error: any) => {
      if (!cancelled && panels.get(fetcher) === cached && cached.generation === generation)
        setState(previous => ({ data: previous.scope === scopeKey ? previous.data : null, scope: scopeKey, loading: false, error: error?.message || '加载失败' }));
    });
    return () => { cancelled = true; };
  }, [fetcher, scopeKey, tick]);
  return { ...(state.scope === scopeKey ? state : { data: panel(fetcher, scopeKey).data as T | null, loading: true, error: null }), reload };
}
