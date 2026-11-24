import type { ReactNode } from 'react';
import type { OptionId } from '../rules/options';

/**
 * "Understand the rules" explanations. Written from: the Article 60 Residential
 * Zoning Amendment Fact Sheet (BPDA, 2024), the City's "Guidance on ADUs and Fire
 * Safety" (Dec 2023), the Boston ADU Guidebook, and boston.gov ADU pages.
 * Plain English, short sentences (Figma design-system tone guidance).
 */
export type TopicId =
  | 'asOfRight'
  | 'whatIsAdu'
  | 'coverage'
  | 'setbacks'
  | 'rearSetback'
  | 'height'
  | 'size'
  | 'fire'
  | 'sprinklers'
  | 'units'
  | 'owner'
  | 'unusual'
  | 'flood'
  | 'egress'
  | 'detached'
  | 'corner'
  | 'technical';

const P = ({ children }: { children: ReactNode }) => <p>{children}</p>;

export const RULE_TOPICS: Record<TopicId, { title: string; body: ReactNode }> = {
  asOfRight: {
    title: 'What does “as-of-right” mean?',
    body: (
      <>
        <P>
          A project is “as-of-right” when it meets all the zoning rules, so it doesn’t need a public hearing or approval from the Zoning Board of Appeal. You still need
          building permits from Inspectional Services.
        </P>
        <P>
          Since January 2024, Mattapan’s zoning (Article 60) allows internal, attached and detached ADUs as-of-right in the R1 and R2 subdistricts, when they meet the
          size, height and yard rules. Elsewhere in Boston, most attached and detached ADUs still need zoning relief.
        </P>
      </>
    ),
  },
  whatIsAdu: {
    title: 'What counts as an ADU?',
    body: (
      <>
        <P>
          An ADU is a self-contained home — its own kitchen, bathroom and living space — with its own separate entrance, on the same lot as a main home where the owner
          lives.
        </P>
        <P>
          A space that shares a kitchen or bathroom with the main home isn’t an ADU. Mattapan’s zoning calls that an “Extended Living Suite”, which is also allowed.
        </P>
      </>
    ),
  },
  coverage: {
    title: 'How is lot coverage calculated?',
    body: (
      <>
        <P>Lot coverage is the share of your lot covered by buildings — your house, garage and any other structures — measured from above.</P>
        <P>
          On lots adding an ADU, buildings may cover up to 60% of a lot under 5,000 sq ft, or 50% of a lot of 5,000 sq ft or more. At least 15% of the lot must stay
          permeable (unpaved), so rain can soak in.
        </P>
        <P>We estimate coverage from the City’s building footprint map. Porches, decks and small sheds may be missing, so a survey will give the true figure.</P>
      </>
    ),
  },
  setbacks: {
    title: 'What are yards and setbacks?',
    body: (
      <>
        <P>
          A yard (or setback) is the open space between a building and the lot line. On lots adding an ADU in Mattapan: front yard at least 5 ft, side yards at least 3
          ft on each side, rear yard at least 20 ft.
        </P>
        <P>
          Your front yard faces the street you’re addressed on; the rear yard is opposite; the side yards are in between. Corner lots and unusual shapes may define their
          yards differently.
        </P>
      </>
    ),
  },
  rearSetback: {
    title: 'What is a rear setback?',
    body: (
      <>
        <P>
          The rear setback is the part of your backyard, next to the back lot line, that must stay open. In Mattapan it’s 20 ft for lots adding an ADU. An addition can
          extend into the backyard only as far as that line.
        </P>
        <P>Rear yards keep light, air and green space between neighbors, and room for stormwater to soak in.</P>
      </>
    ),
  },
  height: {
    title: 'How tall can an ADU be?',
    body: (
      <>
        <P>On lots adding an ADU, buildings may be up to 40 ft and 3½ stories.</P>
        <P>
          An addition or extension can be no taller than your main house. A detached ADU can be no taller than 1½ stories, or the height of your house if that’s lower.
        </P>
        <P>How the “no taller than the main house” rule applies to adding a whole new top floor hasn’t been settled.</P>
      </>
    ),
  },
  size: {
    title: 'How big can an ADU be?',
    body: (
      <>
        <P>An internal or attached ADU can add no more than 75% of the floor area of your main home, or 1,250 sq ft — whichever is smaller.</P>
        <P>A detached ADU can have a floor plate (footprint) up to 900 sq ft, or the footprint of your main house if that’s smaller.</P>
        <P>
          The smallest legal home (an “efficiency unit”) is about 330 sq ft for one person, with at least one 190 sq ft room. Add about 100 sq ft for each extra person.
        </P>
      </>
    ),
  },
  fire: {
    title: 'Why does firefighter access matter?',
    body: (
      <>
        <P>
          Firefighters need to reach every home quickly. The fire code measures from the curb of the street (the “fire access road”) to the ADU’s door, and to the
          farthest part of its ground-floor walls.
        </P>
        <P>
          Without sprinklers: door within 50 ft, walls within 150 ft. With sprinklers: door within 150 ft, walls within 250 ft. If the ADU is behind your house and there
          isn’t 20 ft of open space beside the house to the street, the door must be within 25 ft — or, for an attached ADU, reachable through an indoor hallway from your
          front door.
        </P>
      </>
    ),
  },
  sprinklers: {
    title: 'When are sprinklers needed?',
    body: (
      <>
        <P>Two different codes can require sprinklers:</P>
        <P>
          <strong>Fire code</strong> — when the ADU is far from the street (see firefighter access). <strong>Building code</strong> — when adding the ADU makes 3 or more
          homes in one building. Then sprinklers are needed where the new home is created.
        </P>
        <P>A detached ADU is its own one-home building, so the building code alone doesn’t require sprinklers. Sprinklers can be a significant cost, so plan early.</P>
      </>
    ),
  },
  units: {
    title: 'How many homes can my lot have?',
    body: (
      <>
        <P>Including ADUs, an R1 lot can have up to 3 homes and an R2 lot up to 4.</P>
        <P>A lot can have at most one internal or attached ADU and one detached ADU. For example, a single-family house in R1 could add a basement ADU and a backyard ADU.</P>
      </>
    ),
  },
  owner: {
    title: 'Do I have to live on the property?',
    body: (
      <>
        <P>
          Yes. In Mattapan an ADU is allowed only on a lot where the owner is also a resident. Condominiums and properties owned by LLCs aren’t eligible. The City’s
          financial help also requires owner-occupancy.
        </P>
        <P>
          This is a policy choice that could change. If you think it should, see <a href="#/have-a-say">Have a say</a>.
        </P>
      </>
    ),
  },
  unusual: {
    title: 'What if my lot is an unusual shape?',
    body: (
      <>
        <P>
          Our measurements assume a roughly rectangular lot with one street frontage. On L-shaped, angled, very irregular or corner lots, which side is the “front” or
          “rear” can change, and so do the yard rules.
        </P>
        <P>A survey or plot plan shows your exact lot lines. A designer can tell you how the rules apply to your shape.</P>
      </>
    ),
  },
  flood: {
    title: 'What does a flood zone mean for my ADU?',
    body: (
      <>
        <P>
          If your lot is in a FEMA flood hazard area, the ADU must sit above the base flood elevation. That matters most for basements, which may need flood-resistant
          design or may not be workable.
        </P>
        <P>Flood maps are an early screening signal, not a full assessment. A professional can tell you what applies.</P>
      </>
    ),
  },
  egress: {
    title: 'What is “means of egress”?',
    body: (
      <>
        <P>
          Means of egress is a safe way out in an emergency: the route from inside the home, through a door or large window, to the street. Each home also needs a clear
          path at least 3 ft wide from its exit to the street.
        </P>
        <P>Unless the building has sprinklers, an ADU usually needs two ways out. Basement and attic ADUs often need an egress window or an outside stair.</P>
      </>
    ),
  },
  detached: {
    title: 'What rules apply to a separate building?',
    body: (
      <>
        <P>
          A detached ADU must be at least 5 ft from any other building on the lot. Our placement also keeps 8 ft from sheds or garages and 10 ft from the rear lot line,
          following the team’s decision tree. Its footprint can be up to 900 sq ft, and it can be up to 1½ stories.
        </P>
        <P>A garage or carriage house can be converted. Older garages often sit right on the lot line; reusing one may be allowed, but rebuilding may mean moving it.</P>
      </>
    ),
  },
  corner: {
    title: 'How do corner lots work?',
    body: (
      <>
        <P>On a corner lot, front-yard rules apply along every street line, so the side facing the second street must also stay 5 ft back.</P>
        <P>Nothing over 2½ ft tall can sit within 20 ft of the corner, so drivers can see each other (a “visibility triangle”).</P>
      </>
    ),
  },
  technical: {
    title: 'Technical details and sources',
    body: (
      <>
        <P>Zoning: Boston Zoning Code Article 60 (Greater Mattapan), as amended January 2024 — Tables 5, 6 and 7 and the Article 2 ADU definitions.</P>
        <P>Fire and building code: 527 CMR 1.00 Chapter 18 and 780 CMR, as explained in the City’s “Guidance on ADUs and Fire Safety” (December 2023).</P>
        <P>
          Property data: City of Boston parcels (2025), building footprints, FY2025 assessor records, FEMA flood maps and Boston open space, processed by the MIT 11.458
          class. Yard distances are estimated from maps and may differ from a survey.
        </P>
        <P>
          Full list of thresholds and our assumptions: <a href="#/rules">Rules and sources</a>.
        </P>
      </>
    ),
  },
};

