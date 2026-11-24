import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AMI_135 } from './constants';
import { financeCheck } from './finance';
import { fireAccess } from './fire';
import { OPTIONS, OPTION_BY_ID, optionsForLot } from './options';
import { coverageCap, lotSize, siteCheck, unsupportedReason } from './site';
import type { Parcel } from './types';

const parcels: Record<string, Parcel> = JSON.parse(
  readFileSync(resolve(__dirname, '../../public/data/parcels.json'), 'utf8'),
);
const byAddress = (a: string) => Object.values(parcels).find((p) => p.address?.toLowerCase() === a.toLowerCase())!;

describe('lot size bands (Guidebook / Miro Z-22)', () => {
  it('classifies by street width', () => {
    const p = (w: number) => ({ lotWidth: w }) as Parcel;
    expect(lotSize(p(39.9))).toBe('small');
    expect(lotSize(p(40))).toBe('medium');
    expect(lotSize(p(59.9))).toBe('medium');
    expect(lotSize(p(60))).toBe('large');
  });
  it('medium options also appear on large lots (Figma Medium & Larger Lots)', () => {
    expect(optionsForLot('large').map((o) => o.id)).toEqual(['rear-medium', 'corner', 'side', 'garage', 'backyard', 'front']);
    expect(optionsForLot('small')).toHaveLength(5);
    expect(optionsForLot('medium')).toHaveLength(4);
  });
});

describe('coverage cap (Article 60 Table 6)', () => {
  it('uses 60% below 5,000 sf and 50% at or above', () => {
    expect(coverageCap(4999)).toBe(60);
    expect(coverageCap(5000)).toBe(50);
  });
});

describe('site check on the spreadsheet test parcels', () => {
  it('733-735 Cummins Hwy (R2, two-family) passes using footprint coverage', () => {
    const p = byAddress('733-735 Cummins Hw');
    expect(p.zoning).toBe('R2');
    expect(unsupportedReason(p)).toBeNull();
    const s = siteCheck(p, {});
    expect(s.eligible).toBe(true);
    expect(lotSize(p)).toBe('medium');
  });
  it('99 Lorna Rd is a large corner lot', () => {
    const p = byAddress('99 Lorna Rd');
    expect(lotSize(p)).toBe('large');
    expect(p.corner).toBe(true);
  });
  it('23 Newcroft Ci is irregular → tool stops', () => {
    const p = byAddress('23 Newcroft Ci');
    expect(unsupportedReason(p)).toBe('irregular');
  });
  it('R1 three-family cannot add an ADU (max 3 incl. ADUs)', () => {
    const p = Object.values(parcels).find((x) => x.zoning === 'R1' && x.units === 3 && !unsupportedReason(x))!;
    const s = siteCheck(p, {});
    expect(s.failures.some((f) => f.rule.startsWith('Room for one more home'))).toBe(true);
  });
  it('owner not living there is flagged but not a site failure', () => {
    const p = byAddress('98 Orlando St');
    const s = siteCheck(p, { ownerOccupies: 'no' });
    expect(s.ownerOccupancyIssue).toBe(true);
  });
});

describe('fire access (City fire-safety guidance)', () => {
  it('door within 50 ft and walls within 150 ft → no sprinklers', () => {
    expect(fireAccess({ doorFt: 40, farWallFt: 100, behind: false, frontage20: true, sprinklered: false, detached: true }).outcome).toBe('ok');
  });
  it('door 95 ft → sprinklers', () => {
    expect(fireAccess({ doorFt: 95, farWallFt: 120, behind: true, frontage20: true, sprinklered: false, detached: true }).outcome).toBe('sprinkler');
  });
  it('behind house without 20 ft frontage, attached → needs throughway', () => {
    expect(fireAccess({ doorFt: 70, farWallFt: 90, behind: true, frontage20: false, sprinklered: false, detached: false }).outcome).toBe('fail');
    expect(fireAccess({ doorFt: 70, farWallFt: 90, behind: true, frontage20: false, sprinklered: false, detached: false, interiorThroughway: true }).outcome).toBe('interior');
  });
  it('beyond 150 ft door → fail', () => {
    expect(fireAccess({ doorFt: 170, farWallFt: 200, behind: false, frontage20: true, sprinklered: true, detached: true }).outcome).toBe('fail');
  });
});

