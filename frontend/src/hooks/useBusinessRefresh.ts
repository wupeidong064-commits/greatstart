import { useEffect, useRef } from 'react';

/** Refresh a visible report after a mutation or when returning from another tab. */
export function useBusinessRefresh(refresh: () => void) {
  const current = useRef(refresh);
  current.current = refresh;
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (document.visibilityState !== 'visible') return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (document.visibilityState === 'visible') current.current();
      }, 150);
    };
    window.addEventListener('business-data-changed', schedule);
    window.addEventListener('focus', schedule);
    document.addEventListener('visibilitychange', schedule);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('business-data-changed', schedule);
      window.removeEventListener('focus', schedule);
      document.removeEventListener('visibilitychange', schedule);
    };
  }, []);
}
