/**
 * Limiting-factor analysis for the ADU advocacy page.
 *
 * For every in-scope Mattapan lot and each of four ADU types, list everything
 * that stops that ADU type, and separate two kinds of reason:
 *
 *   • PHYSICAL: even with no zoning setbacks at all, there isn't room on this lot
 *     or in this house (a 3 ft clearance is still kept so people can walk around
 *     and get out). Example: a 5 ft side yard cannot hold a side addition, rule or no rule.
 *   • RULES: there IS physical room, but a zoning, fire-code or building-code rule
 *     blocks it.
 *
 * If a lot fails the physical test, the limiting factor is the lot, even if rules
 * also fail. Only when space allows do the rules count as the limiting factor.
 *
 * Thresholds come from the tool's rules (src/rules/constants.ts) so the two never
 * drift apart. The analysis-only assumptions are below; see ../README.md.
 *
 * Pure functions only (no file I/O), so it can be unit-tested. analyze.ts runs it.
 */
import { RULES } from '../../src/rules/constants';
import { attachedMax, detachedMax } from '../../src/rules/options';
import { coverageCap, unsupportedReason } from '../../src/rules/site';
import type { Parcel } from '../../src/rules/types';

// ---- Analysis assumptions (physical baseline) -------------------------------
/** Smallest ADU worth counting: a one-person studio (Guidebook p.17). */
export const MIN_ADU_SQFT = RULES.minUnitSqftOnePerson; // 330
/** Side of the smallest square that holds MIN_ADU_SQFT (~18.2 ft). */
export const MIN_SQUARE_FT = Math.sqrt(MIN_ADU_SQFT);
/** Clearance kept even in the "no setbacks" physical baseline: a 3 ft walkway (fire/egress path). */
export const CLEARANCE_FT = 3;
/** Shallowest useful rear addition: the tool's smallest depth option. */
export const MIN_ADDITION_DEPTH_FT = 10;
/** Narrowest useful side addition (Miro T-05). */
export const MIN_ADDITION_WIDTH_FT = RULES.minSideAdditionWidthFt; // 7
/** Rear additions are assumed to span the house width, capped at 24 ft (as in the tool). */
export const MAX_ADDITION_WIDTH_FT = 24;
/** A house can be split if one home ≥ ~570 sq ft remains beside a 330 sq ft ADU. */
export const MIN_HOUSE_PER_UNIT_TO_SPLIT = 900;
/** Width of the firefighter path the Fire Department asks for behind a house (FIRE guidance). */
export const FIRE_PATH_FT = RULES.firefighterPathFt; // 10

// ---- Types -------------------------------------------------------------------
export const FAMILIES = ['internal', 'rear', 'side', 'detached'] as const;
export type Family = (typeof FAMILIES)[number];
export const FAMILY_LABEL: Record<Family, string> = {
  internal: 'Inside the house (split, attic, basement)',
  rear: 'Rear addition',
  side: 'Side addition',
  detached: 'Backyard cottage',
};

export type Tag =
  // Article 60 Table 6/7 site check, applied to the lot as it is today
  | 'units' // already at the most homes allowed (Table 7)
  | 'existing-coverage'
  | 'existing-front'
  | 'existing-side'
  | 'existing-rear'
  | 'height'
  | 'frontage'
  // physical
  | 'space'
  // rules that apply to the new ADU itself
  | 'rear-setback' // 20 ft rear yard must stay open behind an addition
  | 'side-setback' // 3 ft side setback
  | 'detached-setbacks' // 10 ft rear, 5 ft from the house, 8 ft from other buildings
  | 'coverage' // lot coverage cap after adding the ADU
  | 'fire-path'; // backyard ADU behind the house: 10 ft firefighter path (fire code)

