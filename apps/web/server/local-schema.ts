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
export const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const Address = Schema.String.check(Schema.isPattern(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/));
export const BaseUnits = Schema.String.check(
  Schema.makeFilter(
    (value: string) =>
      /^(0|[1-9]\d{0,19})$/.test(value) && BigInt(value) <= 18_446_744_073_709_551_615n,
  ),
);
/** Project public connection fields from the local setup file. */
export const PublicLocalMetadata = Schema.Struct({
  rpcUrl: Schema.String,
  programAddress: Address,
  vaultAddress: Address,
  agentAddress: Address,
  facilitatorAddress: Schema.optionalKey(Schema.Unknown),
});
export const PaymentRows = Schema.Array(
  Schema.Struct({
    signature: Schema.String.check(Schema.isPattern(/^[1-9A-HJ-NP-Za-km-z]{64,88}$/)),
    event_index: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 63 })),
    agent_key: Address,
    amount_base_units: BaseUnits,
    chain_timestamp: Schema.String.check(Schema.isPattern(/^-?\d{1,19}$/)),
  }),
);
export type LocalMetadata = typeof PublicLocalMetadata.Type;
export const localFailure = () => new LocalWorkspaceError({ code: 'LOCAL_WORKSPACE_UNAVAILABLE' });
export const isLoopback = (hostname: string) =>
  ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
