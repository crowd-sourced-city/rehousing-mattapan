from pathlib import Path

import geopandas as gpd


DATA_FILENAMES = {
    "streets": "streets_mattapan.geojson",
    "parcels": "parcels_2025_mattapan.geojson",
    "buildings": "building_footprints_mattapan_with_primary.geojson",
}


def load_data(source_path: Path):
    """
    Load the streets, parcels, and buildings GeoJSON files.

    ``source_path`` may be the directory containing the files or the Google
    Drive root containing the project's ``Data/processed files`` directory.
    """
    source_path = Path(source_path).expanduser()
    direct_paths = {
        name: source_path / filename
        for name, filename in DATA_FILENAMES.items()
    }

    if all(path.is_file() for path in direct_paths.values()):
        file_paths = direct_paths
    else:
        drive_data_path = (
            source_path
            / "11_458_ProjectFolder_2026"
            / "Data"
            / "processed files"
        )
        drive_paths = {
            name: drive_data_path / filename
            for name, filename in DATA_FILENAMES.items()
        }
        if all(path.is_file() for path in drive_paths.values()):
            file_paths = drive_paths
        else:
            missing = [
                str(path)
                for path in direct_paths.values()
                if not path.is_file()
            ]
            missing.extend(
                str(path) for path in drive_paths.values() if not path.is_file()
            )
            raise FileNotFoundError(
                "Could not find all required GeoJSON inputs. Checked the input "
                f"directory and Google Drive layout; missing files: {missing}"
            )

    streets = gpd.read_file(file_paths["streets"]).to_crs(epsg=2249)
    parcels = gpd.read_file(file_paths["parcels"]).to_crs(epsg=2249)
    buildings = gpd.read_file(file_paths["buildings"]).to_crs(epsg=2249)

    return streets, parcels, buildings