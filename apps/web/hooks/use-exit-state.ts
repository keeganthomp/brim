import { useState } from 'react';

/** True from the first render where `on` is true, so lazy sheets stay mounted to animate closed. */
export function useLatch(on: boolean): boolean {
  const [latched, setLatched] = useState(on);
  if (on && !latched) setLatched(true);
  return latched || on;
}

/** The latest non-null value, kept through a close so an exiting surface keeps its content. */
export function useRetained<T>(value: T | null): T | null {
  const [retained, setRetained] = useState(value);
  if (value !== null && !Object.is(value, retained)) setRetained(value);
  return value ?? retained;
}

/** The value as of the last open render, so a closing surface never shows the update it caused. */
export function useHeldWhileClosed<T>(value: T, open: boolean): T {
  const [held, setHeld] = useState(value);
  if (open && !Object.is(value, held)) setHeld(value);
  return open ? value : held;
}
