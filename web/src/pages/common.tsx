import type { ReactNode } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useParcels, useSession } from '../data/session';
import type { Parcel } from '../rules/types';
import { PRIVATE } from '../telemetry';

/** Renders children with the selected parcel, or redirects to /find. */
export function WithParcel({ children }: { children: (p: Parcel) => ReactNode }) {
  const { parcels, error } = useParcels();
  const { parcelId } = useSession();
  if (!parcelId) return <Navigate to="/find" replace />;
  if (error) return <main className="page">Couldn’t load property data: {error}</main>;
  if (!parcels) return <main className="page muted">Loading property data…</main>;
  const p = parcels[parcelId];
  if (!p) return <Navigate to="/find" replace />;
  return <>{children(p)}</>;
}

export function Crumbs({ back, backTo, title, parcel }: { back: string; backTo: string; title?: string; parcel: Parcel }) {
  return (
    <div className="crumbs">
      <div className="inner">
        <Link className="back-link" to={backTo}>
          ← {back}
        </Link>
        {title && <span className="muted">/ {title}</span>}
        <span className="addr">
          <span className={PRIVATE}>{parcel.address}</span>, Mattapan
        </span>
      </div>
    </div>
  );
}
