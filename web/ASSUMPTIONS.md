# Decision and Assumptions

Decisions and assumptions that affect the ADU / zoning output of the web prototype (`web/`).
Bigger unresolved items live in [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md).

⚠️ **= important to check.** Every numeric threshold lives in `web/src/rules/constants.ts` with its source, so a
change there updates every option.

Parcel counts below are from `combined_parcels_2026-11-12.gpkg` (3,910 parcels) as processed by
`web/scripts/build_data.py`.

## Sources and precedence

When sources disagree, the tool follows this order:

1. Official City documents: the **Article 60 Residential Zoning Amendment Fact Sheet** (BPDA, 2024), the City's
   **Guidance on ADUs and Fire Safety** (Dec 11 2023) and boston.gov ADU program pages.
2. The **Boston ADU Guidebook**.
3. The team's **Miro "Zoning Decision Tree Mattapan"** and the medium-lot spreadsheet (Chiri, Neugebauer, Daly).
4. The **Figma** prototypes, used for flow, wording and example outcomes only, not as rules.

Web search was unavailable during the build, so the official documents were read directly from boston.gov pages.
Anything not settled there follows the Miro board.

## Who the tool covers

- **Searchable parcels:** every address can be searched. Parcels outside the tool's scope get a "this tool doesn't
  cover your property" screen that explains why, rather than "not found":
  - not zoned R1/R2: 358
  - condo: 39
  - not a 1–3 family home: 656
  - irregular lot: 579
  - missing yard data: 24

  That leaves **2,254 supported parcels**.
- **Irregular lots stop the tool.** Any parcel with `flag_irregular_parcel` (or no measurable front/rear yard or
  width) gets the "sorry, our tool needs to be updated to work with your lot" screen. The wording is an open
  question.
- ⚠️ **Owner-occupancy is required** for any ADU (Article 2 ADU definition, confirmed on boston.gov). Answering "No"
  (or "owned by an LLC") does *not* stop the tool. A banner explains the rule and links to *Have a say*, and every
  result carries a reminder.
- **Unit count** is pre-filled from assessor land use (1/2/3-family) and can be corrected on the details form.

## Site check (Article 60, Table 6)

The check runs before any options. Failing any check leads to the **"As-of-right ADU not possible"** screen, which
lists each failing check.

| Check | Rule | Parcels failing |
|---|---|---|
| Homes after the ADU | R1 ≤ 3, R2 ≤ 4 (Table 7) | 13 |
| Lot coverage | ≤ 60% on lots < 5,000 sf; ≤ 50% on lots ≥ 5,000 sf | 25 |
| Front yard | ≥ 5 ft | 70 |
| Side yards (narrower side) | ≥ 3 ft | **473** |
| Rear yard | ≥ 20 ft | 227 |
| Height / stories | ≤ 40 ft, ≤ 3.5 stories | 2 |
| Frontage | ≥ 20 ft | 0 |

Of the 2,254 supported parcels, 1,586 pass and 668 fail.

- **Coverage = all building footprints ÷ parcel area** (our data). It does not use assessor gross area, and sheds
  and garages count.
- ⚠️ **5,000 sf boundary:** the fact sheet says "< 5,000 sf → 60%" and "≥ 5,000 sf → 50%", so a lot of exactly
  5,000 sf gets 50%. Only one parcel rounds to exactly 5,000, but **75 supported parcels are within ±50 sf**. GIS
  areas aren't survey-accurate, so these could fall on either side.
- **Unpaved ground ≥ 15%** isn't in our data. It is shown as "unknown, a survey will confirm" and never fails.
- ⚠️ **Side yards use the narrower side.** The team's `side_yard_distance_ft` is the *larger* side, so
  `build_data.py` measures both sides per edge from `yard_distances.gpkg` and the check uses the smaller. Yards are
  measured to the parcel's bounding-rectangle edges, not the true lot line. This is the single biggest cause of "not
  possible" results; see OPEN_QUESTIONS (nonconformity).
- Flood zone, within 100 ft of a park, and Neighborhood Design Overlay are flags ("may need extra review"), never
  failures. Mattapan has no historic districts or coastal flood overlay.

## Lot-size routing

