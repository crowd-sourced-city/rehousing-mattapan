/**
 * Whole-dataset sweep: every supported parcel × every option for its lot size ×
 * every answer to every question. Catches crashes and broken text (NaN,
 * undefined, …) that hand-picked examples miss. Rule *correctness* is covered by
 * rules.test.ts; this file checks that nothing breaks on real data.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AMI_120, AMI_135 } from './constants';
import { optionsForLot } from './options';
import { lotSize, mapCategory, siteCheck, unsupportedReason } from './site';
import type { OptionAnswers, OptionResult, Parcel, PropertyAnswers, Status } from './types';

const parcels: Parcel[] = Object.values(
  JSON.parse(readFileSync(resolve(__dirname, '../../public/data/parcels.json'), 'utf8')) as Record<string, Parcel>,
);
const supported = parcels.filter((p) => !unsupportedReason(p));
const STATUSES: Status[] = ['possible', 'info', 'closer', 'notsupported', 'unavailable'];
// No word boundaries: a value glued to text ("900 sq ftNaN") must still be caught.
const BROKEN = /NaN|undefined|Infinity|\[object Object\]|\bnull\b/;

const PROFILES: PropertyAnswers[] = [
  {},
  { sprinklered: 'yes', hasGarage: 'yes', hasAttic: 'yes', hasBasement: 'yes' },
  { sprinklered: 'no', hasGarage: 'no', hasAttic: 'no', hasBasement: 'no', ownerOccupies: 'no' },
] as PropertyAnswers[];

/** Every text a result shows to the user. */
function texts(r: OptionResult): string[] {
  return [
    r.summary,
    r.factor,
    ...r.metrics.flatMap((m) => [m.label, m.value, m.note ?? '']),
    ...r.reasons.flatMap((x) => [x.title, x.body]),
    ...r.nextSteps,
    ...r.trace.flatMap((t) => [t.rule, t.detail]),
  ];
}

describe('every parcel in the dataset', () => {
  it('gets a lot-size group or a reason the tool stops', () => {
    for (const p of parcels) {
      const u = unsupportedReason(p);
      if (!u) expect(lotSize(p), p.address ?? p.id).not.toBeNull();
    }
  });

  it('map colour agrees with what the tool does when the lot is picked', () => {
    for (const p of parcels) {
      const u = unsupportedReason(p);
      const c = mapCategory(p);
      if (!u) expect(c).toBe('covered');
      else expect(c).toBe(u === 'outside' || u === 'notresidential' ? 'other' : 'pending');
    }
  });

  it('site check returns a readable trace for every supported parcel', () => {
    for (const p of supported) {
      const sc = siteCheck(p, {});
      expect(sc.eligible).toBe(sc.failures.length === 0);
      for (const t of sc.trace) expect(`${t.rule} ${t.detail}`, p.address ?? p.id).not.toMatch(BROKEN);
    }
  });
});

describe('every option × every supported parcel × every answer', () => {
  it('never throws, returns a valid status and shows no broken text', () => {
    const problems: string[] = [];
    let evaluations = 0;
    for (const p of supported) {
      const size = lotSize(p)!;
      for (const o of optionsForLot(size)) {
        const check = (label: string, r: OptionResult) => {
          evaluations++;
          if (!STATUSES.includes(r.status)) problems.push(`${p.address} · ${o.id} · ${label}: status ${r.status}`);
          const bad = texts(r).find((t) => BROKEN.test(t));
          if (bad) problems.push(`${p.address} · ${o.id} · ${label}: "${bad}"`);
        };
        for (const profile of PROFILES) {
          const pre = o.preliminary(p, profile);
          if (!STATUSES.includes(pre.status) || BROKEN.test(pre.text)) problems.push(`${p.address} · ${o.id} · preliminary`);
          try {
            check('no answers', o.evaluate(p, profile, {}));
            // each answer on its own…
            for (const q of o.questions) {
              for (const c of q.choices) check(`${q.id}=${c.value}`, o.evaluate(p, profile, { [q.id]: c.value } as OptionAnswers));
            }
            // …and the first / last choice of every question together
            for (const pick of [0, -1]) {
              const all = Object.fromEntries(o.questions.map((q) => [q.id, q.choices.at(pick)!.value])) as OptionAnswers;
              check(`all choice ${pick}`, o.evaluate(p, profile, all));
            }
          } catch (e) {
            problems.push(`${p.address} · ${o.id}: threw ${(e as Error).message}`);
          }
        }
      }
    }
    expect(evaluations).toBeGreaterThan(50_000);
    expect(problems.slice(0, 20)).toEqual([]);
  });
});

describe('income tables', () => {
  it('rise with household size, and 120% is always below 135%', () => {
    for (let n = 2; n <= 8; n++) {
      expect(AMI_135[n]).toBeGreaterThan(AMI_135[n - 1]);
      expect(AMI_120[n]).toBeGreaterThan(AMI_120[n - 1]);
    }
    for (let n = 1; n <= 8; n++) expect(AMI_120[n]).toBeLessThan(AMI_135[n]);
  });
});
