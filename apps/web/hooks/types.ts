import type { Dispatch, SetStateAction } from 'react';
import type { DemoState } from '../lib/demo';

export interface DemoActions {
  demo: boolean;
  setState: Dispatch<SetStateAction<DemoState>>;
  notify: (message: string) => void;
  liveUnavailable: () => void;
}
