import { useEffect, useRef, useState } from 'react';

/** A quiet status light that only pulses while visible. */
export function StatusDot({ label, pulsing = false }: { label: string; pulsing?: boolean }) {
  const element = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const target = element.current;
    if (!pulsing || !target) return;
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(entry?.isIntersecting ?? false);
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [pulsing]);

  return (
    <span
      ref={element}
      className={`status-dot${pulsing ? ' is-pulsing' : ''}${visible ? ' is-visible' : ''}`}
      role="img"
      aria-label={label}
      title={label}
    />
  );
}
