import { RULES } from './constants';
import { buildingCodeSprinkler, fireAccess } from './fire';
import { coverageCap, effectiveStories, effectiveUnits, type LotSize } from './site';
import type {
  Metric,
  OptionAnswers,
  OptionResult,
  Parcel,
  PlanSpec,
  Preliminary,
  PropertyAnswers,
  Reason,
  TraceStep,
} from './types';

export type OptionId =
  | 'split'
  | 'attic'
  | 'floor'
  | 'basement'
  | 'rear-small'
  | 'rear-medium'
  | 'corner'
  | 'side'
  | 'garage'
  | 'backyard'
  | 'front';

export type AduType = 'Internal ADU' | 'Attached ADU' | 'Detached ADU';

export interface QuestionChoice {
  value: string;
  label: string;
}
export interface Question {
  id: string;
  group: string; // "Your plans" / "Your property" / "About your home"
  text: string;
  help?: string;
  choices: QuestionChoice[];
  /** Explains why we ask (shown in an expandable). */
  why?: string;
  /** Shared property answer this question reads/writes instead of option answers. */
  shared?: keyof PropertyAnswers;
}

export interface OptionDef {
  id: OptionId;
  name: string;
  type: AduType;
  lots: LotSize[];
  blurb: string; // short card description
  lead: string; // Explore page description
  bedrooms: '0-1' | '1-2' | '2-3'; // Guidebook "Choose your own ADUventure"
  guidebookPage: number;
  questions: Question[];
  professionalChecks: string[];
  preliminary: (p: Parcel, a: PropertyAnswers) => Preliminary;
  evaluate: (p: Parcel, a: PropertyAnswers, o: OptionAnswers) => OptionResult;
  /** "What we already know" tiles on the Explore screen. */
  known: (p: Parcel, a: PropertyAnswers) => Metric[];
}

// ---------------------------------------------------------------- helpers

const n0 = (v: number | null | undefined) => (v == null ? '—' : Math.round(v).toLocaleString('en-US'));
const sq = (v: number | null | undefined) => `${n0(v)} sq ft`;
const ft = (v: number | null | undefined) => `${n0(v)} ft`;
const storiesLabel = (s: number | null) => (s == null ? 'unknown stories' : `${String(s).replace('.5', '½').replace('.0', '')} ${s === 1 ? 'story' : 'stories'}`);

const UNSURE: QuestionChoice = { value: 'unsure', label: 'I’m not sure' };
const YN: QuestionChoice[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  UNSURE,
];

const BEDROOMS_Q: Question = {
  id: 'bedrooms',
  group: 'Your plans',
  text: 'How many bedrooms would you want?',
  help: 'A studio for one person needs about 330 sq ft. Add about 100 sq ft for each extra person.',
  choices: [
    { value: '0', label: 'Studio' },
    { value: '1', label: '1 bedroom' },
    { value: '2', label: '2 bedrooms' },
    { value: '3', label: '3 bedrooms' },
    UNSURE,
  ],
  why: 'We use this to estimate how much floor space you’d need and compare it with the size limit.',
};

const SPRINKLER_Q: Question = {
  id: 'sprinklered',
  shared: 'sprinklered',
  group: 'Asked once · reused for other options',
  text: 'Does your house have a sprinkler system?',
  help: 'We’ll remember your answer for the other options.',
  choices: YN,
  why: 'Sprinklers let an ADU door be farther from the street (150 ft instead of 50 ft).',
};

/** Typical gross floor area for a number of bedrooms (Guidebook designs range 420–1,350 GSF). */
export function sqftForBedrooms(b: string | number | undefined): number | null {
  if (b == null || b === 'unsure') return null;
  const k = Number(b);
  return [450, 600, 850, 1100][Math.max(0, Math.min(3, k))];
}

/** Gross square footage of the principal unit used for the 75% rule. */
export function principalSqft(p: Parcel, a: PropertyAnswers): number | null {
  // Living area ÷ units approximates one principal unit; see ASSUMPTIONS.md.
  const units = effectiveUnits(p, a) ?? 1;
  const base = p.livingArea ?? (p.houseFootprint && effectiveStories(p, a) ? p.houseFootprint * (effectiveStories(p, a) as number) : null);
  return base == null ? null : base / units;
}

export function attachedMax(p: Parcel, a: PropertyAnswers): number | null {
  const pr = principalSqft(p, a);
  if (pr == null) return RULES.attachedMaxSqft;
  return Math.min(RULES.attachedMaxPctOfPrincipal * pr, RULES.attachedMaxSqft);
}

export function detachedMax(p: Parcel): number {
  return Math.min(RULES.detachedMaxFloorPlateSqft, p.houseFootprint ?? RULES.detachedMaxFloorPlateSqft);
}

function remainingCoverageSqft(p: Parcel): number | null {
  if (p.lotArea == null || p.totalFootprint == null) return null;
  return (coverageCap(p.lotArea) / 100) * p.lotArea - p.totalFootprint;
}

/** Diagram inputs shared by every option and the overview cards. See ASSUMPTIONS.md (Site plan diagrams). */
export function basePlan(p: Parcel, kind: PlanSpec['kind']): PlanSpec {
  const g = p.garagePlan;
  return {
    kind,
    lotWidth: p.lotWidth ?? 50,
    lotDepth: p.lotDepth ?? 100,
    houseWidth: Math.min(p.houseWidth ?? 30, (p.lotWidth ?? 50) - 2),
    houseDepth: p.houseDepth ?? 35,
    frontYard: p.frontYard ?? 15,
    sideLeft: p.sideLeft,
    sideRight: p.sideRight,
    garage: g ? { frontNear: g[0], frontFar: g[1], leftNear: g[2], leftFar: g[3] } : null,
    detachedSpot: p.detachedSpot ? { fromFront: p.detachedSpot[0], fromLeft: p.detachedSpot[1] } : null,
  };
}

interface Builder {
  reasons: Reason[];
  trace: TraceStep[];
  metrics: Metric[];
  next: string[];
}
const builder = (): Builder => ({ reasons: [], trace: [], metrics: [], next: [] });

const unitsAllowsAdu = (p: Parcel, a: PropertyAnswers) => {
  const u = effectiveUnits(p, a);
  const max = RULES.maxUnitsWithAdu[p.zoning ?? 'R1'] ?? 3;
  return u == null ? null : u + 1 <= max;
};

/** Reason shared by attached/internal options when the ADU would make 3+ units. */
function buildingCodeReason(p: Parcel, a: PropertyAnswers, b: Builder) {
  const need = buildingCodeSprinkler(effectiveUnits(p, a), false);
  if (need) {
    b.reasons.push({
      kind: 'issue',
      title: 'Sprinklers needed in the ADU (building code)',
      body: `With ${effectiveUnits(p, a)} homes in your building today, adding an ADU makes ${(effectiveUnits(p, a) ?? 0) + 1}. Buildings with 3 or more homes need sprinklers where the new home is created.`,
    });
    b.trace.push({ rule: 'Building code: 3+ homes in one building', result: 'flag', detail: 'Sprinklers required in the ADU area.', source: 'IEBC 1012.2.1 / 780 CMR 903.2' });
  }
  return need;
}

// ---------------------------------------------------------------- options

