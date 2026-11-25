import type { ExpressionSpecification } from 'maplibre-gl';
import { useMemo, useState } from 'react';
import { FAMILIES, FAMILY_LABEL, REFORMS, REFORM_LABEL, TAG_LABEL, type Reform, type Tag } from '../scripts/analysis';
import type { Loaded, Lot } from './data';
import { BIVARIATE, BIVARIATE_FILL, FACTOR_LAYER, NEUTRAL, STATUS } from './layers';
import { LotMap } from './LotMap';

type Mode = 'reforms' | 'opportunity' | 'why';
const MODES: { id: Mode; label: string; blurb: string }[] = [
  { id: 'reforms', label: 'What if the rules changed?', blurb: 'Switch on rule changes and watch lots open up. Dark blue lots are the ones the changes unlock.' },
  { id: 'opportunity', label: 'Room to grow', blurb: 'Two layers in one: how many kinds of ADU are allowed (blue) and how big they can be (pink). Dark purple lots have both.' },
  { id: 'why', label: 'Why not?', blurb: 'For lots without room for an addition or cottage today: the single thing in the way.' },
];
const STATUS_WORD = { Y: 'Yes', M: 'Maybe', N: 'No' } as const;
const fmt = (n: number) => n.toLocaleString('en-US');

const scenarioFill: ExpressionSpecification = [
  'match',
  ['get', 's'],
  'O',
  NEUTRAL.out,
  'A',
  NEUTRAL.unassessed,
  [
    'case',
    ['all', ['==', ['get', 'r'], 'Y'], ['!=', ['get', 's'], 'Y']],
    STATUS.newly,
    ['==', ['get', 'r'], 'Y'],
    ['case', ['==', ['get', 'changed'], 1], STATUS.wasYes, STATUS.yes],
    ['==', ['get', 'r'], 'M'],
    STATUS.maybe,
    STATUS.no,
  ],
];

export function ExploreMap({ data }: { data: Loaded }) {
  const [mode, setMode] = useState<Mode>('reforms');
  const [mask, setMask] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const s = data.summary;

  // Recompute properties for the chosen reform combination.
  const shapes = useMemo(() => {
    if (mode !== 'reforms') return data.shapes;
    return {
      ...data.shapes,
      features: data.shapes.features.map((f) => {
        const lot = data.lots[f.properties!.id as string];
        return { ...f, properties: { ...f.properties, r: lot?.sc ? lot.sc[mask] : lot?.s, changed: mask ? 1 : 0 } };
      }),
    };
  }, [data, mask, mode]);

  const fill = mode === 'reforms' ? scenarioFill : mode === 'opportunity' ? BIVARIATE_FILL : FACTOR_LAYER.fill;
  const counts = s.scenarioCounts[mask];
  const base = s.scenarioCounts[0];
  const fam = s.familyScenario[mask];
  const fam0 = s.familyScenario[0];
  const toggle = (r: Reform) => setMask((m) => m ^ (1 << REFORMS.indexOf(r)));
  const lot = selected ? data.lots[selected] : null;

  return (
    <div className="explore">
      <div className="mode-tabs" role="tablist" aria-label="Map view">
        {MODES.map((m) => (
          <button key={m.id} role="tab" aria-selected={mode === m.id} className={mode === m.id ? 'on' : ''} onClick={() => setMode(m.id)}>
            {m.label}
          </button>
        ))}
      </div>
      <p className="muted explore-blurb">{MODES.find((m) => m.id === mode)!.blurb}</p>

      <div className="explore-grid">
        <div className="explore-map">
          <LotMap
            shapes={shapes}
            streets={data.streets}
            fill={fill}
            onLotClick={setSelected}
            selectedId={selected}
            height="min(640px, 72vh)"
            label="Interactive map of Mattapan lots. Click a lot for details."
          />
        </div>

        <aside className="explore-side">
          {mode === 'reforms' && (
            <>
              <fieldset className="reforms">
                <legend>Change the rules</legend>
                {REFORMS.map((r, i) => (
                  <label key={r} className={`reform ${mask & (1 << i) ? 'on' : ''}`}>
                    <input type="checkbox" checked={!!(mask & (1 << i))} onChange={() => toggle(r)} />
                    <span>
                      <b>{REFORM_LABEL[r].title}</b>
                      <span className="muted small">{REFORM_LABEL[r].body}</span>
                    </span>
                  </label>
                ))}
                <div className="row">
                  <button className="link-btn small" onClick={() => setMask((1 << REFORMS.length) - 1)}>All on</button>
                  <button className="link-btn small" onClick={() => setMask(0)}>Reset</button>
                </div>
              </fieldset>
              <div className="counter" aria-live="polite">
                <div className="big">
                  {fmt(counts.yes)}
                  {mask > 0 && <span className="delta"> +{fmt(counts.yes - base.yes)}</span>}
                </div>
                <div className="muted small">lots with room for an addition or backyard cottage (today: {fmt(base.yes)})</div>
                <table className="mini">
                  <tbody>
                    {FAMILIES.map((f) => (
                      <tr key={f}>
                        <td>{FAMILY_LABEL[f]}</td>
                        <td className="num">{fmt(fam[f])}</td>
                        <td className="num delta">{fam[f] > fam0[f] ? `+${fmt(fam[f] - fam0[f])}` : ''}</td>
                      </tr>
                    ))}
                    <tr>
                      <td>No ADU of any kind</td>
                      <td className="num">{fmt(counts.no)}</td>
                      <td className="num delta">{counts.no < base.no ? `−${fmt(base.no - counts.no)}` : ''}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <Legend
                items={[
                  ...(mask ? [{ color: STATUS.newly, label: 'Newly allowed: addition or cottage' }, { color: STATUS.wasYes, label: 'Already allowed today' }] : [{ color: STATUS.yes, label: 'Yes: addition or cottage fits' }]),
                  { color: STATUS.maybe, label: 'Maybe: only inside the house' },
                  { color: STATUS.no, label: 'No ADU allowed' },
                  { color: NEUTRAL.unassessed, label: 'Not assessed (irregular lot, condo)' },
                ]}
              />
            </>
          )}
          {mode === 'opportunity' && <BivariateLegend />}
          {mode === 'why' && <Legend items={FACTOR_LAYER.legend} />}

          <LotCard id={selected} lot={lot} mask={mask} onClose={() => setSelected(null)} />
        </aside>
      </div>
    </div>
  );
}

