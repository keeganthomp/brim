import type { Effect } from 'effect';
import type { McpFailure } from './errors.js';

export type EmptyArgs = Record<string, never>;
export interface FetchArgs {
  url: string;
  method?: 'GET' | 'POST';
  body?: string;
}
export interface BrimMcpService {
  balance(input: EmptyArgs, signal: AbortSignal): Effect.Effect<unknown, McpFailure>;
  policy(input: EmptyArgs, signal: AbortSignal): Effect.Effect<unknown, McpFailure>;
  fetch(input: FetchArgs, signal: AbortSignal): Effect.Effect<unknown, McpFailure>;
}
export interface McpConfig {
  vaultConfig: string;
  agentKey: string;
  rpcUrl: string;
  local: boolean;
}