describe('options', () => {
  const p = byAddress('98 Orlando St');
  it('every option evaluates on a real parcel with and without answers', () => {
    for (const o of OPTIONS) {
      const empty = o.evaluate(p, {}, {});
      expect(empty.summary.length).toBeGreaterThan(10);
      const answers = Object.fromEntries(o.questions.map((q) => [q.id, q.choices[0].value]));
      const full = o.evaluate(p, { sprinklered: 'no', hasGarage: 'yes', hasAttic: 'yes', hasBasement: 'yes' }, answers);
      expect(['possible', 'info', 'closer', 'notsupported', 'unavailable']).toContain(full.status);
      expect(o.preliminary(p, {}).text.length).toBeGreaterThan(5);
    }
  });
  it('rear extension: too deep → not supported; shorter → possible/closer', () => {
    const rear = OPTION_BY_ID['rear-medium'];
    const ok = rear.evaluate(p, {}, { depth: '30', storiesWanted: '1', throughway: 'yes' }); // 62 − 30 = 32 ≥ 20
    expect(ok.status).toBe('possible');
    // Without 20 ft side frontage or an interior throughway, fire access needs a closer look.
    expect(rear.evaluate(p, {}, { depth: '30', storiesWanted: '1', throughway: 'no' }).status).toBe('closer');
    const tooDeep = rear.evaluate({ ...p, rearYard: 40 }, {}, { depth: '25', storiesWanted: '1' });
    expect(tooDeep.status).toBe('notsupported');
  });
  it('split unit: shared kitchen → not supported', () => {
    expect(OPTION_BY_ID.split.evaluate(p, {}, { fitsInside: 'yes', selfContained: 'no' }).status).toBe('notsupported');
    expect(OPTION_BY_ID.split.evaluate(p, {}, { fitsInside: 'yes', selfContained: 'yes', entrance: 'own' }).status).toBe('possible');
  });
  it('front yard always needs a closer look (open question)', () => {
    expect(OPTION_BY_ID.front.evaluate(p, {}, {}).status).toBe('closer');
  });
  it('add a floor on a 3-story house is not supported', () => {
    expect(OPTION_BY_ID.floor.evaluate({ ...p, stories: 3 }, {}, {}).status).toBe('notsupported');
  });
  it('basement ceiling under 7 ft 6 in → not supported', () => {
    expect(OPTION_BY_ID.basement.evaluate(p, {}, { condition: 'unfinished', ceiling: 'low' }).status).toBe('notsupported');
  });
});

describe('finance (ADU Financial Assistance Program)', () => {
  it('uses the 135% AMI table', () => {
    expect(financeCheck({ ownerOccupies: 'yes', billsCurrent: 'yes', householdSize: 3, income: AMI_135[3], assetsUnder100k: 'yes' }).status).toBe('possible');
    expect(financeCheck({ ownerOccupies: 'yes', billsCurrent: 'yes', householdSize: 3, income: AMI_135[3] + 1, assetsUnder100k: 'yes' }).status).toBe('notsupported');
  });
  it('flags the 1:1 match between 120% and 135% AMI', () => {
    expect(financeCheck({ ownerOccupies: 'yes', billsCurrent: 'yes', householdSize: 1, income: 150000, assetsUnder100k: 'yes' }).matchRequired).toBe(true);
  });
  it('not owner-occupied → ineligible', () => {
    expect(financeCheck({ ownerOccupies: 'no' }).status).toBe('notsupported');
  });
});

describe('dataset sanity', () => {
  it('has the expected number of supported parcels', () => {
    const supported = Object.values(parcels).filter((p) => !unsupportedReason(p));
    expect(supported.length).toBeGreaterThan(1500);
    const eligible = supported.filter((p) => siteCheck(p, {}).eligible);
    expect(eligible.length).toBeGreaterThan(1000);
  });
});
