/**
 * Map layers: colour rules (MapLibre expressions) and legends, in one place.
 *
 * Colour jobs (dataviz method; palettes checked with its validator, see ../README.md):
 *  - Blue always means "possible": yes/maybe in the first map, the types ramp, "allowed" in charts.
 *  - Orange means "no", and is also the colour of the main reason for no:
 *    the existing house not meeting today's rules.
 *  - Size is a second magnitude, so it gets its own single-hue ramp (teal).
 *  - Limiting factors: orange / violet / aqua (all-pairs safe for colour-blind readers);
 *    neutral greys for "not enough space" and "several rules", so physical limits never
 *    look like a rule. Red–green is avoided entirely.
 */
import type { ExpressionSpecification } from 'maplibre-gl';

export interface LegendItem {
  color: string;
  label: string;
  /** property value(s) this item covers, for counting */
  key?: string;
}
export interface LayerDef {
  id: string;
  title: string;
  question: string;
  fill: ExpressionSpecification;
  legend: LegendItem[];
}

export const NEUTRAL = {
  out: '#ecebe6', // not a 1–3 family home in R1/R2: background
  unassessed: '#d3cec6', // the tool can't assess this lot yet
  zero: '#e2ded7',
  street: '#ffffff',
  bg: '#f6f5f1',
};

/** yes stays the same mid blue under reforms; newly unlocked lots turn navy; maybe is clearly lighter. */
export const STATUS = { yes: '#2a78d6', maybe: '#b7d3f6', no: '#eb6834', newly: '#0d366b', wasYes: '#2a78d6' };

/** Sequential ramps, light → dark: blue (how many types), teal (how big). */
export const BLUE = ['#cde2fb', '#86b6ef', '#3987e5', '#1c5cab'];
export const TEAL = ['#c9eee0', '#80d2b4', '#1baf7a', '#0f7356'];

export const FACTOR = {
  allowed: '#cde2fb',
  existing: '#eb6834',
  setbacks: '#6250d6',
  other: '#1baf7a', // lot-coverage cap or unit cap
  fire: '#eda100', // fire code (charts only: never a lot's single main blocker)
  several: '#5b5954',
  space: '#b9b4ab',
};

const scopeFallback = (inner: ExpressionSpecification): ExpressionSpecification => [
  'match',
  ['get', 's'],
  'O',
  NEUTRAL.out,
  'A',
  NEUTRAL.unassessed,
  inner,
];

const COMMON_LEGEND: LegendItem[] = [
  { color: NEUTRAL.unassessed, label: 'Home the tool can’t assess yet (irregular lot, condo)', key: 'A' },
  { color: NEUTRAL.out, label: 'Not a 1–3 family home in R1/R2', key: 'O' },
];

export const POSSIBLE: LayerDef = {
  id: 'possible',
  title: 'ADU possible?',
  question: 'Could this lot add an ADU under today’s rules?',
  fill: scopeFallback(['match', ['get', 's'], 'Y', STATUS.yes, 'M', STATUS.maybe, STATUS.no]),
  legend: [
    { color: STATUS.yes, label: 'Yes: an addition or backyard cottage fits', key: 'Y' },
    { color: STATUS.maybe, label: 'Maybe: only a conversion inside the house', key: 'M' },
    { color: STATUS.no, label: 'No: no ADU type is allowed', key: 'N' },
    ...COMMON_LEGEND,
  ],
};

export const TYPES: LayerDef = {
  id: 'types',
  title: 'How many kinds of ADU',
  question: 'Of 4 ADU types (inside, rear, side, backyard), how many are allowed?',
  fill: scopeFallback(['match', ['get', 'n'], 0, NEUTRAL.zero, 1, BLUE[0], 2, BLUE[1], 3, BLUE[2], 4, BLUE[3], NEUTRAL.zero]),
  legend: [
    { color: BLUE[3], label: 'All 4 types', key: '4' },
    { color: BLUE[2], label: '3 types', key: '3' },
    { color: BLUE[1], label: '2 types', key: '2' },
    { color: BLUE[0], label: '1 type', key: '1' },
    { color: NEUTRAL.zero, label: 'None', key: '0' },
    ...COMMON_LEGEND,
  ],
};

