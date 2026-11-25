import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { siteCheck } from '../../src/rules/site';
import type { Parcel } from '../../src/rules/types';
import {
  FAMILIES,
  REFORMS,
  TAG_GROUP,
  evaluateLot,
  familyGroup,
  gateTags,
  lotStatus,
  reformsFromMask,
  scopeOf,
  typesAllowed,
} from './analysis';

const parcels = Object.values(
  JSON.parse(readFileSync(resolve(__dirname, '../../public/data/parcels.json'), 'utf8')) as Record<string, Parcel>,
);
const inScope = parcels.filter((p) => scopeOf(p) === 'in');

describe('advocacy analysis', () => {
  it('site-check tags agree with the tool’s own site check on every parcel', () => {
    for (const p of inScope) {
      const blocking = gateTags(p).filter((t) => TAG_GROUP[t] === 'existing' || t === 'units');
      expect(blocking.length === 0, p.address ?? p.id).toBe(siteCheck(p, {}).eligible);
    }
  });

  it('turning on a reform never makes a lot worse', () => {
    const rank = { no: 0, maybe: 1, yes: 2 };
    for (const p of inScope) {
      const base = evaluateLot(p);
      for (let mask = 1; mask < 1 << REFORMS.length; mask++) {
        const r = evaluateLot(p, reformsFromMask(mask));
        expect(rank[lotStatus(r)]).toBeGreaterThanOrEqual(rank[lotStatus(base)]);
        expect(typesAllowed(r)).toBeGreaterThanOrEqual(typesAllowed(base));
        for (const f of FAMILIES) if (base[f].ok) expect(r[f].ok, `${p.address} ${f} mask ${mask}`).toBe(true);
      }
    }
  });

  it('physical space outranks rules: reforms never unlock a lot that has no room', () => {
    const allOn = reformsFromMask((1 << REFORMS.length) - 1);
    for (const p of inScope) {
      const base = evaluateLot(p);
      const r = evaluateLot(p, allOn);
      for (const f of ['rear', 'side', 'detached'] as const) {
        if (base[f].tags.includes('space')) {
          expect(familyGroup(base[f])).toBe('space');
          expect(r[f].ok, `${p.address} ${f}`).toBe(false);
        }
      }
    }
  });

  it('the side-yard example: a 5 ft side yard is a space problem, an 8 ft one is a rule problem', () => {
    const p = inScope.find((x) => gateTags(x).length === 0)!;
    expect(familyGroup(evaluateLot({ ...p, sideYardMax: 5 }).side)).toBe('space');
    expect(familyGroup(evaluateLot({ ...p, sideYardMax: 8 }).side)).toBe('setbacks');
  });

  it('allowed ADU types report a positive size', () => {
    for (const p of inScope.slice(0, 500)) {
      const r = evaluateLot(p);
      for (const f of FAMILIES) if (r[f].ok) expect(r[f].sqft ?? 0).toBeGreaterThan(0);
    }
  });
});
