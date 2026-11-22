/** Heavy validation and Effect runtimes are loaded only when an operation needs them. */
let browserEffects: Promise<typeof import('./browser-effects')> | undefined;
let policyActions: Promise<typeof import('./agent-policy')> | undefined;
let fundsActions: Promise<typeof import('./funds')> | undefined;
let localClient: Promise<typeof import('./local/client')> | undefined;

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