/** Groups used for colours and charts. */
export type Group = 'allowed' | 'space' | 'existing' | 'setbacks' | 'coverage' | 'fire' | 'units' | 'several';
export const TAG_GROUP: Record<Tag, Exclude<Group, 'allowed' | 'several'>> = {
  units: 'units',
  'existing-coverage': 'existing',
  'existing-front': 'existing',
  'existing-side': 'existing',
  'existing-rear': 'existing',
  height: 'existing',
  frontage: 'existing',
  space: 'space',
  'rear-setback': 'setbacks',
  'side-setback': 'setbacks',
  'detached-setbacks': 'setbacks',
  coverage: 'coverage',
  'fire-path': 'fire',
};
export const TAG_LABEL: Record<Tag, string> = {
  units: 'Lot already has the most homes allowed (Article 60 Table 7)',
  'existing-coverage': 'Existing buildings already exceed the lot-coverage limit',
  'existing-front': 'Existing house is closer than 5 ft to the front lot line',
  'existing-side': 'Existing house is closer than 3 ft to a side lot line',
  'existing-rear': 'Existing house leaves less than 20 ft of rear yard',
  height: 'Existing house is over 40 ft or 3½ stories',
  frontage: 'Less than 20 ft of street frontage',
  space: 'Not enough physical space, even with no setbacks',
  'rear-setback': '20 ft rear yard must stay open behind an addition',
  'side-setback': '3 ft side setback leaves less than 7 ft to build',
  'detached-setbacks': 'Cottage setbacks (10 ft rear, 5 ft from house, 8 ft from garages)',
  coverage: 'Lot-coverage limit (50% / 60%) after adding the ADU',
  'fire-path': 'Fire code: needs a 10 ft firefighter path beside the house',
};

/** Policy changes the interactive map can switch on. */
export const REFORMS = ['grandfather', 'rear10', 'cottage3', 'firePath', 'coverage'] as const;
export type Reform = (typeof REFORMS)[number];
export const REFORM_LABEL: Record<Reform, { title: string; body: string }> = {
  grandfather: {
    title: 'Let existing homes keep their setbacks',
    body: 'Don’t block an ADU because the house (often 100 years old) doesn’t meet today’s yard or coverage rules. Sec. 60-34 already points this way for changes that don’t make a nonconformity worse.',
  },
  rear10: { title: 'Rear yard 20 ft → 10 ft for additions', body: 'Keep 10 ft of open yard behind a rear addition instead of 20 ft.' },
  cottage3: {
    title: 'Backyard cottages: 3 ft setbacks',
    body: 'Allow a cottage 3 ft from the lot lines and the house (the walkway clearance), not 10 ft from the rear line and 5–8 ft from other buildings.',
  },
  firePath: {
    title: 'Sprinklers instead of a 10 ft fire path',
    body: 'Accept a fully sprinklered backyard ADU without a 10 ft wide firefighter path beside the house.',
  },
  coverage: { title: 'Don’t count the ADU toward lot coverage', body: 'Exempt the ADU’s footprint from the 50% / 60% lot-coverage cap.' },
};

export interface FamilyResult {
  ok: boolean;
  /** Everything that blocks this ADU type ([] when ok). */
  tags: Tag[];
  /** Rough largest ADU floor area allowed (sq ft) when ok. */
  sqft: number | null;
  /** True when allowed but the fire or building code would require sprinklers. */
  sprinklers?: boolean;
}

export type LotStatus = 'yes' | 'maybe' | 'no';
export type Scope = 'in' | 'unassessed' | 'out';

export function scopeOf(p: Parcel): Scope {
  const u = unsupportedReason(p);
  if (!u) return 'in';
  return u === 'outside' || u === 'notresidential' ? 'out' : 'unassessed';
}

// ---- Core --------------------------------------------------------------------

