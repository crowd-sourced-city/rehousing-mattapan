import { LOT_BANDS, RULES } from './constants';
import type { Parcel, PropertyAnswers, TraceStep } from './types';

export type LotSize = 'small' | 'medium' | 'large';

/** Guidebook lot-size guide / MIRO Z-22: width at the street. */
export function lotSize(p: Parcel): LotSize | null {
  if (p.lotWidth == null) return null;
  if (p.lotWidth < LOT_BANDS.smallMaxFt) return 'small';
  if (p.lotWidth < LOT_BANDS.mediumMaxFt) return 'medium';
  return 'large';
}

export const LOT_SIZE_LABEL: Record<LotSize, string> = {
  small: 'Smaller lot',
  medium: 'Medium lot',
  large: 'Larger lot',
};

/** Coverage cap: 60% under 5,000 sf, 50% at or above (Article 60 Table 6). */
export function coverageCap(lotArea: number): number {
  return lotArea < RULES.coverageLotSizeBreakSqft ? RULES.coverageSmallLotPct : RULES.coverageLargeLotPct;
}

export function effectiveUnits(p: Parcel, a: PropertyAnswers): number | null {
  return a.units ?? p.units;
}
export function effectiveStories(p: Parcel, a: PropertyAnswers): number | null {
  return a.stories ?? p.stories;
}

/**
 * Why a parcel can't use the tool at all (shown as a stop screen), or null.
 * These are "the tool doesn't cover this" cases — distinct from "not possible".
 */
export type Unsupported = 'outside' | 'irregular' | 'nodata' | 'condo' | 'notresidential';

export function unsupportedReason(p: Parcel): Unsupported | null {
  if (p.zoning !== 'R1' && p.zoning !== 'R2') return 'outside';
  if (p.condo) return 'condo';
  if (p.units == null) return 'notresidential';
  if (p.irregular) return 'irregular';
  if (p.frontYard == null || p.rearYard == null || p.lotWidth == null) return 'nodata';
  return null;
}

export interface SiteCheck {
  /** false → "As-of-right ADU not possible" screen */
  eligible: boolean;
  /** Failing checks, in the order Article 60 lists them. */
  failures: TraceStep[];
  trace: TraceStep[];
  /** Flags that may trigger extra review but don't block. */
  flags: { key: 'flood' | 'park' | 'ndod'; label: string; body: string }[];
  /** The owner must live there for ANY ADU (Article 2 ADU definition). */
  ownerOccupancyIssue: boolean;
  unitsAfterAdu: number | null;
}

const fmt = (n: number | null | undefined, d = 0) =>
  n == null ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });

/**
 * Article 60 Table 6 site check for lots adding ADUs (MIRO Z-01…Z-21).
 * Run only on parcels that passed unsupportedReason().
 */