const split: OptionDef = {
  id: 'split',
  name: 'Split Your Unit',
  type: 'Internal ADU',
  lots: ['small'],
  blurb: 'Create a separate home inside the building you already have.',
  lead: 'Create a separate home inside the building you already have — for example on one floor — without building outward.',
  bedrooms: '0-1',
  guidebookPage: 41,
  questions: [
    {
      id: 'fitsInside',
      group: 'Your plans',
      text: 'Could the new home fit inside your existing building, without extending it?',
      help: 'Think about which floor or part of the house it might use.',
      choices: YN,
      why: 'An internal ADU uses only space you already have. If you need to build outward, look at an attached option instead.',
    },
    {
      id: 'selfContained',
      group: 'Your plans',
      text: 'Would the new home have its own kitchen and bathroom?',
      choices: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No, it would share' }, UNSURE],
      why: 'An ADU must be self-contained: its own kitchen, bathroom and living space.',
    },
    {
      id: 'entrance',
      group: 'Your plans',
      text: 'Where might someone enter the new home?',
      help: 'Any of these is a reasonable starting point — we’ll tell you what needs checking.',
      choices: [
        { value: 'own', label: 'Its own outside door' },
        { value: 'shared', label: 'A shared entry hall or stairway' },
        { value: 'through', label: 'Through the main home' },
        UNSURE,
      ],
      why: 'Mattapan’s zoning defines an ADU as having its own separate entrance.',
    },
  ],
  professionalChecks: [
    'Whether the entrance and exits meet building and fire codes',
    'How the two homes are separated for fire safety',
    'Whether the layout works structurally',
  ],
  preliminary: (p, a) =>
    unitsAllowsAdu(p, a) === false
      ? { status: 'notsupported', text: 'Your lot already has the most homes allowed.' }
      : { status: 'info', text: 'This depends on your layout and plans, which city records can’t show. Three quick questions will tell us more.' },
  known: (p, a) => [
    { label: 'Your home', value: `${sq(p.livingArea)} · ${storiesLabel(effectiveStories(p, a))}`, note: 'Assessor records' },
    { label: 'Homes on the property', value: String(effectiveUnits(p, a) ?? '—'), note: 'Assessor land use' },
    { label: 'Building footprint', value: sq(p.houseFootprint), note: 'Building footprints' },
  ],
  evaluate: (p, a, o) => {
    const b = builder();
    const plan = { ...basePlan(p, 'internal'), caption: 'The new home (pink) sits inside the existing building.' };
    b.metrics.push(
      { label: 'Your home', value: sq(p.livingArea), note: 'Living area, assessor records' },
      { label: 'Homes after', value: String((effectiveUnits(p, a) ?? 0) + 1), note: `Limit ${RULES.maxUnitsWithAdu[p.zoning ?? 'R1']} in ${p.zoning}` },
      { label: 'Extra floor space', value: 'None', note: 'Uses space you already have' },
    );
    b.trace.push({ rule: 'Internal ADU: inside the existing envelope', result: o.fitsInside === 'yes' ? 'pass' : o.fitsInside === 'no' ? 'fail' : 'unknown', detail: 'Your answer.', source: 'Your answer' });
    if (o.fitsInside === 'no') {
      return {
        status: 'notsupported',
        summary: 'As proposed, the new home would need space outside your existing building, so it wouldn’t be an internal ADU.',
        factor: 'An internal ADU must fit inside the building you already have.',
        metrics: b.metrics,
        reasons: [{ kind: 'notsupported', title: 'Needs to build outward', body: 'Compare Extend Into the Rear Yard or Add Another Floor, which add space.' }],
        nextSteps: ['Compare the attached options that add space.', 'Update your answers to see the new result.'],
        trace: b.trace,
        plan,
      };
    }
    b.trace.push({ rule: 'Self-contained (own kitchen and bathroom)', result: o.selfContained === 'yes' ? 'pass' : o.selfContained === 'no' ? 'fail' : 'unknown', detail: 'Your answer.', source: 'Your answer' });
    if (o.selfContained === 'no') {
      return {
        status: 'notsupported',
        summary: 'As proposed, the new space would share a kitchen or bathroom with the main home, so it wouldn’t count as a separate dwelling.',
        factor: 'An ADU needs its own kitchen and bathroom.',
        metrics: b.metrics,
        reasons: [
          { kind: 'notsupported', title: 'Shared kitchen or bathroom', body: 'Article 2 defines an ADU as a self-contained dwelling unit. Shared space may instead be an “Extended Living Suite”.' },
        ],
        nextSteps: ['Consider whether a small kitchen and bathroom could fit.', 'Update your answers to see the new result.'],
        trace: b.trace,
        plan,
      };
    }
    const sprinkler = buildingCodeReason(p, a, b);
    const ent = o.entrance;
    b.trace.push({
      rule: 'Its own separate entrance',
      result: ent === 'own' ? 'pass' : ent === 'shared' ? 'unknown' : ent === 'through' ? 'fail' : 'unknown',
      detail: ent === 'shared' ? 'Shared entry hall — interpretation unresolved.' : 'Your answer.',
      source: 'Article 2 ADU definition',
    });
    if (ent === 'through') {
      return {
        status: 'notsupported',
        summary: 'As proposed, the only way in would be through the main home, so it wouldn’t have the separate entrance an ADU needs.',
        factor: 'An ADU needs its own separate entrance.',
        metrics: b.metrics,
        reasons: [{ kind: 'notsupported', title: 'No separate entrance', body: 'Mattapan’s zoning defines an ADU as having its own separate entrance.' }],
        nextSteps: ['Ask a designer whether a separate outside door or shared hall is possible.', 'Update your answers to see the new result.'],
        trace: b.trace,
        plan,
      };
    }
    if (o.fitsInside !== 'yes' || o.selfContained !== 'yes' || ent == null || ent === 'unsure') {
      const missing = [o.fitsInside !== 'yes' && 'whether it fits inside', o.selfContained !== 'yes' && 'its own kitchen and bathroom', (ent == null || ent === 'unsure') && 'the entrance'].filter(Boolean);
      return {
        status: 'info',
        summary: `We need to know ${missing.join(', ')} before we can assess this option.`,
        factor: 'Your layout and plans — city records can’t show the inside of your home.',
        metrics: b.metrics,
        reasons: [{ kind: 'missing', title: 'Your plans', body: 'Sketch where the new home and its door could go, then update your answers.' }, ...b.reasons],
        nextSteps: ['Sketch where the new home and its door would go.', 'Then use “Update my answers” to see your result change.'],
        trace: b.trace,
        plan,
      };
    }
    b.reasons.unshift({
      kind: 'supports',
      title: 'Self-contained home inside your building',
      body: 'A separate home with its own kitchen, bathroom and entrance matches how an ADU is defined.',
    });
    b.reasons.push({ kind: 'confirm', title: 'Exits and fire separation', body: 'A professional will check exits, alarms and the fire separation between the two homes.' });
    if (ent === 'shared') {
      b.reasons.push({ kind: 'confirm', title: 'Shared entry hall', body: 'Whether a shared hall counts as a separate entrance hasn’t been confirmed for Mattapan’s rules.' });
      return {
        status: 'closer',
        summary: 'Your plan sounds workable, but whether a shared entry hall counts as a separate entrance hasn’t been confirmed for Mattapan’s rules.',
        factor: 'Shared entry hall — the rule’s interpretation is unresolved.',
        metrics: b.metrics,
        reasons: b.reasons,
        nextSteps: ['Ask the City’s Planning Department whether a shared entry hall works for your building.', 'Ask a designer whether a separate outside door is possible, as a backup.'],
        trace: b.trace,
        plan,
      };
    }
    return {
      status: sprinkler ? 'closer' : 'possible',
      summary: sprinkler
        ? 'Splitting your unit fits the zoning checks we can run, but with 3 or more homes in the building the new home would need sprinklers.'
        : 'Based on what you told us, splitting your unit looks possible. Exits, fire safety and building code haven’t been checked yet — this isn’t permission to build.',
      factor: sprinkler ? 'Building code: 3 or more homes in one building need sprinklers.' : 'A separate home inside your building, with its own kitchen, bathroom and outside door, matches how an ADU is defined.',
      metrics: b.metrics,
      reasons: b.reasons,
      nextSteps: ['Sketch where the new home and its door would go.', 'Talk to a design professional about walls, exits and fire safety.', 'Ask the City how the new home is counted on your lot.'],
      trace: b.trace,
      plan,
    };
  },
};

