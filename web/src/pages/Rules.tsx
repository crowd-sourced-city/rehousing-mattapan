import { Link } from 'react-router-dom';
import { Expandable, ProcessBand } from '../components/ui';
import { RULE_TOPICS, type TopicId } from '../content/rules';
import { RULES } from '../rules/constants';

const ROWS: [string, string, string][] = [
  ['Zoning subdistricts covered', 'R1 and R2 (Greater Mattapan)', 'Article 60, 2024 amendment'],
  ['Max homes on a lot incl. ADUs', `R1: ${RULES.maxUnitsWithAdu.R1} · R2: ${RULES.maxUnitsWithAdu.R2}`, 'Article 60 Table 7'],
  ['Max lot coverage', `${RULES.coverageSmallLotPct}% (lot < 5,000 sf) · ${RULES.coverageLargeLotPct}% (≥ 5,000 sf)`, 'Article 60 Table 6'],
  ['Min permeable area', `${RULES.minPermeablePct}%`, 'Article 60 Table 6'],
  ['Min front / side / rear yard', `${RULES.minFrontYardFt} / ${RULES.minSideYardFt} / ${RULES.minRearYardFt} ft`, 'Article 60 Table 6'],
  ['Max building height', `${RULES.maxBuildingHeightFt} ft · ${RULES.maxStories} stories`, 'Article 60 Table 6'],
  ['Min lot frontage', `${RULES.minLotFrontageFt} ft`, 'Article 60 Table 6'],
  ['Attached / internal ADU size', `≤ 75% of principal unit or ${RULES.attachedMaxSqft.toLocaleString()} sf, whichever is smaller; no taller than the house`, 'Article 60 Table 5 · Article 2'],
  ['Detached ADU size', `≤ ${RULES.detachedMaxFloorPlateSqft} sf floor plate or the house footprint; ≤ 1½ stories or house height; ≥ 5 ft from other buildings`, 'Article 60 Table 5'],
  ['Fire access (no sprinklers)', `Door ≤ ${RULES.fireDoorNoSprinklerFt} ft, walls ≤ ${RULES.fireWallNoSprinklerFt} ft from the curb`, '527 CMR 18.2.3.2'],
  ['Fire access (sprinklers)', `Door ≤ ${RULES.fireDoorSprinklerFt} ft, walls ≤ ${RULES.fireWallSprinklerFt} ft`, '527 CMR 18.2.3.2.1.1'],
  ['Behind the house, < 20 ft frontage', `Door ≤ ${RULES.fireDoorBehindNoFrontageFt} ft; no sprinkler increase (attached: interior throughway; detached: sprinkler + 10 ft path + wayfinding)`, 'City fire-safety guidance pp. 14–29'],
  ['Building-code sprinklers', '3 or more homes in one building', 'IEBC 1012.2.1 / 780 CMR 903.2'],
  ['Smallest home', `≈ ${RULES.minUnitSqftOnePerson} sf for one person, +${RULES.extraSqftPerPerson} sf per extra person`, 'ADU Guidebook (IBC efficiency unit)'],
  ['City financial assistance', `Owner-occupant · income ≤ ${RULES.amiLimitPct}% AMI · < $${RULES.assetLimit.toLocaleString()} in assets · loan up to $${RULES.maxLoan.toLocaleString()}`, 'boston.gov ADU Financial Assistance Program'],
];

export default function RulesPage() {
  const all = Object.keys(RULE_TOPICS) as TopicId[];
  return (
    <>
      <main className="page narrow stack" style={{ ['--gap' as string]: '28px' }}>
        <div className="stack" style={{ ['--gap' as string]: '8px' }}>
          <div className="eyebrow">About ADUs</div>
          <h1>Rules and sources</h1>
          <p className="lead">The rules this prototype checks, in plain English, and where each one comes from.</p>
        </div>
        <section className="stack" style={{ ['--gap' as string]: '0px' }}>
          {all.map((t) => (
            <Expandable key={t} title={RULE_TOPICS[t].title}>
              {RULE_TOPICS[t].body}
            </Expandable>
          ))}
        </section>
        <section className="stack">
          <h2>Every threshold we use</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--ink)' }}>
                  <th style={{ padding: 8 }}>Rule</th>
                  <th style={{ padding: 8 }}>Value</th>
                  <th style={{ padding: 8 }}>Source</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map(([a, b, c]) => (
                  <tr key={a} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td style={{ padding: 8, fontWeight: 600 }}>{a}</td>
                    <td style={{ padding: 8 }} className="serif">
                      {b}
                    </td>
                    <td style={{ padding: 8 }} className="muted">
                      {c}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted">
            This is a student prototype. Where the sources leave a question open, we’ve made an assumption — they’re listed in the project’s{' '}
            <a href="https://github.com/crowd-sourced-city/rehousing-mattapan/blob/main/web/ASSUMPTIONS.md">assumptions</a> and{' '}
            <a href="https://github.com/crowd-sourced-city/rehousing-mattapan/blob/main/web/OPEN_QUESTIONS.md">open questions</a>. <Link to="/find">Find your property →</Link>
          </p>
        </section>
      </main>
      <ProcessBand />
    </>
  );
}
