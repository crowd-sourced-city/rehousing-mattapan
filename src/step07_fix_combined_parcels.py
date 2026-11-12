"""
Build the cleaned parcel table from the group 2 metrics and the group 3 layers.

Inputs (joined on MAP_PAR_ID):
  - group 2 metrics:   mattapan_residential_parcel_metrics_<date>.gpkg
                       (from calculate_mattapan_parcel_fields_v2.py, run on the
                       pipeline's yard and edge outputs)
  - group 3 working:   mattapan_group3_working.gpkg, layer parcels_zoning_join
                       (flags, zoning_description, max_building_height_ft, and
                       the group 3 coverage values used for Squares + Streets)
  - zoning join:       mattapan_parcels_zoning_join.gpkg, layer parcels_zoning_join
                       (zoning attributes: Zoning_Sub, Front_Setb, and others)
  - zoning polygons:   zoning_mattapan.geojson (defines the parcels kept)

What this step does:
  1. Keeps only parcels whose representative point lies inside a zoning polygon.
  2. Joins the group 3 and zoning fields.
  3. Drops duplicated area columns (checked to be identical first) and the
     constant max_height_ft in favour of max_building_height_ft.
  4. Rebuilds max_coverage_pct by zoning district: the Article 60 lot-size rule
     for R1/R2, the group 3 values for Squares + Streets (S0-S4), and null
     elsewhere. Recomputes available coverage from it.
  5. Fills attic and basement area from the primary footprint only where the
     footprint is over 330 sq ft (the metrics script's rule).
  6. Adds zoning_code and ST_NAME_KEY.

Run from the repository root:

    python -m src.step07_fix_combined_parcels --google-drive
    python -m src.step07_fix_combined_parcels --metrics PATH --group3 PATH \\
        --zoning-join PATH --zoning PATH --out PATH

The output goes to a new file (default: outputs/combined_parcels_clean.gpkg).
The inputs are never modified.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import shapely
from shapely.validation import make_valid

from src.step01_connect_to_drive import find_google_drive

PARCEL_ID = "MAP_PAR_ID"
METRICS_LAYER = "residential_parcel_metrics"
GROUP3_LAYER = "parcels_zoning_join"
ZONING_JOIN_LAYER = "parcels_zoning_join"
OUTPUT_LAYER = "combined_parcels"
METRICS_FILENAME = "mattapan_residential_parcel_metrics_2026-11-12.gpkg"

# Group 3 fields to bring in. group3 max_coverage_pct is renamed because the
# metrics file already has a max_coverage_pct (the lot-size rule for all parcels).
GROUP3_FIELDS = [
    "flag_irregular_parcel",
    "flag_near_park",
    "flag_corner_parcel",
    "corner_angle",
    "flag_corner_irregular_parcel",
    "fema_flood_zone_flag",
    "neighborhood_design_overlay_flag",
    "coastal_flood_resiliency_overlay_flag",
    "zoning_description",
    "max_building_height_ft",
    "lot_area_gis_sf",
    "max_coverage_pct",
]
GROUP3_COVERAGE_RENAME = {"max_coverage_pct": "group3_max_coverage_pct"}

ZONING_FIELDS = [
    "Zoning_Sub",
    "Subdistric",
    "Article",
    "Map_Number",
    "Unique_Cod",
    "Max_FAR",
    "Max_Height",
    "Front_Setb",
    "Side_Setba",
    "Rear_Setba",
]

# Coverage limits by lot size for the Greater Mattapan R1/R2 districts
# (Article 60): 60% under 5,000 sq ft, 50% at or above.
SMALL_LOT_AREA_SQFT = 5_000
SMALL_LOT_MAX_COVERAGE_PCT = 60.0
LARGE_LOT_MAX_COVERAGE_PCT = 50.0
ARTICLE_60_RESIDENTIAL = {"R1", "R2"}
# Squares + Streets (Article 26) districts. Their limits come from the group 3
# layer; they have not been checked against the zoning code.
SQUARES_AND_STREETS = {"S0", "S1", "S2", "S3", "S4"}

# The metrics script records attic and basement area only above this footprint.
ATTIC_MIN_FOOTPRINT_SQFT = 330

ZONE_PATTERN = r"\((?P<code>[A-Z0-9-]+),\s*Article\s*\d+\)"


def default_paths(drive_root: Path) -> dict[str, Path]:
    data = Path(drive_root) / "11_458_ProjectFolder_2026" / "Data"
    return {
        "metrics": data / "group_2 outputs" / METRICS_FILENAME,
        "group3": data / "group3_WIP" / "Outputs" / "mattapan_group3_working.gpkg",
        "zoning_join": data / "group3_WIP" / "Outputs" / "mattapan_parcels_zoning_join.gpkg",
        "zoning": data / "processed files" / "zoning_mattapan.geojson",
    }


def _check_unique(frame: pd.DataFrame, name: str) -> None:
    if not frame[PARCEL_ID].is_unique:
        raise ValueError(f"{name}: {PARCEL_ID} is not unique")


def filter_to_zoning(
    parcels: gpd.GeoDataFrame,
    zoning: gpd.GeoDataFrame,
) -> gpd.GeoDataFrame:
    """Keep parcels whose representative point is inside a zoning polygon."""
    zoning = zoning.to_crs(parcels.crs)
    # Repair invalid polygons first; an invalid polygon can make the union fail
    # or silently drop parcels.
    zoning_geometries = [make_valid(geometry) for geometry in zoning.geometry.values]
    zoning_area = shapely.union_all(zoning_geometries)
    inside = parcels.geometry.representative_point().within(zoning_area)
    return parcels.loc[inside].copy()


def join_group3_and_zoning(
    metrics: gpd.GeoDataFrame,
    group3: pd.DataFrame,
    zoning_join: pd.DataFrame,
) -> gpd.GeoDataFrame:
    """Left-join the group 3 flags and the zoning attributes onto the metrics."""
    _check_unique(metrics, "metrics")
    _check_unique(group3, "group3")
    _check_unique(zoning_join, "zoning join")

    missing_group3 = [c for c in GROUP3_FIELDS if c not in group3.columns]
    missing_zoning = [c for c in ZONING_FIELDS if c not in zoning_join.columns]
    if missing_group3 or missing_zoning:
        raise ValueError(
            f"Missing fields. group3: {missing_group3}; zoning join: {missing_zoning}"
        )

    group3_part = group3[[PARCEL_ID] + GROUP3_FIELDS].rename(columns=GROUP3_COVERAGE_RENAME)
    zoning_part = zoning_join[[PARCEL_ID] + ZONING_FIELDS]

    joined = metrics.merge(
        group3_part, on=PARCEL_ID, how="left", validate="one_to_one", indicator="group3_join"
    )
    joined = joined.merge(zoning_part, on=PARCEL_ID, how="left", validate="one_to_one")
    return joined


def check_joins_complete(parcels: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Every parcel that reached this point must have a group 3 record."""
    unmatched = parcels["group3_join"].ne("both")
    if unmatched.any():
        raise ValueError(
            f"{int(unmatched.sum())} parcels inside the zoning layer have no group 3 record"
        )
    return parcels.drop(columns="group3_join")