function interiorSpaceOption(kind: 'attic' | 'basement'): OptionDef {
  const isAttic = kind === 'attic';
  const label = isAttic ? 'attic' : 'basement';
  const questions: Question[] = isAttic
    ? [
        {
          id: 'condition',
          group: 'About your home',
          text: 'Which best describes your attic?',
          choices: [
            { value: 'unfinished', label: 'Unfinished attic' },
            { value: 'finished', label: 'Finished or partly finished' },
            { value: 'none', label: 'No usable attic' },
            UNSURE,
          ],
          shared: undefined,
        },
        {
          id: 'bigEnough',
          group: 'About your home',
          text: 'Does your attic seem large enough for a small separate home?',
          help: 'Picture a large bedroom where an adult can stand up. Under a sloped roof, usually only the middle part is usable.',
          choices: YN,
          why: 'A one-person home needs about 330 sq ft with at least one 190 sq ft room. City data gives your footprint, but sloped roofs leave less usable floor.',
        },
        SPRINKLER_Q,
      ]
    : [
        {
          id: 'condition',
          group: 'About your home',
          text: 'Which best describes your basement?',
          choices: [
            { value: 'unfinished', label: 'Unfinished basement' },
            { value: 'finished', label: 'Finished or partly finished' },
            { value: 'none', label: 'No basement / crawl space' },
            UNSURE,
          ],
        },
        {
          id: 'ceiling',
          group: 'About your home',
          text: 'About how high is the ceiling at its lowest point?',
          help: 'Measure from the floor to the underside of the lowest beam or duct.',
          choices: [
            { value: 'high', label: '7 ft 6 in or more' },
            { value: 'low', label: 'Under 7 ft 6 in' },
            UNSURE,
          ],
          why: 'Living space needs at least 7 ft 6 in of headroom.',
        },
        {
          id: 'aboveGround',
          group: 'About your home',
          text: 'Is any part of the basement wall above the ground outside?',
          help: 'We’re only asking what you can see. Whether a window is big enough to exit through is for a professional.',
          choices: [
            { value: 'windows', label: 'Yes, with windows' },
            { value: 'yes', label: 'Yes, but no windows' },
            { value: 'no', label: 'No, fully below ground' },
            UNSURE,
          ],
          why: 'A basement home needs light, air and an emergency exit, usually a large window or door.',
        },
        SPRINKLER_Q,
      ];
  return {
    id: kind,
    name: isAttic ? 'Convert Your Attic' : 'Convert Your Basement',
    type: 'Internal ADU',
    lots: ['small'],
    blurb: isAttic ? 'Turn attic space into a separate home.' : 'Turn basement space into a separate home.',
    lead: isAttic
      ? 'Turn attic space into a separate home — if there’s enough room to stand, a safe way in and out, and the right fire protection.'
      : 'Turn basement space into a separate home. Ceiling height, a safe way out and water or flood risk matter most.',
    bedrooms: '1-2',
    guidebookPage: isAttic ? 47 : 61,
    questions,
    professionalChecks: isAttic
      ? ['Whether the headroom meets building code', 'Whether stairs and exits meet code', 'How far the ADU entrance really is from the street']
      : ['Whether a window or door meets emergency-exit rules', 'Groundwater and dampness', 'What flood-related work your property needs'],
    preliminary: (p, a) => {
      if (unitsAllowsAdu(p, a) === false) return { status: 'notsupported', text: 'Your lot already has the most homes allowed.' };
      const has = isAttic ? a.hasAttic : a.hasBasement;
      if (has === 'no') return { status: 'notsupported', text: `You told us there’s no ${label}.` };
      if (!isAttic && p.floodZone)
        return { status: 'closer', text: 'Your lot is in a mapped flood hazard area. That doesn’t rule out a basement home, but a professional may need to look at it.' };
      return {
        status: 'info',
        text: `City data gives your building’s footprint (about ${sq(p.houseFootprint)}), but that’s only a rough starting point. A few questions about your ${label} will tell us more.`,
      };
    },
    known: (p, a) => [
      { label: 'Building footprint', value: sq(p.houseFootprint), note: 'Rough upper limit for usable floor' },
      { label: 'Your home', value: storiesLabel(effectiveStories(p, a)), note: 'Assessor records' },
      isAttic
        ? { label: 'Front door to street', value: ft(p.frontYard), note: 'Estimated from maps' }
        : { label: 'Flood hazard area', value: p.floodZone ? 'Yes' : 'No', note: 'FEMA flood map' },
    ],
    evaluate: (p, a, o) => {
      const b = builder();
      const plan: PlanSpec = { ...basePlan(p, kind), caption: `The new home (pink) is in the ${label}.` };
      const units = effectiveUnits(p, a);
      b.metrics.push(
        { label: 'Building footprint', value: sq(p.houseFootprint), note: 'Usable floor will be less' },
        { label: 'Homes after', value: String((units ?? 0) + 1), note: `Limit ${RULES.maxUnitsWithAdu[p.zoning ?? 'R1']} in ${p.zoning}` },
        { label: 'Door to street', value: `About ${ft(p.frontYard)}`, note: 'Assumes the ADU entrance is near your front door' },
      );
      const has = isAttic ? a.hasAttic : a.hasBasement;
      if (o.condition === 'none' || has === 'no') {
        return {
          status: 'notsupported',
          summary: `There’s no usable ${label}, so this option doesn’t apply.`,
          factor: `An existing ${label} to convert.`,
          metrics: b.metrics,
          reasons: [{ kind: 'notsupported', title: `No ${label}`, body: 'Compare other options for your lot.' }],
          nextSteps: ['Compare other options above ground.'],
          trace: [{ rule: `Has a ${label}`, result: 'fail', detail: 'Your answer.', source: 'Your answer' }],
          plan,
        };
      }
      b.trace.push({ rule: `Has a ${label} to convert`, result: o.condition && o.condition !== 'unsure' ? 'pass' : 'unknown', detail: 'Your answer.', source: 'Your answer' });

      // Space: footprint proxy (MIRO comment: footprint is a reasonable proxy).
      const footprintOk = (p.houseFootprint ?? 0) >= RULES.minUnitSqftOnePerson;
      b.trace.push({
        rule: `Footprint can hold a ${RULES.minUnitSqftOnePerson} sq ft home`,
        result: footprintOk ? 'pass' : 'fail',
        detail: `Footprint about ${sq(p.houseFootprint)}.`,
        source: 'Building footprints',
      });
      if (!footprintOk) {
        return {
          status: 'notsupported',
          summary: `Your building’s footprint is smaller than the ${RULES.minUnitSqftOnePerson} sq ft a one-person home needs.`,
          factor: 'Minimum size of a home (efficiency dwelling unit).',
          metrics: b.metrics,
          reasons: [{ kind: 'notsupported', title: 'Too small', body: 'An efficiency unit needs a 190 sq ft room plus kitchen and bathroom — about 330 sq ft.' }],
          nextSteps: ['Compare options that add space.'],
          trace: b.trace,
          plan,
        };
      }
      const missing: Reason[] = [];
      if (isAttic) {
        if (o.bigEnough === 'no') {
          return {
            status: 'notsupported',
            summary: 'You told us the attic isn’t large enough for a small separate home.',
            factor: 'Usable floor area under the roof.',
            metrics: b.metrics,
            reasons: [{ kind: 'notsupported', title: 'Not enough usable space', body: 'Dormers can add headroom. A designer can tell you whether that’s realistic.' }],
            nextSteps: ['Ask a designer whether dormers could add enough space.', 'Compare Add Another Floor.'],
            trace: b.trace,
            plan,
          };
        }
        if (o.bigEnough !== 'yes')
          missing.push({ kind: 'missing', title: 'Usable attic space', body: 'The footprint isn’t a reliable guide under a sloped roof. Have a look from the hatch or stairs, or ask a designer to measure.' });
        else b.reasons.push({ kind: 'supports', title: 'Enough usable space', body: 'You told us the attic could hold a small home.' });
      } else {
        if (o.ceiling === 'low') {
          return {
            status: 'notsupported',
            summary: 'The ceiling is lower than 7 ft 6 in, the minimum the rules we use require, so this isn’t supported as proposed.',
            factor: 'Minimum ceiling height.',
            metrics: b.metrics,
            reasons: [{ kind: 'notsupported', title: 'Ceiling under 7 ft 6 in', body: 'Lowering the floor (excavating) can fix this, but adds significant cost.' }],
            nextSteps: ['Ask a contractor whether lowering the floor is realistic.', 'Compare other options.'],
            trace: [...b.trace, { rule: 'Ceiling at least 7 ft 6 in', result: 'fail', detail: 'Your answer.', source: 'Your answer' }],
            plan,
          };
        }
        b.trace.push({ rule: 'Ceiling at least 7 ft 6 in', result: o.ceiling === 'high' ? 'pass' : 'unknown', detail: 'Your answer.', source: 'Your answer' });
        if (o.ceiling !== 'high') missing.push({ kind: 'missing', title: 'Ceiling height', body: 'Measure the lowest point of the ceiling and update your answer.' });
        else b.reasons.push({ kind: 'supports', title: 'Enough headroom', body: 'Ceiling at least 7 ft 6 in.' });
        if (o.aboveGround === 'no') {
          return {
            status: 'notsupported',
            summary: 'A fully below-ground basement can’t provide the light, air and emergency exit a home needs without major work.',
            factor: 'A safe way out — usually a large window or door to outside.',
            metrics: b.metrics,
            reasons: [{ kind: 'notsupported', title: 'No above-ground wall', body: 'Window wells can sometimes help; ask a professional.' }],
            nextSteps: ['Ask a designer about window wells or an exterior stair.', 'Compare other options.'],
            trace: [...b.trace, { rule: 'Part of wall above ground (light and exit)', result: 'fail', detail: 'Your answer.', source: 'Your answer' }],
            plan,
          };
        }
        b.trace.push({ rule: 'Part of wall above ground (light and exit)', result: o.aboveGround === 'windows' || o.aboveGround === 'yes' ? 'pass' : 'unknown', detail: 'Your answer.', source: 'Your answer' });
        if (o.aboveGround == null || o.aboveGround === 'unsure') missing.push({ kind: 'missing', title: 'Windows and exit', body: 'Check whether part of the basement wall is above ground.' });
        else b.reasons.push({ kind: 'supports', title: 'Partly above ground', body: o.aboveGround === 'windows' ? 'Existing windows may provide light and an exit.' : 'A window could be added for light and an exit.' });
      }

      // Fire access: internal ADU, entrance assumed near the front door.
      const spr = a.sprinklered === 'yes' ? true : a.sprinklered === 'no' ? false : null;
      const fire = fireAccess({
        doorFt: p.frontYard,
        farWallFt: p.fireTravel,
        behind: false,
        frontage20: null,
        sprinklered: spr,
        detached: false,
      });
      b.trace.push(...fire.trace);
      if (fire.outcome === 'sprinkler' || fire.outcome === 'fail') {
        b.reasons.push({ kind: 'issue', title: fire.headline, body: fire.detail });
      } else if (fire.outcome === 'ok') {
        b.reasons.push({ kind: 'supports', title: 'Fire access', body: fire.detail });
      }
      if (isAttic && spr !== true) {
        b.reasons.push({
          kind: 'confirm',
          title: 'Stairs and second exit',
          body: 'An attic home in an unsprinklered building usually needs a second way out, often an outside stair. A professional will check this.',
        });
      }
      const bc = buildingCodeReason(p, a, b);
      if (!isAttic && p.floodZone) {
        b.reasons.push({ kind: 'issue', title: 'Mapped flood hazard area', body: 'An ADU must sit above the base flood elevation. This is an early screening signal, not a full assessment.' });
        b.trace.push({ rule: 'FEMA flood hazard area', result: 'flag', detail: 'In a mapped flood zone.', source: 'FEMA flood map' });
      }
      if (isAttic && a.sprinklered == null) missing.push({ kind: 'missing', title: 'Sprinklers', body: 'Tell us whether your building has sprinklers.' });
      b.reasons.push(...missing);
      if (missing.length) {
        return {
          status: 'info',
          summary: isAttic
            ? 'We need to know whether your attic has enough usable space before we can assess this option.'
            : `We need a little more about your basement (${missing.map((m) => m.title.toLowerCase()).join(', ')}) before we can assess this option.`,
          factor: missing[0].title + (isAttic ? ' — the footprint isn’t a reliable guide under a sloped roof.' : '.'),
          metrics: b.metrics,
          reasons: b.reasons,
          nextSteps: [isAttic ? 'Ask a designer to measure the usable attic space, or look from the hatch or stairs for a rough idea.' : 'Measure the lowest point of the ceiling and check the walls.', 'Then use “Update my answers” to see your result change.'],
          trace: b.trace,
          plan,
        };
      }
      const closer = (!isAttic && p.floodZone) || fire.outcome === 'sprinkler' || fire.outcome === 'fail' || bc === true || (isAttic && spr !== true);
      return {
        status: closer ? 'closer' : 'possible',
        summary: closer
          ? `Your ${label} meets the basic space checks we can run, but ${
              !isAttic && p.floodZone ? 'your property is in a mapped flood hazard area' : isAttic && spr !== true ? 'stairs and exits need a closer look' : 'sprinklers would be needed'
            }. A professional can tell you what that means for your project.`
          : `Based on what you told us, converting your ${label} looks possible. Exits, moisture and fire safety haven’t been checked — this isn’t permission to build.`,
        factor: closer ? (b.reasons.find((r) => r.kind === 'issue' || r.kind === 'confirm')?.title ?? 'A closer look is needed.') : isAttic ? 'Enough usable attic space.' : 'Enough ceiling height and part of the basement above ground.',
        metrics: b.metrics,
        reasons: b.reasons,
        nextSteps: isAttic
          ? ['Ask a designer to check headroom, stairs and exits.', 'Check whether you could get help paying for it.', 'Bring this summary to a consultation.']
          : p.floodZone
            ? ['Look up your flood zone on FEMA’s flood map.', 'Talk to a design professional with flood-resistant design experience.', 'Compare options above ground.']
            : ['Have a contractor or home inspector check for moisture.', 'Talk to a design professional about the exit window and layout.', 'Check whether you could get help paying for it.'],
        trace: b.trace,
        plan,
      };
    },
  };
}

