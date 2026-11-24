import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Expandable, Overlay, Preliminary, ProcessBand, QuestionField, Reasons, TraceList } from '../components/ui';
import { RULE_TOPICS } from '../content/rules';
import { useSession } from '../data/session';
import { AMI_135, AMI_SOURCE, RULES } from '../rules/constants';
import { financeCheck, type FinanceAnswers } from '../rules/finance';
import type { Question } from '../rules/options';

const QS: (Question & { key: keyof FinanceAnswers })[] = [
  { id: 'ownerOccupies', key: 'ownerOccupies', group: 'About you', text: 'Do you own this property and live in it as your main home?', choices: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
  {
    id: 'billsCurrent',
    key: 'billsCurrent',
    group: 'About you',
    text: 'Are you up to date on property taxes, water bills, mortgage payments and homeowner’s insurance?',
    choices: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'unsure', label: 'I’m not sure' }],
  },
  {
    id: 'householdSize',
    key: 'householdSize',
    group: 'Your household',
    text: 'How many people live in your household?',
    choices: ['1', '2', '3', '4', '5', '6', '7', '8'].map((v) => ({ value: v, label: v === '8' ? '8 or more' : v })),
  },
  {
    id: 'assetsUnder100k',
    key: 'assetsUnder100k',
    group: 'Your household',
    text: 'Do you have less than $100,000 in savings and investments?',
    help: 'Don’t count your home, retirement accounts, college savings, or money set aside to build the ADU.',
    choices: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'unsure', label: 'I’m not sure' }],
  },
];

export default function Paying() {
  const s = useSession();
  const [showResult, setShowResult] = useState(false);
  const [trace, setTrace] = useState(false);
  const f = s.finance;
  const r = financeCheck(f);
  const back = s.parcelId ? '/options' : '/';
  return (
    <>
      <div className="crumbs">
        <div className="inner">
          <Link className="back-link" to={back}>
            ← Back
          </Link>
          <span className="muted">/ Help paying for your ADU</span>
        </div>
      </div>
      {!showResult ? (
        <main className="page narrow stack" style={{ ['--gap' as string]: '20px' }}>
          <div className="eyebrow">Paying for your ADU · 5 quick questions</div>
          <h1>Could you get help paying for it?</h1>
          <p className="lead">The City of Boston offers financial help to some homeowners building an ADU. Answer what you can — nothing is saved or sent anywhere.</p>
          <div>
            {QS.slice(0, 3).map((q) => (
              <div className="q-card" key={q.id}>
                <QuestionField q={q} name={`f-${q.id}`} value={f[q.key] != null ? String(f[q.key]) : undefined} onChange={(v) => s.setFinance({ [q.key]: q.key === 'householdSize' ? Number(v) : v } as Partial<FinanceAnswers>)} />
              </div>
            ))}
            <div className="q-card">
              <fieldset className="q">
                <div className="qgroup">Your household</div>
                <legend>What is your household’s yearly income before taxes?</legend>
                <p className="help">Everyone in the household, all sources.</p>
                <label className="row" style={{ gap: 6 }}>
                  <span aria-hidden>$</span>
                  <input
                    className="text-input"
                    inputMode="numeric"
                    placeholder="e.g. 85,000"
                    aria-label="Yearly household income in dollars"
                    value={f.income != null ? f.income.toLocaleString('en-US') : ''}
                    onChange={(e) => {
                      const n = Number(e.target.value.replace(/[^0-9]/g, ''));
                      s.setFinance({ income: e.target.value.trim() === '' ? undefined : n });
                    }}
                  />
                </label>
                <details className="exp why">
                  <summary>What’s the limit?</summary>
                  <div className="exp-body">
                    <p>
                      The program is for households earning up to {RULES.amiLimitPct}% of the Boston-area median income. For example: 1 person $
                      {AMI_135[1].toLocaleString()}, 2 people ${AMI_135[2].toLocaleString()}, 4 people ${AMI_135[4].toLocaleString()}.
                    </p>
                    <p className="small">Source: {AMI_SOURCE}.</p>
                  </div>
                </details>
              </fieldset>
            </div>
            <div className="q-card">
              <QuestionField q={QS[3]} name="f-assets" value={f.assetsUnder100k} onChange={(v) => s.setFinance({ assetsUnder100k: v as FinanceAnswers['assetsUnder100k'] })} />
            </div>
          </div>
          <div className="row">
            <button className="btn primary" onClick={() => setShowResult(true)}>
              Check my eligibility →
            </button>
            <span className="small muted">You can change your answers at any time.</span>
          </div>
        </main>
      ) : (
        <main className="page stack" style={{ ['--gap' as string]: '36px' }}>
          <div className="grid-2">
            <div className="stack" style={{ ['--gap' as string]: '16px' }}>
              <div className="eyebrow">Paying for your ADU · your result</div>
              <h1>{r.title}</h1>
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
              <div className="row">
                <a className="btn primary" href="https://www.boston.gov/departments/housing/adu-financial-assistance-program" target="_blank" rel="noreferrer">
                  City ADU financial assistance ↗
                </a>
                <button className="btn" onClick={() => setShowResult(false)}>
                  Update my answers
                </button>
              </div>
              {s.parcelId && (
                <Link to="/options" style={{ fontWeight: 600 }}>
                  Compare ADU options ›
                </Link>
              )}
              <Preliminary />
            </div>
            <section className="panel stack" style={{ ['--gap' as string]: '10px' }}>
              <h2>Other ways to pay</h2>
              <p className="serif muted">Most projects combine more than one of these.</p>
              {[
                ['Home equity line of credit (HELOC)', 'Borrow against the value of your home as you need it.'],
                ['Home equity loan', 'A fixed lump sum, repaid over a set term.'],
                ['Construction loan', 'A short-term loan paid out in stages as the work is done.'],
                ['Cash-out refinance', 'Replace your mortgage with a larger one and use the difference.'],
              ].map(([t, d]) => (
                <div key={t} className="tile" style={{ background: '#fff' }}>
                  <div style={{ fontWeight: 700 }}>{t}</div>
                  <div className="serif small muted">{d}</div>
                </div>
              ))}
            </section>
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
            </section>
          </div>
          <section>
            <h2>Understand the rules</h2>
            <Expandable title="What does the City program offer?">
              <p>
                The Boston Home Center’s ADU loan is interest-free and covers up to ${RULES.maxLoan.toLocaleString()} of costs not covered by cash or other loans. There are
                no monthly payments; it’s repaid when you sell, transfer the home or do a cash-out refinance.
              </p>
              <p>Households between 120% and 135% of area median income must match the City loan 1:1 with their own funds or a bank loan.</p>
            </Expandable>
            <Expandable title="What else does the City require?">
              <p>Attend the ADU Design and Budget workshops in the 3 months before applying, work with a licensed architect, and provide two contractor quotes, a budget narrative and plans.</p>
              <p>You can’t have received City home repair assistance in the last ten years (de-leading excepted).</p>
            </Expandable>
            <Expandable title="What is Area Median Income (AMI)?">
              <p>AMI is the middle household income for the Boston area, adjusted for household size. HUD publishes it each year and the City sets its program limits from it.</p>
            </Expandable>
            <Expandable title={RULE_TOPICS.owner.title}>{RULE_TOPICS.owner.body}</Expandable>
          </section>
        </main>
      )}
      <ProcessBand />
      {trace && (
        <Overlay title="How we reached this result" onClose={() => setTrace(false)}>
          <TraceList steps={r.trace} />
        </Overlay>
      )}
    </>
  );
}
