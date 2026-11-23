/** Heavy validation and Effect runtimes are loaded only when an operation needs them. */
let browserEffects: Promise<typeof import('./browser-effects')> | undefined;
let policyActions: Promise<typeof import('./agent-policy')> | undefined;
let fundsActions: Promise<typeof import('./funds')> | undefined;
let localClient: Promise<typeof import('./local/client')> | undefined;
let localPolicies: Promise<typeof import('./local/policies')> | undefined;
let liveClient: Promise<typeof import('./live/client')> | undefined;
let ownerWallet: Promise<typeof import('./live/owner-wallet')> | undefined;

export const loadBrowserEffects = () =>
  (browserEffects ??= import('./browser-effects').catch((error) => {
    browserEffects = undefined;
    throw error;
  }));
export const loadPolicyActions = () =>
  (policyActions ??= import('./agent-policy').catch((error) => {
    policyActions = undefined;
    throw error;
  }));
export const loadFundsActions = () =>
  (fundsActions ??= import('./funds').catch((error) => {
    fundsActions = undefined;
    throw error;
  }));
export const loadLocalClient = () =>
  (localClient ??= import('./local/client').catch((error) => {
    localClient = undefined;
    throw error;
  }));
export const loadLocalPolicies = () =>
  (localPolicies ??= import('./local/policies').catch((error) => {
    localPolicies = undefined;
    throw error;
  }));
export const loadLiveClient = () =>
  (liveClient ??= import('./live/client').catch((error) => {
    liveClient = undefined;
    throw error;
  }));
export const loadOwnerWallet = () =>
  (ownerWallet ??= import('./live/owner-wallet').catch((error) => {
    ownerWallet = undefined;
    throw error;
  }));
