import {
  address,
  getAddressDecoder,
  getAddressEncoder,
  getProgramDerivedAddress,
} from '@solana/kit';
import { ASSOCIATED_TOKEN_PROGRAM, TOKEN_PROGRAM } from './constants.js';
import { fail } from './errors.js';
import type { AgentPolicySnapshot } from './policy.js';

const encoder = getAddressEncoder();
const decoder = getAddressDecoder();
const utf8 = new TextEncoder();

export async function accountDiscriminator(name: string): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.digest('SHA-256', utf8.encode(`account:${name}`)),
  ).slice(0, 8);
}
export function decodeData(encoded: readonly [string, string]): Uint8Array {
  return Uint8Array.from(atob(encoded[0]), (c) => c.charCodeAt(0));
}
export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
export function readAddress(data: Uint8Array, offset: number): string {
  return decoder.decode(data.subarray(offset, offset + 32));
}
export function readInteger(data: Uint8Array, offset: number, signed = false): bigint {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return signed ? view.getBigInt64(offset, true) : view.getBigUint64(offset, true);
}

export async function findBrimPolicyAddress(
  program: string,
  vault: string,
  agent: string,
): Promise<string> {
  const [result] = await getProgramDerivedAddress({
    programAddress: address(program),
    seeds: [utf8.encode('agent'), encoder.encode(address(vault)), encoder.encode(address(agent))],
  });
  return result;
}
export async function findTokenAccount(owner: string, mint: string): Promise<string> {
  const [result] = await getProgramDerivedAddress({
    programAddress: address(ASSOCIATED_TOKEN_PROGRAM),
    seeds: [
      encoder.encode(address(owner)),
      encoder.encode(address(TOKEN_PROGRAM)),
      encoder.encode(address(mint)),
    ],
  });
  return result;
}
export function decodeAgentPolicy(data: Uint8Array): AgentPolicySnapshot {
  // Anchor Borsh layout, corresponding to programs/brim/src/lib.rs.
  if (data.length < 135) fail('INVALID_ACCOUNT', 'Truncated agent policy.');
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const count = view.getUint32(130, true);
  if (count > 16 || data.length < 135 + count * 32)
    fail('INVALID_ACCOUNT', 'Invalid recipient allowlist.');
  if (data[72] > 1 || data[129] > 1) fail('INVALID_ACCOUNT', 'Invalid policy flag.');
  return {
    vault: readAddress(data, 8),
    agentKey: readAddress(data, 40),
    isFrozen: data[72] === 1,
    maxPerTx: readInteger(data, 73),
    windowLimit: readInteger(data, 81),
    windowDuration: readInteger(data, 89, true),
    windowStart: readInteger(data, 97, true),
    windowSpent: readInteger(data, 105),
    minTxInterval: readInteger(data, 113, true),
    lastTxTs: readInteger(data, 121, true),
    allowlistEnabled: data[129] === 1,
    allowlist: Array.from({ length: count }, (_, i) => readAddress(data, 134 + i * 32)),
  };
}
