import type { MapCategory } from '../rules/site';

/**
 * Map colours, shared by the map and the legend on the Find page. Kept out of
 * ParcelMap.tsx so the legend doesn't pull in the ~1 MB map library: the map
 * itself is loaded on demand (see Find.tsx).
 */
export const MAP_COLORS = {
  covered: '#e6f0e1', // pale green: homes this tool can check
  pending: '#fbefd5', // pale amber: homes the tool can't check yet
  other: '#dedad3', // warm grey: other zoning or not a 1–3 family home
  building: '#b9b2b0',
  accessory: '#d9d3d0',
  selected: '#1f5fa8',
} satisfies Record<MapCategory | 'building' | 'accessory' | 'selected', string>;

