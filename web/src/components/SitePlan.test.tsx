/**
 * Site-plan diagrams: render every option's plan for a spread of real parcels
 * (server-side, no browser needed) and check the SVG is well-formed: no NaN
 * coordinates, and the house, garage and ADU stay inside the drawing.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { cardPlan } from '../pages/Overview';
import { basePlan, optionsForLot } from '../rules/options';
import { lotSize, unsupportedReason } from '../rules/site';
import type { Parcel, PlanSpec } from '../rules/types';
import { SitePlan } from './SitePlan';

const all: Parcel[] = Object.values(
  JSON.parse(readFileSync(resolve(__dirname, '../../public/data/parcels.json'), 'utf8')) as Record<string, Parcel>,
);
const supported = all.filter((p) => !unsupportedReason(p));
// Every 10th supported parcel: ~225 lots of all sizes, with and without garages.
const sample = supported.filter((_, i) => i % 10 === 0);

function rects(svg: string) {
  return [...svg.matchAll(/<rect x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"/g)].map((m) => m.slice(1).map(Number));
}
function viewBox(svg: string) {
  const [, , w, h] = svg.match(/viewBox="([^"]+)"/)![1].split(' ').map(Number);
  return { w, h };
}

function checkPlan(spec: PlanSpec, label: string) {
  const svg = renderToStaticMarkup(<SitePlan spec={spec} />);
  expect(svg, label).not.toMatch(/NaN|Infinity|undefined/);
  const { w, h } = viewBox(svg);
  for (const [x, y, rw, rh] of rects(svg)) {
    expect(rw, label).toBeGreaterThanOrEqual(0);
    expect(rh, label).toBeGreaterThanOrEqual(0);
    expect(x, label).toBeGreaterThanOrEqual(-0.01);
    expect(y, label).toBeGreaterThanOrEqual(-0.01);
    // The street band deliberately runs to the bottom edge; everything else sits inside.
    expect(x + rw, label).toBeLessThanOrEqual(w + 0.01);
    expect(y, label).toBeLessThanOrEqual(h);
  }
}

describe('SitePlan', () => {
  it('draws every option’s overview card and base plan for a spread of real lots', () => {
    expect(sample.length).toBeGreaterThan(100);
    for (const p of sample) {
      for (const o of optionsForLot(lotSize(p)!)) {
        checkPlan(cardPlan(o, p), `${p.address} card ${o.id}`);
        const r = o.evaluate(p, {}, {});
        if (r.plan) checkPlan(r.plan, `${p.address} result ${o.id}`);
      }
    }
  });

  it('places the house using the measured side yards', () => {
    const base: PlanSpec = { ...basePlan({ lotWidth: 50, lotDepth: 100, houseWidth: 30, houseDepth: 40, frontYard: 10 } as Parcel, 'internal') };
    const houseX = (spec: PlanSpec) => rects(renderToStaticMarkup(<SitePlan spec={spec} />))[2][0]; // street, lot, house
    const centred = houseX(base);
    expect(houseX({ ...base, sideLeft: 2, sideRight: 18 })).toBeLessThan(centred);
    expect(houseX({ ...base, sideLeft: 18, sideRight: 2 })).toBeGreaterThan(centred);
  });

  it('shows an existing garage, and makes it the ADU on the garage option', () => {
    const p = supported.find((x) => x.garagePlan)!;
    expect(p).toBeDefined();
    expect(renderToStaticMarkup(<SitePlan spec={basePlan(p, 'rear')} />)).toContain('GARAGE');
    expect(renderToStaticMarkup(<SitePlan spec={basePlan(p, 'garage')} />)).not.toContain('>GARAGE<');
  });
});
