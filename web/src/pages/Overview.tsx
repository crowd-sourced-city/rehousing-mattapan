import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { SitePlan } from '../components/SitePlan';
import { Badge, Banner, ProcessBand, TraceList } from '../components/ui';
import { useSession } from '../data/session';
import { basePlan, bedroomMatch, optionsForLot, type OptionDef } from '../rules/options';
import { LOT_SIZE_LABEL, lotSize, siteCheck, unsupportedReason } from '../rules/site';
import type { Parcel, PlanSpec } from '../rules/types';
import { Crumbs, WithParcel } from './common';

export function cardPlan(o: OptionDef, p: Parcel): PlanSpec {
  const base: PlanSpec = basePlan(p, 'rear');
  const map: Record<string, Partial<PlanSpec>> = {
    split: { kind: 'internal' },
    attic: { kind: 'attic' },
    basement: { kind: 'basement' },
    floor: { kind: 'floor' },
    'rear-small': { kind: 'rear', aduWidth: base.houseWidth * 0.8, aduDepth: Math.min(16, Math.max(6, (p.rearYard ?? 30) - 22)) },
    'rear-medium': { kind: 'rear', aduWidth: base.houseWidth * 0.8, aduDepth: Math.min(20, Math.max(6, (p.rearYard ?? 30) - 22)) },
    side: { kind: 'side', aduSide: (p.sideLeft ?? 0) >= (p.sideRight ?? 0) ? 'left' : 'right', aduWidth: Math.max(4, (p.sideYardMax ?? 10) - 3), aduDepth: base.houseDepth - 5 },
    corner: { kind: 'corner' },
    garage: { kind: 'garage', aduWidth: Math.sqrt(p.garageSqft ?? 400), aduDepth: Math.sqrt(p.garageSqft ?? 400) },
    backyard: { kind: 'detached', aduWidth: 22, aduDepth: 24 },
    front: { kind: 'front' },
  };
  return { ...base, ...map[o.id] };
}

export default function Overview() {
  return <WithParcel>{(p) => <OverviewInner p={p} />}</WithParcel>;
}

