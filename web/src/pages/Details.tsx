import { useNavigate } from 'react-router-dom';
import { Banner, QuestionField } from '../components/ui';
import { useSession } from '../data/session';
import type { Question } from '../rules/options';
import type { Parcel, PropertyAnswers } from '../rules/types';
import { Crumbs, WithParcel } from './common';
import { PRIVATE, track } from '../telemetry';

const YN = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'unsure', label: 'I’m not sure' },
];

function questions(p: Parcel): { section: string; why: string; qs: (Question & { key: keyof PropertyAnswers; numeric?: boolean })[] }[] {
  const storiesDefault = p.stories ? String(p.stories) : undefined;
  return [
    {
      section: 'Ownership',
      why: 'Boston’s ADU rules depend on who owns and lives in the home.',
      qs: [
        { id: 'ownerOccupies', key: 'ownerOccupies', group: 'Ownership', text: 'Do you own this home and live in it as your main residence?', choices: YN.slice(0, 2), why: 'In Mattapan, an ADU is allowed only where the owner lives on the property.' },
        { id: 'ownedByLlc', key: 'ownedByLlc', group: 'Ownership', text: 'Is the property owned by an LLC or company?', choices: YN, why: 'Properties owned by LLCs, and condominiums, aren’t eligible for ADUs.' },
      ],
    },
    {
      section: 'Your home today',
      why: 'These set how many homes your lot can have and which building code applies.',
      qs: [
        {
          id: 'units',
          key: 'units',
          numeric: true,
          group: p.units ? `From city records: ${p.units} · please confirm` : 'Your home today',
          text: 'How many homes (units) are on the property now?',
          help: 'Not counting any ADU you’re planning.',
          choices: [
            { value: '1', label: '1 (single-family)' },
            { value: '2', label: '2 (two-family)' },
            { value: '3', label: '3 (triple-decker)' },
          ],
          why: `Your zoning (${p.zoning}) allows up to ${p.zoning === 'R2' ? 4 : 3} homes on a lot including ADUs.`,
        },
        {
          id: 'stories',
          key: 'stories',
          numeric: true,
          group: storiesDefault ? `From city records: ${storiesDefault.replace('.5', '½').replace('.0', '')} · please confirm` : 'Your home today',
          text: 'How many floors does your house have?',
          help: 'A half story is usually an attic level under a sloped roof.',
          choices: ['1', '1.5', '2', '2.5', '3', '3.5'].map((v) => ({ value: v, label: v.replace('.5', '½') })),
        },
        {
          id: 'existingAdu',
          key: 'existingAdu',
          group: 'Your home today',
          text: 'Is there already an ADU on your property?',
          choices: [
            { value: 'none', label: 'No' },
            { value: 'internal', label: 'Yes, inside or attached' },
            { value: 'detached', label: 'Yes, a detached one' },
          ],
          why: 'A lot can have at most one non-detached and one detached ADU.',
        },
        { id: 'sprinklered', key: 'sprinklered', group: 'Your home today', text: 'Does your house have a sprinkler system?', choices: YN, why: 'Sprinklers change how far an ADU door can be from the street.' },
      ],
    },
    {
      section: 'Additional spaces',
      why: 'These decide which options apply to your home.',
      qs: [
        { id: 'hasBasement', key: 'hasBasement', group: 'Additional spaces', text: 'Do you have a basement?', choices: YN },
        { id: 'hasAttic', key: 'hasAttic', group: 'Additional spaces', text: 'Do you have an attic?', choices: YN },
        {
          id: 'hasGarage',
          key: 'hasGarage',
          group: p.garageSqft ? `City records show a garage of about ${Math.round(p.garageSqft)} sq ft` : 'Additional spaces',
          text: 'Do you have a garage or other outbuilding (carriage house, large shed)?',
          choices: YN,
        },
      ],
    },
  ];
}

export default function Details() {
  return <WithParcel>{(p) => <DetailsInner p={p} />}</WithParcel>;
}

function DetailsInner({ p }: { p: Parcel }) {
  const s = useSession();
  const nav = useNavigate();
  const sections = questions(p);
  const all = sections.flatMap((x) => x.qs);
  const answered = all.filter((q) => s.property[q.key] != null).length;
  const value = (q: (typeof all)[number]) => {
    const v = s.property[q.key];
    return v != null ? String(v) : undefined;
  };
  const ownerNo = s.property.ownerOccupies === 'no' || s.property.ownedByLlc === 'yes';

  return (
    <>
      <Crumbs back="Change property" backTo="/find" parcel={p} />
      <main className="page narrow stack" style={{ ['--gap' as string]: '24px' }}>
        <div className="steps">
          <span className="done">1 Your property</span>
          <span className="on">2 Details</span>
          <span>3 ADU options</span>
        </div>
        <div className="stack" style={{ ['--gap' as string]: '8px' }}>
          <h1>
            Tell us about <span className={PRIVATE}>{p.address}</span>
          </h1>
          <p className="lead">Help us understand what’s possible on your lot. Rough answers are fine — “I’m not sure” is always OK.</p>
          <p className="small muted" aria-live="polite">
            {answered} of {all.length} answered · you can skip anything and come back later
          </p>
        </div>
        {sections.map((sec) => (
          <section key={sec.section} className="stack" style={{ ['--gap' as string]: '0px' }}>
            <h2 style={{ marginBottom: 4 }}>{sec.section}</h2>
            <p className="serif muted" style={{ marginBottom: 8 }}>
              {sec.why}
            </p>
            {sec.qs.map((q) => (
              <div className="q-card" key={q.id}>
                <QuestionField
                  q={q}
                  name={`d-${q.id}`}
                  value={value(q)}
                  onChange={(v) => s.setProperty({ [q.key]: q.numeric ? Number(v) : v } as Partial<PropertyAnswers>)}
                />
                {q.key === 'ownerOccupies' && ownerNo && (
                  <div style={{ marginTop: 14 }}>
                    <Banner tone="warn" title="ADUs in Mattapan require the owner to live on the property">
                      You can keep exploring, but you could only add an ADU if the owner lived there. If you think this rule should change,{' '}
                      <a href="#/have-a-say">see how to have a say</a>.
                    </Banner>
                  </div>
                )}
              </div>
            ))}
          </section>
        ))}
        <div className="row">
          <button
            className="btn primary"
            onClick={() => {
              track('details_completed', { answered, questions: all.length });
              nav('/options');
            }}
          >
            See your ADU options →
          </button>
          <span className="small muted">You can change your answers at any time.</span>
        </div>
      </main>
    </>
  );
}
