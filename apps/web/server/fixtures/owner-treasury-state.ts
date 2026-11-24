import {
  address,
  getAddressEncoder,
  getCompiledTransactionMessageDecoder,
  type Transaction,
} from '@solana/kit';

const TOKEN = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export function fixtureTreasury(
  owner: string,
  mint: string,
  program: string,
  ownerAta: string,
  vaultAta: string,
  vault: string,
) {
  const state = {
    initialized: true,
    programAvailable: true,
    ownerHasAta: true,
    solBalance: 1_000_000_000,
    ownerBalance: 100_000_000n,
    vaultBalance: 50_000_000n,
  };
  const account = (key: string) => {
    if (key === program)
      return state.programAvailable
        ? {
            data: ['', 'base64'],
            owner: 'BPFLoaderUpgradeab1e11111111111111111111111',
            executable: true,
            lamports: 1,
            rentEpoch: 0,
            space: 0,
          }
        : null;
    if (key !== ownerAta && key !== vaultAta) return undefined;
    if ((key === ownerAta && !state.ownerHasAta) || (key === vaultAta && !state.initialized))
      return null;
    const data = new Uint8Array(165);
    const encoder = getAddressEncoder();
    data.set(encoder.encode(address(mint)));
    data.set(encoder.encode(address(key === ownerAta ? owner : vault)), 32);
    new DataView(data.buffer).setBigUint64(
      64,
      key === ownerAta ? state.ownerBalance : state.vaultBalance,
      true,
    );
    data[108] = 1;
    return {
      data: [btoa(String.fromCharCode(...data)), 'base64'],
      owner: TOKEN,
      executable: false,
      lamports: 1,
      rentEpoch: 0,
      space: data.length,
    };
  };
  const apply = (tx: Transaction, policy: Uint8Array | null) => {
    const message = getCompiledTransactionMessageDecoder().decode(tx.messageBytes);
    if (message.version !== 0) throw new Error('Expected fixture version-zero message');
    for (const instruction of message.instructions) {
      const data = instruction.data;
      if (!data?.length) continue;
      const invoked = message.staticAccounts[instruction.programAddressIndex];
      const amount =
        data.length >= 16
          ? new DataView(data.buffer, data.byteOffset, data.byteLength).getBigUint64(8, true)
          : 0n;
      if (invoked === program && data.length === 8 && data[0] === 77) state.initialized = true;
      else if (invoked === program && data.length === 9 && data[0] === 0 && policy)
        policy[72] = data[8]!;
      else if (invoked === program && data.length === 16 && data[0] === 183) {
        state.vaultBalance -= amount;
        state.ownerBalance += amount;
      } else if (invoked === TOKEN && data.length === 10 && data[0] === 12) {
        const transferred = new DataView(
          data.buffer,
          data.byteOffset,
          data.byteLength,
        ).getBigUint64(1, true);
        state.ownerBalance -= transferred;
        state.vaultBalance += transferred;
      }
    }
  };
  return { state, account, apply };
}
