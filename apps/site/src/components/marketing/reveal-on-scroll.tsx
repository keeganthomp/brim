'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Fades `[data-reveal]` sections in as they scroll into view. Anything already on screen,
 * and everything when scripts or motion are off, renders immediately.
 */
export function RevealOnScroll() {
  const pathname = usePathname();
  useEffect(() => {
    if (
      !('IntersectionObserver' in window) ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute('data-reveal', 'shown');
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -6% 0px' },
    );
    for (const element of document.querySelectorAll('[data-reveal]')) {
      if (element.getBoundingClientRect().top < window.innerHeight) continue;
      element.setAttribute('data-reveal', 'pending');
      observer.observe(element);
    }
    return () => observer.disconnect();
  }, [pathname]);
  return null;
}
