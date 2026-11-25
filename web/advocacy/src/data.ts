/**
 * Loads the shared parcel shapes and the pre-computed advocacy analysis
 * (written by advocacy/scripts/analyze.ts). Paths are relative to this page,
 * which is served one folder below the site root (…/advocacy/).
 */
import type { Family, Group, Reform, Tag } from '../scripts/analysis';

export type { Family, Group, Reform, Tag };

/** Per-lot record from lots.json. s: Y yes · M maybe · N no · A not assessed · O out of scope. */
export interface Lot {
  /** Street address (in-scope lots only). */
  a?: string | null;
  s: 'Y' | 'M' | 'N' | 'A' | 'O';
  /** ADU types allowed today (0–4). */
  n?: number;
  /** Largest ADU allowed today, sq ft. */
  m?: number | null;
  /** What holds the lot back from an addition or cottage. */
  f?: Group;
  /** Status letter for each reform combination (index = bitmask). */
  sc?: string;
  /** Number of ADU types for each reform combination. */
  nc?: string;
  /** Per ADU type: size (allowed) or the list of blocking tags. */
  t?: Record<Family, number | Tag[]>;
}

export interface Summary {
  generated: string;
  funnel: { parcels: number; inR1R2Homes: number; assessable: number; passSiteCheck: number; yes: number; maybe: number; no: number };
  typesHist: number[];
  sizeBuckets: Record<string, number>;
  factor: Record<string, number>;
  familyGroups: Record<Family, Partial<Record<Group, number>>>;
  familyTags: Record<Family, Partial<Record<Tag, number>>>;
  sprinklers: { internalAllowed: number; internalNeedsSprinklers: number; cottageAllowed: number; cottageNeedsSprinklers: number };
  reforms: Reform[];
  reformImpact: { reform: Reform; yes: number; anyAdu: number }[];
  allReforms: { gainYes: number; gainAnyAdu: number; counts: { yes: number; maybe: number; no: number } };
  withGrandfather: { reform: Reform; yes: number }[];
  scenarioCounts: { yes: number; maybe: number; no: number }[];
  familyScenario: Record<Family, number>[];
}

const DATA = '../data/';

export async function loadAll() {
  const [shapes, lotsFile, summary, streets] = await Promise.all([
    fetch(`${DATA}parcels.geojson`).then((r) => r.json() as Promise<GeoJSON.FeatureCollection>),
    fetch(`${DATA}advocacy/lots.json`).then((r) => r.json() as Promise<{ reforms: Reform[]; lots: Record<string, Lot> }>),
    fetch(`${DATA}advocacy/summary.json`).then((r) => r.json() as Promise<Summary>),
    fetch(`${DATA}streets.geojson`).then((r) => r.json() as Promise<GeoJSON.FeatureCollection>),
  ]);
  // Join each shape with its analysis so map styles can read plain properties.
  for (const f of shapes.features) {
    const id = String(f.properties?.id);
    const l = lotsFile.lots[id] ?? { s: 'O' };
    f.properties = { id, s: l.s, n: l.n ?? -1, m: l.m ?? 0, f: l.f ?? '' };
  }
  return { shapes, lots: lotsFile.lots, reforms: lotsFile.reforms, summary, streets };
}

export type Loaded = Awaited<ReturnType<typeof loadAll>>;
