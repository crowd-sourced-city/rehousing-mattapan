# Open Questions

Bigger questions that are unresolved, or where the prototype picked a direction that should be revisited. Smaller
or more confident calls are in [ASSUMPTIONS.md](ASSUMPTIONS.md).

## High impact on results

1. **Lot-size routing.** The tool uses strict street-width bands (small < 40, medium 40–60, large ≥ 60 ft), per Miro
   and the Guidebook. Problems:
   - 1,118 parcels are within 3 ft of a cutoff.
   - Odd shapes route badly; the test parcels 99 Lorna Rd and 23 Newcroft Cir both carry "medium designs would
     suit".
   - Small-lot conversions (attic, basement, split, add a floor) are never shown to medium or large lots, although
     the Guidebook says they usually work there too.

   Options: show small-lot options to everyone as a second group, or add depth/area signals.
2. **Existing nonconformity (Sec. 60-34).** The site check fails **473 parcels on the 3 ft side yard** (plus 227 rear
   and 70 front). Many are older homes that already don't meet today's setbacks. Sec. 60-34 appears to allow work
   that doesn't increase a nonconformity. An attic or basement ADU arguably shouldn't be blocked by an existing
   narrow side yard. Our yards are also measured to bounding-box edges, so some failures are measurement error.
   Should internal ADUs skip the yard checks?
3. **Irregular lots stop the tool.** That's 579 of the R1/R2 1–3 family parcels (961 flagged across all
   parcels, ~25%). Questions:
   - Is the `flag_irregular_parcel` definition too strict?
   - What should the stop screen say? Current text: "Sorry — our tool needs to be updated to work with your lot",
     with a link to the City's ADU team.
4. **Bedroom question.**
   - Today it is optional and only *re-sorts* the overview cards (Figma), using the Guidebook's "Choose your own
     ADUventure" bedroom ranges. It also sets the wanted floor area inside options (450 / 600 / 850 / 1,100 sf for
     studio–3 bed).
   - Miro uses bedrooms to *filter* options.
   - "2 bedrooms" sits in both the 1–2 and 2–3 buckets.
5. **Add Another Floor and Attach in Your Front Yard** always return "Closer look needed" (Figma). Miro has full
   calculations for both:
   - Front yard: corner rules, 10 ft driveway side yard, depth − 5 ft.
   - Add a floor: Miro's "addition taller than the house → remove" would rule out every added floor, which seems
     wrong.

   Implement Miro's calculations?
6. **One vs two backyard options.** The Guidebook has mid-sized and large backyard ADUs; Miro gives both the same
   logic; the tool merges them into one.
7. **Fire access estimates.**
   - Door distances come from the lot line, not the curb.
   - Is "side yard ≥ 20 ft" the right proxy for "20 ft of frontage between the house and side lot line"?
   - Detached ADUs behind a house without frontage show *Looks possible* with a "needs sprinklers + 10 ft
     firefighter path" requirement. Should that be *Closer look needed* instead? Figma examples are inconsistent
     here.
8. **Principal unit size for the 75% rule.** Is it the principal *unit* or the whole principal *structure*? The fact
   sheet and the Article 2 definition read differently. The tool uses living area ÷ units.
9. **Rear setback for a new detached ADU.** The tool uses 10 ft (Miro detached module / Figma). The Miro garage
   module and Table 6 use 20 ft for principal buildings. Which applies to accessory buildings in Mattapan?

## Data and sources the team should supply

10. **Small-lot and large-lot decision spreadsheets.** Only the medium-lot spreadsheet exists. The other lanes follow
    the Miro board.
11. **"Income and Rent Limits" spreadsheet** referenced in FN-03/FN-05. The tool uses the official MOH June 2026
    table (135% AMI, homeownership). Please confirm it is the right table and year, and supply 7–8 person figures
    (currently extrapolated).
12. **Unpaved ground (≥ 15%) and the 3 ft exit path** have no data source. They always show "confirm with a
    professional".
13. The **"Automation Layer / Data Inventory / Parcel Tests / Open Questions"** Google Sheet linked from Miro, and the
    "Assumptions" / "Zoning Schema" docs, couldn't be read. They may resolve some items above.

## Product and UI

14. **Owner-occupancy "No" path.** The tool lets the user keep exploring, with a banner and a *Have a say* link.
    Should results be visually muted in this case?
15. **"Understand the rules" and "How we reached this result" content** was drafted from the fact sheet, fire
    guidance and Guidebook. It needs a review by the team for accuracy and tone.
16. **Unknown values on the "not possible" screen.** It lists failing checks from map estimates. Should users be able
    to correct a measured value (e.g. side yard) and re-run, as Figma suggests for property facts?