/** Article 60 Table 6/7 checks on the lot as it is today (mirrors siteCheck). */
export function gateTags(p: Parcel): Tag[] {
  const t: Tag[] = [];
  const z = p.zoning as 'R1' | 'R2';
  if (p.units != null && p.units + 1 > RULES.maxUnitsWithAdu[z]) t.push('units');
  if ((p.coveragePct ?? 0) > coverageCap(p.lotArea ?? 0)) t.push('existing-coverage');
  if ((p.frontYard ?? 0) < RULES.minFrontYardFt) t.push('existing-front');
  if (p.sideYardMin != null && p.sideYardMin < RULES.minSideYardFt) t.push('existing-side');
  if ((p.rearYard ?? 0) < RULES.minRearYardFt) t.push('existing-rear');
  if ((p.houseHeight != null && p.houseHeight > RULES.maxBuildingHeightFt) || (p.stories != null && p.stories > RULES.maxStories))
    t.push('height');
  if ((p.lotWidth ?? 0) < RULES.minLotFrontageFt) t.push('frontage');
  return t;
}

const capSqft = (p: Parcel) => (coverageCap(p.lotArea ?? 0) / 100) * (p.lotArea ?? 0);

export function evaluateLot(p: Parcel, reforms: ReadonlySet<Reform> = new Set()): Record<Family, FamilyResult> {
  let gate = gateTags(p);
  if (reforms.has('grandfather')) gate = gate.filter((t) => TAG_GROUP[t] !== 'existing');
  const stories = Math.min(Math.max(p.stories ?? 1, 1), 2);
  const coverageLeft = capSqft(p) - (p.totalFootprint ?? 0);
  const coverageOk = (addSqft: number) => reforms.has('coverage') || addSqft <= coverageLeft;
  const addMax = attachedMax(p, {}) ?? RULES.attachedMaxSqft;
  const result = (tags: Tag[], sqft: number | null, sprinklers = false): FamilyResult =>
    tags.length ? { ok: false, tags, sqft: null } : { ok: true, tags, sqft: sqft == null ? null : Math.round(sqft), sprinklers };

  // Inside the house. Adding a unit inside a 2-family makes 3 in one building → sprinklers (building code).
  const internalTags: Tag[] = [...gate];
  const perUnit = p.livingArea != null && p.units ? p.livingArea / p.units : null;
  if (perUnit != null && perUnit < MIN_HOUSE_PER_UNIT_TO_SPLIT) internalTags.unshift('space');
  const internal = result(internalTags, Math.min(addMax, perUnit ?? addMax), (p.units ?? 1) + 1 >= RULES.buildingUnitsSprinklerTrigger);

  // Rear addition. The gate's "existing rear yard" is implied by the addition's own rear-yard rule.
  const rearReq = reforms.has('rear10') ? 10 : RULES.minRearYardFt;
  const width = Math.min(p.houseWidth ?? MAX_ADDITION_WIDTH_FT, MAX_ADDITION_WIDTH_FT);
  const rearYard = p.rearYard ?? 0;
  const rearTags: Tag[] = gate.filter((t) => t !== 'existing-rear');
  if (rearYard < MIN_ADDITION_DEPTH_FT + CLEARANCE_FT) rearTags.unshift('space');
  else {
    if (rearYard - rearReq < MIN_ADDITION_DEPTH_FT) rearTags.push('rear-setback');
    if (!coverageOk(width * MIN_ADDITION_DEPTH_FT)) rearTags.push('coverage');
  }
  const rearDepth = Math.max(0, rearYard - rearReq);
  const rearFoot = Math.min(width * rearDepth, reforms.has('coverage') ? Infinity : Math.max(0, coverageLeft));
  const rear = result(rearTags, Math.min(rearFoot * stories, addMax));

  // Side addition (assumes no driveway on that side).
  const sideYard = p.sideYardMax;
  const sideDepth = Math.max(0, (p.houseDepth ?? 30) - 5);
  const sideTags: Tag[] = [...gate];
  if (sideYard == null || sideYard < MIN_ADDITION_WIDTH_FT) sideTags.unshift('space');
  else {
    if (sideYard - RULES.minSideYardFt < MIN_ADDITION_WIDTH_FT) sideTags.push('side-setback');
    if (!coverageOk(MIN_ADDITION_WIDTH_FT * sideDepth)) sideTags.push('coverage');
  }
  const sideFoot = Math.min(Math.max(0, (sideYard ?? 0) - RULES.minSideYardFt) * sideDepth, reforms.has('coverage') ? Infinity : Math.max(0, coverageLeft));
  const side = result(sideTags, Math.min(sideFoot * stories, addMax));

  // Backyard cottage, behind the house.
  const freeSide = Math.min(rearYard - 2 * CLEARANCE_FT, (p.lotWidth ?? 0) - 2 * CLEARANCE_FT);
  const ruleSide = reforms.has('cottage3') ? freeSide : (p.detachedMaxSquare ?? 0);
  const detTags: Tag[] = [...gate];
  if (freeSide < MIN_SQUARE_FT) detTags.unshift('space');
  else {
    if (ruleSide < MIN_SQUARE_FT) detTags.push('detached-setbacks');
    if (!coverageOk(MIN_ADU_SQFT)) detTags.push('coverage');
    // Behind the house without 20 ft of frontage: door ≤ 25 ft is not achievable,
    // so the Fire Department's alternative needs sprinklers + a 10 ft path.
    if (!reforms.has('firePath') && (p.sideYardMax ?? 0) < FIRE_PATH_FT) detTags.push('fire-path');
  }
  const detFoot = Math.min(
    detachedMax(p),
    ruleSide * ruleSide,
    reforms.has('coverage') ? Infinity : Math.max(0, coverageLeft),
  );
  const needsSprinklers = (p.sideYardMax ?? 0) < RULES.fireFrontageFt;
  const detached = result(detTags, Math.min(detFoot * RULES.detachedMaxStories, RULES.detachedMaxFloorPlateSqft * RULES.detachedMaxStories), needsSprinklers);

  return { internal, rear, side, detached };
}

