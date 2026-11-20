import { useEffect, useRef } from 'react';
import { subscribeFollowUpRefresh } from '../services/followUpChanges';

export function useFollowUpRefresh(refresh: () => void) {
  const current = useRef(refresh); current.current = refresh;
  useEffect(() => subscribeFollowUpRefresh(() => current.current()), []);
}
