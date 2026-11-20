import { useEffect, useRef } from 'react';
import { subscribeCreditRefresh } from '../services/creditRefresh';

export function useCreditRefresh(refresh: () => unknown, enabled = true) {
  const current = useRef(refresh); current.current = refresh;
  useEffect(() => {
    if (!enabled) return;
    return subscribeCreditRefresh(() => { void current.current(); });
  }, [enabled]);
}
