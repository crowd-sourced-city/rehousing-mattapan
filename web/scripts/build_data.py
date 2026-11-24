"""Build the static data files used by the ADU Explorer web app.

Reads the team's pre-processed GeoPackages from the shared project Drive folder,
derives the few extra per-parcel fields the rules need, and writes compact
GeoJSON/JSON files to web/public/data/.

Run from the repository root:

    .venv-web/bin/python web/scripts/build_data.py \
        --drive "/path/to/11_458_ProjectFolder_2026"

Everything here runs once, offline. The browser only does lookups.
See ASSUMPTIONS.md for the reasoning behind each derived field.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
from shapely.geometry import Point, box
from shapely.ops import unary_union

# Article 60 Table 6 / Table 5 setbacks (feet) used for the buildable envelope.
FRONT_SETBACK = 5.0
SIDE_SETBACK = 3.0
REAR_SETBACK = 20.0
# Detached-ADU placement buffers from the team's Miro tree / Figma C2
# ("5 ft between buildings, 8 ft from sheds or garages, 10 ft from the rear lot line").
DETACHED_FROM_HOUSE = 5.0
DETACHED_FROM_ACCESSORY = 8.0
DETACHED_REAR = 10.0
MIN_UNIT_SQFT = 220.0  # 780 CMR efficiency dwelling minimum used by the team tree
MIN_UNIT_SIDE = 12.0  # assumed narrowest usable dimension for a 220 sf unit

DEFAULT_DRIVE = Path(
    "~/Library/CloudStorage/GoogleDrive-aaga@mit.edu/My Drive/11_458_ProjectFolder_2026"
).expanduser()


def num(value):
    """Convert to a rounded float, or None for missing / non-finite values."""
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(f):
        return None
    return round(f, 1)


def units_from_land_use(lu_desc: str | None) -> int | None:
    lu = (lu_desc or "").upper()
    if lu.startswith("SINGLE FAM"):
        return 1
    if lu.startswith("TWO-FAM"):
        return 2
    if lu.startswith("THREE-FAM"):
        return 3
    return None


def largest_rectangle_side(geom) -> tuple[float, float]:
    """Width/length of the minimum rotated rectangle of a polygon."""
    if geom is None or geom.is_empty:
        return 0.0, 0.0
    rect = geom.minimum_rotated_rectangle
    coords = list(rect.exterior.coords)
    a = math.dist(coords[0], coords[1])
    b = math.dist(coords[1], coords[2])
    return min(a, b), max(a, b)


def fits_unit(region, min_area=MIN_UNIT_SQFT, min_side=MIN_UNIT_SIDE) -> bool:
    """Approximate test: can a min_side-wide, min_area building fit in region?

    We erode the region by half the minimum side; anything left means a strip at
    least min_side wide exists. Then require enough area in the largest piece.
    """
    if region is None or region.is_empty:
        return False
    for piece in getattr(region, "geoms", [region]):
        if piece.geom_type != "Polygon" or piece.area < min_area:
            continue
        if not piece.buffer(-min_side / 2.0).is_empty:
            return True
    return False


def largest_square_side(region, hi=60.0) -> float:
    """Side (ft) of the largest axis-free square that fits in region.

    A square of side k fits (approximately) wherever the region survives an
    inward buffer of k/2. Binary search on k.
    """
    if region is None or region.is_empty:
        return 0.0
    lo = 0.0
    for _ in range(14):
        mid = (lo + hi) / 2
        if region.buffer(-mid / 2.0).is_empty:
            hi = mid
        else:
            lo = mid
    return lo


def strip_union(lines_with_setbacks):
    strips = [line.buffer(s, cap_style="flat") for line, s in lines_with_setbacks if s > 0]
    return unary_union(strips) if strips else None


def attached_envelope(parcel_geom, lines, building_geoms):
    """Table 6 setback envelope (5 ft front, 3 ft side, 20 ft rear) minus buildings."""
    env = parcel_geom
    strips = strip_union(lines)
    if strips is not None:
        env = env.difference(strips)
    if building_geoms:
        env = env.difference(unary_union(building_geoms))
    return env


def detached_envelope(parcel_geom, lines, house_geoms, accessory_geoms):
    """Detached ADU area: 3 ft side, 10 ft rear, 5 ft front strips; 5 ft from
    the house; 8 ft from accessory buildings."""
    env = parcel_geom
    strips = strip_union(lines)
    if strips is not None:
        env = env.difference(strips)
    if house_geoms:
        env = env.difference(unary_union(house_geoms).buffer(DETACHED_FROM_HOUSE))
    if accessory_geoms:
        env = env.difference(unary_union(accessory_geoms).buffer(DETACHED_FROM_ACCESSORY))
    return env


def left_right_sides(edge_rows, parcel_geom):
    """Map side_1/side_2 to the viewer's left/right when facing the house from
    the street (front edge). Returns dict {side_1: 'left'|'right', ...}."""
    front = next((r for r in edge_rows if r.edge_type == "front"), None)
    if front is None:
        return {}
    (x0, y0), (x1, y1) = front.geometry.coords[0], front.geometry.coords[-1]
    fmx, fmy = (x0 + x1) / 2, (y0 + y1) / 2
    c = parcel_geom.centroid
    fx, fy = c.x - fmx, c.y - fmy  # facing direction: from street into lot
    out = {}
    for r in edge_rows:
        if r.edge_type in ("side_1", "side_2"):
            m = r.geometry.interpolate(0.5, normalized=True)
            vx, vy = m.x - fmx, m.y - fmy
            cross = fx * vy - fy * vx
            out[r.edge_type] = "left" if cross > 0 else "right"
    return out


def main(drive: Path, out_dir: Path) -> None:
    data = drive / "Data"
    out_dir.mkdir(parents=True, exist_ok=True)

    print("Loading layers…")
    parcels = gpd.read_file(data / "Assignment 5 Submission/combined_parcels_2026-11-12.gpkg")
    assessor = gpd.read_file(
        data / "group3_WIP/Outputs/mattapan_group3_working.gpkg",
        columns=[
            "MAP_PAR_ID", "LU_DESC", "GROSS_AREA", "LIVING_AREA", "RES_FLOOR",
            "OWN_OCC", "ZIP_CODE", "YR_BUILT", "ST_NUM", "ST_NAME",
        ],
        ignore_geometry=True,
    ).drop_duplicates("MAP_PAR_ID")
    buildings = gpd.read_file(data / "processed_nov10/buildings_raw.gpkg")
    edges = gpd.read_file(data / "processed_nov10/classified_edges.gpkg")
    yards = gpd.read_file(data / "processed_nov10/yard_distances.gpkg", ignore_geometry=True)
    streets = gpd.read_file(data / "processed_nov10/streets_raw.gpkg")

    for layer in (parcels, buildings, edges, streets):
        assert layer.crs.to_epsg() == 2249, "all inputs must be EPSG:2249 (feet)"

    parcels = parcels.merge(assessor, on="MAP_PAR_ID", how="left", suffixes=("", "_assess"))

    # --- Side yards: both sides from the per-edge yard distances -------------
    side = (
        yards[yards.yard.isin(["side_1", "side_2"])]
        .groupby(["MAP_PAR_ID", "yard"]).distance_ft.min().unstack()
    )
    side_min = side.min(axis=1).rename("side_yard_min_ft")
    side_max = side.max(axis=1).rename("side_yard_max_ft")
    parcels = parcels.merge(side_min, left_on="MAP_PAR_ID", right_index=True, how="left")
    parcels = parcels.merge(side_max, left_on="MAP_PAR_ID", right_index=True, how="left")

    # --- Buildings → parcels (by representative point) ------------------------
    bpts = buildings.copy()
    bpts["geometry"] = buildings.geometry.representative_point()
    hits = gpd.sjoin(bpts, parcels[["MAP_PAR_ID", "geometry"]], predicate="within", how="inner")
    buildings = buildings.join(hits["MAP_PAR_ID"])
    buildings = buildings[buildings.MAP_PAR_ID.notna()]

    # Garage = non-primary building whose Land_Use code is "G" (city footprints).
    garages = buildings[(buildings.is_primary_structure != 1) & (buildings.Land_Use == "G")]
    garage_area = garages.groupby("MAP_PAR_ID").area.max().rename("garage_sqft")
    parcels = parcels.merge(garage_area, left_on="MAP_PAR_ID", right_index=True, how="left")

    # Garage position. Distances use the classified FRONT lot line (bounding-box
    # edge), the same convention as fire_travel_dist_ft (see ASSUMPTIONS.md).
    front_lines = {
        pid: unary_union(list(grp.geometry))
        for pid, grp in edges[edges.edge_type == "front"].groupby("MAP_PAR_ID")
    }
    primary = buildings[buildings.is_primary_structure == 1]
    house_by_parcel = {pid: unary_union(list(grp.geometry)) for pid, grp in primary.groupby("MAP_PAR_ID")}
    parcel_geom = dict(zip(parcels.MAP_PAR_ID, parcels.geometry))
    g_front, g_far, g_house, g_lotline = {}, {}, {}, {}
    for pid, grp in garages.groupby("MAP_PAR_ID"):
        g = grp.loc[grp.area.idxmax()].geometry
        fl = front_lines.get(pid)
        if fl is not None:
            g_front[pid] = g.distance(fl)
            g_far[pid] = max(fl.distance(gpd.points_from_xy([x], [y])[0]) for x, y in g.exterior.coords) if g.geom_type == "Polygon" else None
        house = house_by_parcel.get(pid)
        if house is not None:
            g_house[pid] = g.distance(house)
        pg = parcel_geom.get(pid)
        if pg is not None:
            g_lotline[pid] = g.distance(pg.boundary)
    parcels["garage_front_dist_ft"] = parcels.MAP_PAR_ID.map(g_front)
    parcels["garage_far_dist_ft"] = parcels.MAP_PAR_ID.map(g_far)
    parcels["garage_to_house_ft"] = parcels.MAP_PAR_ID.map(g_house)
    parcels["garage_to_lot_line_ft"] = parcels.MAP_PAR_ID.map(g_lotline)

    # --- Buildable envelope tests (E-02/E-05/E-09/E-13) -----------------------
    edges_by_parcel = {pid: grp for pid, grp in edges.groupby("MAP_PAR_ID")}
    house_by_pid = {pid: list(grp.geometry) for pid, grp in primary.groupby("MAP_PAR_ID")}
    acc = buildings[buildings.is_primary_structure != 1]
    acc_by_pid = {pid: list(grp.geometry) for pid, grp in acc.groupby("MAP_PAR_ID")}
    attached_setbacks = {"front": FRONT_SETBACK, "back": REAR_SETBACK,
                         "side_1": SIDE_SETBACK, "side_2": SIDE_SETBACK}
    detached_setbacks = {"front": FRONT_SETBACK, "back": DETACHED_REAR,
                         "side_1": SIDE_SETBACK, "side_2": SIDE_SETBACK}
    fit_att, fit_det, det_sq, side_lr = {}, {}, {}, {}
    # Positions in the lot's own frame (distances from the classified front and
    # left-side bounding-box edges), used only to draw the site-plan diagrams.
    garage_pos, det_pos = {}, {}
    garage_geom = {pid: grp.loc[grp.area.idxmax()].geometry for pid, grp in garages.groupby("MAP_PAR_ID")}
    side_by_edge = (
        yards[yards.yard.isin(["side_1", "side_2"])]
        .groupby(["MAP_PAR_ID", "yard"]).distance_ft.min().to_dict()
    )
    for _, p in parcels.iterrows():
        pid = p.MAP_PAR_ID
        e = edges_by_parcel.get(pid)
        if e is None or (e.edge_type == "unknown").all():
            continue
        rows = list(e.itertuples())
        geom = p.geometry.buffer(0)
        lr = left_right_sides(rows, geom)
        for edge_type, side in lr.items():
            side_lr[(pid, side)] = side_by_edge.get((pid, edge_type))
        houses = house_by_pid.get(pid, [])
        accs = acc_by_pid.get(pid, [])
        try:
            att = attached_envelope(
                geom, [(r.geometry, attached_setbacks.get(r.edge_type, 0)) for r in rows], houses + accs)
            det = detached_envelope(
                geom, [(r.geometry, detached_setbacks.get(r.edge_type, 0)) for r in rows], houses, accs)
        except Exception:  # noqa: BLE001 - degenerate geometry
            continue
        fit_att[pid] = fits_unit(att)
        fit_det[pid] = fits_unit(det)
        det_sq[pid] = largest_square_side(det)

        front_l = next((r.geometry for r in rows if r.edge_type == "front"), None)
        left_l = next((r.geometry for r in rows if lr.get(r.edge_type) == "left"), None)
        if front_l is not None and left_l is not None:
            g = garage_geom.get(pid)
            hull = g.convex_hull if g is not None else None  # garages may be MultiPolygons
            if hull is not None and hull.geom_type == "Polygon":
                pts = [Point(c) for c in hull.exterior.coords]
                fd = [front_l.distance(q) for q in pts]
                ld = [left_l.distance(q) for q in pts]
                garage_pos[pid] = (min(fd), max(fd), min(ld), max(ld))
            k = det_sq[pid]
            if k and k > 0:
                core = det.buffer(-k / 2.0 + 0.01)
                if not core.is_empty:
                    c = core.representative_point()
                    det_pos[pid] = (front_l.distance(c), left_l.distance(c))
    parcels["envelope_fits_attached"] = parcels.MAP_PAR_ID.map(fit_att)
    parcels["envelope_fits_detached"] = parcels.MAP_PAR_ID.map(fit_det)
    parcels["detached_max_square_ft"] = parcels.MAP_PAR_ID.map(det_sq)
    parcels["side_left_ft"] = parcels.MAP_PAR_ID.map(lambda x: side_lr.get((x, "left")))
    parcels["side_right_ft"] = parcels.MAP_PAR_ID.map(lambda x: side_lr.get((x, "right")))
    parcels["garage_plan"] = parcels.MAP_PAR_ID.map(garage_pos)
    parcels["detached_plan"] = parcels.MAP_PAR_ID.map(det_pos)

    # --- Output ---------------------------------------------------------------
    parcels_wgs = parcels.to_crs(4326)
    parcels_wgs["geometry"] = parcels_wgs.geometry.simplify(0.000005, preserve_topology=True)

    def stories(v):
        f = num(v)
        return f if f and f > 0 else None

    records = {}
    features = []
    for (_, p), geom in zip(parcels.iterrows(), parcels_wgs.geometry):
        pid = str(p.MAP_PAR_ID)
        units = units_from_land_use(p.LU_DESC)
        rec = {
            "id": pid,
            "address": (p.address or "").title() if isinstance(p.address, str) else None,
            "zip": p.ZIP_CODE if isinstance(p.ZIP_CODE, str) and p.ZIP_CODE else "02126",
            "zoning": p.zoning_code if isinstance(p.zoning_code, str) and p.zoning_code else None,
            "zoningDesc": p.zoning_description if isinstance(p.zoning_description, str) else None,
            "landUse": p.LU_DESC if isinstance(p.LU_DESC, str) else None,
            "units": units,
            "condo": bool(p.property_is_condominium) if pd.notna(p.property_is_condominium) else False,
            "ownerOccupiedRecord": p.OWN_OCC == "Y",
            "lotArea": num(p.lot_area_sqft),
            "lotWidth": num(p.lot_frontage_ft),
            "lotDepth": num(p.lot_depth_ft),
            "irregular": bool(p.flag_irregular_parcel) if pd.notna(p.flag_irregular_parcel) else None,
            "corner": bool(p.flag_corner_parcel) if pd.notna(p.flag_corner_parcel) else None,
            "nearPark": bool(p.flag_near_park) if pd.notna(p.flag_near_park) else False,
            "floodZone": bool(p.fema_flood_zone_flag) if pd.notna(p.fema_flood_zone_flag) else False,
            "ndod": bool(p.neighborhood_design_overlay_flag) if pd.notna(p.neighborhood_design_overlay_flag) else False,
            "coastalOverlay": bool(p.coastal_flood_resiliency_overlay_flag) if pd.notna(p.coastal_flood_resiliency_overlay_flag) else False,
            "buildingCount": int(p.count_blds) if pd.notna(p.count_blds) else 0,
            "coveragePct": num(p.coverage_pct),
            "totalFootprint": num(p.total_bldg_footprint_sqft),
            "houseFootprint": num(p.primary_bldg_footprint_sqft),
            "houseWidth": num(p.primary_bldg_width_ft),
            "houseDepth": num(p.primary_bldg_depth_ft),
            "houseHeight": num(p.primary_bldg_height_ft),
            "stories": stories(p.RES_FLOOR),
            "grossArea": num(p.GROSS_AREA),
            "livingArea": num(p.LIVING_AREA),
            "yearBuilt": int(p.YR_BUILT) if str(p.YR_BUILT).isdigit() else None,
            "frontYard": num(p.front_yard_distance_ft),
            "rearYard": num(p.rear_yard_distance_ft),
            "rearYardArea": num(p.rear_yard_area_sqft),
            "sideYardMin": num(p.side_yard_min_ft),
            "sideYardMax": num(p.side_yard_max_ft),
            "fireTravel": num(p.fire_travel_dist_ft),
            "garageSqft": num(p.garage_sqft),
            "garageFrontDist": num(p.garage_front_dist_ft),
            "garageFarDist": num(p.garage_far_dist_ft),
            "garageToHouse": num(p.garage_to_house_ft),
            "garageToLotLine": num(p.garage_to_lot_line_ft),
            "envelopeFitsAttached": None if pd.isna(p.envelope_fits_attached) else bool(p.envelope_fits_attached),
            "envelopeFitsDetached": None if pd.isna(p.envelope_fits_detached) else bool(p.envelope_fits_detached),
            "detachedMaxSquare": num(p.detached_max_square_ft),
            "sideLeft": num(p.side_left_ft),
            "sideRight": num(p.side_right_ft),
            # Site-plan drawing only: garage [front near, front far, left near, left far]
            # and the centre of the detached-ADU spot [from front, from left], in ft.
            "garagePlan": [round(v, 1) for v in p.garage_plan] if isinstance(p.garage_plan, tuple) else None,
            "detachedSpot": [round(v, 1) for v in p.detached_plan] if isinstance(p.detached_plan, tuple) else None,
            "lat": round(float(p.geometry_props_centroid_lat), 6),
            "lon": round(float(p.geometry_props_centroid_lon), 6),
        }
        records[pid] = rec
        features.append({
            "type": "Feature",
            "id": int(pid) if pid.isdigit() else pid,
            "properties": {"id": pid, "z": rec["zoning"], "u": units},
            "geometry": json.loads(gpd.GeoSeries([geom]).to_json())["features"][0]["geometry"],
        })

    with open(out_dir / "parcels.json", "w") as f:
        json.dump(records, f, separators=(",", ":"))
    with open(out_dir / "parcels.geojson", "w") as f:
        json.dump({"type": "FeatureCollection", "features": features}, f, separators=(",", ":"))

    b_wgs = buildings.to_crs(4326)
    b_wgs["geometry"] = b_wgs.geometry.simplify(0.000003, preserve_topology=True)
    bfeat = []
    for _, b in b_wgs.iterrows():
        bfeat.append({
            "type": "Feature",
            "properties": {"p": str(b.MAP_PAR_ID), "m": int(b.is_primary_structure == 1)},
            "geometry": json.loads(gpd.GeoSeries([b.geometry]).to_json())["features"][0]["geometry"],
        })
    with open(out_dir / "buildings.geojson", "w") as f:
        json.dump({"type": "FeatureCollection", "features": bfeat}, f, separators=(",", ":"))

    s_wgs = streets.to_crs(4326)
    sfeat = [{
        "type": "Feature",
        "properties": {"n": " ".join(x for x in [r.PRE_DIR, r.ST_NAME, r.ST_TYPE] if isinstance(x, str) and x)},
        "geometry": json.loads(gpd.GeoSeries([r.geometry]).to_json())["features"][0]["geometry"],
    } for r in s_wgs.itertuples()]
    with open(out_dir / "streets.geojson", "w") as f:
        json.dump({"type": "FeatureCollection", "features": sfeat}, f, separators=(",", ":"))

    # Summary stats printed for ASSUMPTIONS.md
    df = pd.DataFrame(records.values())
    print(f"Wrote {len(df)} parcels → {out_dir}")
    print("  garages detected:", int(df.garageSqft.notna().sum()))
    print("  envelope fits attached:", df.envelopeFitsAttached.value_counts(dropna=False).to_dict())
    print("  envelope fits detached:", df.envelopeFitsDetached.value_counts(dropna=False).to_dict())
    print("  detached max square ft:", df.detachedMaxSquare.describe().round(1).to_dict())
    print("  lots exactly 5000 sf (rounded):", int((df.lotArea.round() == 5000).sum()))
    print("  irregular:", int(df.irregular.fillna(False).sum()))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--drive", type=Path, default=DEFAULT_DRIVE)
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().parents[1] / "public" / "data")
    args = ap.parse_args()
    main(args.drive, args.out)
