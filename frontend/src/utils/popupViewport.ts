// Select's rc-trigger continuously realigns against the popup rectangle. Applying
// a second translation to that same rectangle feeds back into its next align,
// amplified by CSS zoom. Let Select own its position and overflow adjustment.
const floatingSelector = '.ant-picker-dropdown, .ant-dropdown, .ant-popover, .ant-tooltip';

/** Ant aligns to its trigger first. Keep its final floating surface inside the
 * viewport, including when neither side of a trigger has enough space.
 * Individual translate preserves Ant's own enter/exit transform animations. */
export function keepPopupsInViewport(scale: number) {
  let frame = 0;
  const constrain = () => {
    frame = 0;
    document.querySelectorAll<HTMLElement>(floatingSelector).forEach(element => {
      if (!element.getClientRects().length || getComputedStyle(element).visibility === 'hidden') return;
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const oldX = parseFloat(element.style.getPropertyValue('--ui-popup-x')) || 0;
      const oldY = parseFloat(element.style.getPropertyValue('--ui-popup-y')) || 0;
      const left = rect.left - oldX * scale, top = rect.top - oldY * scale;
      const x = (Math.max(8, Math.min(left, innerWidth - rect.width - 8)) - left) / scale;
      const y = (Math.max(8, Math.min(top, innerHeight - rect.height - 8)) - top) / scale;
      if (Math.abs(x - oldX) > .1) element.style.setProperty('--ui-popup-x', `${x}px`);
      if (Math.abs(y - oldY) > .1) element.style.setProperty('--ui-popup-y', `${y}px`);
    });
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(constrain); };
  const observer = new MutationObserver(records => {
    if (records.some(record => record.target instanceof Element && record.target.closest(floatingSelector)
      || [...record.addedNodes].some(node => node instanceof Element && (node.matches(floatingSelector) || node.querySelector(floatingSelector))))) schedule();
  });
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style'] });
  window.addEventListener('resize', schedule);
  document.addEventListener('scroll', schedule, true);
  document.addEventListener('animationend', schedule, true);
  document.addEventListener('transitionend', schedule, true);
  schedule();
  return () => {
    observer.disconnect(); cancelAnimationFrame(frame);
    window.removeEventListener('resize', schedule);
    document.removeEventListener('scroll', schedule, true);
    document.removeEventListener('animationend', schedule, true);
    document.removeEventListener('transitionend', schedule, true);
    document.querySelectorAll<HTMLElement>(floatingSelector).forEach(element => {
      element.style.removeProperty('--ui-popup-x'); element.style.removeProperty('--ui-popup-y');
    });
  };
}
