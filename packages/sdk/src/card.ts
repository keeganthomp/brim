import { Schema } from 'effect';
import { CardDetailsSchema, CardPayloadSchema } from './schemas.js';
import { fail } from './errors.js';
import { resolveBrimRpcUrl } from './rpc.js';
import type { BrimCardDetails, BrimConfig, BrimCardConfig, ResolvedBrimConfig } from './types.js';

const PREFIX = 'brim:v1:';
const MAX_CARD_LENGTH = 4096;
const invalid = (): never =>
  fail('INVALID_CARD', 'Card setup is invalid. Copy a new BRIM_CARD from your operator.');
function readDetails(value: unknown, encoded = false): BrimCardDetails {
  const schema = encoded ? CardPayloadSchema : CardDetailsSchema;
  let decoded: BrimCardDetails;
  try {
    decoded = Schema.decodeUnknownSync(schema, { onExcessProperty: 'error' })(value);
  } catch {
    return invalid();
  }
  return {
    vaultAddress: decoded.vaultAddress,
    programAddress: decoded.programAddress,
    network: decoded.network,
    facilitatorFeePayers: [...decoded.facilitatorFeePayers],
  };
}

/** Public routing metadata. Contains no agent key, RPC credential, or spending authority. */
export function createBrimCard(details: BrimCardDetails): string {
  const safe = readDetails(details);
  const payload = JSON.stringify({ version: 1, ...safe });
  return PREFIX + btoa(payload).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Internal decoder also used by the simple setup path. Never echoes card contents. */
export function decodeBrimCard(card: unknown): BrimCardDetails {
  if (typeof card !== 'string' || card.length > MAX_CARD_LENGTH) return invalid();
  const version = /^brim:v([0-9]+):/.exec(card)?.[1];
  if (version !== undefined && version !== '1')
    fail(
      'UNSUPPORTED_CARD_VERSION',
      'This card needs a different SDK version. Ask your operator for a v1 card.',
    );
  if (!card.startsWith(PREFIX)) return invalid();
  const encoded = card.slice(PREFIX.length);
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) return invalid();
  let decoded: unknown;
  try {
    decoded = JSON.parse(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return invalid();
  }
  if (
    decoded &&
    typeof decoded === 'object' &&
    'version' in decoded &&
    typeof decoded.version === 'number' &&
    decoded.version !== 1
  )
    fail(
      'UNSUPPORTED_CARD_VERSION',
      'This card needs a different SDK version. Ask your operator for a v1 card.',
    );
  return readDetails(decoded, true);
}

export function resolveBrimConfig(input: BrimConfig | BrimCardConfig): ResolvedBrimConfig {
  if (!input || typeof input !== 'object')
    fail('INVALID_CONFIG', 'Provide your public vault config (Brim card) and scoped agent key.');
  if ('card' in input) {
    // Reject mixed setup styles so sensitive fields cannot silently change meaning.
    if (
      ['agentSecretKey', 'vaultAddress', 'programAddress', 'network', 'facilitator'].some(
        (key) => key in input,
      )
    )
      fail(
        'INVALID_CONFIG',
        'Use either a Brim card or advanced setup fields, without mixing them.',
      );
    const details = decodeBrimCard(input.card);
    return {
      vaultAddress: details.vaultAddress,
      programAddress: details.programAddress,
      network: details.network,
      facilitator: { mode: 'smart-wallet-exact', feePayers: details.facilitatorFeePayers },
      agentSecretKey: input.agentKey,
      rpcUrl: resolveBrimRpcUrl(details.network, input.rpcUrl),
      ...(input.maxPaymentAmount === undefined ? {} : { maxPaymentAmount: input.maxPaymentAmount }),
      ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
      ...(input.onEvent === undefined ? {} : { onEvent: input.onEvent }),
    };
  }
  return { ...input, rpcUrl: resolveBrimRpcUrl(input.network, input.rpcUrl) };
}