function OverviewInner({ p }: { p: Parcel }) {
  const s = useSession();
  const [showUnavail, setShowUnavail] = useState(false);
  if (unsupportedReason(p)) return <Navigate to="/unsupported" replace />;
  const site = siteCheck(p, s.property);
  if (!site.eligible) return <Navigate to="/not-possible" replace />;
  const size = lotSize(p)!;
  // A corner addition only exists as an idea on corner lots, so other lots don't
  // see it at all (not even under "not available here").
  const opts = optionsForLot(size)
    .filter((o) => o.id !== 'corner' || p.corner)
    .map((o) => ({ o, pre: o.preliminary(p, s.property) }));
  const available = opts.filter((x) => x.pre.status !== 'unavailable' && x.pre.status !== 'notsupported');
  const unavailable = opts.filter((x) => x.pre.status === 'unavailable' || x.pre.status === 'notsupported');
  const order = { possible: 0, closer: 1, info: 2, notsupported: 3, unavailable: 4 };
  available.sort((a, b) => bedroomMatch(a.o, s.bedroomsPref) - bedroomMatch(b.o, s.bedroomsPref) || order[a.pre.status] - order[b.pre.status]);
  const groups = size === 'small' ? [{ title: 'Options on smaller lots', sub: 'Use the space you have, or build up or back.', ids: null as null | string[] }] : [
    { title: 'Options on medium lots', sub: 'Add onto your house, or reuse a building you already have.', ids: ['rear-medium', 'corner', 'side', 'garage'] },
    ...(size === 'large' ? [{ title: 'More options on larger lots', sub: 'With more land, a separate building or a front addition may also fit.', ids: ['backyard', 'front'] }] : []),
  ];

  return (
    <>
      <Crumbs back="Property details" backTo="/details" parcel={p} />
      <main className="page stack" style={{ ['--gap' as string]: '28px' }}>
        <div className="stack" style={{ ['--gap' as string]: '10px' }}>
          <div className="eyebrow">{LOT_SIZE_LABEL[size]} · your options</div>
          <h1>What could you build on your property?</h1>
          <p className="lead">Explore {opts.length} ways you might add a separate home to your property.</p>
          <p className="row small" style={{ gap: 14 }}>
            <strong>{p.address}, Mattapan</strong>
            <span className="muted">
              {LOT_SIZE_LABEL[size]} · {Math.round(p.lotWidth ?? 0)} ft wide · {Math.round(p.lotArea ?? 0).toLocaleString()} sq ft · {p.zoning}
            </span>
            <Link to="/find">View property details ›</Link>
          </p>
        </div>
        <Banner tone="info" title="These are early indications based on information about your property — not an assessment of a specific design.">
          You don’t need to know what you want to build yet: explore an option to see what might work.
        </Banner>
        {site.ownerOccupancyIssue && !s.ownerBannerDismissed && (
          <Banner
            tone="warn"
            title="An ADU is only allowed where the owner lives on the property"
            action={
              <div className="row">
                <Link to="/have-a-say">Have a say about this rule</Link>
                <button className="link-btn small" onClick={s.dismissOwnerBanner}>
                  Keep exploring
                </button>
              </div>
            }
          >
            You told us the owner doesn’t live here (or an LLC owns it). You can still explore, but you could only build an ADU if the owner lived on the property.
          </Banner>
        )}
        {site.flags.map((f) => (
          <Banner key={f.key} tone="warn" title={f.label}>
            {f.body} This may add review but doesn’t rule anything out.
          </Banner>
        ))}

        <section className="panel stack" style={{ ['--gap' as string]: '10px' }} aria-labelledby="bed-q">
          <h3 id="bed-q">How many bedrooms would you want in your ADU?</h3>
          <p className="serif small muted">Optional. We’ll put the best matches first. Smaller homes suit conversions; larger ones usually need an addition or a separate building.</p>
          <div className="choices" role="radiogroup" aria-labelledby="bed-q">
            {[
              ['1-2', 'Studio, 1 or 2 bedrooms'],
              ['2-3', '2 or 3 bedrooms'],
              ['', 'I’m not sure'],
            ].map(([v, l]) => (
              <label className="choice" key={l}>
                <input type="radio" name="bedpref" checked={(s.bedroomsPref ?? '') === v} onChange={() => s.setBedroomsPref((v || undefined) as '1-2' | '2-3' | undefined)} />
                <span>{l}</span>
              </label>
            ))}
          </div>
        </section>

        {groups.map((g) => {
          const items = available.filter((x) => (g.ids ? g.ids.includes(x.o.id) : true));
          if (!items.length) return null;
          return (
            <section key={g.title} className="stack" style={{ ['--gap' as string]: '14px' }}>
              <div>
                <h2>{g.title}</h2>
                <p className="serif muted">{g.sub}</p>
              </div>
              <div className="grid-cards">
                {items.map(({ o, pre }) => (
                  <OptionCard key={o.id} o={o} p={p} status={pre.status} text={pre.text} />
                ))}
              </div>
            </section>
          );
        })}
        {!available.length && <p className="serif">None of the options look possible from city data alone. Open the list below to see why.</p>}

        {unavailable.length > 0 && (
          <section className="stack" style={{ ['--gap' as string]: '14px' }}>
            <button className="unavail-toggle" aria-expanded={showUnavail} aria-controls="unavail" onClick={() => setShowUnavail((v) => !v)}>
              {showUnavail ? 'Hide' : 'Show'} {unavailable.length} option{unavailable.length === 1 ? '' : 's'} not available here
              <span className="caret" aria-hidden />
            </button>
            {showUnavail && (
              <div id="unavail" className="grid-cards">
                {unavailable.map(({ o, pre }) => (
                  <OptionCard key={o.id} o={o} p={p} status={pre.status === 'notsupported' ? 'unavailable' : pre.status} text={pre.text} dim />
                ))}
              </div>
            )}
          </section>
        )}

        <details className="exp">
          <summary>How we checked your lot first</summary>
          <div className="exp-body">
            <p>Before showing options, we check the Article 60 rules every lot adding an ADU must meet.</p>
            <TraceList steps={site.trace} />
          </div>
        </details>
      </main>
      <ProcessBand />
    </>
  );
}

function OptionCard({ o, p, status, text, dim }: { o: OptionDef; p: Parcel; status: Parameters<typeof Badge>[0]['status']; text: string; dim?: boolean }) {
  return (
    <article className={`card${dim ? ' dim' : ''}`}>
      <div className="plan-wrap">
        <SitePlan spec={cardPlan(o, p)} compact />
      </div>
      <div className="card-body">
        <div className="eyebrow">{o.type}</div>
        <h3>{o.name}</h3>
        <p className="serif small muted" style={{ fontStyle: 'italic' }}>
          {o.blurb}
        </p>
        <div className="eyebrow" style={{ fontSize: 10.5, marginTop: 4 }}>
          Preliminary check · property data
        </div>
        <div>
          <Badge status={status} />
        </div>
        <p className="small">{text}</p>
        <div className="push">
          <Link className="btn small" to={`/option/${o.id}`}>
            Explore this option
          </Link>
        </div>
      </div>
    </article>
  );
}