const floor: OptionDef = {
  id: 'floor',
  name: 'Add Another Floor',
  type: 'Attached ADU',
  lots: ['small'],
  blurb: 'Build a new home on top of your existing building.',
  lead: 'Build a new home on top of your existing building, if there is room under the height limits and the structure can carry it.',
  bedrooms: '2-3',
  guidebookPage: 67,
  questions: [
    {
      id: 'confirmStories',
      group: 'From city records · please confirm',
      text: 'City records say your home has this many stories. Is that right?',
      help: 'A half story is usually an attic level under a sloped roof.',
      choices: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, UNSURE],
    },
    {
      id: 'heightKnown',
      group: 'From city records · please confirm',
      text: 'Do you know roughly how tall your home is?',
      help: 'Most people don’t, and that’s fine. A professional measurement may be needed.',
      choices: [
        { value: 'records', label: 'The city estimate sounds right' },
        { value: 'measured', label: 'A designer has measured it' },
        UNSURE,
      ],
    },
    { ...BEDROOMS_Q, why: 'We compare the floor space you’d want with the size limit for added ADUs.' },
  ],
  professionalChecks: [
    'Whether your building can structurally carry another floor',
    'How zoning measures your building’s height',
    'How the addition-height rule applies to a new top floor (unresolved)',
  ],
  preliminary: (p, a) => {
    const st = effectiveStories(p, a);
    if (unitsAllowsAdu(p, a) === false) return { status: 'notsupported', text: 'Your lot already has the most homes allowed.' };
    if (st != null && st + 1 > RULES.maxStories) return { status: 'notsupported', text: `A full extra floor would take your home to ${st + 1} stories — above the 3½-story limit.` };
    return {
      status: 'closer',
      text: `City records suggest your home is ${storiesLabel(st)} and about ${ft(p.houseHeight)} tall, so there may be room for one more floor. A rule about addition height needs a closer look.`,
    };
  },
  known: (p, a) => [
    { label: 'Stories', value: storiesLabel(effectiveStories(p, a)), note: 'Assessor records' },
    { label: 'Height', value: `About ${ft(p.houseHeight)}`, note: 'Building footprints (roof height)' },
    { label: 'Height limit', value: `${RULES.maxBuildingHeightFt} ft · 3½ stories`, note: 'Article 60, lots adding ADUs' },
  ],
  evaluate: (p, a, o) => {
    const b = builder();
    const st = effectiveStories(p, a);
    const plan: PlanSpec = { ...basePlan(p, 'floor'), caption: 'The new floor (pink) sits on top of the existing home.' };
    const perFloor = (p.houseHeight ?? 0) / Math.max(1, Math.ceil(st ?? 2));
    const after = (p.houseHeight ?? 0) + (perFloor || 10);
    b.metrics.push(
      { label: 'Stories after', value: st == null ? '—' : String(st + 1).replace('.5', '½'), note: 'Limit 3½' },
      { label: 'Height after', value: `About ${ft(after)}`, note: 'Limit 40 ft' },
      { label: 'Largest ADU', value: sq(attachedMax(p, a)), note: 'Smaller of 75% of your home or 1,250 sq ft' },
    );
    if (st != null && st + 1 > RULES.maxStories) {
      return {
        status: 'notsupported',
        summary: `A full extra floor would take your home to ${st + 1} stories — above the 3½-story limit — so this isn’t supported as proposed.`,
        factor: `Story limit: ${st} + 1 = ${st + 1}.`,
        metrics: b.metrics,
        reasons: [{ kind: 'notsupported', title: 'Above the story limit', body: 'Lots adding ADUs may have buildings up to 3½ stories.' }],
        nextSteps: ['Compare Convert Your Attic or Convert Your Basement, which don’t add height.'],
        trace: [{ rule: 'Stories + 1 ≤ 3½', result: 'fail', detail: `${st} + 1 = ${st + 1}`, source: 'Article 60 Table 6' }],
        plan,
      };
    }
    b.trace.push({ rule: 'Stories + 1 ≤ 3½', result: st == null ? 'unknown' : 'pass', detail: `${st ?? '?'} + 1`, source: 'Article 60 Table 6' });
    if (after > RULES.maxBuildingHeightFt) {
      return {
        status: 'notsupported',
        summary: `Adding a floor would take your home to about ${ft(after)}, above the 40 ft limit.`,
        factor: 'Height limit: 40 ft.',
        metrics: b.metrics,
        reasons: [{ kind: 'notsupported', title: 'Above the height limit', body: 'Compare options that don’t add height.' }],
        nextSteps: ['Compare Convert Your Attic or Convert Your Basement.'],
        trace: [...b.trace, { rule: 'Height after ≤ 40 ft', result: 'fail', detail: `About ${ft(after)}`, source: 'Article 60 Table 6' }],
        plan,
      };
    }
    b.trace.push({ rule: 'Height after ≤ 40 ft', result: 'pass', detail: `About ${ft(after)} (adds one typical floor)`, source: 'Building footprints' });
    const want = sqftForBedrooms(o.bedrooms);
    const max = attachedMax(p, a);
    if (want && max && want > max) {
      b.reasons.push({ kind: 'issue', title: 'Larger than the size limit', body: `About ${sq(want)} is more than the ${sq(max)} limit for your home.` });
    } else if (want) b.reasons.push({ kind: 'supports', title: 'Size', body: `About ${sq(want)} is within the ${sq(max)} limit.` });
    b.reasons.push({ kind: 'supports', title: 'Stories and height', body: `About ${ft(after)} and ${String((st ?? 0) + 1).replace('.5', '½')} stories after — within 40 ft and 3½ stories.` });
    b.reasons.push({ kind: 'confirm', title: 'Addition-height rule', body: 'Mattapan’s rule says an addition can be “no taller than the primary structure”. How that applies to a new top floor hasn’t been resolved.' });
    b.reasons.push({ kind: 'confirm', title: 'Structure', body: 'An engineer must confirm the building can carry another floor.' });
    buildingCodeReason(p, a, b);
    b.trace.push({ rule: 'Addition no taller than the primary structure', result: 'unknown', detail: 'Interpretation for a new top floor is unresolved.', source: 'Article 2 ADU definition' });
    const heightUnsure = o.heightKnown == null || o.heightKnown === 'unsure' || o.confirmStories === 'no' || o.confirmStories === 'unsure';
    if (heightUnsure) {
      return {
        status: 'info',
        summary: `We need a reliable height before we can finish. City records suggest about ${ft(p.houseHeight)}, but they can be incomplete, so a professional measurement may be needed.`,
        factor: 'Building height — the city figure may be incomplete.',
        metrics: b.metrics,
        reasons: [{ kind: 'missing', title: 'Height and stories', body: 'Confirm your home’s stories and height.' }, ...b.reasons],
        nextSteps: ['A design professional or survey can measure the height.', 'Ask an engineer early whether the structure can take another floor.'],
        trace: b.trace,
        plan,
      };
    }
    return {
      status: 'closer',
      summary: 'Height and stories look like they could work, but one rule about how tall additions can be hasn’t been resolved for new top floors. We can’t call this “looks possible” until it is.',
      factor: 'How the addition-height rule applies to an added floor.',
      metrics: b.metrics,
      reasons: b.reasons,
      nextSteps: ['Ask the City’s Planning Department how the addition-height rule applies.', 'Ask an engineer about the structure.'],
      trace: b.trace,
      plan,
    };
  },
};

