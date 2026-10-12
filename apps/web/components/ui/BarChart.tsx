'use client';

import { useState } from 'react';
import styles from './BarChart.module.css';

export type BarDatum = { label: string; shortLabel: string; value: number };

const HEIGHT = 140;
const MAX_BAR = 24; // bars never fill their slot

/**
 * Single-series column chart (one hue, so no legend - the card title names it).
 * Hover/focus shows the exact value; a visually hidden table carries the data.
 */
export function BarChart({ data, unit = '' }: { data: BarDatum[]; unit?: string }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const top = niceCeil(max);
  return (
    <figure className={styles.figure}>
      <div className={styles.plot} style={{ height: HEIGHT }} onMouseLeave={() => setActive(null)}>
        {[0, 0.5, 1].map((f) => (
          <div key={f} className={styles.grid} style={{ bottom: f * HEIGHT }}>
            <span className={styles.tick}>{Math.round(top * f)}</span>
          </div>
        ))}
        <div className={styles.bars}>
          {data.map((d, i) => {
            const h = d.value === 0 ? 0 : Math.max(4, (d.value / top) * HEIGHT);
            return (
              <button
                key={d.label}
                type="button"
                className={styles.slot}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                aria-label={`${d.label}: ${d.value} ${unit}`}
              >
                <span className={styles.bar} style={{ height: h, maxWidth: MAX_BAR }} />
                {active === i && (
                  <span className={styles.tooltip} style={{ bottom: h + 8 }}>
                    <strong>{d.value}</strong> {unit}
                    <span>{d.label}</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div className={styles.axis}>
        {data.map((d, i) => (
          <span key={d.label}>
            {i === 0 || i === data.length - 1 || i % 7 === 0 ? d.shortLabel : ''}
          </span>
        ))}
      </div>
      <table className="visually-hidden">
        <tbody>
          {data.map((d) => (
            <tr key={d.label}>
              <th scope="row">{d.label}</th>
              <td>{d.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function niceCeil(n: number): number {
  if (n <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(n));
  return Math.ceil(n / pow) * pow;
}
