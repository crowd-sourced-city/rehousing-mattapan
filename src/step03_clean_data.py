import geopandas as gpd
import shapely


OUTLIER_PARCEL_IDS = {"1812256100", "1700401010"}
STARTER_PARCEL_COLUMNS = ["MAP_PAR_ID", "ST_NAME", "geometry"]
STARTER_STREET_COLUMNS = ["ST_NAME", "ST_TYPE", "geometry"]

# STREET_SUFFIXES = {'ST': 'STREET',
#                     'AVE': 'AVENUE', 
#                     'RD': 'ROAD', 
#                     'HWY': 'HIGHWAY',
#                    'TER': 'TERRACE', 
#                    'DR': 'DRIVE', 
#                    'CIR': 'CIRCLE',
#                    'PLACE', 'PL', 
#                    'PARKWAY', 'PKWY', 
#                    'WAY', 'WAY', 
#                    'PARK', 'PARK', 'COURT', 'CT', 'LANE', 'LN']

def create_bounding_box(
        polygon: gpd.GeoDataFrame
) -> gpd.GeoDataFrame:
    """
    Convert each polygon to its bounding box (minumum rotated rectangle).
    """
    polygon.geometry = polygon.geometry.minimum_rotated_rectangle()
    return polygon

def clean_parcels(parcels_raw_gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Keep the parcel fields used by processing and calculate geometry metrics."""
    
    # Check for missing columns
    missing_columns = set(STARTER_PARCEL_COLUMNS) - set(parcels_raw_gdf.columns)
    if missing_columns:
        raise ValueError(f"Parcel data is missing columns: {sorted(missing_columns)}")

    # Add calculated fields to the cleaned parcels GeoDataFrame
    cleaned = parcels_raw_gdf[STARTER_PARCEL_COLUMNS].copy()
    cleaned["parcel_area"] = cleaned.geometry.area
    cleaned["number_vertices"] = cleaned.geometry.apply(
        lambda geometry: (
            len(shapely.get_coordinates(geometry))
            if geometry is not None and not geometry.is_empty
            else 0
        )
    )

    # Calculate the ratio of parcel area to its minimum rotated rectangle's area
    bounding_box_areas = cleaned.geometry.minimum_rotated_rectangle().area
    cleaned["parcel_boundingbox_ratio"] = cleaned["parcel_area"].div(
        bounding_box_areas
    ).where(bounding_box_areas > 0)

    # Remove outliers in final cleaned version
    return cleaned.loc[
        ~cleaned["MAP_PAR_ID"].isin(OUTLIER_PARCEL_IDS)
    ].copy()

def filter_parcels(
    cleaned_parcels: gpd.GeoDataFrame,
    minimum_bounding_box_ratio: float = 0.9,
) -> gpd.GeoDataFrame:
    """
    Select parcels whose area is greater than the configured share of their
    minimum rotated rectangle's area.
    """

    if not 0 <= minimum_bounding_box_ratio <= 1:
        raise ValueError("minimum_bounding_box_ratio must be between 0 and 1")
    if "parcel_boundingbox_ratio" not in cleaned_parcels.columns:
        raise ValueError("clean_parcels must be run before filter_parcels")

    result = cleaned_parcels.copy()
    valid_ratio = result["parcel_boundingbox_ratio"].gt(minimum_bounding_box_ratio)
    
    return result.loc[valid_ratio.fillna(False)].copy()


def clean_streets(
        streets: gpd.GeoDataFrame
) -> gpd.GeoDataFrame:
    """
    Clean the streets GeoDataFrame by keeping only the necessary columns.
    """
    
    # Check for missing columns
    missing_columns = set(STARTER_STREET_COLUMNS) - set(streets.columns)
    if missing_columns:
        raise ValueError(f"Streets data is missing columns: {sorted(missing_columns)}")

    # Create cleaned street name
    streets['STREET_NAME_CLEAN'] = streets.apply(
        lambda row: f"{row['ST_NAME'].str.upper().str.strip()} {STREET_SUFFIXES}"
    )

    return streets[STARTER_STREET_COLUMNS].copy()