function rearExtension(id: 'rear-small' | 'rear-medium'): OptionDef {
  const small = id === 'rear-small';
  return {
    id,
    name: small ? 'Extend Into the Rear Yard' : 'Extend Towards the Backyard',
    type: 'Attached ADU',
    lots: small ? ['small'] : ['medium', 'large'],
    blurb: 'Add a new home onto the back of your house.',
    lead: 'Add a new home onto the back of your house. How much backyard you have — and how much must stay open — matters most.',
    bedrooms: small ? '1-2' : '2-3',
    guidebookPage: small ? 55 : 87,
    questions: [
      {
        id: 'depth',
        group: 'Your plans',
        text: 'How far into the backyard would you want to extend?',
        help: 'Measured from your back wall. The plan updates as you choose.',
        choices: [
          { value: '10', label: '10 ft' },
          { value: '15', label: '15 ft' },
          { value: '20', label: '20 ft' },
          { value: '25', label: '25 ft' },
          { value: '30', label: '30 ft' },
          UNSURE,
        ],
        why: 'At least 20 ft of backyard must stay open behind the addition.',
      },
      {
        id: 'storiesWanted',
        group: 'Your plans',
        text: 'Would you want the addition to be one story or two?',
        choices: [{ value: '1', label: 'One story' }, { value: '2', label: 'Two stories' }, UNSURE],
        why: 'The addition can’t be taller than your house, and its floor space counts toward the size limit.',
      },
      {
        id: 'throughway',
        group: 'Your plans',
        text: 'Could the new home connect to the main house through an indoor hallway or door?',
        help: 'For example, a shared hall from your front door.',
        choices: YN,
        why: 'If there isn’t 20 ft of open space beside your house, firefighters would reach a rear home through the main house.',
      },
    ],
    professionalChecks: ['Firefighter access to the new home’s entrance', 'Side yards and unpaved ground (needs a survey)', 'The exact depth of your backyard'],
    preliminary: (p, a) => {
      if (unitsAllowsAdu(p, a) === false) return { status: 'notsupported', text: 'Your lot already has the most homes allowed.' };
      const room = (p.rearYard ?? 0) - RULES.minRearYardFt;
      if (room <= 0) return { status: 'notsupported', text: `About ${ft(p.rearYard)} of backyard — no room beyond the 20 ft that must stay open.` };
      if (p.envelopeFitsAttached === false) return { status: 'notsupported', text: 'After the required yards, there isn’t room for a 220 sq ft addition.' };
      return { status: 'possible', text: `About ${ft(p.rearYard)} of backyard — more than the 20 ft that must stay open.` };
    },
    known: (p, a) => [
      { label: 'Backyard depth', value: `About ${ft(p.rearYard)}`, note: 'Estimated from building footprints' },
      { label: 'Rear yard to keep open', value: `${RULES.minRearYardFt} ft`, note: 'Article 60' },
      { label: 'Your home', value: `${sq(p.livingArea)} · ${storiesLabel(effectiveStories(p, a))}`, note: 'Assessor records' },
      { label: 'Corner lot?', value: p.corner ? 'Yes' : 'No', note: 'Parcel map' },
    ],
    evaluate: (p, a, o) => {
      const b = builder();
      const rear = p.rearYard ?? 0;
      const room = rear - RULES.minRearYardFt;
      const depth = o.depth && o.depth !== 'unsure' ? Number(o.depth) : null;
      const width = Math.min(p.houseWidth ?? 24, 24);
      const plan: PlanSpec = {
        ...basePlan(p, 'rear'),
        aduWidth: width,
        aduDepth: depth ?? undefined,
        requiredRear: RULES.minRearYardFt,
        conflict: depth != null && rear - depth < RULES.minRearYardFt,
        caption: depth == null ? 'Choose a depth to see how much backyard would be left.' : 'The new home (pink) extends from the back of the house.',
      };
      const max = attachedMax(p, a);
      b.trace.push({ rule: 'Backyard deeper than the 20 ft that must stay open', result: room > 0 ? 'pass' : 'fail', detail: `About ${ft(rear)} of backyard.`, source: 'Estimated from parcel and building footprints' });
      if (room <= 0) {
        return {
          status: 'notsupported',
          summary: `Your backyard is about ${ft(rear)} deep — not more than the 20 ft that must stay open — so there’s no room for a rear extension.`,
          factor: 'Rear yard: 20 ft must stay open.',
          metrics: [{ label: 'Backyard', value: `About ${ft(rear)}`, note: '20 ft must stay open' }],
          reasons: [{ kind: 'notsupported', title: 'No room behind the house', body: 'Compare options that stay inside your home.' }],
          nextSteps: ['Get a survey to confirm how deep your backyard really is.', 'Compare other options.'],
          trace: b.trace,
          plan,
        };
      }
      if (depth == null) {
        return {
          status: 'info',
          summary: 'We need a rough idea of how far you’d extend before we can assess this option.',
          factor: 'Extension depth.',
          metrics: [
            { label: 'Backyard', value: `About ${ft(rear)}`, note: 'Estimated from maps' },
            { label: 'Most you could extend', value: `About ${ft(room)}`, note: `${ft(rear)} minus 20 ft` },
            { label: 'Largest ADU', value: sq(max), note: 'Smaller of 75% of your home or 1,250 sq ft' },
          ],
          reasons: [{ kind: 'missing', title: 'Extension depth', body: 'Try a few depths to see how much backyard would be left.' }],
          nextSteps: ['Try a few sizes with the depth selector.', 'A designer can help you work out how much space you need.'],
          trace: b.trace,
          plan,
        };
      }
      const left = rear - depth;
      const storiesN = o.storiesWanted === '2' ? 2 : 1;
      const gsf = depth * width * storiesN;
      const newCoverage = p.lotArea ? ((p.totalFootprint ?? 0) + depth * width) / p.lotArea * 100 : null;
      const cap = coverageCap(p.lotArea ?? 0);
      b.metrics.push(
        { label: 'Backyard left', value: `About ${ft(left)}`, note: '20 ft must stay open' },
        { label: 'Lot coverage after', value: newCoverage == null ? '—' : `${Math.round(newCoverage)}%`, note: `Limit ${cap}%, assuming a ${width} ft wide addition` },
        { label: 'Largest ADU', value: sq(max), note: 'Smaller of 75% of your home or 1,250 sq ft' },
      );
      b.trace.push({ rule: 'Leaves at least 20 ft of rear yard', result: left >= RULES.minRearYardFt ? 'pass' : 'fail', detail: `${ft(rear)} − ${depth} ft = ${ft(left)}`, source: 'Article 60 Table 6' });
      if (left < RULES.minRearYardFt) {
        return {
          status: 'notsupported',
          summary: `As proposed, a ${depth} ft extension would leave about ${ft(left)} of backyard. The rule requires at least 20 ft, so this design isn’t supported as proposed.`,
          factor: `Rear yard: 20 ft must stay open; your design leaves about ${ft(left)}.`,
          metrics: b.metrics,
          reasons: [
            { kind: 'notsupported', title: 'Enters the required rear yard', body: `Try a depth of ${Math.floor(room)} ft or less.` },
          ],
          nextSteps: [`Try a depth of ${Math.floor(room)} ft or less.`, 'Get a survey to confirm how deep your backyard really is.', 'Want to know why the rule exists? Open “What is a rear setback?” below.'],
          trace: b.trace,
          plan,
        };
      }
      b.reasons.push({ kind: 'supports', title: 'Enough backyard', body: `About ${ft(left)} would stay open (estimated from maps); the rule requires 20 ft.` });
      b.trace.push({ rule: `Lot coverage after ≤ ${cap}%`, result: newCoverage != null && newCoverage <= cap ? 'pass' : 'fail', detail: `About ${Math.round(newCoverage ?? 0)}%.`, source: 'Building footprints + your design' });
      if (newCoverage != null && newCoverage > cap) {
        return {
          status: 'notsupported',
          summary: `A ${depth} ft extension would bring lot coverage to about ${Math.round(newCoverage)}%, above the ${cap}% limit.`,
          factor: `Lot coverage: limit ${cap}%.`,
          metrics: b.metrics,
          reasons: [...b.reasons, { kind: 'notsupported', title: 'Too much lot coverage', body: 'Try a shorter or narrower extension, or a second story instead.' }],
          nextSteps: ['Try a smaller footprint or a two-story addition.', 'Compare other options.'],
          trace: b.trace,
          plan,
        };
      }
      b.reasons.push({ kind: 'supports', title: 'Lot coverage', body: `About ${Math.round(newCoverage ?? 0)}% after — under the ${cap}% limit.` });
      b.trace.push({ rule: `Floor area ≤ ${sq(max)}`, result: gsf <= (max ?? Infinity) ? 'pass' : 'fail', detail: `About ${sq(gsf)} (${depth} × ${width} ft × ${storiesN}).`, source: 'Article 2 ADU definition' });
      if (max != null && gsf > max) {
        b.reasons.push({ kind: 'issue', title: 'Larger than the size limit', body: `About ${sq(gsf)} is more than the ${sq(max)} allowed. A smaller addition would fit.` });
      } else b.reasons.push({ kind: 'supports', title: 'Size', body: `About ${sq(gsf)} — within the ${sq(max)} limit.` });
      if (storiesN === 2 && (effectiveStories(p, a) ?? 2) < 2) {
        b.reasons.push({ kind: 'issue', title: 'Taller than your house', body: 'An addition can be no taller than the main house.' });
      }
      // Fire: rear ADU is behind the house.
      const widerSide = p.sideYardMax;
      const frontage20 = widerSide == null ? null : widerSide >= RULES.fireFrontageFt;
      const doorFt = (p.fireTravel ?? (p.frontYard ?? 0) + (p.houseDepth ?? 0)) + 1;
      const fire = fireAccess({
        doorFt,
        farWallFt: doorFt + depth,
        behind: true,
        frontage20,
        sprinklered: a.sprinklered === 'yes' ? true : a.sprinklered === 'no' ? false : null,
        detached: false,
        interiorThroughway: o.throughway === 'yes',
      });
      b.trace.push(...fire.trace);
      if (fire.outcome === 'ok' || fire.outcome === 'interior') b.reasons.push({ kind: 'supports', title: fire.headline, body: fire.detail });
      else b.reasons.push({ kind: fire.outcome === 'unknown' ? 'missing' : 'issue', title: fire.headline, body: fire.detail });
      buildingCodeReason(p, a, b);
      b.reasons.push({ kind: 'confirm', title: 'Side yards and unpaved ground', body: 'At least 3 ft side yards and 15% unpaved ground. A survey will confirm.' });
      const sizeIssue = max != null && gsf > max;
      const fireIssue = fire.outcome === 'fail' || fire.outcome === 'sprinkler';
      const status = sizeIssue || fireIssue || b.reasons.some((r) => r.kind === 'issue') ? 'closer' : 'possible';
      return {
        status,
        summary:
          status === 'possible'
            ? `A ${depth} ft extension appears to meet the checks we can run: backyard depth, lot coverage and size. Side yards, structure and building code haven’t been checked — this isn’t permission to build.`
            : fire.outcome === 'fail'
              ? `The size works, but on this lot firefighters would usually reach a rear home through the main house. Without an indoor connection, the standard fire-access requirement may not be met.`
              : `A ${depth} ft extension fits the backyard, but ${b.reasons.find((r) => r.kind === 'issue')?.title.toLowerCase() ?? 'something'} needs a closer look.`,
        factor: status === 'possible' ? `About ${ft(left)} of backyard would stay open (estimated from maps); the rule requires 20 ft.` : (b.reasons.find((r) => r.kind === 'issue')?.title ?? ''),
        metrics: b.metrics,
        reasons: b.reasons,
        nextSteps: ['Get a plot plan or survey of your lot.', 'Ask a design professional to sketch the addition, including firefighter access.', 'Bring your summary to that conversation.'],
        trace: b.trace,
        plan,
      };
    },
  };
}

const corner: OptionDef = {
  id: 'corner',
  name: 'Attach on a Corner Lot',
  type: 'Attached ADU',
  lots: ['medium', 'large'],
  blurb: 'Add a new home on the street-facing side of a corner property.',
  lead: 'Add a new home on the street-facing side of a corner property. This option applies only where your lot touches two streets.',
  bedrooms: '1-2',
  guidebookPage: 103,
  questions: [
    BEDROOMS_Q,
    {
      id: 'twoStreets',
      group: 'Your property',
      text: 'Does your lot touch two streets?',
      help: 'A corner lot has a street along two sides of the property.',
      choices: YN,
    },
    {
      id: 'recordsRight',
      group: 'Your property',
      text: 'Do the city records look right?',
      choices: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No, something’s wrong' }, UNSURE],
    },
  ],
  professionalChecks: ['Whether the parcel qualifies as a corner lot', 'Exact lot lines and both street frontages', 'Street-facing setbacks, entrances and sightlines'],
  preliminary: (p, a) => {
    if (unitsAllowsAdu(p, a) === false) return { status: 'notsupported', text: 'Your lot already has the most homes allowed.' };
    if (!p.corner) return { status: 'unavailable', text: 'City records show your lot touches only one street.' };
    return { status: 'closer', text: 'City records show a corner lot. Street-facing rules on both sides need a closer look.' };
  },
  known: (p, a) => [
    { label: 'Street frontages', value: p.corner ? '2 streets' : '1 street', note: 'City parcel records' },
    { label: 'Corner lot?', value: p.corner ? 'Yes' : 'No', note: 'Parcel map' },
    { label: 'Your home', value: `${sq(p.livingArea)} · ${storiesLabel(effectiveStories(p, a))}`, note: 'Assessor records' },
    { label: 'Corner option', value: p.corner ? 'May apply' : 'Not available', note: 'Needs two street frontages' },
  ],
  evaluate: (p, a, o) => {
    const isCorner = o.twoStreets === 'yes' || (o.twoStreets !== 'no' && !!p.corner && o.recordsRight !== 'no');
    const plan: PlanSpec = { ...basePlan(p, 'corner'), caption: isCorner ? 'Corner-lot concept: the addition faces the side street.' : 'Illustrative corner-lot layout; it does not represent this property.' };
    const trace: TraceStep[] = [{ rule: 'Lot touches two streets', result: isCorner ? 'pass' : 'fail', detail: o.twoStreets ? 'Your answer.' : 'City parcel records.', source: o.twoStreets ? 'Your answer' : 'Parcel map' }];
    if (!isCorner) {
      return {
        status: 'unavailable',
        summary: 'This option isn’t available here: city records show a lot on one street, and a corner addition needs a lot on two streets.',
        factor: 'A corner addition needs a lot on two streets.',
        metrics: [
          { label: 'Street frontages', value: '1 street', note: 'Based on city parcel records' },
          { label: 'Corner eligibility', value: 'Not met', note: 'Two street frontages needed' },
          { label: 'ADU size', value: 'Not assessed', note: 'This pathway does not apply' },
        ],
        reasons: [{ kind: 'notsupported', title: 'One street frontage', body: 'Corner-lot rules apply only where a lot touches two streets.' }],
        nextSteps: ['Compare other options that may fit this property.', 'If the parcel map looks wrong, ask a professional to confirm the street frontages.', 'Bring corrected property information to a zoning consultation.'],
        trace,
        plan,
      };
    }
    const max = attachedMax(p, a);
    return {
      status: 'closer',
      summary: 'Your lot looks like a corner lot. A corner addition may fit, but front-yard rules apply along both streets, and a visibility triangle at the corner must stay clear.',
      factor: 'Street-facing setbacks on both streets need a professional review.',
      metrics: [
        { label: 'Street frontages', value: '2 streets', note: 'Front-yard rules on each (Sec. 60-33.3)' },
        { label: 'Largest ADU', value: sq(max), note: 'Smaller of 75% of your home or 1,250 sq ft' },
        { label: 'Tallest ADU', value: `About ${ft(p.houseHeight)}`, note: 'No taller than your house' },
      ],
      reasons: [
        { kind: 'supports', title: 'Corner lot', body: 'Your lot touches two streets, so a street-facing addition may be possible.' },
        { kind: 'confirm', title: 'Street-side yard', body: 'The side facing the second street is treated as a front yard: the addition must stay 5 ft back.' },
        { kind: 'confirm', title: 'Visibility triangle', body: 'Nothing over 2½ ft tall within 20 ft of the corner (Sec. 60-33.1).' },
        { kind: 'confirm', title: 'Entrance and fire access', body: 'The ADU door would face a street, which usually helps fire access. A designer will confirm.' },
      ],
      nextSteps: ['Gather a survey showing both street frontages.', 'Ask a designer to sketch the addition within both front yards.', 'Bring this summary to a zoning consultation.'],
      trace: [...trace, { rule: 'Street-side setback and visibility triangle', result: 'unknown', detail: 'Needs a site plan.', source: 'Article 60 Sec. 60-33' }],
      plan,
    };
  },
};

