import { RULES } from './constants';
import type { TraceStep } from './types';

export type FireOutcome = 'ok' | 'sprinkler' | 'interior' | 'fail' | 'unknown';

export interface FireInput {
  /** Curb/front lot line to the ADU's entry door (ft). null = unknown. */
  doorFt: number | null;
  /** Curb/front lot line to the farthest ground-floor exterior wall (ft). */
  farWallFt: number | null;
  /** Is the ADU behind the main house? */
  behind: boolean;
  /** At least 20 ft of frontage between the house and a side lot line, connecting street to rear? */
  frontage20: boolean | null;
  /** Building already sprinklered? */
  sprinklered: boolean | null;
  /** Detached ADU (vs attached / internal). */
  detached: boolean;
  /** Attached rear ADU reachable through an indoor throughway from the main front door? */
  interiorThroughway?: boolean | null;
}

export interface FireResult {
  outcome: FireOutcome;
  sprinklerNeeded: boolean | null;
  headline: string;
  detail: string;
  trace: TraceStep[];
}

const SRC = '527 CMR 18.2.3.2 via City “Guidance on ADUs and Fire Safety” (2023)';

/**
 * Fire Department access road check (City fire-safety guidance pp. 10-29):
 *  - door ≤ 50 ft & every wall ≤ 150 ft → OK without sprinklers
 *  - door ≤ 150 ft & walls ≤ 250 ft → OK with sprinklers
 *  - behind the house AND no 20 ft frontage → door ≤ 25 ft, no sprinkler increase.
 *    Attached: an interior throughway from the main front door satisfies it.
 *    Detached: sprinkler + 10 ft firefighter path + wayfinding may be accepted.
 */
export function fireAccess(f: FireInput): FireResult {
  const trace: TraceStep[] = [];
  if (f.doorFt == null) {
    return {
      outcome: 'unknown',
      sprinklerNeeded: null,
      headline: 'Fire access: to confirm',
      detail: 'We couldn’t estimate how far the ADU door would be from the street.',
      trace: [{ rule: 'Fire access distance', result: 'unknown', detail: 'Distance unknown.', source: SRC }],
    };
  }
  const door = Math.round(f.doorFt);
  const wall = f.farWallFt == null ? null : Math.round(f.farWallFt);
  const constrained = f.behind && f.frontage20 === false;

  if (constrained) {
    if (!f.detached && f.interiorThroughway) {
      trace.push({
        rule: 'ADU behind house without 20 ft frontage',
        result: 'pass',
        detail: 'An indoor connection from the main front door lets firefighters reach the ADU.',
        source: SRC,
      });
      return {
        outcome: 'interior',
        sprinklerNeeded: false,
        headline: 'Fire access through the main house',
        detail: 'Without 20 ft of open frontage beside the house, firefighters reach the ADU through an indoor connection from your front door.',
        trace,
      };
    }
    if (door <= RULES.fireDoorBehindNoFrontageFt) {
      trace.push({ rule: 'Door within 25 ft (behind, no frontage)', result: 'pass', detail: `About ${door} ft.`, source: SRC });
      return { outcome: 'ok', sprinklerNeeded: false, headline: 'Fire access looks OK', detail: `The ADU door would be about ${door} ft from the street.`, trace };
    }
    trace.push({
      rule: 'Door within 25 ft (behind, no frontage)',
      result: 'fail',
      detail: `About ${door} ft. Behind the house without 20 ft of frontage, the door must be within 25 ft and sprinklers don’t extend that.`,
      source: SRC,
    });
    return {
      outcome: f.detached ? 'sprinkler' : 'fail',
      sprinklerNeeded: f.detached ? true : null,
      headline: f.detached ? 'Needs sprinklers and a firefighter path' : 'Needs an indoor connection for fire access',
      detail: f.detached
        ? `The ADU would sit behind your house without 20 ft of open frontage. The Fire Department may accept it with sprinklers, a clear ${RULES.firefighterPathFt} ft wide firefighter path and a lit route to the door.`
        : 'The ADU would sit behind your house without 20 ft of open frontage. Firefighters would need to reach it through an indoor hallway or door from your main front door.',
      trace,
    };
  }

  const wallOkNoSpr = wall == null || wall <= RULES.fireWallNoSprinklerFt;
  if (door <= RULES.fireDoorNoSprinklerFt && wallOkNoSpr) {
    trace.push({ rule: 'Door ≤ 50 ft and walls ≤ 150 ft from the street', result: 'pass', detail: `Door about ${door} ft${wall != null ? `, farthest wall about ${wall} ft` : ''}.`, source: SRC });
    return {
      outcome: 'ok',
      sprinklerNeeded: false,
      headline: 'No sprinklers needed for fire access',
      detail: `The ADU door would be about ${door} ft from the street — within the 50 ft limit without sprinklers.`,
      trace,
    };
  }
  const wallOkSpr = wall == null || wall <= RULES.fireWallSprinklerFt;
  if (door <= RULES.fireDoorSprinklerFt && wallOkSpr) {
    trace.push({
      rule: 'Door ≤ 50 ft and walls ≤ 150 ft (no sprinklers)',
      result: 'fail',
      detail: `Door about ${door} ft${wall != null ? `, farthest wall about ${wall} ft` : ''}.`,
      source: SRC,
    });
    trace.push({ rule: 'Door ≤ 150 ft and walls ≤ 250 ft with sprinklers', result: 'pass', detail: 'Sprinklers extend the allowed distance.', source: SRC });
    return {
      outcome: f.sprinklered ? 'ok' : 'sprinkler',
      sprinklerNeeded: !f.sprinklered,
      headline: f.sprinklered ? 'Your sprinklers cover the extra distance' : 'Sprinklers needed at this spot',
      detail: `The ADU door would be about ${door} ft from the street. Without sprinklers it must be within 50 ft; with sprinklers, up to 150 ft (walls up to 250 ft).`,
      trace,
    };
  }
  trace.push({ rule: 'Door ≤ 150 ft and walls ≤ 250 ft with sprinklers', result: 'fail', detail: `Door about ${door} ft${wall != null ? `, farthest wall about ${wall} ft` : ''}.`, source: SRC });
  return {
    outcome: 'fail',
    sprinklerNeeded: null,
    headline: 'Too far from the street for standard fire access',
    detail: `The ADU door would be about ${door} ft from the street — beyond the 150 ft allowed even with sprinklers.`,
    trace,
  };
}

/** Building code: an attached/internal ADU that makes 3+ units in the building needs sprinklers (FIRE p.32-35). */
export function buildingCodeSprinkler(unitsBefore: number | null, detached: boolean): boolean | null {
  if (detached) return false;
  if (unitsBefore == null) return null;
  return unitsBefore + 1 >= RULES.buildingUnitsSprinklerTrigger;
}
