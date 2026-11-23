import { NETWORKS, type BrimNetwork } from './constants.js';
import { fail } from './errors.js';

/** Choose the trusted network's public RPC, or validate an explicit endpoint. No I/O. */
export function resolveBrimRpcUrl(network: BrimNetwork, explicit?: string): string {
  if (!Object.hasOwn(NETWORKS, network))
    fail('INVALID_CONFIG', 'The vault config uses an unsupported Solana network.');
  const value = explicit === undefined ? NETWORKS[network].rpcUrl : explicit;
  if (typeof value !== 'string')
    fail(
      'INVALID_CONFIG',
      'Provide a valid Solana RPC URL, or omit rpcUrl to use the public endpoint.',
    );
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    fail(
      'INVALID_CONFIG',
      'Provide a valid Solana RPC URL, or omit rpcUrl to use the public endpoint.',
    );
  }
  if (
    url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
  )
    fail('INVALID_CONFIG', 'Use an HTTPS Solana RPC endpoint, or localhost for development.');
  return value;
}