function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <ul className="legend-list">
      {items.map((i) => (
        <li key={i.label}>
          <span className="sw" style={{ background: i.color }} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

function BivariateLegend() {
  return (
    <div className="bivar">
      <div className="bivar-grid" aria-hidden>
        {[2, 1, 0].map((row) =>
          [0, 1, 2].map((col) => <span key={`${row}-${col}`} style={{ background: BIVARIATE[row][col] }} />),
        )}
      </div>
      <div className="bivar-y small">More kinds of ADU ↑<br /><span className="muted">1–2 · 3 · all 4</span></div>
      <div className="bivar-x small">Bigger ADU →<br /><span className="muted">&lt;1,000 · 1,000–1,250 · 1,250+ sq ft</span></div>
      <Legend items={[{ color: NEUTRAL.zero, label: 'No ADU allowed' }, { color: NEUTRAL.unassessed, label: 'Not assessed' }]} />
    </div>
  );
}

function LotCard({ id, lot, mask, onClose }: { id: string | null; lot: Lot | null; mask: number; onClose: () => void }) {
  if (!id) return <p className="muted small card-hint">Click any lot on the map to see what’s allowed and what’s in the way.</p>;
  if (!lot || lot.s === 'O') return <div className="lot-card"><p className="small">This parcel isn’t a 1–3 family home in R1/R2 zoning, so Article 60’s ADU rules don’t apply here.</p><button className="link-btn small" onClick={onClose}>Close</button></div>;
  if (lot.s === 'A') return <div className="lot-card"><p className="small">This home is on an irregular lot or is a condo. The analysis can’t measure it yet.</p><button className="link-btn small" onClick={onClose}>Close</button></div>;
  const now = (lot.sc?.[mask] ?? lot.s) as 'Y' | 'M' | 'N';
  return (
    <div className="lot-card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h4>{lot.a ?? 'Unaddressed lot'}</h4>
        <button className="link-btn small" onClick={onClose} aria-label="Close lot details">Close</button>
      </div>
      <p className="small">
        ADU possible today: <b>{STATUS_WORD[lot.s as 'Y' | 'M' | 'N']}</b>
        {mask > 0 && now !== lot.s && <> · with the changes you picked: <b>{STATUS_WORD[now]}</b></>}
      </p>
      <ul className="fam-list">
        {FAMILIES.map((f) => {
          const v = lot.t?.[f];
          const ok = typeof v === 'number';
          return (
            <li key={f} className={ok ? 'ok' : 'blocked'}>
              <b>{FAMILY_LABEL[f]}</b>
              {ok ? (
                <span className="small fam-ok">Allowed{v ? `, up to about ${fmt(Math.round(v / 10) * 10)} sq ft` : ''}</span>
              ) : (
                <ul>
                  {(v as Tag[] | undefined)?.map((t) => <li key={t} className="small">{TAG_LABEL[t]}</li>)}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      <p className="muted small">Today’s rules. Estimates from city data, not a zoning determination.</p>
    </div>
  );
}
