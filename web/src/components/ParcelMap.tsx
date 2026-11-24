import maplibregl, { type GeoJSONSource, type Map as MLMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef } from 'react';
import { loadParcels } from '../data/session';
import { mapCategory } from '../rules/site';
import { MAP_COLORS } from './mapColors';

const base = import.meta.env.BASE_URL;

type FC = GeoJSON.FeatureCollection;
/**
 * Parcel shapes, fetched once and shared. The highlight uses the full feature
 * from here: querySourceFeatures() returns shapes clipped to MapLibre's
 * internal tiles, which drew partial outlines for lots crossing a tile edge.
 */
let parcelsGeo: Promise<{ fc: FC; byId: Map<string, GeoJSON.Geometry> }> | null = null;
function loadParcelShapes() {
  if (!parcelsGeo) {
    parcelsGeo = Promise.all([fetch(`${base}data/parcels.geojson`).then((r) => r.json() as Promise<FC>), loadParcels()]).then(
      ([fc, recs]) => {
        // Tag each shape with its map category (see mapCategory in rules/site.ts).
        for (const f of fc.features) f.properties = { ...f.properties, c: mapCategory(recs[String(f.properties?.id)]) };
        return { fc, byId: new Map(fc.features.map((f) => [String(f.properties?.id), f.geometry])) };
      },
    );
  }
  return parcelsGeo;
}
/**
 * Maps that have been removed (user left the page). Parcel shapes load asynchronously,
 * so callbacks check this before touching a map that no longer exists.
 */
const removedMaps = new WeakSet<MLMap>();
const EMPTY: FC = { type: 'FeatureCollection', features: [] };

/**
 * Plain parcel map (no basemap tiles, per the Figma design): parcels, building
 * footprints and street lines from our own data. Click a parcel to select it.
 */
export function ParcelMap({
  selectedId,
  onSelect,
  center,
}: {
  selectedId?: string;
  onSelect: (id: string) => void;
  center?: [number, number];
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const ready = useRef(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!el.current) return;
    const m = new maplibregl.Map({
      container: el.current,
      style: {
        version: 8,
        sources: {
          parcels: { type: 'geojson', data: EMPTY, promoteId: 'id' },
          buildings: { type: 'geojson', data: `${base}data/buildings.geojson` },
          streets: { type: 'geojson', data: `${base}data/streets.geojson` },
          sel: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
        },
        layers: [
          { id: 'bg', type: 'background', paint: { 'background-color': '#efeeea' } },
          { id: 'streets', type: 'line', source: 'streets', paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 2, 17, 18] } },
          {
            id: 'parcels-fill',
            type: 'fill',
            source: 'parcels',
            paint: {
              'fill-color': ['match', ['get', 'c'], 'covered', MAP_COLORS.covered, 'pending', MAP_COLORS.pending, MAP_COLORS.other],
              'fill-opacity': 1,
            },
          },
          { id: 'parcels-line', type: 'line', source: 'parcels', paint: { 'line-color': '#a3a29c', 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 0.3, 18, 1] } },
          { id: 'buildings', type: 'fill', source: 'buildings', paint: { 'fill-color': ['case', ['==', ['get', 'm'], 1], MAP_COLORS.building, MAP_COLORS.accessory], 'fill-outline-color': '#6b737c' } },
          { id: 'sel-fill', type: 'fill', source: 'sel', paint: { 'fill-color': MAP_COLORS.selected, 'fill-opacity': 0.18 } },
          { id: 'sel-line', type: 'line', source: 'sel', paint: { 'line-color': MAP_COLORS.selected, 'line-width': 3 } },
        ],
      },
      center: center ?? [-71.0915, 42.2725],
      zoom: center ? 17.5 : 14,
      attributionControl: { compact: true, customAttribution: 'City of Boston open data' },
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    m.on('load', () => {
      loadParcelShapes().then(({ fc }) => {
        if (removedMaps.has(m)) return;
        (m.getSource('parcels') as GeoJSONSource | undefined)?.setData(fc);
        ready.current = true;
        highlight(m, selectedIdRef.current);
      });
    });
    m.on('click', 'parcels-fill', (e) => {
      const id = e.features?.[0]?.properties?.id;
      if (id) onSelectRef.current(String(id));
    });
    m.on('mouseenter', 'parcels-fill', () => (m.getCanvas().style.cursor = 'pointer'));
    m.on('mouseleave', 'parcels-fill', () => (m.getCanvas().style.cursor = ''));
    map.current = m;
    return () => {
      removedMaps.add(m);
      map.current = null;
      m.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  useEffect(() => {
    const m = map.current;
    if (m && ready.current) highlight(m, selectedId);
  }, [selectedId]);
  useEffect(() => {
    if (center && map.current) map.current.easeTo({ center, zoom: Math.max(map.current.getZoom(), 17.5), duration: 600 });
  }, [center?.[0], center?.[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={el} className="ml" aria-label="Map of Mattapan parcels. Click a parcel to select it." role="application" />;
}

function highlight(m: MLMap, id?: string) {
  const src = m.getSource('sel') as GeoJSONSource | undefined;
  if (!src) return;
  if (!id) return src.setData(EMPTY);
  loadParcelShapes().then(({ byId }) => {
    if (removedMaps.has(m)) return;
    const geometry = byId.get(id);
    src.setData(geometry ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry }] } : EMPTY);
  });
}