const sideOpt: OptionDef = {
  id: 'side',
  name: 'Attach on the Side',
  type: 'Attached ADU',
  lots: ['medium', 'large'],
  blurb: 'Add a new home onto the side of your house.',
  lead: 'Add a new home onto the side of your house. How wide your side yard is — and how much must stay open — decides how big it can be.',
  bedrooms: '1-2',
  guidebookPage: 95,
  questions: [
    BEDROOMS_Q,
    {
      id: 'whichSide',
      group: 'Your plans',
      text: 'Which side of the house would you build on?',
      help: 'Facing your house from the street.',
      choices: [{ value: 'left', label: 'Left side' }, { value: 'right', label: 'Right side' }, UNSURE],
    },
    {
      id: 'driveway',
      group: 'Your property',
      text: 'Is there a driveway on that side?',
      choices: YN,
      why: 'If there’s a driveway, at least 10 ft of that side yard must stay open (Sec. 60-33.5).',
    },
  ],
  professionalChecks: ['A 3 ft clear path from each home’s exit to the street', 'Exact lot lines (needs a survey)', 'Firefighter access to the new entrance'],
  preliminary: (p, a) => {
    if (unitsAllowsAdu(p, a) === false) return { status: 'notsupported', text: 'Your lot already has the most homes allowed.' };
    const w = p.sideYardMax;
    if (w == null) return { status: 'info', text: 'We couldn’t measure your side yards.' };
    const fit = w - RULES.minSideYardFt;
    if (fit < RULES.minSideAdditionWidthFt)
      return { status: 'notsupported', text: `Your wider side yard is about ${ft(w)}. At least ${RULES.minSideAdditionWidthFt + RULES.minSideYardFt} ft is needed.` };
    return { status: 'possible', text: `One side yard is about ${ft(w)} wide. At least ${RULES.minSideAdditionWidthFt + RULES.minSideYardFt} ft is needed.` };
  },
  known: (p, a) => [
    { label: 'Wider side yard', value: ft(p.sideYardMax), note: 'Estimated from building footprints' },
    { label: 'Narrower side yard', value: ft(p.sideYardMin), note: 'Estimated from building footprints' },
    { label: 'Your home', value: `${sq(p.livingArea)} · ${storiesLabel(effectiveStories(p, a))}`, note: 'Assessor records' },
    { label: 'Corner lot?', value: p.corner ? 'Yes' : 'No', note: 'Parcel map' },
  ],
  evaluate: (p, a, o) => {
    const b = builder();
    const pick: 'left' | 'right' =
      o.whichSide === 'left' || o.whichSide === 'right'
        ? o.whichSide
        : (p.sideLeft ?? 0) >= (p.sideRight ?? 0)
          ? 'left'
          : 'right';
    const yardW = (pick === 'left' ? p.sideLeft : p.sideRight) ?? p.sideYardMax ?? 0;
    const keep = o.driveway === 'yes' ? RULES.drivewaySideYardFt : RULES.minSideYardFt;
    const addW = yardW - keep;
    const depth = Math.max(0, (p.houseDepth ?? 30) - 5);
    const plan: PlanSpec = {
      ...basePlan(p, 'side'),
      aduWidth: Math.max(0, addW),
      aduDepth: depth,
      aduSide: pick,
      caption: `The addition (pink) stays ${keep} ft from the side lot line and 5 ft back from the front of the house.`,
    };
    const max = attachedMax(p, a);
    b.metrics.push(
      { label: 'Largest ADU', value: sq(max), note: 'Smaller of 75% of your home or 1,250 sq ft' },
      { label: 'Tallest ADU', value: `About ${ft(p.houseHeight)}`, note: 'No taller than your house' },
      { label: 'Widest addition', value: `About ${ft(Math.max(0, addW))}`, note: `${ft(yardW)} side yard minus ${keep} ft` },
    );
    b.trace.push({
      rule: `Side yard leaves ≥ ${RULES.minSideAdditionWidthFt} ft after ${keep} ft stays open`,
      result: addW >= RULES.minSideAdditionWidthFt ? 'pass' : 'fail',
      detail: `${pick === 'left' ? 'Left' : 'Right'} side yard about ${ft(yardW)}.`,
      source: o.driveway === 'yes' ? 'Sec. 60-33.5 (driveway) · building footprints' : 'MIRO T-05 · building footprints',
    });
    if (addW < RULES.minSideAdditionWidthFt) {
      return {
        status: 'notsupported',
        summary: `The ${pick} side yard is about ${ft(yardW)} wide. After the ${keep} ft that must stay open, there isn’t room for a ${RULES.minSideAdditionWidthFt} ft wide addition.`,
        factor: `Side yard: ${RULES.minSideAdditionWidthFt + keep} ft or more is needed to attach on the side; yours is about ${ft(yardW)}.`,
        metrics: b.metrics,
        reasons: [{ kind: 'notsupported', title: 'Side yard too narrow', body: o.whichSide ? 'Try the other side, or compare other options.' : 'Compare other options.' }],
        nextSteps: ['Try the other side of the house.', 'Compare other options for your lot.'],
        trace: b.trace,
        plan,
      };
    }
    b.reasons.push({ kind: 'supports', title: 'Side yard', body: `${RULES.minSideAdditionWidthFt + keep} ft or more is needed to attach on the side; yours is about ${ft(yardW)}.` });
    const footprint = addW * depth;
    const cov = remainingCoverageSqft(p);
    b.trace.push({ rule: 'Lot coverage after within limit', result: cov == null ? 'unknown' : footprint <= cov ? 'pass' : 'fail', detail: `Addition footprint about ${sq(footprint)}; about ${sq(cov)} of coverage left.`, source: 'Building footprints' });
    if (cov != null && footprint > cov) b.reasons.push({ kind: 'issue', title: 'Lot coverage', body: `A full-depth addition would exceed the coverage limit; about ${sq(cov)} of coverage is left.` });
    else b.reasons.push({ kind: 'supports', title: 'Lot coverage', body: `Room for about ${sq(cov)} more building footprint.` });
    const want = sqftForBedrooms(o.bedrooms);
    if (want && max && want > max) b.reasons.push({ kind: 'issue', title: 'Size', body: `About ${sq(want)} for ${o.bedrooms} bedrooms is more than the ${sq(max)} limit.` });
    else if (want) b.reasons.push({ kind: 'supports', title: 'Size', body: `About ${sq(want)} for ${o.bedrooms === '0' ? 'a studio' : `${o.bedrooms} bedroom${o.bedrooms === '1' ? '' : 's'}`} fits the ${sq(max)} limit${want > footprint ? ' over two stories' : ''}.` });
    if (p.envelopeFitsAttached === false) b.reasons.push({ kind: 'issue', title: 'Buildable area', body: 'After the required yards, our map estimate found no spot for a 220 sq ft addition.' });
    const fire = fireAccess({
      doorFt: (p.frontYard ?? 0) + 5,
      farWallFt: (p.frontYard ?? 0) + 5 + depth,
      behind: false,
      frontage20: null,
      sprinklered: a.sprinklered === 'yes' ? true : a.sprinklered === 'no' ? false : null,
      detached: false,
    });
    b.trace.push(...fire.trace);
    b.reasons.push({ kind: fire.outcome === 'ok' ? 'supports' : fire.outcome === 'unknown' ? 'missing' : 'issue', title: fire.headline, body: fire.detail });
    buildingCodeReason(p, a, b);
    b.reasons.push({ kind: 'confirm', title: '3 ft exit path', body: 'Each home needs a clear 3 ft path from its exit to the street. A designer will confirm.' });
    const issues = b.reasons.filter((r) => r.kind === 'issue');
    const status = issues.length ? 'closer' : 'possible';
    return {
      status,
      summary:
        status === 'possible'
          ? `A side addition appears to fit the checks we can run. The largest ADU the current rules would allow here is about ${sq(max)}.`
          : `A side addition may fit, but ${issues[0].title.toLowerCase()} needs a closer look.`,
      factor: status === 'possible' ? `Side yard: ${RULES.minSideAdditionWidthFt + keep} ft or more is needed to attach on the side; yours is about ${ft(yardW)}.` : issues[0].body,
      metrics: b.metrics,
      reasons: b.reasons,
      nextSteps: ['Check whether you could get help paying for it.', 'Ask a designer to confirm the 3 ft exit path and your lot lines.', 'Bring this summary to a zoning or permitting consultation.'],
      trace: b.trace,
      plan,
    };
  },
};