def _assert_same(first: pd.Series, second: pd.Series, name: str, atol: float = 1e-6):
    both_null = first.isna() & second.isna()
    equal = np.isclose(first, second, atol=atol) | both_null
    if not equal.all():
        raise ValueError(f"{name}: differs from parcel_area_sqft in {int((~equal).sum())} rows")


def drop_duplicate_columns(parcels: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Keep one lot-area column. Both copies are checked to agree first."""
    parcels = parcels.copy()
    # parcel_area is the cleaned-parcel copy; lot_area_gis_sf is rounded to 0.1 sq ft.
    _assert_same(parcels["parcel_area"], parcels["parcel_area_sqft"], "parcel_area")
    _assert_same(
        parcels["lot_area_gis_sf"], parcels["parcel_area_sqft"], "lot_area_gis_sf", atol=0.06
    )
    parcels = parcels.drop(columns=["parcel_area", "lot_area_gis_sf"]).rename(
        columns={"parcel_area_sqft": "lot_area_sqft"}
    )
    # max_height_ft is a constant 40 for every parcel; max_building_height_ft
    # comes from zoning.
    return parcels.drop(columns=["max_height_ft"])


def add_zoning_code(parcels: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    parcels = parcels.copy()
    parcels["zoning_code"] = parcels["zoning_description"].str.extract(
        ZONE_PATTERN
    )["code"]
    return parcels


def rebuild_coverage(parcels: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """
    Rebuild max_coverage_pct by district and recompute the fields that depend
    on it. Districts with no known limit (CF, MFR, OS and unzoned parcels) stay
    null.
    """
    parcels = parcels.copy()
    code = parcels["zoning_code"]
    area = parcels["lot_area_sqft"]

    maximum = pd.Series(np.nan, index=parcels.index, dtype="float64")
    source = pd.Series(None, index=parcels.index, dtype="object")

    residential = code.isin(ARTICLE_60_RESIDENTIAL)
    maximum[residential] = np.where(
        area[residential] < SMALL_LOT_AREA_SQFT,
        SMALL_LOT_MAX_COVERAGE_PCT,
        LARGE_LOT_MAX_COVERAGE_PCT,
    )
    source[residential] = "article_60_lot_size_rule"

    squares = code.isin(SQUARES_AND_STREETS)
    maximum[squares] = parcels.loc[squares, "group3_max_coverage_pct"]
    source[squares & maximum.notna()] = "group3_article_26_unverified"

    parcels["max_coverage_pct"] = maximum
    parcels["max_coverage_source"] = source
    parcels = parcels.drop(columns=["group3_max_coverage_pct"])

    parcels["available_coverage_pct"] = (
        maximum - parcels["coverage_pct"]
    ).clip(lower=0)
    parcels["extra_lot_coverage_area_sqft"] = (
        area * parcels["available_coverage_pct"] / 100
    )
    parcels["flag_over_max_coverage"] = pd.array(
        np.where(maximum.notna(), parcels["coverage_pct"] > maximum, pd.NA),
        dtype="boolean",
    )
    return parcels


def fill_attic_basement(parcels: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """
    The schema estimates attic and basement area as the primary footprint, for
    footprints over 330 sq ft (the metrics script's rule). Fill the gaps only
    where that applies.
    """
    parcels = parcels.copy()
    footprint = parcels["primary_bldg_footprint_sqft"]
    eligible = footprint.gt(ATTIC_MIN_FOOTPRINT_SQFT)
    for column in ["attic_area_sqft", "basement_area_sqft"]:
        parcels[column] = parcels[column].fillna(footprint.where(eligible))
    return parcels


def yard_gap_report(parcels: gpd.GeoDataFrame) -> pd.DataFrame:
    """Split the yard-null parcels by cause, for review."""
    no_yard = parcels["front_yard_distance_ft"].isna()
    has_building = parcels["count_blds"].fillna(0) > 0
    rows = [
        ("no yard, no buildings", int((no_yard & ~has_building).sum())),
        ("no yard, has buildings (no front edge or not rectangular)",
         int((no_yard & has_building).sum())),
        ("yard present", int((~no_yard).sum())),
    ]
    return pd.DataFrame(rows, columns=["cause", "parcels"])


def add_street_key(parcels: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    parcels = parcels.copy()
    parcels["ST_NAME_KEY"] = (
        parcels["ST_NAME"].fillna("").str.upper().str.strip()
    )
    return parcels


def check_result(parcels: gpd.GeoDataFrame) -> None:
    if not parcels[PARCEL_ID].is_unique:
        raise AssertionError("MAP_PAR_ID is not unique")
    leftovers = [c for c in parcels.columns if c.endswith(("_x", "_y"))]
    if leftovers:
        raise AssertionError(f"Merge suffix columns remain: {leftovers}")


def build_clean_parcels(
    metrics_path: Path,
    group3_path: Path,
    zoning_join_path: Path,
    zoning_path: Path,
) -> gpd.GeoDataFrame:
    metrics = gpd.read_file(metrics_path, layer=METRICS_LAYER)
    group3 = gpd.read_file(group3_path, layer=GROUP3_LAYER).drop(columns="geometry")
    zoning_join = gpd.read_file(zoning_join_path, layer=ZONING_JOIN_LAYER).drop(columns="geometry")
    zoning = gpd.read_file(zoning_path)
    print(f"Read {len(metrics)} parcels from {metrics_path.name}")

    parcels = filter_to_zoning(metrics, zoning)
    print(
        f"Kept {len(parcels)} parcels inside the zoning polygons; "
        f"dropped {len(metrics) - len(parcels)}"
    )

    parcels = join_group3_and_zoning(parcels, group3, zoning_join)
    parcels = check_joins_complete(parcels)
    parcels = drop_duplicate_columns(parcels)
    parcels = add_zoning_code(parcels)
    parcels = rebuild_coverage(parcels)
    parcels = fill_attic_basement(parcels)
    parcels = add_street_key(parcels)
    check_result(parcels)
    return parcels


def main(
    metrics_path: Path,
    group3_path: Path,
    zoning_join_path: Path,
    zoning_path: Path,
    output_path: Path,
) -> gpd.GeoDataFrame:
    output_path = Path(output_path).expanduser()
    parcels = build_clean_parcels(
        Path(metrics_path), Path(group3_path), Path(zoning_join_path), Path(zoning_path)
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    parcels.to_file(output_path, layer=OUTPUT_LAYER, driver="GPKG")

    print(f"Wrote {len(parcels)} parcels, {len(parcels.columns)} columns: {output_path}")
    nulls = parcels.drop(columns="geometry").isna().sum()
    print("Columns with nulls:")
    print(nulls[nulls > 0].to_string())
    print("Yard gaps:")
    print(yard_gap_report(parcels).to_string(index=False))
    print("Max coverage by source:")
    print(parcels["max_coverage_source"].value_counts(dropna=False).to_string())
    return parcels


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--google-drive", action="store_true",
                        help="Use the default Drive locations for the inputs.")
    parser.add_argument("--metrics", type=Path, help="Path to the group 2 metrics GeoPackage")
    parser.add_argument("--group3", type=Path, help="Path to mattapan_group3_working.gpkg")
    parser.add_argument("--zoning-join", type=Path, help="Path to mattapan_parcels_zoning_join.gpkg")
    parser.add_argument("--zoning", type=Path, help="Path to zoning_mattapan.geojson")
    parser.add_argument("--out", type=Path,
                        default=Path("outputs/combined_parcels_clean.gpkg"),
                        help="Output GeoPackage (default: outputs/combined_parcels_clean.gpkg)")
    return parser.parse_args()


if __name__ == "__main__":
    arguments = _parse_args()
    defaults = default_paths(find_google_drive()) if arguments.google_drive else {}
    paths = {
        "metrics": arguments.metrics or defaults.get("metrics"),
        "group3": arguments.group3 or defaults.get("group3"),
        "zoning_join": arguments.zoning_join or defaults.get("zoning_join"),
        "zoning": arguments.zoning or defaults.get("zoning"),
    }
    if any(value is None for value in paths.values()):
        raise SystemExit(
            "Pass --google-drive, or all of --metrics, --group3, --zoning-join and --zoning."
        )
    main(paths["metrics"], paths["group3"], paths["zoning_join"], paths["zoning"], arguments.out)
