from pathlib import Path

import geopandas as gpd


def export_data(
    parcel_edges_gdf: gpd.GeoDataFrame,
    building_edges_gdf: gpd.GeoDataFrame,
    yard_distances_gdf: gpd.GeoDataFrame,
    output_dir: Path,
) -> dict[str, Path]:
    """Write the three processed spatial layers as GeoJSON files."""
    output_dir = Path(output_dir).expanduser()
    output_dir.mkdir(parents=True, exist_ok=True)

    datasets = {
        "parcel_edges": parcel_edges_gdf,
        "building_edges": building_edges_gdf,
        "yard_distances": yard_distances_gdf,
    }
    output_paths = {}
    for name, dataset in datasets.items():
        output_path = output_dir / f"{name}.geojson"
        dataset.to_file(output_path, driver="GeoJSON", index=False)
        output_paths[name] = output_path

    return output_paths