const garage: OptionDef = {
  id: 'garage',
  name: 'Adapt Your Garage',
  type: 'Detached ADU',
  lots: ['medium', 'large'],
  blurb: 'Turn an existing garage into a separate home.',
  lead: 'Turn an existing garage into a separate home. Where the garage sits on your lot decides which fire-safety rules apply.',
  bedrooms: '1-2',
  guidebookPage: 79,
  questions: [
    {
      id: 'hasGarage',
      shared: 'hasGarage',
      group: 'Your property',
      text: 'Do you have a garage or similar building (carriage house, large shed) on your lot?',
      choices: YN,
    },
    {
      id: 'atBack',
      group: 'Your property',
      text: 'Is your garage at the back of your lot?',
      help: 'Behind your house, away from the street.',
      choices: YN,
    },
    {
      id: 'distance',
      group: 'Your property',
      text: 'About how far is the garage door from the street?',
      choices: [
        { value: 'near', label: 'Less than 25 ft' },
        { value: 'mid', label: '25 to 50 ft' },
        { value: 'far', label: 'More than 50 ft' },
        UNSURE,
      ],
      why: 'A rear garage more than 25 ft from the street needs sprinklers when it becomes a home.',
    },
  ],
  professionalChecks: ['Whether the garage structure can be reused', 'A 3 ft clear path from each home’s exit to the street', 'Keeping 5 ft clear around your house'],
  preliminary: (p, a) => {
    if (unitsAllowsAdu(p, a) === false) return { status: 'notsupported', text: 'Your lot already has the most homes allowed.' };
    if (a.hasGarage === 'no') return { status: 'unavailable', text: 'You told us there’s no garage on your lot.' };
    if (p.garageSqft) return { status: 'info', text: `City records show a garage of about ${sq(p.garageSqft)}. Two quick questions about where it sits.` };
    return { status: 'info', text: 'City records don’t show a garage. If you have one, a few questions will tell us more.' };
  },
  known: (p) => [
    { label: 'Garage on record', value: p.garageSqft ? `Yes · about ${sq(p.garageSqft)}` : 'Not found', note: 'Building footprints' },
    { label: 'Largest detached ADU', value: sq(detachedMax(p)), note: 'Or the size of your house, if smaller' },
    { label: 'Tallest detached ADU', value: '1½ stories', note: 'Or the height of your house, if lower' },
  ],
  evaluate: (p, a, o) => {
    const b = builder();
    const has = a.hasGarage ?? (p.garageSqft ? 'yes' : undefined);
    const base = basePlan(p, 'garage');
    const plan: PlanSpec = {
      ...base,
      aduWidth: Math.sqrt(p.garageSqft ?? 400),
      aduDepth: Math.sqrt(p.garageSqft ?? 400),
      caption: base.garage
        ? 'The garage (pink) becomes the new home. Shown where city maps place it.'
        : 'City maps don’t show a garage, so this placement is illustrative only.',
    };
    const max = detachedMax(p);
    b.metrics.push(
      { label: 'Largest ADU', value: sq(max), note: 'Smaller of 900 sq ft or your house' },
      { label: 'Tallest ADU', value: '1½ stories', note: 'Or your house height, if lower' },
      { label: 'Garage today', value: p.garageSqft ? `About ${sq(p.garageSqft)}` : 'Not on record', note: 'Could be enlarged within the limits' },
    );
    if (has === 'no') {
      return {
        status: 'unavailable',
        summary: 'You told us there’s no garage or similar building on your lot, so this option doesn’t apply.',
        factor: 'An existing garage or accessory building to convert.',
        metrics: b.metrics,
        reasons: [{ kind: 'notsupported', title: 'No garage', body: 'Compare Build in Your Backyard for a new detached ADU.' }],
        nextSteps: ['Compare other options.'],
        trace: [{ rule: 'Has a garage', result: 'fail', detail: 'Your answer.', source: 'Your answer' }],
        plan,
      };
    }
    b.trace.push({ rule: 'Has a garage or accessory building', result: has === 'yes' ? 'pass' : 'unknown', detail: p.garageSqft ? `City footprint about ${sq(p.garageSqft)}.` : 'Not in city footprints.', source: has === 'yes' && a.hasGarage ? 'Your answer' : 'Building footprints' });
    if (p.garageToHouse != null) {
      const ok = p.garageToHouse >= RULES.detachedMinSeparationFt;
      b.trace.push({ rule: 'At least 5 ft from the house', result: ok ? 'pass' : 'fail', detail: `About ${ft(p.garageToHouse)}.`, source: 'Building footprints' });
      b.reasons.push(ok ? { kind: 'supports', title: 'Space around the garage', body: `About ${ft(p.garageToHouse)} from your house; 5 ft is required.` } : { kind: 'issue', title: 'Too close to the house', body: `About ${ft(p.garageToHouse)} from your house; a detached ADU must be at least 5 ft from other buildings.` });
    }
    if (p.garageToLotLine != null && p.garageToLotLine < RULES.minSideYardFt) {
      b.reasons.push({ kind: 'confirm', title: 'Close to the lot line', body: 'Older garages often sit on the lot line. Reusing it as-is may be allowed; rebuilding may need to move it back. A professional will check.' });
    }
    if (p.garageSqft && p.garageSqft < RULES.minEnvelopeSqft)
      b.reasons.push({ kind: 'issue', title: 'Small garage', body: `About ${sq(p.garageSqft)} — it would need to be enlarged (up to ${sq(max)}) to fit a home.` });
    else if (p.garageSqft) b.reasons.push({ kind: 'supports', title: 'Size', body: `About ${sq(p.garageSqft)} — within the ${sq(max)} limit.` });

    const atBack = o.atBack ?? (p.garageFrontDist != null && p.houseDepth != null && p.frontYard != null ? (p.garageFrontDist > p.frontYard + p.houseDepth / 2 ? 'yes' : 'no') : undefined);
    const distFt =
      o.distance === 'near' ? 20 : o.distance === 'mid' ? 40 : o.distance === 'far' ? 60 : p.garageFrontDist ?? null;
    if (has !== 'yes' || atBack == null || atBack === 'unsure' || distFt == null) {
      return {
        status: 'info',
        summary: 'We need to know where the garage sits before we can say more.',
        factor: 'Where the garage sits on your lot decides which fire-safety rules apply.',
        metrics: b.metrics,
        reasons: [{ kind: 'missing', title: 'Garage location', body: 'Tell us whether it’s at the back of the lot and roughly how far from the street.' }, ...b.reasons],
        nextSteps: ['Answer the two questions about your garage.', 'Have the garage structure checked — some need rebuilding.'],
        trace: b.trace,
        plan,
      };
    }
    const sprinkler = atBack === 'yes' && distFt > RULES.garageSprinklerFt;
    b.trace.push({ rule: 'Rear garage within 25 ft of the street (no sprinklers)', result: sprinkler ? 'fail' : 'pass', detail: `About ${Math.round(distFt)} ft${atBack === 'yes' ? ', at the rear' : ', beside the house'}.`, source: 'Guidebook p.93 · MIRO F-04' });
    const fire = fireAccess({
      doorFt: distFt,
      farWallFt: p.garageFarDist ?? distFt + 20,
      behind: atBack === 'yes',
      frontage20: p.sideYardMax == null ? null : p.sideYardMax >= RULES.fireFrontageFt,
      sprinklered: false,
      detached: true,
    });
    b.trace.push(...fire.trace);
    if (sprinkler || fire.outcome === 'sprinkler') b.reasons.push({ kind: 'issue', title: 'Sprinklers needed', body: `A garage ${Math.round(distFt)} ft from the street, at the back of the lot, needs sprinklers when it becomes a home.` });
    else if (fire.outcome === 'fail') b.reasons.push({ kind: 'issue', title: fire.headline, body: fire.detail });
    else b.reasons.push({ kind: 'supports', title: 'Fire access', body: 'Close enough to the street that sprinklers likely aren’t needed for fire access.' });
    b.reasons.push({ kind: 'confirm', title: 'Structure and utilities', body: 'Some garages need rebuilding. Rear garages also need longer utility connections.' });
    const issues = b.reasons.filter((r) => r.kind === 'issue');
    return {
      status: issues.length ? 'closer' : 'possible',
      summary: issues.length
        ? sprinkler
          ? 'Your garage looks like it could become an ADU, but because it sits well back from the street the new home would need sprinklers. That adds cost, so it’s worth planning for early.'
          : `Your garage may work, but ${issues[0].title.toLowerCase()} needs a closer look.`
        : 'Your garage looks like it could become an ADU. Its structure and utilities haven’t been checked — this isn’t permission to build.',
      factor: sprinkler ? 'Fire safety: a garage 25 ft or more from the street needs sprinklers when it becomes a home.' : issues[0]?.body ?? 'Garage close to the street, with room around it.',
      metrics: b.metrics,
      reasons: b.reasons,
      nextSteps: sprinkler
        ? ['Ask a contractor what sprinklers would cost for a building this size.', 'Have the garage structure checked — some need rebuilding.', 'Check whether you could get help paying for it.']
        : ['Have the garage structure checked — some need rebuilding.', 'Check whether you could get help paying for it.', 'Bring this summary to a consultation.'],
      trace: b.trace,
      plan,
    };
  },
};

