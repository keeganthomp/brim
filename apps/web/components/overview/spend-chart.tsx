import { dollars } from '../../lib/currency';

const sampleDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const sampleSpend = [3040, 5410, 4350, 8620, 6975, 11321, 8580];
const points = sampleSpend.map((cents, day) => [12 + day * 76, 104 - (cents / 12_000) * 88]);
const line = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x} ${y}`).join(' ');
const area = `${line} L468 112 H12Z`;

export const demoSpendTotal = sampleSpend.reduce((total, cents) => total + cents, 0) / 100;

export function SpendChart() {
  return (
    <figure className="spend-chart" aria-label="Sample spending by day">
      <svg viewBox="0 0 480 112" aria-hidden="true" preserveAspectRatio="none">
        <defs>
          <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity=".09" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path className="chart-grid" d="M0 28H480 M0 68H480 M0 111H480" />
        <path d={area} fill="url(#chart-fill)" />
        <path className="chart-line" d={line} />
        {points.map(([x, y], day) => (
          <circle key={sampleDays[day]} className="chart-point" cx={x} cy={y} r="3" />
        ))}
      </svg>
      <ol className="chart-days">
        {sampleDays.map((day, index) => (
          <li key={day}>
            {day}
            <span className="sr-only"> {dollars(sampleSpend[index]! / 100)}</span>
          </li>
        ))}
      </ol>
    </figure>
  );
}
