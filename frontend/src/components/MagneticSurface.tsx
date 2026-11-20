import type { HTMLAttributes, PointerEvent } from 'react';

/** Fine-pointer attraction, capped at 3px; keyboard and touch keep a stable target. */
export function MagneticSurface({ className = '', children, ...props }: HTMLAttributes<HTMLDivElement>) {
  const reset = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.style.setProperty('--magnet-x', '0px');
    event.currentTarget.style.setProperty('--magnet-y', '0px');
  };
  return (
    <div {...props} className={`bz-magnetic ${className}`}
      onPointerMove={(event) => {
        if (event.pointerType !== 'mouse' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const box = event.currentTarget.getBoundingClientRect();
        event.currentTarget.style.setProperty('--magnet-x', `${((event.clientX - box.left) / box.width - .5) * 6}px`);
        event.currentTarget.style.setProperty('--magnet-y', `${((event.clientY - box.top) / box.height - .5) * 6}px`);
      }} onPointerLeave={reset} onPointerCancel={reset}>
      {children}
    </div>
  );
}