const backyard: OptionDef = {
  id: 'backyard',
  name: 'Build in Your Backyard',
  type: 'Detached ADU',
  lots: ['large'],
  blurb: 'Build a separate small home behind your house.',
  lead: 'Build a separate small home behind your house. We check three things in turn: whether there’s enough land, whether there’s a workable spot, and what else applies.',
  bedrooms: '2-3',
  guidebookPage: 121,
  questions: [
    {
      id: 'people',
      group: 'Step 1 · Is there enough land?',
      text: 'How many people would live in the ADU?',
      help: 'One person needs about 330 sq ft. Add about 100 sq ft for each extra person.',
      choices: [
        { value: '1', label: '1' },
        { value: '2', label: '2' },
        { value: '3', label: '3' },
        { value: '4', label: '4 or more' },
        UNSURE,
      ],
    },
    {
      id: 'behind',
      group: 'Step 2 · Is there a good spot?',
      text: 'Would the ADU sit behind your house, with no street frontage of its own?',
      choices: [{ value: 'yes', label: 'Yes, behind the house' }, { value: 'no', label: 'No, beside the house' }, UNSURE],
      why: 'A detached ADU behind the house, without 20 ft of open frontage, has stricter fire-access rules.',
    },
  ],
  professionalChecks: ['How much of your lot is unpaved (needs a survey)', '5 ft between buildings, 8 ft from sheds or garages, 10 ft from the rear lot line', 'Energy code requirements for the new building'],
  preliminary: (p, a) => {
    if (unitsAllowsAdu(p, a) === false) return { status: 'notsupported', text: 'Your lot already has the most homes allowed.' };
    const left = remainingCoverageSqft(p);
    if (left != null && left < RULES.minUnitSqftOnePerson) return { status: 'notsupported', text: 'Your buildings already use nearly all the lot coverage allowed.' };
    if (p.envelopeFitsDetached === false) return { status: 'notsupported', text: 'After the required yards and spacing, there isn’t a spot big enough for a small home.' };
    return { status: 'possible', text: 'Your lot looks large enough. Size and firefighter access decide the rest.' };
  },
  known: (p) => [
    { label: 'Lot size', value: sq(p.lotArea), note: 'Parcel map' },
    { label: 'Covered by buildings', value: `${sq(p.totalFootprint)} · ${Math.round(p.coveragePct ?? 0)}%`, note: 'House and garage footprints' },
    { label: 'Coverage limit', value: `${coverageCap(p.lotArea ?? 0)}%`, note: 'Lots 5,000 sq ft or more (60% if smaller)' },
    { label: 'Unpaved ground', value: 'Not known yet', note: 'At least 15% must stay unpaved' },
  ],
  evaluate: (p, _a, o) => {
    const b = builder();
    const people = o.people && o.people !== 'unsure' ? Number(o.people) : null;
    const want = people ? RULES.minUnitSqftOnePerson + (people - 1) * RULES.extraSqftPerPerson : null;
    const max = detachedMax(p);
    const left = remainingCoverageSqft(p);
    const side = Math.sqrt(want ?? 500);
    const base = basePlan(p, 'detached');
    const plan: PlanSpec = {
      ...base,
      aduWidth: side,
      aduDepth: side,
      caption: base.detachedSpot
        ? 'Shown in the largest open spot we found: 5 ft from the house, 8 ft from other buildings, 3 ft from the sides and 10 ft from the rear lot line.'
        : 'Illustrative placement. The ADU keeps 5 ft from the house, 8 ft from other buildings and 10 ft from the rear lot line.',
    };
    const footprint = want ?? 0;
    const covAfter = p.lotArea ? (((p.totalFootprint ?? 0) + footprint) / p.lotArea) * 100 : null;
    const cap = coverageCap(p.lotArea ?? 0);
    b.metrics.push(
      { label: 'Lot coverage after', value: covAfter == null ? '—' : `${Math.round(covAfter)}%`, note: `Limit is ${cap}% on lots ${(p.lotArea ?? 0) < 5000 ? 'under' : 'of'} 5,000 sq ft${(p.lotArea ?? 0) < 5000 ? '' : ' or more'}` },
      { label: 'Largest ADU', value: sq(max), note: 'And no taller than 1½ stories' },
    );
    // Step 1: enough land
    b.trace.push({ rule: `Coverage after ≤ ${cap}%`, result: covAfter != null && covAfter <= cap ? 'pass' : want ? 'fail' : 'unknown', detail: `About ${Math.round(covAfter ?? 0)}% with a ${sq(footprint)} ADU.`, source: 'Building footprints · Article 60 Table 6' });
    if (left != null && left < RULES.minUnitSqftOnePerson) {
      return {
        status: 'notsupported',
        summary: 'Your buildings already use nearly all the lot coverage allowed, so there isn’t room for a separate home.',
        factor: `Lot coverage: limit ${cap}%.`,
        metrics: b.metrics,
        reasons: [{ kind: 'notsupported', title: 'Not enough land', body: `About ${sq(Math.max(0, left))} of coverage left; a one-person home needs about 330 sq ft.` }],
        nextSteps: ['Compare options inside your home.'],
        trace: b.trace,
        plan,
      };
    }
    if (want && covAfter != null && covAfter > cap) b.reasons.push({ kind: 'issue', title: 'Lot coverage', body: `A ${sq(want)} ADU would bring coverage to about ${Math.round(covAfter)}%, above ${cap}%.` });
    else if (want) b.reasons.push({ kind: 'supports', title: 'Enough land', body: `House, garage and a ${sq(want)} ADU would cover about ${Math.round(covAfter ?? 0)}% of the lot. The limit is ${cap}%.` });
    if (want && want > max) b.reasons.push({ kind: 'issue', title: 'Size and height', body: `About ${sq(want)} is more than the ${sq(max)} limit for a detached ADU.` });
    else if (want) b.reasons.push({ kind: 'supports', title: 'Size and height', body: `${sq(want)} is under the ${sq(max)} limit for a detached ADU.` });
    // Step 2: spot
    b.trace.push({ rule: 'A 220 sq ft spot fits after yards and spacing', result: p.envelopeFitsDetached ? 'pass' : p.envelopeFitsDetached === false ? 'fail' : 'unknown', detail: `Largest square spot about ${ft(p.detachedMaxSquare)} on a side.`, source: 'Parcel and building footprints (estimate)' });
    if (p.envelopeFitsDetached === false) {
      return {
        status: 'notsupported',
        summary: 'After the required yards and spacing from other buildings, our map estimate found no spot for a small home.',
        factor: 'A workable spot: 5 ft from the house, 8 ft from sheds or garages, 10 ft from the rear lot line.',
        metrics: b.metrics,
        reasons: [...b.reasons, { kind: 'notsupported', title: 'No workable spot', body: 'A survey might find more room than our map estimate.' }],
        nextSteps: ['Get a survey to confirm the space you have.', 'Compare options attached to your house.'],
        trace: b.trace,
        plan,
      };
    }
    const behind = o.behind === 'no' ? false : o.behind === 'yes' ? true : null;
    // Door distance: placed behind the house = curb-to-back-of-house + 5 ft gap + ADU depth.
    const doorFt = behind === false ? (p.frontYard ?? 0) + (p.houseDepth ?? 0) / 2 : (p.fireTravel ?? (p.frontYard ?? 0) + (p.houseDepth ?? 0)) + RULES.detachedMinSeparationFt;
    const fire = fireAccess({
      doorFt,
      farWallFt: doorFt + side,
      behind: behind !== false,
      frontage20: p.sideYardMax == null ? null : p.sideYardMax >= RULES.fireFrontageFt,
      sprinklered: false,
      detached: true,
    });
    b.metrics.push({ label: 'Door to street', value: `About ${ft(doorFt)}`, note: fire.sprinklerNeeded ? 'Over 50 ft, so sprinklers are needed' : 'Within 50 ft, no sprinklers needed' });
    b.trace.push(...fire.trace);
    b.reasons.push({ kind: fire.outcome === 'ok' ? 'supports' : 'issue', title: fire.headline, body: fire.detail });
    b.reasons.push({ kind: 'missing', title: 'Unpaved ground', body: 'At least 15% of the lot must stay unpaved. We don’t have this data yet, so a survey should confirm it.' });
    b.reasons.push({ kind: 'confirm', title: 'Spacing from other buildings', body: '5 ft between buildings, 8 ft from the garage and 10 ft from the rear lot line. A professional should confirm the exact spot.' });
    if (!want || behind == null) {
      return {
        status: 'info',
        summary: 'Your lot looks large enough. Tell us how many people would live there and where the ADU would sit, and we’ll check size and fire access.',
        factor: 'Size and placement.',
        metrics: b.metrics,
        reasons: b.reasons,
        nextSteps: ['Answer the two questions.', 'Check whether you could get help paying for it.'],
        trace: b.trace,
        plan,
      };
    }
    const issues = b.reasons.filter((r) => r.kind === 'issue');
    const sprOnly = issues.length === 1 && fire.outcome === 'sprinkler';
    return {
      status: issues.length ? (sprOnly ? 'possible' : 'closer') : 'possible',
      summary: sprOnly
        ? `A backyard ADU of about ${sq(want)} appears to fit your lot. Where we’ve placed it, the ADU would need sprinklers — moving it closer to the street could avoid them.`
        : issues.length
          ? `A backyard ADU may fit, but ${issues[0].title.toLowerCase()} needs a closer look.`
          : `A backyard ADU of about ${sq(want)} appears to fit your lot, close enough to the street that sprinklers likely aren’t needed.`,
      factor: fire.outcome !== 'ok' ? `${fire.headline}: ${fire.detail}` : 'Enough land and a workable spot.',
      metrics: b.metrics,
      reasons: b.reasons,
      nextSteps: ['Check whether you could get help paying for it.', 'Get a survey to confirm unpaved area and lot lines.', fire.outcome === 'ok' ? 'Ask a designer to sketch the ADU and its path to the street.' : 'Ask a designer whether the ADU could sit within 50 ft of the street to avoid sprinklers.'],
      trace: b.trace,
      plan,
    };
  },
};

const front: OptionDef = {
  id: 'front',
  name: 'Attach in Your Front Yard',
  type: 'Attached ADU',
  lots: ['large'],
  blurb: 'Add a new home onto the front of your house.',
  lead: 'Add a new home onto the front of your house. Front-yard rules, the street-facing entrance and utilities all need a professional review.',
  bedrooms: '1-2',
  guidebookPage: 115,
  questions: [
    BEDROOMS_Q,
    {
      id: 'entrance',
      group: 'Your plans',
      text: 'Where would the new entrance face?',
      help: 'A rough idea is enough. A designer will review the entrance and street access.',
      choices: [{ value: 'street', label: 'Toward the street' }, { value: 'side', label: 'Toward the side' }, UNSURE],
    },
    {
      id: 'obstacles',
      group: 'Your property',
      text: 'Are there trees or utilities in the front yard?',
      choices: YN,
    },
  ],
  professionalChecks: ['The front setback and street-facing building rules', 'Exact lot lines, trees and utility locations', 'Entrance design, structure and firefighter access'],
  preliminary: (p, a) =>
    unitsAllowsAdu(p, a) === false
      ? { status: 'notsupported', text: 'Your lot already has the most homes allowed.' }
      : { status: 'closer', text: 'Front yards have the most rules. A professional should review this one.' },
  known: (p, a) => [
    { label: 'Lot size', value: sq(p.lotArea), note: 'City parcel records' },
    { label: 'Front-yard fit', value: 'To confirm', note: 'Professional review needed' },
    { label: 'Your home', value: `${sq(p.livingArea)} · ${storiesLabel(effectiveStories(p, a))}`, note: 'Assessor records' },
    { label: 'Street-facing rules', value: 'Review needed', note: 'Not resolved by city data' },
  ],
  // OPEN QUESTION: the Miro board has a full front-yard calculation; for now we
  // follow Figma and always return "Closer look needed".
  evaluate: (p) => ({
    status: 'closer',
    summary: 'A front addition needs a closer look. Your answers help describe the idea, but they do not resolve the front-yard rules for your property.',
    factor: 'Front-yard rules and the street-facing layout need a professional review.',
    metrics: [
      { label: 'ADU size', value: 'To confirm', note: 'No buildable size estimated' },
      { label: 'Front setback', value: 'To confirm', note: `Front yard today about ${ft(p.frontYard)}; 5 ft must stay open` },
      { label: 'Street access', value: 'Review needed', note: 'Check entrance and exit route' },
    ],
    reasons: [
      { kind: 'confirm', title: 'Front-yard rules', body: 'Front setback, street-facing walls and entrances need review against Article 60.' },
      { kind: 'confirm', title: 'Existing building conformity', body: 'If your house doesn’t meet today’s rules, an ADU is allowed only if it doesn’t make that worse (Sec. 60-34).' },
      { kind: 'supports', title: 'Fire access', body: 'An entrance facing the street is usually close enough for firefighters.' },
      { kind: 'missing', title: 'Trees and utilities', body: 'A survey will show trees, utility lines and the exact front lot line.' },
    ],
    nextSteps: ['Gather a survey, photos and any plans for the front yard.', 'Ask a designer to review front-yard rules, the entrance and utilities.', 'Confirm a feasible layout before moving on to permitting.'],
    trace: [{ rule: 'Front-yard addition', result: 'unknown', detail: 'Not assessed by this prototype — professional review needed.', source: 'Not yet assessed by this prototype' }],
    plan: { ...basePlan(p, 'front'), caption: 'Concept only — the front setback and entrance layout are not yet confirmed.' },
  }),
};

export const OPTIONS: OptionDef[] = [
  split,
  interiorSpaceOption('attic'),
  floor,
  interiorSpaceOption('basement'),
  rearExtension('rear-small'),
  rearExtension('rear-medium'),
  corner,
  sideOpt,
  garage,
  backyard,
  front,
];

export const OPTION_BY_ID = Object.fromEntries(OPTIONS.map((o) => [o.id, o])) as Record<OptionId, OptionDef>;

export function optionsForLot(size: LotSize): OptionDef[] {
  return OPTIONS.filter((o) => o.lots.includes(size));
}

/** Bedroom preference re-sorts options (see OPEN_QUESTIONS.md). */
export function bedroomMatch(o: OptionDef, pref: '1-2' | '2-3' | undefined): number {
  if (!pref) return 0;
  if (pref === '1-2') return o.bedrooms === '2-3' ? 1 : 0;
  return o.bedrooms === '2-3' ? 0 : 1;
}
