import { Link } from 'react-router-dom';
import { OPTIONS } from '../rules/options';
import { ProcessBand } from '../components/ui';

const QUOTES: Record<string, string> = {
  split: 'My lot is small, there is limited space in my home to add an ADU, and I only need a studio or one-bedroom ADU.',
  attic: 'I have a home with an unfinished attic. I may add an ADU with just one or two bedrooms.',
  floor: 'My lot is small, my home is short, and I want to add an ADU with at least two bedrooms.',
  basement: 'I have an unfinished basement that has room for an ADU with windows on at least one side, and my property is not in a flood-prone area.',
  'rear-small': 'My lot is small, with little to no space on the sides, but has a deep backyard.',
  'rear-medium': 'I have a lot with extra backyard space. I want to add an ADU with at least two to three bedrooms.',
  corner: 'I have a corner lot and would like to have an ADU that is directly accessible from the street.',
  side: 'My lot has enough room on the side for an ADU with at least one or two bedrooms.',
  garage: 'My lot has an existing building on it. I want to convert it into an ADU separate from the main unit.',
  backyard: 'My lot has enough width on the sides or space in the backyard, and I want to build a detached ADU.',
  front: 'My lot is large, with a deep front yard, and I’d like an ADU facing the street.',
};

export default function Landing() {
  return (
    <>
      <section className="hero">
        <div className="inner">
          <div className="stack" style={{ ['--gap' as string]: '18px' }}>
            <div className="eyebrow">Mattapan · Boston</div>
            <h1>One lot. Two homes. Make room for more.</h1>
            <p className="lead">
              A basement apartment, an attic unit, an addition, or a backyard cottage: find out what kind of ADU could fit on your Mattapan lot.
            </p>
            <div className="row">
              <Link className="btn primary" to="/find">
                Find your property →
              </Link>
              <a className="btn" href="#what">
                What is an ADU?
              </a>
            </div>
          </div>
          <div className="panel white stack">
            <h3>Who is this for?</h3>
            <p className="serif">Owners of 1- to 3-family homes in Mattapan who want to know what’s realistic on their lot before hiring an architect or applying for a permit.</p>
            <ul className="serif" style={{ margin: 0, paddingLeft: 18 }}>
              <li>✓ You own and live in a home in Mattapan</li>
              <li>✓ You’re curious what the new ADU rules allow</li>
              <li>✓ You want a starting point for a conversation with a professional</li>
              <li>✕ You need a permit, zoning decision or design approval</li>
            </ul>
          </div>
        </div>
      </section>

      <main className="page stack" style={{ ['--gap' as string]: '48px' }}>
        <section id="what" className="stack">
          <h2>What is an ADU?</h2>
          <p className="body" style={{ maxWidth: 760 }}>
            An Accessory Dwelling Unit (ADU) is a smaller, independent home on the same lot as your house, with its own kitchen, bathroom and entrance. Homeowners build
            ADUs to house family, age in place or earn rental income. Since January 2024, Mattapan’s zoning allows internal, attached and detached ADUs{' '}
            <strong>as-of-right</strong> — without a zoning hearing — when they meet the rules.
          </p>
          <div className="type-tiles">
            {[
              ['Internal ADU', 'Inside your existing home — a basement, attic or part of a floor.'],
              ['Attached ADU', 'An addition to your home, to the back, side or top.'],
              ['Detached ADU', 'A separate small building in your yard, or a converted garage.'],
            ].map(([t, d]) => (
              <div key={t} className="tile">
                <div className="value">{t}</div>
                <p className="serif muted">{d}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="stack">
          <h2>{OPTIONS.length} ADU designs from Boston’s Guidebook</h2>
          <p className="serif muted">See how your property stacks up against designs from the City’s ADU Guidebook.</p>
          <div className="design-list">
            {OPTIONS.map((o) => (
              <div key={o.id} className="d">
                <strong>{o.name}</strong> <span className="small muted">· {o.type}</span>
                <q>{QUOTES[o.id]}</q>
              </div>
            ))}
          </div>
        </section>

        <section className="stack">
          <h2>How it works</h2>
          <ol className="howto" style={{ padding: 0 }}>
            <li>
              <h3>Find your property</h3>
              <p className="serif muted">Enter your address and see your lot and buildings from city records.</p>
            </li>
            <li>
              <h3>Confirm a few details</h3>
              <p className="serif muted">Check the records and answer questions city data can’t capture.</p>
            </li>
            <li>
              <h3>See your ADU options</h3>
              <p className="serif muted">Explore each design, answer a few questions, and get a preliminary result with reasons.</p>
            </li>
          </ol>
          <div>
            <Link className="btn primary" to="/find">
              Ready to see what fits on your lot? →
            </Link>
          </div>
        </section>
      </main>
      <ProcessBand />
    </>
  );
}
