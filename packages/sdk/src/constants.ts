/** Local Surfpool fixture identity only. Public networks require an explicit deployed program address. */
export const BRIM_DEVELOPMENT_PROGRAM_ADDRESS = 'AekkJRGenJd9bgXoYo88xnAGpen9DMqSjkBRZZMMskpo';
export const BRIM_NETWORK_IDS = Object.freeze({
  devnet: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
  mainnet: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
} as const);
export type BrimNetworkName = keyof typeof BRIM_NETWORK_IDS;

export const NETWORKS = {
  [BRIM_NETWORK_IDS.mainnet]: {
    rpcUrl: 'https://api.mainnet-beta.solana.com',
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    genesisHash: '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
  },
  [BRIM_NETWORK_IDS.devnet]: {
    rpcUrl: 'https://api.devnet.solana.com',
    mint: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
    genesisHash: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
  },
} as const;
export type BrimNetwork = keyof typeof NETWORKS;
export const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const ASSOCIATED_TOKEN_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
export const EXECUTE_PAYMENT_DISCRIMINATOR = new Uint8Array([86, 4, 7, 7, 120, 139, 232, 139]);

export const AGENT_POLICY_DISCRIMINATOR = new Uint8Array([148, 193, 218, 129, 21, 96, 195, 77]);
