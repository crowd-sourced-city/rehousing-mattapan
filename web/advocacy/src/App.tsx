import { useEffect, useMemo, useState } from 'react';
import { FAMILY_LABEL, REFORMS, REFORM_LABEL } from '../scripts/analysis';
import {
  CLEARANCE_FT,
  FIRE_PATH_FT,
  MIN_ADDITION_DEPTH_FT,
  MIN_ADDITION_WIDTH_FT,
  MIN_ADU_SQFT,
  MIN_HOUSE_PER_UNIT_TO_SPLIT,
} from '../scripts/analysis';
import { Funnel, ReformChart, TypeBreakdown } from './charts';
import { loadAll, type Loaded, type Lot } from './data';
import { ExploreMap } from './ExploreMap';
import { FACTOR_LAYER, POSSIBLE, SIZE, TYPES, type LayerDef } from './layers';
import { createSync, LotMap } from './LotMap';

const fmt = (n: number) => n.toLocaleString('en-US');

/** Lots per legend entry, so every small map's legend carries its own counts. */
function countFor(layer: LayerDef, lots: Lot[], label: string): number {
  const inScope = lots.filter((l) => l.s !== 'O' && l.s !== 'A');
  const item = layer.legend.find((x) => x.label === label)!;
  if (item.key === 'A') return lots.filter((l) => l.s === 'A').length;
  if (item.key === 'O') return lots.filter((l) => l.s === 'O').length;
  switch (layer.id) {
    case 'possible':
      return inScope.filter((l) => l.s === item.key).length;
    case 'types':
      return inScope.filter((l) => String(l.n) === item.key).length;
    case 'factor':
      return inScope.filter((l) => (item.key === 'other' ? l.f === 'coverage' || l.f === 'units' || l.f === 'fire' : l.f === item.key)).length;
    case 'size': {
      const m = (l: Lot) => l.m ?? 0;
      const ranges: Record<number, (l: Lot) => boolean> = {
        0: (l) => m(l) >= 1250,
        1: (l) => m(l) >= 1000 && m(l) < 1250,
        2: (l) => m(l) >= 750 && m(l) < 1000,
        3: (l) => m(l) > 0 && m(l) < 750,
        4: (l) => m(l) <= 0,
      };
      return inScope.filter(ranges[layer.legend.indexOf(item)]).length;
    }
  }
  return 0;
}

