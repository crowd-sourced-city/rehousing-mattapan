import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { RULE_TOPICS, topicsFor } from '../content/rules';
import { SitePlan } from '../components/SitePlan';
import { Badge, Banner, Expandable, Overlay, Preliminary, ProcessBand, QuestionField, Reasons, Steps, Tiles, TraceList } from '../components/ui';
import { useSession } from '../data/session';
import { OPTION_BY_ID, type OptionDef, type OptionId } from '../rules/options';
import { siteCheck, unsupportedReason } from '../rules/site';
import type { OptionAnswers, Parcel, PropertyAnswers } from '../rules/types';
import { Crumbs, WithParcel } from './common';
import { cardPlan } from './Overview';

export default function OptionLane() {
  return <WithParcel>{(p) => <Lane p={p} />}</WithParcel>;
}

function useOption() {
  const { id, step } = useParams<{ id: OptionId; step?: string }>();
  const s = useSession();
  const o = id ? OPTION_BY_ID[id] : undefined;
  const answers: OptionAnswers = (id && s.options[id]) || {};
  // Shared questions read from the property answers.
  const merged: OptionAnswers = { ...answers };
  o?.questions.forEach((q) => {
    if (q.shared) merged[q.id] = s.property[q.shared] as string | undefined;
  });
  return { o, step, s, answers: merged };
}

function Lane({ p }: { p: Parcel }) {
  const { o, step, s, answers } = useOption();
  if (!o) return <Navigate to="/options" replace />;
  if (unsupportedReason(p)) return <Navigate to="/unsupported" replace />;
  if (!siteCheck(p, s.property).eligible) return <Navigate to="/not-possible" replace />;
  if (step === 'questions') return <Questions o={o} p={p} answers={answers} />;
  if (step === 'result') return <Result o={o} p={p} answers={answers} property={s.property} />;
  if (step === 'summary') return <Summary o={o} p={p} answers={answers} property={s.property} />;
  return <Explore o={o} p={p} property={s.property} />;
}

function Explore({ o, p, property }: { o: OptionDef; p: Parcel; property: PropertyAnswers }) {
  const pre = o.preliminary(p, property);
  return (
    <>
      <Crumbs back="All options" backTo="/options" title={o.name} parcel={p} />
      <main className="page stack" style={{ ['--gap' as string]: '36px' }}>
        <div className="grid-2">
          <div className="stack" style={{ ['--gap' as string]: '16px' }}>
            <Steps current={1} />
            <div className="eyebrow">{o.type}</div>
            <h1 className="caps">{o.name}</h1>
            <p className="lead">{o.lead}</p>
            <h3 style={{ marginTop: 20 }}>Could it be worth exploring here?</h3>
            <div>
              <Badge status={pre.status} large />
            </div>
            <p className="body">{pre.text}</p>
            <div className="row">
              <Link className="btn primary" to={`/option/${o.id}/questions`}>
                Answer {o.questions.length} quick questions →
              </Link>
              <Link className="btn" to="/options">
                Compare other options
              </Link>
            </div>
            <Expandable title="What is this option?">
              <p>{o.lead}</p>
              <p>
                It’s based on the “{o.name}” design in Boston’s ADU Guidebook (p. {o.guidebookPage}), usually suited to {o.bedrooms === '0-1' ? 'a studio or one bedroom' : o.bedrooms === '1-2' ? 'one or two bedrooms' : 'two or three bedrooms'}.
              </p>
            </Expandable>
          </div>
          <figure className="panel" style={{ margin: 0 }}>
            <SitePlan spec={cardPlan(o, p)} />
            <figcaption className="plan-caption">Sketch drawn from your lot’s measured size. The new home is shown in pink.</figcaption>
          </figure>
        </div>
        <section className="stack" style={{ ['--gap' as string]: '12px' }}>
          <h2>What we already know about your property</h2>
          <p className="serif muted">Filled in automatically from city data. You can correct anything that looks wrong on the <Link to="/details">property details</Link> page.</p>
          <Tiles items={o.known(p, property)} />
        </section>
      </main>
      <ProcessBand />
    </>
  );
}

