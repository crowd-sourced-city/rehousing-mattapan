/**
 * The three analysis graphics, as plain HTML/CSS bars so they reflow on phones.
 * Every bar has a hover/focus tooltip and every chart has a "Show the numbers" table.
 */
import { useState, type ReactNode } from 'react';
import { FAMILIES, FAMILY_LABEL, REFORMS, type Family, type Group, type Reform } from '../scripts/analysis';
import type { Summary } from './data';
import { BLUE, FACTOR, STATUS } from './layers';

const fmt = (n: number) => n.toLocaleString('en-US');
const pct = (n: number, d: number) => `${Math.round((100 * n) / d)}%`;
const bit = (r: Reform) => 1 << REFORMS.indexOf(r);

/** Shared hover/focus tooltip for a bar. */
function Bar({ width, color, tip, children, className = '' }: { width: string; color: string; tip: ReactNode; children?: ReactNode; className?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div
      className={`bar ${className}`}
      style={{ width, background: color }}
      tabIndex={0}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
    >
      {children}
      {show && <div className="tip" role="tooltip">{tip}</div>}
    </div>
  );
}

function Numbers({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <details className="exp numbers">
      <summary>Show the numbers</summary>
      <div className="exp-body">
        <table>
          <thead>
            <tr>{head.map((h) => <th key={h}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>{r.map((c, j) => <td key={j}>{typeof c === 'number' ? fmt(c) : c}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

// ---------------------------------------------------------------------------
// 1. Funnel: where Mattapan's parcels drop out
// ---------------------------------------------------------------------------
export function Funnel({ s }: { s: Summary }) {
  const f = s.funnel;
  const steps = [
    { label: 'All parcels in the study area', n: f.parcels, why: '' },
    { label: '1–3 family homes in R1/R2 zoning', n: f.inR1R2Homes, why: 'Article 60’s ADU rules cover these.' },
    { label: 'Lot shape the analysis can measure', n: f.assessable, why: 'Irregular lots and condos are left out for now.' },
    { label: 'Pass Article 60’s site check today', n: f.passSiteCheck, why: 'Coverage, yards, height and unit count, applied to the existing house.' },
    { label: 'An addition or backyard cottage fits', n: f.yes, why: 'At least one outdoor ADU type passes every rule.' },
  ];
  return (
    <figure className="chart">
      <figcaption>
        <h3>From 3,910 parcels to {fmt(f.yes)} lots with room for an addition or cottage</h3>
        <p className="muted small">Each bar is a subset of the one above it.</p>
      </figcaption>
      <div className="funnel">
        {steps.map((st, i) => (
          <div className="funnel-row" key={st.label}>
            <div className="funnel-label">
              <span>{st.label}</span>
              {st.why && <span className="muted small"> · {st.why}</span>}
            </div>
            <div className="track">
              <Bar
                width={`${(100 * st.n) / f.parcels}%`}
                color={i === steps.length - 1 ? BLUE[3] : BLUE[1]}
                tip={`${fmt(st.n)} parcels (${pct(st.n, f.parcels)} of all)`}
              />
              <span className="value">{fmt(st.n)}</span>
            </div>
          </div>
        ))}
      </div>
      <Numbers head={['Step', 'Parcels', 'Share of all']} rows={steps.map((st) => [st.label, st.n, pct(st.n, f.parcels)])} />
    </figure>
  );
}

// ---------------------------------------------------------------------------
// 2. What stops each ADU type
// ---------------------------------------------------------------------------
type Seg = 'allowed' | 'existing' | 'setbacks' | 'other' | 'fire' | 'several' | 'space';
export const SEGMENTS: { key: Seg; label: string; color: string; groups: Group[] }[] = [
  { key: 'allowed', label: 'Allowed', color: STATUS.yes, groups: ['allowed'] },
  { key: 'existing', label: 'Existing house doesn’t meet today’s rules', color: FACTOR.existing, groups: ['existing'] },
  { key: 'setbacks', label: 'Setbacks for the new ADU', color: FACTOR.setbacks, groups: ['setbacks'] },
  { key: 'other', label: 'Lot-coverage or unit cap', color: FACTOR.other, groups: ['coverage', 'units'] },
  { key: 'fire', label: 'Fire code (10 ft path)', color: FACTOR.fire, groups: ['fire'] },
  { key: 'several', label: 'Several rules at once', color: FACTOR.several, groups: ['several'] },
  { key: 'space', label: 'Not enough physical space', color: FACTOR.space, groups: ['space'] },
];

export function TypeBreakdown({ s }: { s: Summary }) {
  const total = s.funnel.assessable;
  const rows = FAMILIES.map((fam) => ({
    fam,
    segs: SEGMENTS.map((seg) => ({ ...seg, n: seg.groups.reduce((a, g) => a + (s.familyGroups[fam][g] ?? 0), 0) })),
  }));
  return (
    <figure className="chart">
      <figcaption>
        <h3>Rules block every kind of ADU more often than lack of space does</h3>
        <p className="muted small">
          Each bar is all {fmt(total)} lots the analysis can measure. A lot counts as <b>not enough space</b> only if the ADU
          wouldn’t fit even with no setbacks (keeping just a 3 ft walkway). Rules count only where the space is there.
        </p>
      </figcaption>
      <ul className="legend-row" aria-label="Legend">
        {SEGMENTS.map((seg) => (
          <li key={seg.key}>
            <span className="sw" style={{ background: seg.color }} />
            {seg.label}
          </li>
        ))}
      </ul>
      <div className="stack-chart">
        {rows.map(({ fam, segs }) => (
          <div className="stack-row" key={fam}>
            <div className="stack-label">{FAMILY_LABEL[fam as Family]}</div>
            <div className="stack-track">
              {segs
                .filter((sg) => sg.n > 0)
                .map((sg) => (
                  <Bar key={sg.key} width={`${(100 * sg.n) / total}%`} color={sg.color} className="seg" tip={<><b>{sg.label}</b><br />{fmt(sg.n)} lots · {pct(sg.n, total)}</>}>
                    {sg.n / total >= 0.08 && <span className={`seg-label ${['space', 'other', 'fire'].includes(sg.key) ? 'dark' : ''}`}>{pct(sg.n, total)}</span>}
                  </Bar>
                ))}
            </div>
          </div>
        ))}
      </div>
      <Numbers
        head={['ADU type', ...SEGMENTS.map((x) => x.label)]}
        rows={rows.map(({ fam, segs }) => [FAMILY_LABEL[fam as Family], ...segs.map((x) => x.n)])}
      />
    </figure>
  );
}

// ---------------------------------------------------------------------------
// 3. What rule changes would do
// ---------------------------------------------------------------------------
export function ReformChart({ s }: { s: Summary }) {
  const total = s.funnel.assessable;
  const all = (1 << REFORMS.length) - 1;
  const today = s.familyScenario[0];
  const reformed = s.familyScenario[all];
  const c = (mask: number) => s.familyScenario[mask].detached;
  const cottage = [
    { label: 'Today', n: c(0) },
    { label: 'Sprinklers instead of the 10 ft fire path', n: c(bit('firePath')) },
    { label: '3 ft cottage setbacks', n: c(bit('cottage3')) },
    { label: 'Both changes together', n: c(bit('firePath') | bit('cottage3')), hi: true },
    { label: 'All five changes', n: c(all) },
  ];
  const separately = cottage[1].n - cottage[0].n + (cottage[2].n - cottage[0].n);
  const together = cottage[3].n - cottage[0].n;
  return (
    <figure className="chart">
      <figcaption>
        <h3>Five targeted rule changes would roughly triple where backyard cottages are allowed</h3>
        <p className="muted small">Lots (of {fmt(total)}) allowing each kind of ADU, today and with all five changes on the map above.</p>
      </figcaption>
      <ul className="legend-row" aria-label="Legend">
        <li><span className="sw" style={{ background: BLUE[1] }} />Today</li>
        <li><span className="sw" style={{ background: BLUE[3] }} />With all five changes</li>
      </ul>
      <div className="pairs">
        {FAMILIES.map((fam) => (
          <div className="pair" key={fam}>
            <div className="stack-label">{FAMILY_LABEL[fam]}</div>
            <div className="pair-bars">
              <div className="track">
                <Bar width={`${(100 * today[fam]) / total}%`} color={BLUE[1]} tip={`Today: ${fmt(today[fam])} lots`} />
                <span className="value">{fmt(today[fam])}</span>
              </div>
              <div className="track">
                <Bar width={`${(100 * reformed[fam]) / total}%`} color={BLUE[3]} tip={`With all five changes: ${fmt(reformed[fam])} lots (+${fmt(reformed[fam] - today[fam])})`} />
                <span className="value">
                  {fmt(reformed[fam])} <span className="muted">(+{fmt(reformed[fam] - today[fam])})</span>
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="inset">
        <h4>Rules stack: backyard cottages need two changes at once</h4>
        <p className="muted small">
          Behind most houses, a cottage is blocked by <b>both</b> the 10 ft fire path and the cottage setbacks. Relaxing
          either alone adds {fmt(separately)} lots between them; relaxing both adds {fmt(together)}.
        </p>
        <div className="funnel">
          {cottage.map((row) => (
            <div className="funnel-row" key={row.label}>
              <div className="funnel-label">{row.hi ? <b>{row.label}</b> : row.label}</div>
              <div className="track">
                <Bar width={`${(100 * row.n) / total}%`} color={row.hi ? BLUE[3] : BLUE[1]} tip={`${fmt(row.n)} lots allow a backyard cottage`} />
                <span className="value">{fmt(row.n)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <Numbers
        head={['ADU type', 'Today', 'All five changes', 'Gain']}
        rows={[
          ...FAMILIES.map((fam) => [FAMILY_LABEL[fam], today[fam], reformed[fam], `+${fmt(reformed[fam] - today[fam])}`]),
          ...cottage.map((r) => [`Backyard cottage: ${r.label}`, r.n, '', '']),
        ]}
      />
    </figure>
  );
}
