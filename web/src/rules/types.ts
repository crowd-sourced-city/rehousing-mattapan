/** A parcel record as written by web/scripts/build_data.py. null = not known. */
export interface Parcel {
  id: string;
  address: string | null;
  zip: string;
  zoning: string | null;
  zoningDesc: string | null;
  landUse: string | null;
  units: number | null;
  condo: boolean;
  ownerOccupiedRecord: boolean;
  lotArea: number | null;
  lotWidth: number | null;
  lotDepth: number | null;
  irregular: boolean | null;
  corner: boolean | null;
  nearPark: boolean;
  floodZone: boolean;
  ndod: boolean;
  coastalOverlay: boolean;
  buildingCount: number;
  coveragePct: number | null;
  totalFootprint: number | null;
  houseFootprint: number | null;
  houseWidth: number | null;
  houseDepth: number | null;
  houseHeight: number | null;
  stories: number | null;
  grossArea: number | null;
  livingArea: number | null;
  yearBuilt: number | null;
  frontYard: number | null;
  rearYard: number | null;
  rearYardArea: number | null;
  sideYardMin: number | null;
  sideYardMax: number | null;
  sideLeft: number | null;
  sideRight: number | null;
  fireTravel: number | null;
  garageSqft: number | null;
  garageFrontDist: number | null;
  garageFarDist: number | null;
  garageToHouse: number | null;
  garageToLotLine: number | null;
  envelopeFitsAttached: boolean | null;
  envelopeFitsDetached: boolean | null;
  detachedMaxSquare: number | null;
  /** Site-plan drawing only: garage extent in the lot frame, ft
   *  [from front near, from front far, from left near, from left far]. */
  garagePlan?: [number, number, number, number] | null;
  /** Site-plan drawing only: centre of the detached-ADU spot [from front, from left], ft. */
  detachedSpot?: [number, number] | null;
  lat: number;
  lon: number;
}

export type YesNoUnsure = 'yes' | 'no' | 'unsure';

/** Answers from the shared property-details form (Screen 2c). */
export interface PropertyAnswers {
  ownerOccupies?: YesNoUnsure;
  ownedByLlc?: YesNoUnsure;
  units?: number; // confirmed number of homes on the property
  stories?: number; // confirmed stories
  existingAdu?: 'none' | 'internal' | 'detached' | 'both';
  sprinklered?: YesNoUnsure;
  hasBasement?: YesNoUnsure;
  hasAttic?: YesNoUnsure;
  hasGarage?: YesNoUnsure;
}

/** Answers to option-specific questions, keyed by option then question. */
export type OptionAnswers = Record<string, string | number | undefined>;

export type Status = 'possible' | 'info' | 'closer' | 'notsupported' | 'unavailable';

export type ReasonKind = 'supports' | 'issue' | 'missing' | 'confirm' | 'notsupported';

export interface Reason {
  kind: ReasonKind;
  title: string;
  body: string;
}

export interface Metric {
  label: string;
  value: string;
  note: string;
}

/** One rule check as shown in the "How we reached this result" overlay. */
export interface TraceStep {
  rule: string;
  result: 'pass' | 'fail' | 'unknown' | 'flag' | 'info';
  detail: string;
  source: string; // e.g. "City data · parcel map", "Your answer", "Article 60 Table 6"
}

export interface OptionResult {
  status: Status;
  summary: string; // the lead sentence
  factor: string; // "Most important factor"
  metrics: Metric[];
  reasons: Reason[];
  nextSteps: string[];
  trace: TraceStep[];
  /** Plan diagram parameters for this result (dimensions in feet). */
  plan?: PlanSpec;
}

/** Early, data-only indication on the overview card and the Explore screen. */
export interface Preliminary {
  status: Status;
  text: string;
}

export interface PlanSpec {
  kind: 'rear' | 'side' | 'corner' | 'garage' | 'detached' | 'front' | 'internal' | 'attic' | 'basement' | 'floor';
  lotWidth: number;
  lotDepth: number;
  houseWidth: number;
  houseDepth: number;
  frontYard: number;
  aduWidth?: number;
  aduDepth?: number;
  aduSide?: 'left' | 'right';
  /** Measured side yards (ft); place the house left-to-right. Centred if missing. */
  sideLeft?: number | null;
  sideRight?: number | null;
  /** Existing garage in the lot frame (ft from front / left lot lines). */
  garage?: { frontNear: number; frontFar: number; leftNear: number; leftFar: number } | null;
  /** Centre of the spot where the detached-ADU calculation found room (ft). */
  detachedSpot?: { fromFront: number; fromLeft: number } | null;
  requiredRear?: number;
  conflict?: boolean;
  caption?: string;
}
