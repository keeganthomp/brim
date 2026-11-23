import { Snowflake } from 'lucide-react';

/** The only per-agent status worth a label: active agents need none. */
export function FrozenStatus() {
  return (
    <span className="frozen-status">
      <Snowflake size={11} strokeWidth={2.25} aria-hidden="true" />
      Frozen
    </span>
  );
}