/**
 * yes   = an addition or backyard cottage fits the rules (outdoor space is in the data)
 * maybe = only a conversion inside the house passes; depends on the attic/basement/layout,
 *         which city data can't see
 * no    = nothing passes
 */
export function lotStatus(r: Record<Family, FamilyResult>): LotStatus {
  if (r.rear.ok || r.side.ok || r.detached.ok) return 'yes';
  return r.internal.ok ? 'maybe' : 'no';
}

export function typesAllowed(r: Record<Family, FamilyResult>): number {
  return FAMILIES.filter((f) => r[f].ok).length;
}

export function largestSqft(r: Record<Family, FamilyResult>): number | null {
  const s = FAMILIES.map((f) => r[f].sqft).filter((x): x is number => x != null && x > 0);
  return s.length ? Math.max(...s) : null;
}

/** What stops one ADU type: physical space wins; otherwise the rule group, or "several". */
export function familyGroup(fr: FamilyResult): Group {
  if (fr.ok) return 'allowed';
  if (fr.tags.includes('space')) return 'space';
  const groups = new Set(fr.tags.map((t) => TAG_GROUP[t]));
  return groups.size === 1 ? [...groups][0] : 'several';
}

/**
 * The single thing holding a lot back from an addition or cottage (for the map).
 * 'allowed' when one already fits.
 */
export function lotFactor(r: Record<Family, FamilyResult>): Group {
  const outdoor = [r.rear, r.side, r.detached];
  if (outdoor.some((f) => f.ok)) return 'allowed';
  const groups = outdoor.map(familyGroup);
  if (groups.every((g) => g === 'space')) return 'space';
  // The type closest to being allowed: fewest non-space blockers.
  const candidates = outdoor
    .filter((f) => !f.tags.includes('space'))
    .sort((a, b) => new Set(a.tags.map((t) => TAG_GROUP[t])).size - new Set(b.tags.map((t) => TAG_GROUP[t])).size);
  return familyGroup(candidates[0]);
}

/** Every on/off combination of the reforms, as a bitmask index (bit i = REFORMS[i]). */
export function reformsFromMask(mask: number): Set<Reform> {
  return new Set(REFORMS.filter((_, i) => mask & (1 << i)));
}