function Questions({ o, p, answers }: { o: OptionDef; p: Parcel; answers: OptionAnswers }) {
  const s = useSession();
  const nav = useNavigate();
  const set = (qid: string, v: string) => {
    const q = o.questions.find((x) => x.id === qid)!;
    if (q.shared) s.setProperty({ [q.shared]: v } as Partial<PropertyAnswers>);
    else s.setOption(o.id, { [qid]: v });
  };
  return (
    <>
      <Crumbs back="Back" backTo={`/option/${o.id}`} title={o.name} parcel={p} />
      <main className="page narrow stack" style={{ ['--gap' as string]: '20px' }}>
        <Steps current={2} />
        <div className="eyebrow">
          {o.name} · {o.questions.length} quick questions
        </div>
        <h1>
          {o.questions.length === 2 ? 'Two' : o.questions.length === 3 ? 'Three' : o.questions.length === 4 ? 'Four' : o.questions.length} quick questions about your plans
        </h1>
        <p className="lead">Rough answers are fine. “I’m not sure” is always OK — we’ll tell you how to find out.</p>
        <div>
          {o.questions.map((q) => (
            <div className="q-card" key={q.id}>
              <QuestionField
                q={q.id === 'confirmStories' && p.stories ? { ...q, text: `City records say your home has ${String(p.stories).replace('.5', '½').replace('.0', '')} stories. Is that right?` } : q}
                name={`${o.id}-${q.id}`}
                value={answers[q.id] as string | undefined}
                onChange={(v) => set(q.id, v)}
              />
              {o.id.startsWith('rear') && q.id === 'depth' && (
                <div style={{ marginTop: 16, maxWidth: 360 }}>
                  <SitePlan
                    spec={{
                      ...cardPlan(o, p),
                      kind: 'rear',
                      aduDepth: answers.depth && answers.depth !== 'unsure' ? Number(answers.depth) : 0,
                      requiredRear: 20,
                      conflict: answers.depth != null && answers.depth !== 'unsure' && (p.rearYard ?? 0) - Number(answers.depth) < 20,
                    }}
                  />
                  <p className="plan-caption">
                    {answers.depth && answers.depth !== 'unsure'
                      ? `Leaves about ${Math.round((p.rearYard ?? 0) - Number(answers.depth))} ft of backyard (20 ft must stay open).`
                      : 'Choose a depth to see how much backyard would be left.'}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="panel">
          <p className="small" style={{ fontWeight: 600 }}>
            We won’t ask you to judge these — a professional will check them:
          </p>
          <ul className="checklist" style={{ margin: '6px 0 0' }}>
            {o.professionalChecks.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
        <div className="row">
          <button className="btn primary" onClick={() => nav(`/option/${o.id}/result`)}>
            See my result →
          </button>
          <span className="small muted">You can change your answers at any time.</span>
        </div>
      </main>
    </>
  );
}

function Result({ o, p, answers, property }: { o: OptionDef; p: Parcel; answers: OptionAnswers; property: PropertyAnswers }) {
  const [trace, setTrace] = useState(false);
  const r = o.evaluate(p, property, answers);
  const site = siteCheck(p, property);
  const topics = topicsFor(o.id);
  return (
    <>
      <Crumbs back="Back to this option" backTo={`/option/${o.id}`} title={o.name} parcel={p} />
      <main className="page stack" style={{ ['--gap' as string]: '40px' }}>
        {site.ownerOccupancyIssue && (
          <Banner tone="warn" title="Reminder: an ADU requires the owner to live on the property" action={<Link to="/have-a-say">Have a say about this rule</Link>}>
            This result assumes the owner would live here.
          </Banner>
        )}
        <div className="grid-2">
          <div className="stack" style={{ ['--gap' as string]: '16px' }}>
            <Steps current={3} />
            <div className="eyebrow">Your result · {o.type}</div>
            <h1 className="caps">{o.name}</h1>
            <div>
              <Badge status={r.status} large />
            </div>
            <p className="body" style={{ fontSize: 19 }}>
              {r.summary}
            </p>
            <div className="factor">
              <span className="k">Most important factor</span>
              <span>{r.factor}</span>
            </div>
            <Tiles items={r.metrics} />
            <div className="row">
              <Link className="btn primary" to="/paying">
                See help paying for it ›
              </Link>
              <Link className="btn" to={`/option/${o.id}/summary`}>
                Prepare for a professional
              </Link>
            </div>
            <div className="row">
              <Link to="/options" style={{ fontWeight: 600 }}>
                Compare other options ›
              </Link>
              <Link to={`/option/${o.id}/questions`} style={{ fontWeight: 600 }}>
                Update my answers
              </Link>
            </div>
            <Preliminary />
          </div>
          {r.plan && (
            <figure className="panel" style={{ margin: 0 }}>
              <SitePlan spec={r.plan} />
              <figcaption className="plan-caption">{r.plan.caption}</figcaption>
            </figure>
          )}
        </div>

        <div className="grid-2">
          <section className="stack" style={{ ['--gap' as string]: '6px' }}>
            <h2>Why did I get this result?</h2>
            <Reasons items={r.reasons} />
            <button className="btn small" onClick={() => setTrace(true)}>
              How we reached this result
            </button>
          </section>
          <section className="panel next stack" style={{ ['--gap' as string]: '10px' }}>
            <h2>What happens next?</h2>
            <ol>
              {r.nextSteps.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ol>
            {(r.status === 'notsupported' || r.status === 'unavailable') && (
              <p className="small">
                Hit a rule that limits your plans? <Link to="/have-a-say">Ways to respond to this rule</Link>.
              </p>
            )}
          </section>
        </div>

        <AlsoWorthKnowing p={p} property={property} />

        <section className="stack" style={{ ['--gap' as string]: '6px' }}>
          <h2>Understand the rules</h2>
          <p className="serif muted">Optional — open anything you’re curious about.</p>
          <div className="grid-2" style={{ gap: '0 40px' }}>
            {topics.map((t) => (
              <Expandable key={t} title={RULE_TOPICS[t].title}>
                {RULE_TOPICS[t].body}
              </Expandable>
            ))}
          </div>
        </section>
      </main>
      <ProcessBand />
      {trace && (
        <Overlay title="How we reached this result" onClose={() => setTrace(false)}>
          <p className="serif muted" style={{ marginBottom: 12 }}>
            {o.name} — every rule we check, in order, and where each fact comes from. Rules about the whole lot come first.
          </p>
          <h3 style={{ margin: '12px 0 4px' }}>Your lot (Article 60)</h3>
          <TraceList steps={site.trace} />
          <h3 style={{ margin: '20px 0 4px' }}>{o.name}</h3>
          <TraceList steps={r.trace} />
          <p className="small muted" style={{ marginTop: 16 }}>
            Thresholds are listed with their sources on the <Link to="/rules" onClick={() => setTrace(false)}>Rules and sources</Link> page.
          </p>
        </Overlay>
      )}
    </>
  );
}

function AlsoWorthKnowing({ p, property }: { p: Parcel; property: PropertyAnswers }) {
  const units = property.units ?? p.units ?? 1;
  return (
    <section className="stack" style={{ ['--gap' as string]: '10px' }}>
      <h2>Also worth knowing</h2>
      <p className="serif muted">Other rules that apply to this property. None of them change the result above.</p>
      <Tiles
        items={[
          {
            label: 'Accessibility',
            value: units >= 2 ? 'May be required' : 'Suggested, not required',
            note: `${units} home${units === 1 ? '' : 's'} on the property today (521 CMR)`,
          },
          { label: 'Flood risk', value: p.floodZone ? 'In a mapped flood area' : 'Outside mapped flood areas', note: 'FEMA floodplain · coastal flood overlay' },
          { label: 'Historic or neighborhood rules', value: p.ndod ? 'Design overlay' : 'None found', note: 'Mattapan has no historic districts' },
          { label: 'Parks review', value: p.nearPark ? 'Within 100 ft of a park' : 'Not near a park', note: p.nearPark ? 'Parks Commission approval before a permit' : 'City Ordinance 7-4.11' },
          { label: 'Energy code', value: 'Applies at design stage', note: 'Your designer will cover this' },
        ]}
      />
    </section>
  );
}

function Summary({ o, p, answers, property }: { o: OptionDef; p: Parcel; answers: OptionAnswers; property: PropertyAnswers }) {
  const r = o.evaluate(p, property, answers);
  const answered = o.questions
    .map((q) => {
      const v = answers[q.id];
      const c = q.choices.find((x) => x.value === v);
      return c ? `${q.text} — ${c.label}` : null;
    })
    .filter(Boolean) as string[];
  return (
    <>
      <Crumbs back="Back to my result" backTo={`/option/${o.id}/result`} title={o.name} parcel={p} />
      <main className="page narrow stack" style={{ ['--gap' as string]: '22px' }}>
        <div className="eyebrow">Your summary · bridge from Learn to Plan</div>
        <h1>Prepare for a professional consultation</h1>
        <p className="lead">Bring this to a first conversation with an architect, designer or the City. It records what you explored — it is not an application.</p>
        <div className="row no-print">
          <button className="btn primary" onClick={() => window.print()}>
            Print or save as PDF
          </button>
        </div>
        <section className="panel white stack" style={{ ['--gap' as string]: '16px' }}>
          <div>
            <div className="eyebrow">Property</div>
            <p>
              <strong>{p.address}, Mattapan {p.zip}</strong> · Parcel {p.id}
            </p>
            <p className="serif small">{p.zoningDesc}</p>
          </div>
          <div>
            <div className="eyebrow">ADU option</div>
            <p>
              <strong>{o.name}</strong> ({o.type})
            </p>
          </div>
          <div>
            <div className="eyebrow">Preliminary result</div>
            <Badge status={r.status} />
            <p className="serif" style={{ marginTop: 6 }}>
              {r.summary}
            </p>
          </div>
          <div>
            <div className="eyebrow">What you told us</div>
            <ul className="serif">{answered.length ? answered.map((a) => <li key={a}>{a}</li>) : <li>No answers yet.</li>}</ul>
          </div>
          <div>
            <div className="eyebrow">Property information and estimates</div>
            <ul className="serif">
              <li>
                Lot about {Math.round(p.lotArea ?? 0).toLocaleString()} sq ft, {Math.round(p.lotWidth ?? 0)} × {Math.round(p.lotDepth ?? 0)} ft; buildings cover about{' '}
                {Math.round(p.coveragePct ?? 0)}%.
              </li>
              <li>
                House footprint about {Math.round(p.houseFootprint ?? 0).toLocaleString()} sq ft; about {Math.round(p.houseHeight ?? 0)} ft tall; {p.stories ?? '?'} stories.
              </li>
              <li>
                Yards (estimated from maps): front {Math.round(p.frontYard ?? 0)} ft, rear {Math.round(p.rearYard ?? 0)} ft, sides {Math.round(p.sideYardMin ?? 0)} and{' '}
                {Math.round(p.sideYardMax ?? 0)} ft.
              </li>
              {r.metrics.map((m) => (
                <li key={m.label}>
                  {m.label}: {m.value} ({m.note})
                </li>
              ))}
              {p.floodZone && <li>Mapped flood hazard area: yes.</li>}
              {p.nearPark && <li>Within 100 ft of a park: Parks Commission review.</li>}
            </ul>
          </div>
          <div>
            <div className="eyebrow">Still to check</div>
            <ul className="serif">
              {r.reasons
                .filter((x) => x.kind !== 'supports')
                .map((x) => (
                  <li key={x.title}>
                    <strong>{x.title}:</strong> {x.body}
                  </li>
                ))}
              {o.professionalChecks.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="eyebrow">Next steps</div>
            <ul className="serif">
              {r.nextSteps.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="eyebrow">Official resources</div>
            <ul className="serif">
              <li>Boston ADU Guidebook — {o.name} (p. {o.guidebookPage}).</li>
              <li>Questions: ADU@boston.gov · ADU Design Workshop, first Thursday of each month.</li>
            </ul>
          </div>
        </section>
        <Preliminary />
      </main>
    </>
  );
}
