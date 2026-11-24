import { isAddress } from '@solana/kit';
import { Data, Schema } from 'effect';

export class LocalWorkspaceError extends Data.TaggedError('LocalWorkspaceError')<{
  code: 'LOCAL_ONLY' | 'LOCAL_WORKSPACE_UNAVAILABLE';
}> {
  override get message() {
    return this.code;
  }
}
export const DEVNET_GENESIS = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
export const LOCAL_USDC_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
export { POLICY_ACCOUNT_BYTES, MAX_LOCAL_AGENTS } from '../lib/chain/read-vault';
export const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const Address = Schema.String.check(Schema.makeFilter(isAddress));
/** Project public connection fields from the local setup file. */
export const PublicLocalMetadata = Schema.Struct({
  rpcUrl: Schema.String,
  programAddress: Address,
  vaultAddress: Address,
  agentAddress: Address,
  facilitatorAddress: Schema.optionalKey(Schema.Unknown),
});
export type LocalMetadata = typeof PublicLocalMetadata.Type;
export const localFailure = () => new LocalWorkspaceError({ code: 'LOCAL_WORKSPACE_UNAVAILABLE' });
export const isLoopback = (hostname: string) =>
  ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
