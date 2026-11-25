# Room to Grow: ADU advocacy page

A standalone page, separate from the homeowner tool. It maps how possible ADUs are on every 1–3 family lot in
Mattapan and analyses which rules, as opposed to the lots themselves, limit them. It is served at `…/advocacy/`, and
neither page links to the other.

```
advocacy/
├── index.html          page entry (second Vite input, see ../vite.config.ts)
├── src/                the page: React + MapLibre, no server
│   ├── App.tsx         sections: hero · four maps · explore map · analysis · method
│   ├── LotMap.tsx      plain lot map (our own GeoJSON, no basemap); maps can move together
│   ├── ExploreMap.tsx  interactive map: rule-change toggles, bivariate view, "why not?", lot details
│   ├── charts.tsx      the three analysis graphics (HTML/CSS bars + "Show the numbers" tables)
│   ├── layers.ts       every colour and legend, with the reasoning behind each colour choice
│   └── data.ts         loads ../data/parcels.geojson + the analysis output
└── scripts/            the analysis, kept here as the record of how it was done
    ├── analysis.ts     the logic (pure functions, reuses ../src/rules thresholds)
    ├── analysis.test.ts
    └── analyze.ts      runs it → public/data/advocacy/{lots,summary}.json
```

Shared with the tool: the Vite/React setup, `src/styles.css` (design tokens and fonts), `src/rules/` (thresholds and
the site check), and `public/data/` (parcel shapes and facts).

## Regenerating the analysis

```bash
cd web
npm run advocacy:data     # writes public/data/advocacy/*.json (~2 s)
npm test                  # includes advocacy/scripts/analysis.test.ts
```

Re-run whenever `public/data/parcels.json` (from `scripts/build_data.py`) or the rules in `src/rules/` change, then
commit the JSON.

## Method

For every lot the tool can measure (2,254 of Mattapan's 2,896 1–3 family homes in R1/R2), and for each of four kinds
of ADU, the analysis lists everything that stops it. It then decides whether the **lot** or the **rules** are the
limiting factor.

| ADU type | Rules checked (Article 60, fire and building code) | Physical test: "no rules, would it fit?" |
|---|---|---|
| Inside the house (split, attic, basement) | Article 60 site check on the existing house | ≥ 900 sq ft of living area per existing home, so a 330 sq ft unit leaves a livable main home |
| Rear addition | Site check; 10 ft deep addition must leave the 20 ft rear yard; lot coverage after | ≥ 13 ft of rear yard (10 ft addition + 3 ft walkway) |
| Side addition | Site check; ≥ 7 ft wide after the 3 ft side setback; lot coverage after | side yard ≥ 7 ft |
| Backyard cottage | Site check; 330 sq ft studio fits after cottage setbacks (10 ft rear, 3 ft sides, 5 ft from house, 8 ft from garages); lot coverage after; **fire code**: behind the house without 20 ft of frontage it needs a 10 ft firefighter path | a 330 sq ft square fits in the rear yard with 3 ft clearance all round |

**Deciding the limiting factor:**
- **Not enough physical space.** If the physical test fails, the lot is the limit, whatever rules also fail. Example:
  a 5 ft side yard is a space problem; an 8 ft one is a setback problem.
- **One rule group.** Otherwise, if every blocker belongs to one group, that group is the limit. The groups are:
  - *existing house doesn't meet today's rules*
  - *setbacks for the new ADU*
  - *coverage or unit cap*
  - *fire code*
- **Several rules at once.** If blockers come from more than one group.

**Lot status:**
- **Yes:** an addition or cottage passes.
- **Maybe:** only a conversion inside the house passes; that depends on the attic, basement or layout, which city data
  can't see.
- **No:** nothing passes.

**Map "what's holding it back":** for lots without an outdoor option, the limiting factor of the ADU type closest to
being allowed.

**Rule changes (explore map):** all 32 on/off combinations of five reforms are pre-computed per lot:
1. Let existing homes keep their setbacks (Sec. 60-34 logic).
2. Rear yard 20 → 10 ft for additions.
3. 3 ft cottage setbacks.
4. Sprinklers instead of the 10 ft fire path.
5. Don't count the ADU toward lot coverage.

Tests check that turning any reform on never makes a lot worse, and that no reform unlocks a lot that fails the
physical test.

**Sizes** are rough upper limits for comparison:
- **Additions:** footprint × up to 2 stories, capped at the smaller of 75% of the principal unit or 1,250 sq ft.
- **Cottages:** footprint up to the smaller of 900 sq ft or the house footprint, × 1.5 stories.
- Lot coverage limits both.

### Assumptions specific to this analysis

These are on top of the tool's assumptions in [`../ASSUMPTIONS.md`](../ASSUMPTIONS.md):
- The physical baseline thresholds above (3 ft clearance, 10 ft minimum addition depth, 7 ft minimum width, 330 sq ft
  minimum unit, 900 sq ft per home to split). They decide "space" vs "rules", so changing them moves lots between
  those groups.
- Every ADU type is assessed on every lot. The tool instead offers designs by lot width, following the Guidebook.
- The backyard cottage sits behind the house, so the fire-path rule applies unless the side yard is ≥ 20 ft.
- No driveways are assumed, which would otherwise raise the side setback to 10 ft.
- Unpaved area (15%) and the 3 ft exit path aren't in city data and aren't checked.

### Colour choices

Every palette was checked for colour-blind safety with the dataviz validator. Red-green is avoided entirely.
- **Blue means possible:** yes / maybe, the "how many types" ramp, and "allowed" in charts.
- **Orange means no,** and is also the colour of its main cause: the existing house not meeting today's rules.
- **Limiting factors on the map** use orange, violet and aqua, which are distinct for all pairs.
- **"Not enough space" and "several rules" are grey,** so a physical limit never looks like a rule.
- **Contrast:** two chart colours are below 3:1 against the background, so every chart has a "Show the numbers"
  table.
