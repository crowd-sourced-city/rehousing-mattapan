import geopandas as gpd
import numpy as np
import pandas as pd
from shapely.geometry import LineString
from shapely.ops import nearest_points, unary_union

DEFAULT_STREET_SUFFIXES = {
    "ST", "STREET", "AVE", "AVENUE", "RD", "ROAD", "DR", "DRIVE",
    "LN", "LANE", "CT", "COURT", "PL", "PLACE", "TE", "TERRACE",
    "PKWY", "PARKWAY", "HWY", "HIGHWAY", "SQ", "SQUARE", "CIR", "CIRCLE",
}

def decompose_parcel_edges(
    parcels_gdf: gpd.GeoDataFrame,
) -> gpd.GeoDataFrame:
    """Turn each parcel's minimum rotated rectangle into four line segments."""
    records = []
    for _, parcel in parcels_gdf.iterrows():
        geometry = parcel.geometry
        if geometry is None or geometry.is_empty:
            continue

        rectangle = geometry.minimum_rotated_rectangle
        if rectangle.geom_type != "Polygon":
            continue

        coordinates = list(rectangle.exterior.coords)
        for edge_num in range(4):
            edge = LineString([coordinates[edge_num], coordinates[edge_num + 1]])
            records.append({
                "MAP_PAR_ID": parcel["MAP_PAR_ID"],
                "edge_num": edge_num,
                "edge_length": edge.length,
                "geometry": edge,
            })

    return gpd.GeoDataFrame(
        records,
        columns=["MAP_PAR_ID", "edge_num", "edge_length", "geometry"],
        geometry="geometry",
        crs=parcels_gdf.crs,
    )


def _street_suffixes(streets_gdf: gpd.GeoDataFrame) -> set[str]:
    suffixes = set(DEFAULT_STREET_SUFFIXES)
    if "ST_TYPE" in streets_gdf.columns:
        suffixes.update(
            streets_gdf["ST_TYPE"].dropna().astype(str).str.strip().str.upper()
        )
    return suffixes


def normalize_street_name(
    name: object,
    suffixes: set[str] | None = None,
) -> str:
    """Normalize capitalization, punctuation, and a trailing street suffix."""
    if name is None or pd.isna(name):
        return ""

    if suffixes is None:
        suffixes = DEFAULT_STREET_SUFFIXES
    parts = str(name).strip().upper().replace(".", "").split()
    if len(parts) > 1 and parts[-1] in suffixes:
        parts = parts[:-1]
    return " ".join(parts)

