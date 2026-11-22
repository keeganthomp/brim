import * as Switch from '@radix-ui/react-switch';
export function PolicySwitch({
  checked,
  onChange,
  label,
  disabled = false,
  id,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <Switch.Root
      type="button"
      id={id}
      className="switch"
      checked={checked}
      onCheckedChange={onChange}
      aria-label={label}
      disabled={disabled}
    >
      <Switch.Thumb className="switch-thumb" />
    </Switch.Root>
  );
}