export function siteCheck(p: Parcel, a: PropertyAnswers): SiteCheck {
  const trace: TraceStep[] = [];
  const push = (s: TraceStep) => (trace.push(s), s);
  const z = p.zoning as 'R1' | 'R2';
  const units = effectiveUnits(p, a);
  const maxUnits = RULES.maxUnitsWithAdu[z];
  push({
    rule: `Zoning subdistrict is R1 or R2`,
    result: 'pass',
    detail: `${p.zoningDesc ?? z}. Mattapan allows internal, attached and detached ADUs as-of-right here.`,
    source: 'City zoning map · Article 60',
  });
  push(
    units == null
      ? { rule: 'Room for one more home', result: 'unknown', detail: 'Number of homes unknown.', source: 'Assessor records' }
      : {
          rule: 'Room for one more home',
          result: units + 1 <= maxUnits ? 'pass' : 'fail',
          detail: `${units} home${units === 1 ? '' : 's'} today + 1 ADU = ${units + 1}. ${z} allows up to ${maxUnits} including ADUs.`,
          source: a.units != null ? 'Your answer' : 'Assessor land use (1/2/3-family)',
        },
  );
  const cap = coverageCap(p.lotArea ?? 0);
  push({
    rule: `Lot coverage under ${cap}%`,
    result: (p.coveragePct ?? 0) <= cap ? 'pass' : 'fail',
    detail: `Buildings cover about ${fmt(p.coveragePct)}% of your ${fmt(p.lotArea)} sq ft lot. Limit is ${cap}% on lots ${
      (p.lotArea ?? 0) < RULES.coverageLotSizeBreakSqft ? 'under' : 'of'
    } 5,000 sq ft${(p.lotArea ?? 0) < RULES.coverageLotSizeBreakSqft ? '' : ' or more'}.`,
    source: 'Building footprints ÷ parcel area',
  });
  push({
    rule: `At least ${RULES.minPermeablePct}% unpaved ground`,
    result: 'unknown',
    detail: 'City data doesn’t show paved areas, so we can’t check this. A survey or site plan will.',
    source: 'Not in city data',
  });
  push({
    rule: `Front yard at least ${RULES.minFrontYardFt} ft`,
    result: (p.frontYard ?? 0) >= RULES.minFrontYardFt ? 'pass' : 'fail',
    detail: `About ${fmt(p.frontYard)} ft from the front lot line to your house.`,
    source: 'Estimated from parcel and building footprints',
  });
  if (p.sideYardMin == null) {
    push({ rule: `Side yards at least ${RULES.minSideYardFt} ft`, result: 'unknown', detail: 'Side yards could not be measured.', source: 'Parcel map' });
  } else {
    push({
      rule: `Side yards at least ${RULES.minSideYardFt} ft`,
      result: p.sideYardMin >= RULES.minSideYardFt ? 'pass' : 'fail',
      detail: `Your narrower side yard is about ${fmt(p.sideYardMin, 1)} ft; the wider is about ${fmt(p.sideYardMax, 1)} ft.`,
      source: 'Estimated from parcel and building footprints',
    });
  }
  push({
    rule: `Rear yard at least ${RULES.minRearYardFt} ft`,
    result: (p.rearYard ?? 0) >= RULES.minRearYardFt ? 'pass' : 'fail',
    detail: `About ${fmt(p.rearYard)} ft from the back of your house to the rear lot line.`,
    source: 'Estimated from parcel and building footprints',
  });
  push({
    rule: `Building ${RULES.maxBuildingHeightFt} ft or lower`,
    result: p.houseHeight == null ? 'unknown' : p.houseHeight <= RULES.maxBuildingHeightFt ? 'pass' : 'fail',
    detail: p.houseHeight == null ? 'Height not in city data.' : `City data estimates your house at about ${fmt(p.houseHeight)} ft.`,
    source: 'Building footprints (roof height)',
  });
  const st = effectiveStories(p, a);
  push({
    rule: `${RULES.maxStories} stories or fewer`,
    result: st == null ? 'unknown' : st <= RULES.maxStories ? 'pass' : 'fail',
    detail: st == null ? 'Stories not on record.' : `${fmt(st, 1).replace('.0', '')} stories.`,
    source: a.stories != null ? 'Your answer' : 'Assessor records',
  });
  push({
    rule: `Street frontage at least ${RULES.minLotFrontageFt} ft`,
    result: (p.lotWidth ?? 0) >= RULES.minLotFrontageFt ? 'pass' : 'fail',
    detail: `About ${fmt(p.lotWidth)} ft along the street.`,
    source: 'Parcel map',
  });

  const flags: SiteCheck['flags'] = [];
  if (p.floodZone)
    flags.push({ key: 'flood', label: 'Mapped flood hazard area', body: 'An ADU must sit above the base flood elevation. This matters most for basements.' });
  if (p.nearPark)
    flags.push({
      key: 'park',
      label: 'Within 100 ft of a park',
      body: 'Building near a park or parkway needs Boston Parks Commission approval before a permit (City Ordinance 7-4.11).',
    });
  if (p.ndod)
    flags.push({ key: 'ndod', label: 'Neighborhood Design Overlay District', body: 'Exterior changes may need design review.' });
  for (const f of flags) push({ rule: f.label, result: 'flag', detail: f.body, source: 'City and FEMA map layers' });

  const failures = trace.filter((t) => t.result === 'fail');
  return {
    eligible: failures.length === 0,
    failures,
    trace,
    flags,
    ownerOccupancyIssue: a.ownerOccupies === 'no' || a.ownedByLlc === 'yes',
    unitsAfterAdu: units == null ? null : units + 1,
  };
}

/**
 * Map shading category for a parcel, derived from unsupportedReason() so the
 * map always agrees with what the tool will do when the lot is selected.
 *  - covered: R1/R2 1–3 family home the tool can assess
 *  - pending: a home the tool can't assess yet (irregular lot, missing data, condo)
 *  - other:   outside R1/R2, or not a 1–3 family home
 */
export type MapCategory = 'covered' | 'pending' | 'other';
export function mapCategory(p: Parcel | undefined): MapCategory {
  if (!p) return 'other';
  const u = unsupportedReason(p);
  if (!u) return 'covered';
  return u === 'outside' || u === 'notresidential' ? 'other' : 'pending';
}
