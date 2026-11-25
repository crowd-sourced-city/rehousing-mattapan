import maplibregl, { type ExpressionSpecification, type GeoJSONSource, type Map as MLMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef } from 'react';
import { NEUTRAL } from './layers';

/** Mattapan, framed to fit the analysed parcels. */
const BOUNDS: [[number, number], [number, number]] = [
  [-71.1095, 42.2632],
  [-71.0749, 42.2879],
];

export interface View {
  center: [number, number];
  zoom: number;
}

/**
 * A plain lot map (no basemap tiles): parcels coloured by `fill`, streets in white.
 * `sync` lets several maps pan and zoom together.
 */
export function LotMap({
  shapes,
  streets,
  fill,
  onLotClick,
  selectedId,
  sync,
  height = 360,
  label,
  interactive = true,
}: {
  shapes: GeoJSON.FeatureCollection;
  streets: GeoJSON.FeatureCollection;
  fill: ExpressionSpecification;
  onLotClick?: (id: string) => void;
  selectedId?: string | null;
  sync?: { subscribe: (fn: (v: View, from: MLMap) => void) => () => void; publish: (v: View, from: MLMap) => void };
  height?: number | string;
  label: string;
  interactive?: boolean;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const ready = useRef(false);
  const clickRef = useRef(onLotClick);
  clickRef.current = onLotClick;

  useEffect(() => {
    if (!el.current) return;
    const m = new maplibregl.Map({
      container: el.current,
      style: {
        version: 8,
        sources: {
          lots: { type: 'geojson', data: shapes, promoteId: 'id' },
          streets: { type: 'geojson', data: streets },
          sel: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
        },
        layers: [
          { id: 'bg', type: 'background', paint: { 'background-color': NEUTRAL.bg } },
          { id: 'lots', type: 'fill', source: 'lots', paint: { 'fill-color': fill } },
          { id: 'lot-lines', type: 'line', source: 'lots', paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.15, 17, 1] } },
          { id: 'streets', type: 'line', source: 'streets', paint: { 'line-color': NEUTRAL.street, 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 1.2, 17, 14] } },
          { id: 'sel', type: 'line', source: 'sel', paint: { 'line-color': '#1b252f', 'line-width': 3 } },
        ],
      },
      bounds: BOUNDS,
      fitBoundsOptions: { padding: 8 },
      interactive,
      attributionControl: false,
      cooperativeGestures: true,
    });
    if (interactive) m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    m.on('load', () => {
      ready.current = true;
      m.resize();
    });
    m.on('click', 'lots', (e) => {
      const id = e.features?.[0]?.properties?.id;
      if (id && clickRef.current) clickRef.current(String(id));
    });
    m.on('mouseenter', 'lots', () => clickRef.current && (m.getCanvas().style.cursor = 'pointer'));
    m.on('mouseleave', 'lots', () => (m.getCanvas().style.cursor = ''));

    // Pan/zoom together with sibling maps.
    let applying = false;
    const unsub = sync?.subscribe((v, from) => {
      if (from === m) return;
      applying = true;
      m.jumpTo(v);
      applying = false;
    });
    m.on('move', () => {
      if (!applying && sync) sync.publish({ center: m.getCenter().toArray() as [number, number], zoom: m.getZoom() }, m);
    });

    map.current = m;
    return () => {
      unsub?.();
      m.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restyle without rebuilding the map.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const apply = () => m.setPaintProperty('lots', 'fill-color', fill);
    if (ready.current) apply();
    else m.once('load', apply);
  }, [fill]);

  // The data itself can change (reform scenarios rewrite properties).
  useEffect(() => {
    const m = map.current;
    if (m && ready.current) (m.getSource('lots') as GeoJSONSource).setData(shapes);
  }, [shapes]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const apply = () => {
      const f = selectedId ? shapes.features.find((x) => x.properties?.id === selectedId) : null;
      (m.getSource('sel') as GeoJSONSource).setData({ type: 'FeatureCollection', features: f ? [f] : [] });
    };
    if (ready.current) apply();
    else m.once('load', apply);
  }, [selectedId, shapes]);

  return <div ref={el} className="lotmap" style={{ height }} role="img" aria-label={label} />;
}

/** A tiny pub/sub so several maps move together. */
export function createSync() {
  const subs = new Set<(v: View, from: MLMap) => void>();
  return {
    subscribe(fn: (v: View, from: MLMap) => void) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    publish(v: View, from: MLMap) {
      for (const fn of subs) fn(v, from);
    },
  };
}
