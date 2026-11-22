export type WorkspaceMode = 'demo' | 'local' | 'live';
export type LocalWorkspaceStatus = 'connecting' | 'ready' | 'unavailable' | 'paused';

export function initialWorkspaceMode(): WorkspaceMode {
  const mode = process.env.NEXT_PUBLIC_BRIM_MODE;
  return mode === 'live' || mode === 'local' ? mode : 'demo';
}