function SmallMap({ layer, data, sync }: { layer: LayerDef; data: Loaded; sync: ReturnType<typeof createSync> }) {
  const lots = useMemo(() => Object.values(data.lots), [data]);
  return (
    <figure className="small-map">
      <figcaption>
        <h3>{layer.title}</h3>
        <p className="muted small">{layer.question}</p>
      </figcaption>
      <LotMap shapes={data.shapes} streets={data.streets} fill={layer.fill} sync={sync} height={340} label={`Map: ${layer.title}`} />
      <ul className="legend-list compact">
        {layer.legend.map((i) => (
          <li key={i.label}>
            <span className="sw" style={{ background: i.color }} />
            <span>{i.label}</span>
            <span className="num muted">{fmt(countFor(layer, lots, i.label))}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

export default function App() {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sync = useMemo(() => createSync(), []);
  useEffect(() => {
    loadAll().then(setData).catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <main className="page"><p>Couldn’t load the data: {error}</p></main>;
  if (!data) return <main className="page"><p className="muted">Loading Mattapan’s lots…</p></main>;

  const s = data.summary;
  const f = s.funnel;
  const grand = s.reformImpact.find((r) => r.reform === 'grandfather')!;
  const all = (1 << REFORMS.length) - 1;
  const cottagesToday = s.familyScenario[0].detached;
  const cottagesAll = s.familyScenario[all].detached;
  const tags = s.familyTags;
  const sp = s.sprinklers;

  return (
    <>
      <header className="adv-header">
        <div className="inner">
          <span className="brand">Room to Grow</span>
          <span className="proto-tag">MIT student analysis · not an official City of Boston publication</span>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="page stack" style={{ ['--gap' as string]: '20px' }}>
            <div className="eyebrow">Accessory dwelling units in Mattapan</div>
            <h1>Mattapan has room for more homes. Old rules are in the way.</h1>
            <p className="lead">
              An accessory dwelling unit (ADU) is a small second home on a lot: a converted basement, a rear addition, a
              backyard cottage. We checked every 1–3 family lot in Mattapan against Boston’s ADU rules to see where one
              fits, and what stops it where it doesn’t.
            </p>
            <div className="hero-stats">
              <div className="stat">
                <div className="big">{fmt(f.yes)}</div>
                <p>lots, {Math.round((100 * f.yes) / f.assessable)}% of those we could measure, could add an addition or backyard cottage today.</p>
              </div>
              <div className="stat">
                <div className="big">{fmt(grand.anyAdu)} of {fmt(f.no)}</div>
                <p>lots where no ADU is allowed are blocked mainly because the <b>existing house</b> doesn’t meet today’s yard and coverage rules, not by a lack of space.</p>
              </div>
              <div className="stat">
                <div className="big">{fmt(cottagesToday)} → {fmt(cottagesAll)}</div>
                <p>lots where a backyard cottage would be allowed, with five targeted rule changes.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="page stack" style={{ ['--gap' as string]: '20px' }}>
          <div className="eyebrow">1 · Four maps</div>
          <h2>Where ADUs could go, lot by lot</h2>
          <p className="body">
            Each map shows the same {fmt(f.inR1R2Homes)} homes in Mattapan’s R1 and R2 zoning, measured from City parcel and
            building data. The maps move together: zoom into one to compare a block across all four.
          </p>
          <div className="small-maps">
            {[POSSIBLE, TYPES, SIZE, FACTOR_LAYER].map((l) => (
              <SmallMap key={l.id} layer={l} data={data} sync={sync} />
            ))}
          </div>
        </section>

        <section className="page stack" style={{ ['--gap' as string]: '16px' }}>
          <div className="eyebrow">2 · Explore</div>
          <h2>What if the rules changed?</h2>
          <ExploreMap data={data} />
        </section>

        <section className="page stack" style={{ ['--gap' as string]: '24px' }}>
          <div className="eyebrow">3 · What’s really in the way</div>
          <h2>Limiting factors: rules, or the lot itself?</h2>
          <p className="body">
            A rule can technically “fail” on a lot where the real problem is space. With a 5 ft side yard, a side addition
            breaks the 3 ft setback, but no rule change would make room for one. So for every lot and every kind of ADU,
            we first ask whether it would <b>physically</b> fit with no setbacks at all, keeping only a {CLEARANCE_FT} ft
            walkway. Only where it would do we blame the rules.
          </p>

          <Funnel s={s} />
          <TypeBreakdown s={s} />

          <div className="findings">
            <article>
              <h3>1. Old houses are judged by new setbacks</h3>
              <p>
                Article 60 checks the <i>existing</i> house against today’s yard rules before allowing any ADU, even one
                built entirely inside it. {fmt(tags.internal['existing-side'] ?? 0)} houses sit closer than 3 ft to a side
                lot line, and {fmt(tags.internal['existing-rear'] ?? 0)} leave less than 20 ft of rear yard. Most were built
                long before these rules. Letting existing homes keep their setbacks (as Sec. 60-34 already does for changes
                that don’t worsen a nonconformity) would open an ADU option on <b>{fmt(grand.anyAdu)}</b> of the{' '}
                {fmt(f.no)} lots where none is allowed today.
              </p>
            </article>
            <article>
              <h3>2. Space really is the limit for most side additions</h3>
              <p>
                Side yards in Mattapan are narrow: {fmt(s.familyGroups.side.space ?? 0)} lots don’t have the{' '}
                {MIN_ADDITION_WIDTH_FT} ft needed for even a narrow side addition. No rule change fixes that. Rear additions
                are the opposite: only {fmt(s.familyGroups.rear.space ?? 0)} lots lack the depth, while the 20 ft rear-yard
                rule blocks {fmt(tags.rear['rear-setback'] ?? 0)}.
              </p>
            </article>
            <article>
              <h3>3. Fire code and setbacks stack up against backyard cottages</h3>
              <p>
                A cottage behind a house needs a {FIRE_PATH_FT} ft firefighter path beside the house when there isn’t 20 ft of
                frontage, and most side yards are narrower. That blocks {fmt(tags.detached['fire-path'] ?? 0)} cottages, usually
                together with the 10 ft rear and 5–8 ft separation setbacks. Fixing one alone barely moves the numbers; fixing
                both opens hundreds of lots.
              </p>
            </article>
            <article>
              <h3>4. Building code: allowed, but expensive</h3>
              <p>
                Some ADUs are allowed but trigger costly requirements. On {fmt(sp.internalNeedsSprinklers)} of the{' '}
                {fmt(sp.internalAllowed)} lots where an ADU inside the house is allowed, the house already has two homes, and a
                third unit in one building requires sprinklers throughout. {fmt(sp.cottageNeedsSprinklers)} of{' '}
                {fmt(sp.cottageAllowed)} allowed cottages would need sprinklers too.
              </p>
            </article>
          </div>

          <ReformChart s={s} />
        </section>

        <section className="page narrow stack" style={{ ['--gap' as string]: '12px' }}>
          <div className="eyebrow">How we did this</div>
          <h2>Method and caveats</h2>
          <details className="exp">
            <summary>The four kinds of ADU and what we check</summary>
            <div className="exp-body">
              <ul>
                <li><b>{FAMILY_LABEL.internal}:</b> Article 60’s site check; physically, at least {fmt(MIN_HOUSE_PER_UNIT_TO_SPLIT)} sq ft of living space per home today, so a {MIN_ADU_SQFT} sq ft unit leaves a livable main home.</li>
                <li><b>{FAMILY_LABEL.rear}:</b> a {MIN_ADDITION_DEPTH_FT} ft deep addition across the back of the house must leave 20 ft of rear yard; physically, {MIN_ADDITION_DEPTH_FT + CLEARANCE_FT} ft of yard.</li>
                <li><b>{FAMILY_LABEL.side}:</b> at least {MIN_ADDITION_WIDTH_FT} ft wide after the 3 ft side setback; physically, a {MIN_ADDITION_WIDTH_FT} ft side yard.</li>
                <li><b>{FAMILY_LABEL.detached}:</b> a {MIN_ADU_SQFT} sq ft studio must fit after the cottage setbacks (10 ft rear, 3 ft sides, 5 ft from the house, 8 ft from garages); physically, with {CLEARANCE_FT} ft all round. Behind the house it needs a {FIRE_PATH_FT} ft firefighter path unless there’s 20 ft of frontage.</li>
                <li>Every lot is also checked against lot coverage after adding the ADU, and Article 60’s site check (yards, coverage, height, unit count) on the existing house.</li>
              </ul>
            </div>
          </details>
          <details className="exp">
            <summary>“Yes / Maybe / No” and the rule changes</summary>
            <div className="exp-body">
              <p><b>Yes:</b> an addition or backyard cottage passes every rule. <b>Maybe:</b> only a conversion inside the house passes, which depends on the attic, basement or layout, and city data can’t see those. <b>No:</b> nothing passes.</p>
              <ul>
                {REFORMS.map((r) => (
                  <li key={r}><b>{REFORM_LABEL[r].title}.</b> {REFORM_LABEL[r].body}</li>
                ))}
              </ul>
            </div>
          </details>
          <details className="exp">
            <summary>Caveats</summary>
            <div className="exp-body">
              <ul>
                <li>Measurements come from City parcel and building maps, not surveys. Yards are measured to each lot’s bounding rectangle.</li>
                <li>{fmt(f.inR1R2Homes - f.assessable)} homes on irregular lots or in condos aren’t analysed yet.</li>
                <li>This analysis looks at every kind of ADU on every lot. The Boston ADU Guidebook suggests designs by lot width, so the homeowner tool shows fewer options on some lots.</li>
                <li>Unpaved-area (15%), driveway and the 3 ft exit-path rules aren’t in city data and aren’t checked.</li>
                <li>Sizes are rough upper limits for comparison, not designs.</li>
              </ul>
              <p className="small muted">Data: City of Boston parcels, buildings and assessing records; Article 60 fact sheet (BPDA, 2024); City of Boston Guidance on ADUs and Fire Safety (2023); Boston ADU Guidebook. Analysis generated {s.generated}.</p>
            </div>
          </details>
        </section>
      </main>
      <footer className="site-footer">
        <div className="inner">
          <p>An MIT student analysis for the Rehousing Mattapan project. Estimates from public data; not a zoning determination or legal advice.</p>
        </div>
      </footer>
    </>
  );
}
