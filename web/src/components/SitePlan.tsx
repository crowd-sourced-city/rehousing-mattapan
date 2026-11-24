import type { PlanSpec } from '../rules/types';

/**
 * Schematic site plan, drawn to scale from the parcel's measured dimensions.
 * Rectangle approximation of the lot (street at the bottom). See ASSUMPTIONS.md.
 */
export function SitePlan({ spec, compact, showDims = true }: { spec: PlanSpec; compact?: boolean; showDims?: boolean }) {
  // Drawing size: very narrow/wide or very deep lots are squeezed into a readable
  // range. sx/sy convert real feet to drawing units so every part scales together.
  const W = Math.max(20, Math.min(spec.lotWidth, 160));
  const D = Math.max(40, Math.min(spec.lotDepth, 260));
  const sx = W / Math.max(1, spec.lotWidth);
  const sy = D / Math.max(1, spec.lotDepth);
  const streetH = Math.max(14, D * 0.12);
  const pad = 10;
  const scale = 1;
  const vbW = W + pad * 2 + (spec.kind === 'corner' ? streetH : 0);
  const vbH = D + streetH + pad * 2 + 8;
  const lotX = pad;
  const lotY = pad + 8;
  const streetY = lotY + D;
  const clampX = (x: number, w: number) => Math.max(lotX, Math.min(x, lotX + W - w));
  const clampY = (y: number, h: number) => Math.max(lotY, Math.min(y, streetY - h));

  const hw = Math.min(spec.houseWidth * sx, W - 4);
  const fy = spec.frontYard * sy;
  const hd = Math.max(4, Math.min(spec.houseDepth * sy, D - fy - 4));
  // Left-to-right position from the measured side yards (centred when unknown).
  const sl = spec.sideLeft;
  const sr = spec.sideRight;
  const hx =
    sl != null && sr != null && sl + sr > 0 ? lotX + (sl / (sl + sr)) * (W - hw) : lotX + (W - hw) / 2;
  const hy = streetY - fy - hd;

  // Existing garage, where city footprints place it.
  const g = spec.garage;
  const garageRect = g
    ? (() => {
        const w = Math.max(3, (g.leftFar - g.leftNear) * sx);
        const h = Math.max(3, (g.frontFar - g.frontNear) * sy);
        return { x: clampX(lotX + g.leftNear * sx, w), y: clampY(streetY - g.frontFar * sy, h), w, h };
      })()
    : null;

  let adu: { x: number; y: number; w: number; h: number } | null = null;
  let label = 'ADU';
  const aw = (spec.aduWidth ?? 0) * sx;
  const ad = (spec.aduDepth ?? 0) * sy;
  switch (spec.kind) {
    case 'rear':
      if (ad > 0) adu = { x: hx + (hw - Math.min(aw, hw)) / 2, y: hy - ad, w: Math.min(aw, hw), h: ad };
      if (ad > 0) label = `${Math.round(spec.aduDepth ?? 0)}' ADU`;
      break;
    case 'side': {
      const w = Math.max(4, Math.min(aw, (spec.aduSide === 'left' ? hx - lotX : lotX + W - (hx + hw)) - 1));
      const x = spec.aduSide === 'left' ? hx - w : hx + hw;
      adu = { x, y: hy, w, h: Math.max(8, ad) };
      break;
    }
    case 'garage':
      if (garageRect) {
        adu = garageRect;
        break;
      }
    // falls through: no garage on record, so use the illustrative corner spot
    case 'detached': {
      const w = Math.max(10, Math.min(aw || 22, W - 6));
      const h = Math.max(10, Math.min(ad || 22, D * 0.6));
      const spot = spec.kind === 'detached' ? spec.detachedSpot : null;
      adu = spot
        ? { x: clampX(lotX + spot.fromLeft * sx - w / 2, w), y: clampY(streetY - spot.fromFront * sy - h / 2, h), w, h }
        : { x: lotX + W - w - 4, y: lotY + 10, w, h: Math.max(10, Math.min(h, hy - lotY - 14)) };
      break;
    }
    case 'front':
      adu = { x: hx + hw * 0.2, y: hy + hd, w: hw * 0.6, h: Math.max(6, fy - 6) };
      break;
    case 'corner':
      adu = { x: hx + hw, y: hy + hd * 0.25, w: Math.max(6, Math.min(16, lotX + W - hx - hw - 5)), h: hd * 0.6 };
      break;
    case 'internal':
      adu = { x: hx + 2, y: hy + hd / 2, w: hw - 4, h: hd / 2 - 2 };
      break;
    case 'attic':
      adu = { x: hx + 2, y: hy + 2, w: hw - 4, h: hd * 0.35 };
      label = 'ATTIC ADU';
      break;
    case 'basement':
      adu = { x: hx + 2, y: hy + hd * 0.62, w: hw - 4, h: hd * 0.35 };
      label = 'BASEMENT';
      break;
    case 'floor':
      adu = { x: hx + 2, y: hy + 2, w: hw - 4, h: hd - 4 };
      label = 'NEW FLOOR';
      break;
  }
  // The house is drawn as its bounding rectangle, so a backyard spot that really
  // sits beside a narrower part of the house can land on the drawn rectangle.
  // Move it behind the drawn house (5 ft gap) so the sketch stays readable.
  if (adu && spec.kind === 'detached') {
    const overlaps = adu.x < hx + hw && adu.x + adu.w > hx && adu.y < hy + hd && adu.y + adu.h > hy;
    if (overlaps) adu = { ...adu, y: Math.max(lotY, hy - 5 * sy - adu.h) };
  }
  // Show the existing garage in grey on every other option.
  const showGarage = garageRect && spec.kind !== 'garage';
  const fs = Math.max(4, Math.min(W, D) * 0.055);
  const rearReq = (spec.requiredRear ?? 0) * sy;

  return (
    <div className="plan">
      <svg
        viewBox={`0 0 ${vbW * scale} ${vbH * scale}`}
        role="img"
        aria-label={`Site plan sketch: lot about ${Math.round(spec.lotWidth)} by ${Math.round(spec.lotDepth)} feet${spec.caption ? '. ' + spec.caption : ''}`}
        style={{ maxHeight: compact ? 190 : 460 }}
      >
        <defs>
          <pattern id="hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="4" stroke="#a1323d" strokeWidth="1" />
          </pattern>
        </defs>
        {/* street */}
        <rect x={0} y={streetY} width={vbW} height={streetH + pad} fill="var(--street)" />
        <text x={lotX + W / 2} y={streetY + streetH * 0.65} fontSize={fs} textAnchor="middle" fill="#6b737c" fontFamily="Montserrat" fontWeight={600}>
          STREET
        </text>
        {spec.kind === 'corner' && (
          <>
            <rect x={lotX + W} y={0} width={streetH + pad} height={streetY} fill="var(--street)" />
            <text x={lotX + W + streetH / 2} y={lotY + D / 2} fontSize={fs} textAnchor="middle" fill="#6b737c" fontFamily="Montserrat" fontWeight={600} transform={`rotate(90 ${lotX + W + streetH / 2} ${lotY + D / 2})`}>
              SIDE STREET
            </text>
          </>
        )}
        {/* lot */}
        <rect x={lotX} y={lotY} width={W} height={D} fill="var(--yard)" stroke="var(--rose)" strokeWidth={0.8} />
        {!compact && (
          <text x={lotX + W / 2} y={lotY - 2.5} fontSize={fs * 0.8} textAnchor="middle" fill="var(--rose)" fontFamily="Montserrat" fontWeight={600}>
            LOT BOUNDARY
          </text>
        )}
        {/* required rear yard */}
        {rearReq > 0 && (
          <>
            <rect x={lotX} y={lotY} width={W} height={rearReq} fill="rgba(255,255,255,0.55)" stroke="#6b737c" strokeDasharray="2 1.5" strokeWidth={0.5} />
            {!compact && (
              <text x={lotX + W / 2} y={lotY + rearReq / 2 + fs * 0.35} fontSize={fs * 0.8} textAnchor="middle" fill="#4c5661" fontFamily="Montserrat" fontWeight={600}>
                REQUIRED REAR YARD · {spec.requiredRear}'
              </text>
            )}
          </>
        )}
        {/* house */}
        <rect x={hx} y={hy} width={hw} height={hd} fill="var(--taupe-light)" stroke="#4c5661" strokeWidth={0.8} />
        <text x={hx + hw / 2} y={hy + (spec.kind === 'basement' || spec.kind === 'internal' ? hd * 0.32 : hd / 2) + fs * 0.35} fontSize={fs} textAnchor="middle" fill="#1b252f" fontFamily="Montserrat" fontWeight={700}>
          {compact || hw < fs * 9 ? 'HOUSE' : 'EXISTING HOUSE'}
        </text>
        {/* existing garage */}
        {showGarage && (
          <>
            <rect x={garageRect.x} y={garageRect.y} width={garageRect.w} height={garageRect.h} fill="var(--taupe-light)" stroke="#6b737c" strokeWidth={0.6} strokeDasharray="1.5 1" />
            {!compact && garageRect.w > fs * 3 && (
              <text x={garageRect.x + garageRect.w / 2} y={garageRect.y + garageRect.h / 2 + fs * 0.3} fontSize={fs * 0.75} textAnchor="middle" fill="#4c5661" fontFamily="Montserrat" fontWeight={600}>
                GARAGE
              </text>
            )}
          </>
        )}
        {/* ADU */}
        {adu && adu.w > 0 && adu.h > 0 && (
          <>
            <rect x={adu.x} y={adu.y} width={adu.w} height={adu.h} fill="var(--adu-pink)" stroke="var(--rose)" strokeWidth={0.8} />
            {spec.conflict && rearReq > 0 && adu.y < lotY + rearReq && (
              <rect x={adu.x} y={adu.y} width={adu.w} height={lotY + rearReq - adu.y} fill="url(#hatch)" stroke="#a1323d" strokeWidth={0.6} />
            )}
            <text x={adu.x + adu.w / 2} y={adu.y + adu.h / 2 + fs * 0.35} fontSize={fs * 0.9} textAnchor="middle" fill="#a1323d" fontFamily="Montserrat" fontWeight={700}>
              {adu.w > fs * 2.2 ? label : ''}
            </text>
          </>
        )}
        {/* dimensions */}
        {showDims && !compact && (
          <g fontFamily="Montserrat" fontSize={fs * 0.85} fill="#1b252f">
            <text x={lotX + W / 2} y={streetY + streetH * 0.65 + fs * 1.2} textAnchor="middle">
              {Math.round(spec.lotWidth)}' wide
            </text>
            {/* depth label sits just outside the lot's left edge so it never covers a left-side addition */}
            <text x={lotX - fs * 0.5} y={lotY + D / 2} transform={`rotate(-90 ${lotX - fs * 0.5} ${lotY + D / 2})`} textAnchor="middle">
              {Math.round(spec.lotDepth)}' deep
            </text>
            {spec.kind === 'rear' && (
              <text x={hx + hw + 2} y={(lotY + hy) / 2} fontSize={fs * 0.8}>
                {Math.round((hy - lotY) / sy)}' backyard
              </text>
            )}
          </g>
        )}
      </svg>
    </div>
  );
}
