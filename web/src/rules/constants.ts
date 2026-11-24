/**
 * Every numeric threshold the rules use, in one place, with its source.
 * Change a number here and every option updates. See ASSUMPTIONS.md.
 *
 * Sources:
 *  - ART60 = Article 60 Residential Zoning Amendment Fact Sheet (BPDA, adopted Jan 2024),
 *    Tables 1, 5, 6, 7 and ADU definitions.
 *  - FIRE  = City of Boston "Guidance on ADUs and Fire Safety" (Dec 11 2023), 527 CMR 18.
 *  - GUIDE = Boston ADU Guidebook.
 *  - MIRO  = team "Zoning Decision Tree Mattapan" board / medium-lot spreadsheet.
 *  - MOH   = Mayor's Office of Housing income limits (June 15 2026).
 */
export const RULES = {
  // ART60 Table 6 — dimensional regulations for lots adding ADUs (R1 & R2)
  coverageSmallLotPct: 60, // lots < 5,000 sf
  coverageLargeLotPct: 50, // lots >= 5,000 sf
  coverageLotSizeBreakSqft: 5000, // ART60 uses "< 5000" and "≥ 5000"
  minPermeablePct: 15,
  minFrontYardFt: 5,
  minSideYardFt: 3,
  minRearYardFt: 20,
  maxBuildingHeightFt: 40,
  maxStories: 3.5,
  minLotFrontageFt: 20,

  // ART60 Table 1 / 7 — max dwelling units on a lot INCLUDING ADUs
  maxUnitsWithAdu: { R1: 3, R2: 4 } as Record<string, number>,

  // ART60 Table 5 — ADU size and height
  attachedMaxPctOfPrincipal: 0.75,
  attachedMaxSqft: 1250,
  detachedMaxFloorPlateSqft: 900,
  detachedMaxStories: 1.5,
  detachedMinSeparationFt: 5,

  // MIRO / Figma: placement buffers for a new detached ADU
  detachedFromAccessoryFt: 8,
  detachedFromRearLotLineFt: 10,

  // GUIDE p.17 / 780 CMR efficiency unit
  minUnitSqftOnePerson: 330,
  extraSqftPerPerson: 100,
  minEnvelopeSqft: 220, // MIRO E-02 (780 CMR 1208.4)
  minCeilingFt: 7.5, // 7 ft 6 in, MIRO basement tree / Figma

  // MIRO T-05: side yard must leave >= 7 ft after the 3 ft setback
  minSideAdditionWidthFt: 7,
  // ART60 Sec. 60-33.5 (via MIRO front-yard tree): driveway side yard stays >= 10 ft
  drivewaySideYardFt: 10,

  // FIRE (527 CMR 18.2.3.2) — distances measured from the curb
  fireDoorNoSprinklerFt: 50,
  fireDoorSprinklerFt: 150,
  fireDoorBehindNoFrontageFt: 25,
  fireWallNoSprinklerFt: 150,
  fireWallSprinklerFt: 250,
  fireFrontageFt: 20,
  firefighterPathFt: 10,
  // GUIDE p.~93 / MIRO F-04: converted rear garage needs sprinklers if > 25 ft from street
  garageSprinklerFt: 25,

  // Building code: 3+ units in a building → sprinkler (FIRE p.32-35)
  buildingUnitsSprinklerTrigger: 3,

  // Financial assistance (boston.gov ADU Financial Assistance Program)
  amiLimitPct: 135,
  assetLimit: 100000,
  maxLoan: 50000,
} as const;

/**
 * 135% AMI income limits by household size — MOH "Income & Rent Limits
 * (June 15, 2026)", City and MHP Funded Homeownership Programs table, 135%
 * column (MHP/City calculated from HUD data, effective 05/01/2026).
 * Sizes 7–8 are not published in that table; see ASSUMPTIONS.md.
 */
export const AMI_135: Record<number, number> = {
  1: 162000,
  2: 185150,
  3: 208250,
  4: 231400,
  5: 249950,
  6: 268400,
  // 7-8 extrapolated with HUD's family-size adjustment (7 = 124%, 8 = 132% of
  // the 4-person limit), rounded to the nearest $50.
  7: 286950,
  8: 305450,
};
/** Same table, 120% column — below this no owner match is required. */
export const AMI_120: Record<number, number> = {
  1: 144000,
  2: 164550,
  3: 185100,
  4: 205650,
  5: 222150,
  6: 238600,
  7: 255000,
  8: 271450,
};
export const AMI_SOURCE =
  'Mayor’s Office of Housing, Income & Rent Limits (June 15, 2026) — 135% AMI, City and MHP funded homeownership programs';

/** Guidebook lot-size guide (p.33) and MIRO Z-22: classified by lot width. */
export const LOT_BANDS = { smallMaxFt: 40, mediumMaxFt: 60 };