- Lot size is set by **street-facing width** (`lot_frontage_ft`): small < 40 ft, medium 40–60 ft, large ≥ 60 ft,
  per the Guidebook (p. 33) and Miro Z-22. This is strict width bands only, which is an open question.
- Options shown:
  - **Small lots:** Split, Attic, Add a Floor, Basement, Extend Into the Rear Yard.
  - **Medium lots:** Extend Towards the Backyard, Attach on a Corner Lot, Attach on the Side, Adapt Your Garage.
  - **Large lots:** the four medium options plus Build in Your Backyard and Attach in Your Front Yard (as in the
    Figma "Medium & Larger Lots" prototype).
- Options that can't apply to this lot are collapsed into a hidden **"Show N options not available here"** section.
  Examples are Corner on a non-corner lot, and Garage with no garage on record when the user said there isn't one.

## Size and height limits (Article 60, Table 5)

- **Attached / internal ADU:** at most the smaller of 75% of the principal unit or 1,250 sf. (The Guidebook photo
  caption's 1,350 sf is not used.)
- ⚠️ **"Principal unit" size = assessor living area ÷ number of units.** If living area is missing, house footprint ×
  stories is used instead. For most homes the 1,250 sf cap is the tighter limit anyway.
- **Detached ADU:** at most the smaller of 900 sf or the house footprint, and no taller than the smaller of
  1.5 stories or the house.
- **Minimum space:** 220 sf envelope (Miro E-02); 330 sf for one person + 100 sf per extra person (Guidebook).
- **Bedrooms → floor area** (to compare against the caps): studio 450, 1 bed 600, 2 bed 850, 3 bed 1,100 sf.
  These are rough values picked within the Guidebook's 420–1,350 GSF design range.

## Buildable area (pre-computed in `build_data.py`)

- **Attached envelope:** parcel minus a 5 ft front strip, 3 ft side strips and a 20 ft rear strip (buffers of the
  classified bounding-box edges), minus all buildings. It "fits" if one piece is ≥ 220 sf and at least 12 ft wide.
- **Detached envelope:** 5 ft front, 3 ft side and 10 ft rear strips; 5 ft from the house; 8 ft from accessory
  buildings (Miro / Figma C2). The largest square that fits is stored and compared with the wanted footprint.
- **Rear additions** are assumed to be the house's width, capped at 24 ft, when estimating new coverage.
- **Side additions:** the usable width is side yard − 3 ft, or − 10 ft if there's a driveway on that side
  (Sec. 60-33.5). It must leave at least 7 ft (Miro T-05), so a side yard of 10 ft or more is needed. Left and right
  are worked out from the front edge's orientation.
- **Garage** = the largest footprint on the parcel with building land-use code `G` (466 supported parcels). The user
  confirms it on the details form.

## Fire access

Official City fire guidance is used. It matches the Miro board; the Guidebook table appears to have its columns
swapped.

| Case | Limit |
|---|---|
| No sprinklers | door ≤ 50 ft and every wall ≤ 150 ft from the street |
| With sprinklers | door ≤ 150 ft, walls ≤ 250 ft |
| Behind the house with < 20 ft of side frontage (side yard < 20 ft) | door ≤ 25 ft, no sprinkler increase |

When a unit sits behind the house without that 20 ft frontage:
- **Detached:** sprinklers + a 10 ft firefighter path + wayfinding *may* be accepted. Shown as a requirement to look
  at.
- **Attached:** it needs an interior throughway to the main entrance. If there isn't one, the result is "Closer look
  needed".

Other fire-related rules:
- ⚠️ **Door-to-street distances are measured from the front lot line, not the curb.** `fire_travel_dist_ft` equals
  front yard + building depth exactly, so it has no sidewalk offset. Real curb distances are a few feet longer. Door
  positions by option:
  - internal ADU: front-yard depth
  - rear addition: fire travel distance + addition depth
  - side addition: front yard + 5 ft
  - garage / backyard: measured from the footprint or the envelope
- **Building-code sprinklers:** an attached or internal ADU that makes 3+ units in one building needs sprinklers.
- **Converted rear garage:** sprinklers if it's > 25 ft from the street and behind the house (Guidebook / Miro F-04).
- **A sprinkler requirement alone doesn't downgrade a result.** It appears as a "requirement to look at" and a cost
  note. The status drops only when access fails even with sprinklers.
- The 3 ft exit path to the street (Miro F-01/02/05) isn't in our data. It always appears as "confirm with a
  professional".

## Per-option decisions

- **Split Your Unit:**
  - not fitting inside, or no separate kitchen/bath → *Not supported*
  - entry through the main home → *Not supported*
  - shared entry hall → *Closer look*
  - own outside door → can be *Possible*
- **Convert Your Attic:**
  - no attic → *Not supported*
  - no sprinklers → *Closer look* (an external stair / second exit is "complicated", per the Miro board comment)
- **Convert Your Basement:**
  - ceiling under 7′6″ → *Not supported*
  - fully below ground → *Closer look* (egress windows)
  - in a flood zone → *Closer look* (must be above base flood elevation)
- **Add Another Floor** and **Attach in Your Front Yard:** fixed *Closer look needed*, as in Figma. Exceeding
  3.5 stories or 40 ft still gives *Not supported*.
- **One "Build in Your Backyard" option** (the Guidebook's mid-sized and large backyard designs are merged).
- The **corner-lot** street-side yard is the wider side yard minus 5 ft, and must leave ≥ 7 ft.

## Help paying

- The program is the Boston Home Center ADU loan: interest-free, up to $50k, for owner-occupied 1–3 unit homes, with
  assets under $100k.
- Income limit: ⚠️ **135% AMI by household size, from the Mayor's Office of Housing "Income & Rent Limits"
  (June 15 2026), City/MHP homeownership table.**
  - Sizes 1–6 are published.
  - Sizes 7–8 are extrapolated with HUD's family-size factors (124% / 132% of the 4-person limit).
  - Between 120% and 135% AMI the owner match note is shown.
- Finance answers are not saved; everything else is kept in sessionStorage for the browser tab.

## Site plan diagrams

The diagrams are illustrations: **they never change a status or a number in a result.** They are built from the
parcel's measured values (`web/src/components/SitePlan.tsx`, inputs from `basePlan()` in `web/src/rules/options.ts`).

**What is drawn from real data**

| Drawn element | Source |
|---|---|
| Lot | Rectangle of `lot_frontage_ft` × `lot_depth_ft`, from the team's rotated bounding rectangle. The street is always at the bottom. |
| House | Rectangle of `primary_bldg_width_ft` × `primary_bldg_depth_ft`, set back by the front-yard distance. |
| House, left-to-right | Placed by the measured left and right side yards. Left/right are as seen from the street. Side yard + house width + side yard comes to 97–100% of the lot width for most parcels. |
| Garage | Drawn where city footprints put it (code `G` building). `build_data.py` measures its distance from the front lot line and the left side line (`garagePlan`). It is pink on the garage option and grey with a dashed outline on every other option. |
| Backyard ADU | Centred on the middle of the largest open square the detached-ADU calculation found (`detachedSpot`). |
| Rear / side additions | Sized from the user's answers: rear extension depth; side yard minus 3 ft, or minus 10 ft with a driveway. |

**Simplifications**

- **Rectangles, not true shapes.** Wedge or angled lots, and L-shaped houses, are drawn as their bounding
  rectangles.
- **Overlap fix.** A backyard spot beside a narrow part of an L-shaped house can land on the drawn rectangle. When
  that happens the sketch moves the ADU behind the drawn house, keeping a 5 ft gap (e.g. 507 Norfolk St).
- **Size limits.** Lots narrower than 20 ft or wider than 160 ft, or shallower than 40 ft or deeper than 260 ft, are
  drawn at that limit. Everything on them is scaled by the same factors, and the dimension labels show the real
  feet.
- **Fallback sizes** when a value is missing: a 50 × 100 ft lot, a 30 × 35 ft house and a 15 ft front yard. Lots
  missing width or yards are already stopped before options.
- **Fallback placements:**
  - With no garage on record, the garage option uses an illustrative back-corner position and says so in the
    caption.
  - With no open spot found, the backyard option does the same.
  - The house is centred when side yards are unknown.
- **Fixed illustrations.** Attic, basement, add a floor, split, front yard and corner shapes are proportional to the
  house, not measured.
- **Not drawn:** sheds and other non-garage outbuildings, driveways, and the exact position of the second street on a
  corner lot.

## Display

- Results always carry a "preliminary, not a zoning determination" note.
