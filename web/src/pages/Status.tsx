import { Link, Navigate } from 'react-router-dom';
import { Banner, ProcessBand, TraceList } from '../components/ui';
import { useSession } from '../data/session';
import { siteCheck, unsupportedReason, type Unsupported } from '../rules/site';
import { Crumbs, WithParcel } from './common';
import type { Parcel } from '../rules/types';

/** Shown when a parcel fails the Article 60 Table 6 site check. */
export function NotPossible() {
  return <WithParcel>{(p) => <NotPossibleInner p={p} />}</WithParcel>;
}

function NotPossibleInner({ p }: { p: Parcel }) {
        const s = useSession();
        if (unsupportedReason(p)) return <Navigate to="/unsupported" replace />;
        const site = siteCheck(p, s.property);
        if (site.eligible) return <Navigate to="/options" replace />;
        return (
          <>
            <Crumbs back="Property details" backTo="/details" parcel={p} />
            <main className="page narrow stack" style={{ ['--gap' as string]: '24px' }}>
              <div className="eyebrow">Your result · whole property</div>
              <h1 className="caps">An as-of-right ADU doesn’t look possible here</h1>
              <span className="badge notsupported large">
                <span className="ico" aria-hidden>
                  ✕
                </span>
                Not possible as-of-right
              </span>
              <p className="body">
                Before looking at specific designs, every Mattapan lot adding an ADU must meet a few rules about the whole property. Based on city data
                {s.property.units != null || s.property.stories != null ? ' and your answers' : ''}, your lot doesn’t meet{' '}
                {site.failures.length === 1 ? 'one of them' : `${site.failures.length} of them`}.
              </p>
              <div className="factor">
                <span className="k">Most important factor</span>
                <span>
                  {site.failures[0].rule}: {site.failures[0].detail}
                </span>
              </div>
              <section className="stack">
                <h2>What this means</h2>
                <p className="serif">
                  “As-of-right” means a project meets the zoning rules, so no hearing is needed. Not meeting them doesn’t always mean no — you could:
                </p>
                <ul className="serif" style={{ paddingLeft: 20, margin: 0 }}>
                  <li>
                    <strong>Check the data.</strong> Our measurements come from maps, not a survey. If something looks wrong, a survey may show your lot does meet the
                    rule. You can <Link to="/details">correct your home’s details</Link>.
                  </li>
                  <li>
                    <strong>Ask about zoning relief.</strong> The Zoning Board of Appeal decides case by case whether to allow a project that doesn’t meet a rule. It
                    isn’t guaranteed and takes time.
                  </li>
                  <li>
                    <strong>Have a say.</strong> Residents can take part in changing the rules for Mattapan. <Link to="/have-a-say">See how</Link>.
                  </li>
                </ul>
              </section>
              <section>
                <h2>Every rule we checked</h2>
                <TraceList steps={site.trace} />
              </section>
              <div className="row">
                <Link className="btn primary" to="/have-a-say">
                  Ways to respond to this rule →
                </Link>
                <Link className="btn" to="/details">
                  Update my answers
                </Link>
              </div>
            </main>
            <ProcessBand />
          </>
        );
}

const UNSUPPORTED_COPY: Record<Unsupported, { title: string; body: string }> = {
  irregular: {
    title: 'Sorry, our tool needs to be updated to work with your lot',
    body: 'Your lot has an irregular shape (for example L-shaped, angled or made of several pieces). Our measurements of front, side and rear yards assume a roughly rectangular lot, so we can’t give you a reliable result yet.',
  },
  nodata: {
    title: 'Sorry, our tool needs to be updated to work with your lot',
    body: 'We couldn’t measure your lot’s yards from city maps — often because the main building couldn’t be matched to the lot or the street frontage is unclear.',
  },
  outside: {
    title: 'This tool covers Mattapan’s R1 and R2 residential areas',
    body: 'Your property is in a different zoning subdistrict, where Mattapan’s as-of-right ADU rules don’t apply. Internal ADUs may still be possible under Boston’s citywide rules.',
  },
  condo: {
    title: 'Condominiums aren’t eligible for ADUs',
    body: 'City records show this property as a condominium. Boston’s ADU program is for owner-occupants of 1-, 2- and 3-family homes.',
  },
  notresidential: {
    title: 'This tool covers 1-, 2- and 3-family homes',
    body: 'City records don’t show this property as a 1-, 2- or 3-family home (for example, it may be vacant land, city-owned or a larger building).',
  },
};

export function Unsupported() {
  return (
    <WithParcel>
      {(p) => {
        const r = unsupportedReason(p);
        if (!r) return <Navigate to="/details" replace />;
        const c = UNSUPPORTED_COPY[r];
        return (
          <>
            <Crumbs back="Change property" backTo="/find" parcel={p} />
            <main className="page narrow stack" style={{ ['--gap' as string]: '22px' }}>
              <h1>{c.title}</h1>
              <p className="body">{c.body}</p>
              <Banner tone="info" title="What you can do">
                Boston’s ADU team can answer questions about your property: email <a href="mailto:ADU@boston.gov">ADU@boston.gov</a>, or join a free monthly ADU
                Design Workshop. A design professional can also look at your lot.
              </Banner>
              <div className="row">
                <Link className="btn primary" to="/find">
                  Try another address
                </Link>
                <a className="btn" href="https://www.boston.gov/departments/housing/accessory-dwelling-units-adus-boston" target="_blank" rel="noreferrer">
                  Boston’s ADU program ↗
                </a>
              </div>
            </main>
          </>
        );
      }}
    </WithParcel>
  );
}
