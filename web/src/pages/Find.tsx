import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MAP_COLORS } from '../components/mapColors';
import { Banner } from '../components/ui';
import { useParcels, useSession } from '../data/session';
import { coverageCap, LOT_SIZE_LABEL, lotSize, mapCategory, unsupportedReason } from '../rules/site';
import type { Parcel } from '../rules/types';
import { PRIVATE, track } from '../telemetry';

// The map library is ~1 MB, so it is only downloaded when this page needs it.
const ParcelMap = lazy(() => import('../components/ParcelMap').then((m) => ({ default: m.ParcelMap })));

const fmt = (n: number | null | undefined) => (n == null ? '—' : Math.round(n).toLocaleString('en-US'));

function normalize(s: string) {
  return s
    .toLowerCase()
    .replace(/\b(street)\b/g, 'st')
    .replace(/\b(avenue|av)\b/g, 'ave')
    .replace(/\b(road)\b/g, 'rd')
    .replace(/\b(terrace)\b/g, 'te')
    .replace(/\b(circle|cir)\b/g, 'ci')
    .replace(/\b(highway|hwy)\b/g, 'hw')
    .replace(/[.,#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function searchParcels(all: Parcel[], q: string, limit = 8): Parcel[] {
  const n = normalize(q);
  if (n.length < 2) return [];
  const tokens = n.split(' ');
  const scored: [number, Parcel][] = [];
  for (const p of all) {
    if (!p.address) continue;
    const a = normalize(p.address);
    if (!tokens.every((t) => a.includes(t))) continue;
    const score = (a.startsWith(n) ? 0 : 10) + a.length / 100 + (p.zoning === 'R1' || p.zoning === 'R2' ? 0 : 5);
    scored.push([score, p]);
  }
  return scored.sort((x, y) => x[0] - y[0]).slice(0, limit).map((x) => x[1]);
}

export default function Find() {
  const { parcels, error } = useParcels();
  const session = useSession();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const selectedId = params.get('p') ?? session.parcelId;
  const list = useMemo(() => (parcels ? Object.values(parcels) : []), [parcels]);
  const results = useMemo(() => searchParcels(list, q), [list, q]);
  const selected = selectedId && parcels ? parcels[selectedId] : undefined;

  useEffect(() => {
    if (selected && !q) setQ(selected.address ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const choose = (id: string, via: 'search' | 'map') => {
    setParams({ p: id }, { replace: true });
    session.setParcel(id);
    const p = parcels?.[id];
    // Coarse traits only: never the address or lot ID.
    if (p) track('lot_selected', { via, lot_size: lotSize(p), zoning: p.zoning, category: mapCategory(p), supported: !unsupportedReason(p) });
    if (p) setQ(p.address ?? '');
    setOpen(false);
  };

  // A search that finds nothing is a sign someone is stuck. Sent once the typing pauses;
  // only the length of what was typed leaves the browser, never the text.
  const noResults = open && q.length >= 3 && results.length === 0 && !!parcels;
  useEffect(() => {
    if (!noResults) return;
    const t = setTimeout(() => track('search_no_results', { query_length: q.length }), 1200);
    return () => clearTimeout(t);
  }, [noResults, q]);

  const unsupported = selected ? unsupportedReason(selected) : null;
  const size = selected ? lotSize(selected) : null;

  return (
    <div className="find-layout">
      <aside className="find-side stack" style={{ ['--gap' as string]: '20px' }}>
        <div className="steps">
          <span className="on">1 Your property</span>
          <span>2 Details</span>
          <span>3 ADU options</span>
        </div>
        {!selected && (
          <div className="stack" style={{ ['--gap' as string]: '6px' }}>
            <h1 style={{ fontSize: 28 }}>Find your property</h1>
            <p className="serif muted">Start typing your address, or click your lot on the map. This tool covers residential properties in Mattapan.</p>
          </div>
        )}
        <div className="search">
          <label htmlFor="addr" className="visually-hidden">
            Address
          </label>
          <input
            id="addr"
            className="text-input"
            placeholder={parcels ? 'e.g. 98 Orlando St' : 'Loading property data…'}
            value={q}
            autoComplete="off"
            role="combobox"
            aria-expanded={open && results.length > 0}
            aria-controls="addr-list"
            aria-autocomplete="list"
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
              setActive(0);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, results.length - 1));
              if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
              if (e.key === 'Enter' && results[active]) choose(results[active].id, 'search');
              if (e.key === 'Escape') setOpen(false);
            }}
          />
          {open && results.length > 0 && (
            <ul className="suggest" id="addr-list" role="listbox">
              {results.map((r, i) => (
                <li key={r.id}>
                  <button role="option" aria-selected={i === active} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(r.id, 'search')}>
                    <span className={PRIVATE}>{r.address}</span>, Mattapan {r.zip}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {open && q.length >= 3 && results.length === 0 && parcels && (
            <p className="small muted" style={{ marginTop: 8 }}>
              No Mattapan address matches. Try the street number and name, or click your lot on the map.
            </p>
          )}
        </div>
        {error && <Banner tone="no" title="Couldn’t load property data">{error}</Banner>}

        {selected && (
          <div className="stack" style={{ ['--gap' as string]: '18px' }}>
            <div>
              <h1 style={{ fontSize: 26 }}>
                <span className={PRIVATE}>{selected.address ?? 'Unaddressed parcel'}</span>, Mattapan
              </h1>
              <p className="serif small muted">
                Parcel {selected.id} · {selected.zoningDesc ?? 'Zoning unknown'}
              </p>
            </div>
            <iframe
              className="streetview"
              title={`Street View of ${selected.address}`}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              src={`https://maps.google.com/maps?q=&layer=c&cbll=${selected.lat},${selected.lon}&cbp=11,0,0,0,0&output=svembed`}
            />
            <div>
              <div className="eyebrow">Property</div>
              <ul className="fact-list">
                <li>Zoning <b>{selected.zoning ?? '—'}</b></li>
                <li>Lot area <b>{fmt(selected.lotArea)} sq ft</b></li>
                <li>Lot width × depth <b>{fmt(selected.lotWidth)} × {fmt(selected.lotDepth)} ft</b></li>
                <li>Lot size group <b>{size ? LOT_SIZE_LABEL[size] : '—'}</b></li>
                <li>Corner lot <b>{selected.corner ? 'Yes' : 'No'}</b></li>
                <li>Flood zone <b>{selected.floodZone ? 'Yes' : 'No'}</b></li>
              </ul>
            </div>
            <div>
              <div className="eyebrow">Existing buildings</div>
              <ul className="fact-list">
                <li>Buildings on lot <b>{selected.buildingCount}</b></li>
                <li>Homes (units) <b>{selected.units ?? '—'}</b></li>
                <li>Main house footprint <b>{fmt(selected.houseFootprint)} sq ft</b></li>
                <li>Main house size <b>{fmt(selected.houseWidth)} × {fmt(selected.houseDepth)} ft</b></li>
                <li>Approx. height <b>{fmt(selected.houseHeight)} ft</b></li>
                <li>Lot coverage <b>{fmt(selected.coveragePct)}% of {coverageCap(selected.lotArea ?? 0)}% allowed</b></li>
                <li>Rear yard depth <b>{fmt(selected.rearYard)} ft</b></li>
              </ul>
            </div>
            {unsupported ? (
              <Banner tone="info" title="Our tool can’t assess this property yet">
                See the next page for why.
              </Banner>
            ) : (
              <p className="small muted">Something wrong? You can make corrections on the next page.</p>
            )}
            <div>
              <button className="btn primary" onClick={() => {
                  track('find_continued', { supported: !unsupported });
                  nav(unsupported ? '/unsupported' : '/details');
                }}
              >
                {unsupported ? 'Continue' : 'Enter property info'} →
              </button>
            </div>
          </div>
        )}
      </aside>
      <div className="map">
        <Suspense fallback={<div className="map-loading">Loading map…</div>}>
          <ParcelMap selectedId={selectedId ?? undefined} onSelect={(id) => choose(id, 'map')} center={selected ? [selected.lon, selected.lat] : undefined} />
        </Suspense>
        <div className="legend" aria-label="Map legend">
          {selected && <div className={`legend-title ${PRIVATE}`}>{selected.address}</div>}
          <ul>
            <li><span className="sw" style={{ background: 'rgba(31,95,168,.18)', borderColor: MAP_COLORS.selected, borderWidth: 2 }} />Your parcel</li>
            <li><span className="sw" style={{ background: MAP_COLORS.covered }} />Homes this tool can check</li>
            <li><span className="sw" style={{ background: MAP_COLORS.pending }} />Homes we can’t check yet (unusual lot shape, missing data or condo)</li>
            <li><span className="sw" style={{ background: MAP_COLORS.other }} />Other lots (not a 1–3 family home, or outside R1/R2 zoning)</li>
            <li><span className="sw" style={{ background: MAP_COLORS.building }} />Building</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
