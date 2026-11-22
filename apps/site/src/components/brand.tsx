export function Brand({ className = '' }: { className?: string }) {
  return (
    <span className={`brim-brand ${className}`}>
      <span className="brim-mark" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span>brim</span>
    </span>
  );
}
