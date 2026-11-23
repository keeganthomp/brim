import { useId } from 'react';

export function PolicyNumberField({
  label,
  value,
  onChange,
  unit,
  description,
  min = 0.000001,
  step = 0.000001,
  readOnly = false,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  unit: string;
  description?: string;
  min?: number;
  step?: number;
  readOnly?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="policy-number-field">
      <label htmlFor={id}>{label}</label>
      <div className="policy-number-input">
        <input
          id={id}
          type="number"
          inputMode={unit === 'USDC' ? 'decimal' : 'numeric'}
          value={Number.isFinite(value) ? value : ''}
          min={min}
          step={step}
          required
          readOnly={readOnly}
          disabled={disabled}
          aria-describedby={`${id}-unit${description ? ` ${id}-help` : ''}`}
          onInvalid={(event) => event.currentTarget.closest('details')?.setAttribute('open', '')}
          onChange={(event) => onChange(event.currentTarget.valueAsNumber)}
        />
        <span id={`${id}-unit`}>{unit}</span>
      </div>
      {description && <p id={`${id}-help`}>{description}</p>}
    </div>
  );
}
