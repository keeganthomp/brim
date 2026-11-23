'use client';

import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react';

interface QuestionAnimation {
  height: Animation;
  opacity: Animation;
  opening: boolean;
}

/** Native disclosure with reversible opening and closing motion. */
export function Question({ title, children }: { title: string; children: ReactNode }) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const answerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<QuestionAnimation | null>(null);

  useEffect(
    () => () => {
      animationRef.current?.height.cancel();
      animationRef.current?.opacity.cancel();
    },
    [],
  );

  function toggle(event: MouseEvent<HTMLElement>) {
    const details = detailsRef.current;
    const answer = answerRef.current;
    if (!details || !answer) return;
    event.preventDefault();

    const opening = !(animationRef.current?.opening ?? details.open);
    const startHeight = details.open ? answer.getBoundingClientRect().height : 0;
    const startOpacity = details.open ? getComputedStyle(answer).opacity : '0';
    animationRef.current?.height.cancel();
    animationRef.current?.opacity.cancel();
    animationRef.current = null;
    answer.style.height = '';
    answer.style.overflow = '';

    if (
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      typeof answer.animate !== 'function'
    ) {
      details.open = opening;
      delete details.dataset.expanded;
      return;
    }

    details.open = true;
    details.dataset.expanded = String(opening);
    const endHeight = opening ? answer.getBoundingClientRect().height : 0;
    answer.style.height = `${startHeight}px`;
    answer.style.overflow = 'hidden';
    const timing: KeyframeAnimationOptions = {
      duration: 180,
      easing: 'ease-out',
      fill: 'both',
    };
    const height = answer.animate({ height: [`${startHeight}px`, `${endHeight}px`] }, timing);
    const opacity = answer.animate({ opacity: [startOpacity, opening ? '1' : '0'] }, timing);
    animationRef.current = { height, opacity, opening };
    height.onfinish = () => {
      if (animationRef.current?.height !== height) return;
      details.open = opening;
      delete details.dataset.expanded;
      answer.style.height = '';
      answer.style.overflow = '';
      height.cancel();
      opacity.cancel();
      animationRef.current = null;
    };
  }

  return (
    <details ref={detailsRef}>
      <summary onClick={toggle}>{title}</summary>
      <div className="question-answer" ref={answerRef}>
        {children}
      </div>
    </details>
  );
}
