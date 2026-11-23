import { describe, expect, it } from 'vitest';
import {
  BRIM_NETWORK_IDS,
  BRIM_DEVELOPMENT_PROGRAM_ADDRESS,
  createBrimVaultConfig,
  readBrimVaultConfig,
  createBrimCard,
  type BrimNetwork,
  type BrimNetworkName,
} from '../src/index.js';
import { resolveBrimConfig } from '../src/vault-config.js';
import { config, encodedVaultConfig, vaultConfigDetails } from './sharedfixtures.js';

const names: readonly BrimNetworkName[] = ['devnet', 'mainnet'];
describe('vault config network aliases', () => {
  it.each(names)('serializes %s to exactly the same v1 bytes as its CAIP-2 ID', (network) => {
    const expected = createBrimVaultConfig({
      ...vaultConfigDetails,
      network: BRIM_NETWORK_IDS[network],
    });
    const encoded = createBrimVaultConfig({ ...vaultConfigDetails, network });
    expect(encoded).toBe(expected);
    expect(createBrimCard({ ...vaultConfigDetails, network })).toBe(expected);
    const decodedNetwork: BrimNetwork = readBrimVaultConfig(encoded).network;
    expect(decodedNetwork).toBe(BRIM_NETWORK_IDS[network]);
  });

  it.each([
    'testnet',
    'Devnet',
    'mainnet-beta',
    'solana:unknown',
    'constructor',
    '',
    null,
    undefined,
  ])('refuses an invalid public input network', (network) => {
    expect(() => createBrimVaultConfig({ ...vaultConfigDetails, network } as never)).toThrow(
      expect.objectContaining({ code: 'INVALID_CARD' }),
    );
  });

  it.each(names)(
    'keeps %s shorthand out of the strict wire decoder and advanced config',
    (network) => {
      expect(() =>
        readBrimVaultConfig(encodedVaultConfig({ version: 1, ...vaultConfigDetails, network })),
      ).toThrow(expect.objectContaining({ code: 'INVALID_CARD' }));
      expect(() => resolveBrimConfig({ ...config, network } as never)).toThrow(
        expect.objectContaining({ code: 'INVALID_CONFIG' }),
      );
    },
  );

  it('keeps the local fixture address explicit instead of using it as a public default', () => {
    expect(typeof BRIM_DEVELOPMENT_PROGRAM_ADDRESS).toBe('string');
    const { programAddress: _localProgram, ...incomplete } = vaultConfigDetails;
    expect(() => createBrimVaultConfig({ ...incomplete, network: 'devnet' } as never)).toThrow(
      expect.objectContaining({ code: 'INVALID_CARD' }),
    );
    expect(Object.isFrozen(BRIM_NETWORK_IDS)).toBe(true);
  });
});