def classify_parcel_edges(
    parcel_edges_gdf: gpd.GeoDataFrame,
    parcels_gdf: gpd.GeoDataFrame,
    streets_gdf: gpd.GeoDataFrame,
) -> gpd.GeoDataFrame:
    """
    Classify the parcel edge nearest and parallel to its named street as front.
    The opposite edge is back; the remaining edges are sides.
    """
    required_parcel_columns = {"MAP_PAR_ID", "ST_NAME"}
    required_edge_columns = {"MAP_PAR_ID", "edge_num", "geometry"}
    required_street_columns = {"ST_NAME", "geometry"}
    if missing := required_parcel_columns - set(parcels_gdf.columns):
        raise ValueError(f"Parcel data is missing columns: {sorted(missing)}")
    if missing := required_edge_columns - set(parcel_edges_gdf.columns):
        raise ValueError(f"Parcel edge data is missing columns: {sorted(missing)}")
    if missing := required_street_columns - set(streets_gdf.columns):
        raise ValueError(f"Street data is missing columns: {sorted(missing)}")

    if parcel_edges_gdf.crs != streets_gdf.crs:
        streets_gdf = streets_gdf.to_crs(parcel_edges_gdf.crs)

    suffixes = _street_suffixes(streets_gdf)
    street_names = streets_gdf["ST_NAME"].map(
        lambda value: normalize_street_name(value, suffixes)
    )
    parcel_street_names = parcels_gdf.set_index("MAP_PAR_ID")["ST_NAME"].to_dict()
    results = []

    def line_parts(geometry):
        if geometry is None or geometry.is_empty:
            return []
        if geometry.geom_type == "LineString":
            return [geometry]
        if geometry.geom_type in {"MultiLineString", "GeometryCollection"}:
            return [
                line
                for part in geometry.geoms
                for line in line_parts(part)
            ]
        return []

    def parallel_alignment(edge, street):
        edge_start, edge_end = edge.coords[0], edge.coords[-1]
        edge_x = edge_end[0] - edge_start[0]
        edge_y = edge_end[1] - edge_start[1]
        edge_length = np.hypot(edge_x, edge_y)
        if edge_length == 0:
            return 0.0

        midpoint = edge.interpolate(0.5, normalized=True)
        projected_distance = street.project(midpoint)
        delta = min(5, street.length / 2)
        if delta <= 0:
            return 0.0

        point_start = street.interpolate(max(0, projected_distance - delta))
        point_end = street.interpolate(min(street.length, projected_distance + delta))
        street_x = point_end.x - point_start.x
        street_y = point_end.y - point_start.y
        street_length = np.hypot(street_x, street_y)
        if street_length == 0:
            return 0.0
        return abs(
            (edge_x * street_x + edge_y * street_y)
            / (edge_length * street_length)
        )

    for parcel_id, edges in parcel_edges_gdf.groupby("MAP_PAR_ID"):
        normalized_name = normalize_street_name(
            parcel_street_names.get(parcel_id), suffixes
        )
        matching_streets = streets_gdf.loc[
            street_names.eq(normalized_name) & street_names.ne("")
        ]
        street_lines = [
            line
            for geometry in matching_streets.geometry
            for line in line_parts(geometry)
        ]

        edge_scores = []
        for index, edge_row in edges.iterrows():
            best_score = float("inf")
            for street in street_lines:
                distance = edge_row.geometry.distance(street)
                alignment = parallel_alignment(edge_row.geometry, street)
                if distance <= 100 and alignment >= 0.7:
                    best_score = min(best_score, distance + (1 - alignment) * 20)
            edge_scores.append((index, best_score))

        valid_scores = [
            (index, score)
            for index, score in edge_scores
            if score != float("inf")
        ]
        if not valid_scores:
            for _, row in edges.iterrows():
                results.append({
                    **row.drop(labels="geometry").to_dict(),
                    "edge_type": "unknown",
                    "geometry": row.geometry,
                })
            continue

        front_index, _ = min(valid_scores, key=lambda item: item[1])
        front_edge_num = edges.loc[front_index, "edge_num"]
        back_edge_num = (front_edge_num + 2) % 4
        for index, row in edges.iterrows():
            edge_num = row["edge_num"]
            if index == front_index:
                edge_type = "front"
            elif edge_num == back_edge_num:
                edge_type = "back"
            elif edge_num == (front_edge_num + 1) % 4:
                edge_type = "side_1"
            else:
                edge_type = "side_2"
            results.append({
                **row.drop(labels="geometry").to_dict(),
                "edge_type": edge_type,
                "geometry": row.geometry,
            })

    columns = [column for column in parcel_edges_gdf.columns if column != "geometry"]
    columns.extend(["edge_type", "geometry"])
    return gpd.GeoDataFrame(
        results,
        columns=columns,
        geometry="geometry",
        crs=parcel_edges_gdf.crs,
    )


