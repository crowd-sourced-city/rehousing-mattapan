/**
 * Runs the limiting-factor analysis over every parcel and writes the advocacy
 * page's data:
 *   public/data/advocacy/lots.json     per-lot results for the maps
 *   public/data/advocacy/summary.json  totals for the charts
 *
 * Run from web/:  npm run advocacy:data
 * Re-run whenever public/data/parcels.json or the rules change.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Parcel } from '../../src/rules/types';
import {
  FAMILIES,
  REFORMS,
  TAG_GROUP,
  evaluateLot,
  familyGroup,
  largestSqft,
  lotFactor,
  lotStatus,
  reformsFromMask,
  scopeOf,
  typesAllowed,
  type Family,
  type Group,
  type Tag,
} from './analysis';

const web = resolve(__dirname, '../..');
const parcels = JSON.parse(readFileSync(resolve(web, 'public/data/parcels.json'), 'utf8')) as Record<string, Parcel>;
const outDir = resolve(web, 'public/data/advocacy');
mkdirSync(outDir, { recursive: true });

const STATUS_CODE = { yes: 'Y', maybe: 'M', no: 'N' } as const;
const COMBOS = 1 << REFORMS.length;

const lots: Record<string, unknown> = {};
const funnel = { parcels: 0, inR1R2Homes: 0, assessable: 0, passSiteCheck: 0, yes: 0, maybe: 0, no: 0 };
const familyGroups = Object.fromEntries(FAMILIES.map((f) => [f, {} as Record<Group, number>])) as Record<Family, Record<Group, number>>;
const familyTags = Object.fromEntries(FAMILIES.map((f) => [f, {} as Record<Tag, number>])) as Record<Family, Record<Tag, number>>;
const factor: Record<string, number> = {};
const scenario = Array.from({ length: COMBOS }, () => ({ yes: 0, maybe: 0, no: 0 }));
/** Lots allowing each ADU type, for every reform combination. */
const familyScenario = Array.from({ length: COMBOS }, () => Object.fromEntries(FAMILIES.map((f) => [f, 0])) as Record<Family, number>);
const sprinklers = { internalAllowed: 0, internalNeedsSprinklers: 0, cottageAllowed: 0, cottageNeedsSprinklers: 0 };
const typesHist = [0, 0, 0, 0, 0];
const sizeBuckets = { under500: 0, to750: 0, to1000: 0, over1000: 0 };

for (const p of Object.values(parcels)) {
  funnel.parcels++;
  const scope = scopeOf(p);
  if (scope === 'out') {
    lots[p.id] = { s: 'O' };
    continue;
  }
  funnel.inR1R2Homes++;
  if (scope === 'unassessed') {
    lots[p.id] = { s: 'A' };
    continue;
  }
  funnel.assessable++;

  const base = evaluateLot(p);
  const status = lotStatus(base);
  funnel[status]++;
  if (!base.internal.tags.some((t) => TAG_GROUP[t] === 'existing' || t === 'units')) funnel.passSiteCheck++;
  const n = typesAllowed(base);
  typesHist[n]++;
  const m = largestSqft(base);
  if (m != null) {
    if (m < 500) sizeBuckets.under500++;
    else if (m < 750) sizeBuckets.to750++;
    else if (m < 1000) sizeBuckets.to1000++;
    else sizeBuckets.over1000++;
  }
  const f = lotFactor(base);
  factor[f] = (factor[f] ?? 0) + 1;

  for (const fam of FAMILIES) {
    const g = familyGroup(base[fam]);
    familyGroups[fam][g] = (familyGroups[fam][g] ?? 0) + 1;
    for (const t of base[fam].tags) familyTags[fam][t] = (familyTags[fam][t] ?? 0) + 1;
  }
  if (base.internal.ok) {
    sprinklers.internalAllowed++;
    if (base.internal.sprinklers) sprinklers.internalNeedsSprinklers++;
  }
  if (base.detached.ok) {
    sprinklers.cottageAllowed++;
    if (base.detached.sprinklers) sprinklers.cottageNeedsSprinklers++;
  }

  // Every combination of reforms: status letter and number of ADU types.
  let sc = '';
  let nc = '';
  for (let mask = 0; mask < COMBOS; mask++) {
    const r = mask === 0 ? base : evaluateLot(p, reformsFromMask(mask));
    const st = lotStatus(r);
    scenario[mask][st]++;
    for (const fam of FAMILIES) if (r[fam].ok) familyScenario[mask][fam]++;
    sc += STATUS_CODE[st];
    nc += typesAllowed(r);
  }

  lots[p.id] = {
    a: p.address,
    s: STATUS_CODE[status],
    n,
    m,
    f,
    sc,
    nc,
    // per ADU type: blocking tags ([] = allowed) and rough size
    t: Object.fromEntries(FAMILIES.map((fam) => [fam, base[fam].ok ? base[fam].sqft ?? 0 : base[fam].tags])),
  };
}

// Single-reform impact (one bit set) and all reforms together.
const reformImpact = REFORMS.map((r, i) => ({
  reform: r,
  yes: scenario[1 << i].yes - scenario[0].yes,
  anyAdu: scenario[0].no - scenario[1 << i].no,
}));
const all = COMBOS - 1;

const summary = {
  generated: new Date().toISOString().slice(0, 10),
  funnel,
  typesHist,
  sizeBuckets,
  factor,
  familyGroups,
  familyTags,
  sprinklers,
  reforms: REFORMS,
  reformImpact,
  allReforms: { gainYes: scenario[all].yes - scenario[0].yes, gainAnyAdu: scenario[0].no - scenario[all].no, counts: scenario[all] },
  // Each reform added on top of "grandfather" (the biggest single reform), to show how rules stack.
  withGrandfather: REFORMS.map((r, i) => {
    const g = 1 << REFORMS.indexOf('grandfather');
    const mask = g | (1 << i);
    return { reform: r, yes: scenario[mask].yes - scenario[0].yes, counts: scenario[mask] };
  }),
  scenarioCounts: scenario,
  familyScenario,
  baseline: scenario[0],
};

writeFileSync(resolve(outDir, 'lots.json'), JSON.stringify({ reforms: REFORMS, lots }));
writeFileSync(resolve(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
const bit = (r: string) => 1 << REFORMS.indexOf(r as (typeof REFORMS)[number]);
console.log(JSON.stringify({
  funnel,
  allReforms: summary.allReforms,
  cottages: {
    today: familyScenario[0].detached,
    firePath: familyScenario[bit('firePath')].detached,
    cottage3: familyScenario[bit('cottage3')].detached,
    both: familyScenario[bit('firePath') | bit('cottage3')].detached,
    all: familyScenario[COMBOS - 1].detached,
  },
  today: familyScenario[0],
  allOn: familyScenario[COMBOS - 1],
}, null, 1));
