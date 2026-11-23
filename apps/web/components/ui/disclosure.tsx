import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react';

interface PanelMotion {
  readonly height: Animation;
  readonly opacity: Animation;
  readonly opening: boolean;
}

const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';

/** A native <details> whose panel eases open and closed, reversing if toggled mid-flight. */
export function Disclosure({
  className,
  summary,
  children,
}: {
  className: string;
  summary: ReactNode;
  children: ReactNode;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const motion = useRef<PanelMotion | null>(null);

  useEffect(
    () => () => {
      motion.current?.height.cancel();
      motion.current?.opacity.cancel();
    },
    [],
  );

  function toggle(event: MouseEvent<HTMLElement>) {
    const details = detailsRef.current;
    const panel = panelRef.current;
    if (!details || !panel) return;
    event.preventDefault();

    const opening = !(motion.current?.opening ?? details.open);
    const fromHeight = details.open ? panel.getBoundingClientRect().height : 0;
    const fromOpacity = details.open ? getComputedStyle(panel).opacity : '0';
    motion.current?.height.cancel();
    motion.current?.opacity.cancel();
    motion.current = null;

    if (
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      typeof panel.animate !== 'function'
    ) {
      details.open = opening;
      delete details.dataset.expanded;
      return;
    }

    details.open = true;
    details.dataset.expanded = String(opening);
    const toHeight = opening ? panel.getBoundingClientRect().height : 0;
    const duration = opening ? 340 : 240;
    panel.style.overflow = 'hidden';
    const height = panel.animate(
      { height: [`${fromHeight}px`, `${toHeight}px`] },
      { duration, easing: EASE_OUT, fill: 'both' },
    );
    const opacity = panel.animate(
      { opacity: [fromOpacity, opening ? '1' : '0'] },
      { duration: opening ? duration : 160, easing: 'ease-out', fill: 'both' },
    );
    motion.current = { height, opacity, opening };
    height.onfinish = () => {
      if (motion.current?.height !== height) return;
      details.open = opening;
      delete details.dataset.expanded;
      panel.style.overflow = '';
      height.cancel();
      opacity.cancel();
      motion.current = null;
    };
  }

  return (
    <details ref={detailsRef} className={className}>
      <summary onClick={toggle}>{summary}</summary>
      <div ref={panelRef}>{children}</div>
    </details>
  );
}