def primary_buildings_by_parcel(
    buildings_primary: gpd.GeoDataFrame,
    parcels_gdf: gpd.GeoDataFrame,
) -> tuple[dict[object, object], int, int]:
    """
    Assign primary building footprints to parcels by representative point.
    Buildings that match no parcel or multiple parcels are not assigned.
    """
    if buildings_primary.empty:
        return {}, 0, 0

    points = gpd.GeoDataFrame(
        geometry=buildings_primary.geometry.representative_point(),
        index=buildings_primary.index,
        crs=buildings_primary.crs,
    )
    hits = gpd.sjoin(
        points,
        parcels_gdf[["MAP_PAR_ID", "geometry"]],
        how="inner",
        predicate="within",
    )
    parcels_per_building = hits.groupby(level=0)["MAP_PAR_ID"].agg(list)
    unmatched = len(buildings_primary) - len(parcels_per_building)
    ambiguous = int((parcels_per_building.str.len() > 1).sum())
    single = parcels_per_building[parcels_per_building.str.len() == 1].str[0]

    building_by_parcel = {}
    for parcel_id, indexes in single.groupby(single).groups.items():
        building_by_parcel[parcel_id] = unary_union(
            buildings_primary.geometry.loc[list(indexes)].values
        )
    return building_by_parcel, unmatched, ambiguous


def create_building_edges(
    buildings_gdf: gpd.GeoDataFrame,
    parcels_gdf: gpd.GeoDataFrame,
) -> gpd.GeoDataFrame:
    """Return primary building footprint boundaries associated with parcels."""
    if "is_primary_structure" not in buildings_gdf.columns:
        raise ValueError("Building data is missing column: is_primary_structure")

    primary = buildings_gdf.loc[
        buildings_gdf["is_primary_structure"] == 1
    ].reset_index(drop=True)
    building_by_parcel, _, _ = primary_buildings_by_parcel(primary, parcels_gdf)
    records = [
        {"MAP_PAR_ID": parcel_id, "geometry": geometry.boundary}
        for parcel_id, geometry in building_by_parcel.items()
    ]
    return gpd.GeoDataFrame(
        records,
        columns=["MAP_PAR_ID", "geometry"],
        geometry="geometry",
        crs=parcels_gdf.crs,
    )


def measure_primary_building_distances(
    edges_gdf: gpd.GeoDataFrame,
    buildings_gdf: gpd.GeoDataFrame,
    parcels_gdf: gpd.GeoDataFrame,
) -> gpd.GeoDataFrame:
    """Measure shortest distances from each primary building to each parcel edge."""
    if edges_gdf.crs != buildings_gdf.crs or edges_gdf.crs != parcels_gdf.crs:
        raise ValueError("edges, buildings and parcels must share a CRS")
    if "is_primary_structure" not in buildings_gdf.columns:
        raise ValueError("Building data is missing column: is_primary_structure")

    primary = buildings_gdf.loc[
        buildings_gdf["is_primary_structure"] == 1
    ].reset_index(drop=True)
    building_by_parcel, unmatched, ambiguous = primary_buildings_by_parcel(
        primary, parcels_gdf
    )
    print(f"Primary buildings assigned to parcels: {len(building_by_parcel)}")
    print(
        f"Primary buildings: {unmatched} in no parcel, "
        f"{ambiguous} in more than one (dropped)"
    )

    records = []
    for parcel_id, edges in edges_gdf.groupby("MAP_PAR_ID"):
        building = building_by_parcel.get(parcel_id)
        for _, edge in edges.iterrows():
            base = {
                "MAP_PAR_ID": parcel_id,
                "edge_num": edge["edge_num"],
                "yard": edge["edge_type"],
            }
            if building is None:
                records.append({
                    **base,
                    "distance_ft": float("nan"),
                    "has_primary_building": False,
                    "geometry": LineString(),
                })
                continue

            building_point, edge_point = nearest_points(building, edge.geometry)
            connector = LineString([
                (building_point.x, building_point.y),
                (edge_point.x, edge_point.y),
            ])
            records.append({
                **base,
                "distance_ft": connector.length,
                "has_primary_building": True,
                "geometry": connector,
            })

    return gpd.GeoDataFrame(
        records,
        columns=[
            "MAP_PAR_ID", "edge_num", "yard", "distance_ft",
            "has_primary_building", "geometry",
        ],
        geometry="geometry",
        crs=edges_gdf.crs,
    )