import { Link } from 'react-router-dom';
import { ProcessBand } from '../components/ui';

export default function HaveASay() {
  return (
    <>
      <main className="page narrow stack" style={{ ['--gap' as string]: '28px' }}>
        <div className="stack" style={{ ['--gap' as string]: '8px' }}>
          <div className="eyebrow">Optional · What you can do</div>
          <h1>Have a say in how housing rules change</h1>
          <p className="lead">Hit a rule that limits your plans? There are three different ways to respond.</p>
        </div>
        {[
          [
            'A',
            'Want to change your proposed design?',
            'Often the quickest route: adjust the size or layout so it meets current rules — for example, a shorter rear extension, or an ADU placed closer to the street to avoid sprinklers.',
            <Link to="/options">Compare your options</Link>,
          ],
          [
            'B',
            'Want to ask about approval for your property?',
            'If your design doesn’t meet a zoning rule, you can ask the Zoning Board of Appeal whether zoning relief is available for your specific property. It’s decided case by case, isn’t guaranteed, and takes time. For fire-code issues, an appeal can go to the Massachusetts Fire Prevention Appeals Board.',
            <span>Contact: the Planning Department (bostonplans.org) · Zoning Board of Appeal (boston.gov)</span>,
          ],
          [
            'C',
            'Want to change the rules for Mattapan?',
            'Residents, community groups and policymakers can consider changes to zoning rules that apply to many properties — for example, the owner-occupancy requirement for ADUs, or the minimum yards. Changes go through a public planning process.',
            <span>Current opportunities are listed at bostonplans.org</span>,
          ],
        ].map(([k, t, d, a]) => (
          <section key={k as string} className="panel stack" style={{ ['--gap' as string]: '8px' }}>
            <div className="row" style={{ gap: 12 }}>
              <span className="badge info" style={{ paddingRight: 6 }}>
                <span className="ico">{k}</span>
              </span>
              <h2 style={{ fontSize: 20 }}>{t}</h2>
            </div>
            <p className="serif">{d}</p>
            <div className="small">{a}</div>
          </section>
        ))}
        <section className="stack">
          <h2>Who decides what</h2>
          <div className="grid-tiles">
            <div className="tile">
              <div className="value">Planning Department</div>
              <div className="note">Studies neighborhoods and drafts zoning changes, with public meetings.</div>
            </div>
            <div className="tile">
              <div className="value">Zoning Commission</div>
              <div className="note">Votes to adopt changes to the Boston Zoning Code.</div>
            </div>
            <div className="tile">
              <div className="value">Zoning Board of Appeal</div>
              <div className="note">Decides requests for zoning relief on individual properties.</div>
            </div>
          </div>
          <p className="small muted">We don’t list specific consultations here. Questions about ADUs: ADU@boston.gov.</p>
        </section>
      </main>
      <ProcessBand />
    </>
  );
}
