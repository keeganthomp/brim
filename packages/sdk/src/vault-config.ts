import { Schema } from 'effect';
import { VaultConfigDetailsSchema, VaultConfigPayloadSchema } from './schemas.js';
import { fail } from './errors.js';
import { resolveBrimRpcUrl } from './rpc.js';
import { BRIM_NETWORK_IDS, type BrimNetwork, type BrimNetworkName } from './constants.js';
import type {
  BrimVaultConfigDetails,
  BrimConfig,
  BrimVaultConfig,
  BrimCardConfig,
  ResolvedBrimConfig,
} from './types.js';

const PREFIX = 'brim:v1:';
const MAX_VAULT_CONFIG_LENGTH = 4096;
const invalid = (): never =>
  fail('INVALID_CARD', 'Vault config is invalid. Copy a new BRIM_VAULT_CONFIG from your operator.');
function readDetails(value: unknown, encoded = false): BrimVaultConfigDetails {
  const schema = encoded ? VaultConfigPayloadSchema : VaultConfigDetailsSchema;
  let decoded: BrimVaultConfigDetails;
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

type VaultConfigInput = Omit<BrimVaultConfigDetails, 'network'> & {
  network: BrimNetwork | BrimNetworkName;
};

/** Public routing metadata. Simple network names serialize to canonical CAIP-2 IDs. */
export function createBrimVaultConfig(details: VaultConfigInput): string {
  const network = details?.network;
  const normalized =
    typeof network === 'string' && Object.hasOwn(BRIM_NETWORK_IDS, network)
      ? { ...details, network: BRIM_NETWORK_IDS[network as BrimNetworkName] }
      : details;
  const safe = readDetails(normalized);
  const payload = JSON.stringify({ version: 1, ...safe });
  return PREFIX + btoa(payload).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Internal decoder also used by the simple setup path. Never echoes vault config contents. */
export function readBrimVaultConfig(vaultConfig: unknown): BrimVaultConfigDetails {
  if (typeof vaultConfig !== 'string' || vaultConfig.length > MAX_VAULT_CONFIG_LENGTH)
    return invalid();
  const version = /^brim:v([0-9]+):/.exec(vaultConfig)?.[1];
  if (version !== undefined && version !== '1')
    fail(
      'UNSUPPORTED_CARD_VERSION',
      'This vault config needs a different SDK version. Ask your operator for a v1 config.',
    );
  if (!vaultConfig.startsWith(PREFIX)) return invalid();
  const encoded = vaultConfig.slice(PREFIX.length);
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
      'This vault config needs a different SDK version. Ask your operator for a v1 config.',
    );
  return readDetails(decoded, true);
}

export function resolveBrimConfig(
  input: BrimConfig | BrimVaultConfig | BrimCardConfig,
): ResolvedBrimConfig {
  if (!input || typeof input !== 'object')
    fail('INVALID_CONFIG', 'Provide your public vault config and scoped agent key.');
  if ('vaultConfig' in input && 'card' in input)
    fail('INVALID_CONFIG', 'Provide exactly one vault config input.');
  if ('vaultConfig' in input || 'card' in input) {
    // Reject mixed setup styles so sensitive fields cannot silently change meaning.
    if (
      ['agentSecretKey', 'vaultAddress', 'programAddress', 'network', 'facilitator'].some(
        (key) => key in input,
      )
    )
      fail(
        'INVALID_CONFIG',
        'Use either a vault config or advanced setup fields, without mixing them.',
      );
    const details = readBrimVaultConfig('vaultConfig' in input ? input.vaultConfig : input.card);
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
