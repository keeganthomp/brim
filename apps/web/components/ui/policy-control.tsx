import { useId } from 'react';
import * as Slider from '@radix-ui/react-slider';
import { dollars } from '../../lib/currency';

export function PolicyControl({
  title,
  description,
  value,
  max,
  step,
  money,
  onChange,
}: {
  title: string;
  description: string;
  value: number;
  max: number;
  step: number;
  money?: boolean;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const descriptionId = `${id}-description`;
  const upperLimit = money ? 1_000_000 : max;
  const invalid = !Number.isFinite(value) || value < step || value > upperLimit;
  const sliderValue = Math.min(max, Math.max(step, Number.isFinite(value) ? value : step));
  return (
    <div className="policy-control">
      <div className="control-label">
        <label htmlFor={id}>{title}</label>
        <div className="control-value">
          {money && <span aria-hidden="true">$</span>}
          <input
            id={id}
            type="number"
            inputMode={money ? 'decimal' : 'numeric'}
            min={step}
            max={upperLimit}
            step={step}
            value={Number.isFinite(value) && value !== 0 ? value : ''}
            aria-invalid={invalid}
            aria-describedby={descriptionId}
            onChange={(event) =>
              onChange(event.target.value === '' ? 0 : Number(event.target.value))
            }
          />
        </div>
      </div>
      <Slider.Root
        className="slider"
        min={step}
        max={max}
        step={step}
        value={[sliderValue]}
        onValueChange={(values) => onChange(values[0]!)}
      >
        <Slider.Track className="slider-track">
          <Slider.Range className="slider-range" />
        </Slider.Track>
        <Slider.Thumb
          className="slider-thumb"
          aria-label={title}
          aria-describedby={descriptionId}
          aria-valuetext={money ? dollars(sliderValue) : String(sliderValue)}
        />
      </Slider.Root>
      <p id={descriptionId}>{description}</p>
    </div>
  );
}