export const SIZE: LayerDef = {
  id: 'size',
  title: 'How big an ADU',
  question: 'Largest ADU allowed on the lot (any type), in square feet.',
  fill: scopeFallback([
    'case',
    ['<=', ['get', 'm'], 0],
    NEUTRAL.zero,
    ['<', ['get', 'm'], 750],
    TEAL[0],
    ['<', ['get', 'm'], 1000],
    TEAL[1],
    ['<', ['get', 'm'], 1250],
    TEAL[2],
    TEAL[3],
  ]),
  legend: [
    { color: TEAL[3], label: '1,250 sq ft or more (roughly 3 bedrooms)' },
    { color: TEAL[2], label: '1,000–1,250 sq ft' },
    { color: TEAL[1], label: '750–1,000 sq ft (roughly 2 bedrooms)' },
    { color: TEAL[0], label: 'Under 750 sq ft (studio / 1 bedroom)' },
    { color: NEUTRAL.zero, label: 'No ADU allowed' },
    ...COMMON_LEGEND,
  ],
};

export const FACTOR_LAYER: LayerDef = {
  id: 'factor',
  title: 'What’s holding it back',
  question: 'What stops an addition or backyard cottage on this lot?',
  fill: scopeFallback([
    'match',
    ['get', 'f'],
    'allowed',
    FACTOR.allowed,
    'existing',
    FACTOR.existing,
    'setbacks',
    FACTOR.setbacks,
    'fire',
    FACTOR.fire,
    ['coverage', 'units'],
    FACTOR.other,
    'several',
    FACTOR.several,
    'space',
    FACTOR.space,
    NEUTRAL.zero,
  ]),
  legend: [
    { color: FACTOR.existing, label: 'The existing house doesn’t meet today’s yard rules', key: 'existing' },
    { color: FACTOR.setbacks, label: 'Setbacks for the new ADU', key: 'setbacks' },
    { color: FACTOR.other, label: 'Lot-coverage cap or unit cap', key: 'other' },
    { color: FACTOR.several, label: 'Several rules at once', key: 'several' },
    { color: FACTOR.space, label: 'Not enough physical space', key: 'space' },
    { color: FACTOR.allowed, label: 'Nothing: an addition or cottage fits', key: 'allowed' },
    ...COMMON_LEGEND,
  ],
};

export const SMALL_MULTIPLES = [POSSIBLE, TYPES, SIZE, FACTOR_LAYER];

/**
 * Bivariate "opportunity" layer: how many types (rows) × how big (columns).
 * 3×3 grid from Joshua Stevens' blue–pink scheme; corners read as
 * "few, small" (light) → "many, large" (dark).
 */
export const BIVARIATE = [
  // rows: types 1–2 / 3 / 4  ·  columns: size <1,000 / 1,000–1,250 / ≥1,250
  ['#e8e8e8', '#dfb0d6', '#be64ac'],
  ['#ace4e4', '#a5add3', '#8c62aa'],
  ['#5ac8c8', '#5698b9', '#3b4994'],
];
const sizeCol: ExpressionSpecification = ['case', ['<', ['get', 'm'], 1000], 0, ['<', ['get', 'm'], 1250], 1, 2];
const typeRow: ExpressionSpecification = ['case', ['<=', ['get', 'n'], 2], 0, ['==', ['get', 'n'], 3], 1, 2];
export const BIVARIATE_FILL: ExpressionSpecification = scopeFallback([
  'case',
  ['<=', ['get', 'n'], 0],
  NEUTRAL.zero,
  [
    'match',
    ['+', ['*', typeRow, 3], sizeCol],
    0, BIVARIATE[0][0], 1, BIVARIATE[0][1], 2, BIVARIATE[0][2],
    3, BIVARIATE[1][0], 4, BIVARIATE[1][1], 5, BIVARIATE[1][2],
    6, BIVARIATE[2][0], 7, BIVARIATE[2][1], 8, BIVARIATE[2][2],
    NEUTRAL.zero,
  ],
]);
