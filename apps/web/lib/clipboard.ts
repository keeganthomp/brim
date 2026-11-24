import { sdkSetupTemplate } from './sdk-template';

export type ClipboardOperation =
  'copy-template' | 'copy-signature' | 'copy-vault-config' | 'copy-agent-key';

/** Start before any await/import so Safari retains transient clipboard activation. */
export function copyText(text: string, operation: ClipboardOperation): Promise<boolean> {
  let write: Promise<void>;
  try {
    write = navigator.clipboard.writeText(text);
  } catch {
    return Promise.resolve(false);
  }
  // Attach rejection handling immediately, even while the Effect chunk is downloading.
  const outcome = write.then(
    () => true,
    () => false,
  );
  return import('./clipboard-effects').then(
    ({ completeClipboardWrite }) => completeClipboardWrite(outcome, operation),
    () => outcome,
  );
}

export const copySdkTemplate = (vaultConfig?: string, rpcUrl?: string, resourceUrl?: string) =>
  copyText(sdkSetupTemplate(vaultConfig, rpcUrl, resourceUrl), 'copy-template');