const BY_OPTION: Record<OptionId, TopicId[]> = {
  split: ['whatIsAdu', 'egress', 'sprinklers', 'units', 'asOfRight', 'technical'],
  attic: ['size', 'egress', 'sprinklers', 'fire', 'asOfRight', 'technical'],
  floor: ['height', 'size', 'sprinklers', 'asOfRight', 'technical'],
  basement: ['flood', 'egress', 'size', 'sprinklers', 'asOfRight', 'technical'],
  'rear-small': ['rearSetback', 'coverage', 'fire', 'size', 'asOfRight', 'unusual', 'technical'],
  'rear-medium': ['rearSetback', 'coverage', 'fire', 'size', 'asOfRight', 'unusual', 'technical'],
  corner: ['corner', 'setbacks', 'size', 'fire', 'asOfRight', 'technical'],
  side: ['setbacks', 'coverage', 'fire', 'size', 'asOfRight', 'unusual', 'technical'],
  garage: ['detached', 'fire', 'sprinklers', 'size', 'asOfRight', 'technical'],
  backyard: ['coverage', 'detached', 'fire', 'asOfRight', 'unusual', 'technical'],
  front: ['setbacks', 'corner', 'size', 'asOfRight', 'unusual', 'technical'],
};

export function topicsFor(id: OptionId): TopicId[] {
  return BY_OPTION[id];
}
