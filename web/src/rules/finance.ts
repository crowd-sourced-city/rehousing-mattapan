import { AMI_120, AMI_135, AMI_SOURCE, RULES } from './constants';
import type { Reason, Status, TraceStep } from './types';

export interface FinanceAnswers {
  ownerOccupies?: 'yes' | 'no';
  billsCurrent?: 'yes' | 'no' | 'unsure';
  householdSize?: number;
  income?: number;
  assetsUnder100k?: 'yes' | 'no' | 'unsure';
}

export interface FinanceResult {
  status: Status;
  title: string;
  summary: string;
  factor: string;
  reasons: Reason[];
  nextSteps: string[];
  trace: TraceStep[];
  limit: number | null;
  matchRequired: boolean;
}

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

/** Boston ADU Financial Assistance Program eligibility (MIRO FN-01…FN-07). */
export function financeCheck(f: FinanceAnswers): FinanceResult {
  const trace: TraceStep[] = [];
  const reasons: Reason[] = [];
  const size = f.householdSize ? Math.min(8, Math.max(1, f.householdSize)) : null;
  const limit = size ? AMI_135[size] : null;
  const fail = (title: string, summary: string, factor: string, next: string[]): FinanceResult => ({
    status: 'notsupported',
    title,
    summary,
    factor,
    reasons,
    nextSteps: next,
    trace,
    limit,
    matchRequired: false,
  });

  trace.push({ rule: 'Owner lives in the home', result: f.ownerOccupies === 'yes' ? 'pass' : f.ownerOccupies === 'no' ? 'fail' : 'unknown', detail: 'Your answer.', source: 'Program rule' });
  if (f.ownerOccupies === 'no') {
    reasons.push({ kind: 'notsupported', title: 'Owner-occupancy', body: 'The City program is for owners who live in a 1-, 2- or 3-family home.' });
    return fail('City help isn’t available as things stand', 'The City’s ADU financial assistance is only for owners who live in the home as their main residence.', 'Owner-occupancy.', [
      'Look at private options such as a home equity line of credit or construction loan.',
      'Read about “Have a say” if you think this rule should change.',
    ]);
  }
  if (f.ownerOccupies === 'yes') reasons.push({ kind: 'supports', title: 'Owner lives in the home', body: 'You own and live in the property.' });

  trace.push({ rule: 'Up to date on taxes, water, mortgage and insurance', result: f.billsCurrent === 'yes' ? 'pass' : f.billsCurrent === 'no' ? 'fail' : 'unknown', detail: 'Your answer.', source: 'Program rule' });
  if (f.billsCurrent === 'no') {
    reasons.push({ kind: 'notsupported', title: 'Property debts', body: 'Bills must be up to date before applying.' });
    return fail('Resolve property debts first', 'Property debts need to be resolved before you can apply for the City program.', 'Up to date on property taxes, water, mortgage and insurance.', [
      'Contact the Boston Home Center about payment help.',
      'Come back to this check once bills are current.',
    ]);
  }
  if (f.billsCurrent === 'yes') reasons.push({ kind: 'supports', title: 'Bills up to date', body: 'Taxes, water, mortgage and insurance are current.' });

  if (limit != null && f.income != null) {
    const ok = f.income <= limit;
    trace.push({ rule: `Income ≤ ${RULES.amiLimitPct}% AMI`, result: ok ? 'pass' : 'fail', detail: `${money(f.income)} vs ${money(limit)} for ${size} ${size === 1 ? 'person' : 'people'}.`, source: AMI_SOURCE });
    if (!ok) {
      reasons.push({ kind: 'notsupported', title: 'Income', body: `${money(f.income)} is above the ${money(limit)} limit for a household of ${size}.` });
      return fail('Above the income limit', `Your household income is above ${RULES.amiLimitPct}% of the area median income for a household of ${size}, so the City program isn’t available.`, `Income: limit is ${money(limit)} for ${size} ${size === 1 ? 'person' : 'people'}.`, [
        'Compare private financing options below.',
        'Income limits change each year — check again if your income changes.',
      ]);
    }
    reasons.push({ kind: 'supports', title: 'Income', body: `Your household is within ${RULES.amiLimitPct}% of the area median income for its size (${money(limit)}).` });
  } else {
    trace.push({ rule: `Income ≤ ${RULES.amiLimitPct}% AMI`, result: 'unknown', detail: 'Household size or income not given.', source: AMI_SOURCE });
    reasons.push({ kind: 'missing', title: 'Income', body: 'Enter your household size and income to compare with the limit.' });
  }

  trace.push({ rule: `Less than ${money(RULES.assetLimit)} in savings and investments`, result: f.assetsUnder100k === 'yes' ? 'pass' : f.assetsUnder100k === 'no' ? 'fail' : 'unknown', detail: 'Excludes home equity, retirement and college savings.', source: 'Program rule' });
  if (f.assetsUnder100k === 'no') {
    reasons.push({ kind: 'notsupported', title: 'Assets', body: `The program is for households with less than ${money(RULES.assetLimit)} in financial assets.` });
    return fail('Above the asset limit', `The City program is for households with less than ${money(RULES.assetLimit)} in savings and investments.`, 'Asset limit.', ['Compare private financing options below.']);
  }
  if (f.assetsUnder100k === 'yes') reasons.push({ kind: 'supports', title: 'Assets', body: `Under ${money(RULES.assetLimit)}, not counting home, retirement or college savings.` });

  reasons.push({ kind: 'confirm', title: 'Other program steps', body: 'Attend the ADU Design and Budget workshops, work with a licensed architect, and provide two contractor quotes.' });

  const unknown = trace.some((t) => t.result === 'unknown');
  const matchRequired = size != null && f.income != null && f.income > AMI_120[size];
  return {
    status: unknown ? 'info' : 'possible',
    title: unknown ? 'A few answers would help' : 'You may qualify for city help',
    summary: unknown
      ? 'Based on what you’ve told us so far, nothing rules you out. Answer the remaining questions to see whether you appear to qualify.'
      : `Based on your answers, you appear to meet the main conditions for the City’s ADU financial assistance (an interest-free loan of up to ${money(RULES.maxLoan)}). The City makes the final decision.`,
    factor: matchRequired
      ? `Income: between 120% and 135% of area median income — you’d need to match the City loan 1:1 with your own funds or a bank loan.`
      : `Income: your household is within ${RULES.amiLimitPct}% of the area median income for its size.`,
    reasons,
    nextSteps: ['Read the City’s ADU financial assistance guidance.', 'Gather proof of income, residency and recent bills.', 'Compare loan options for the rest of the cost.'],
    trace,
    limit,
    matchRequired,
  };
}
