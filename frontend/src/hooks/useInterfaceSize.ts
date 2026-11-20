import { useLayoutEffect } from 'react';
import { useUiStore } from '../store/uiStore';
import { keepPopupsInViewport } from '../utils/popupViewport';

/** Native layout zoom scales text, geometry and body portals together. Viewport units
 * must use the available layout viewport, rather than being magnified a second time.
 * Scope this to the signed-in shell; login/application retain their own composition. */
export function useInterfaceSize() {
  const size = useUiStore(state => state.interfaceSize);
  useLayoutEffect(() => {
    const root = document.documentElement;
    const update = () => {
      root.dataset.uiSize = String(size);
      root.style.setProperty('--ui-scale', String(size / 100));
      root.style.setProperty('--ui-vw', `${window.innerWidth / size}px`);
      root.style.setProperty('--ui-vh', `${window.innerHeight / size}px`);
    };
    update();
    const stopKeepingPopups = keepPopupsInViewport(size / 100);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      stopKeepingPopups();
      delete root.dataset.uiSize;
      for (const property of ['--ui-scale', '--ui-vw', '--ui-vh']) root.style.removeProperty(property);
    };
  }, [size]);
}
