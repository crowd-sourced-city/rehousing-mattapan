import argparse
from pathlib import Path

import geopandas as gpd

from src.step01_connect_to_drive import find_google_drive
from src.step02_load_data import load_data
from src.step03_clean_data import clean_parcels, filter_parcels
from src.step04_process_data import (
    classify_parcel_edges,
    create_building_edges,
    decompose_parcel_edges,
    measure_primary_building_distances,
)
from src.step05_export_data import export_data


def main(
    input_dir: Path = Path("raw"),
    output_dir: Path = Path("outputs"),
) -> dict[str, gpd.GeoDataFrame]:
    """Run the complete parcel processing pipeline and export its layers."""
    input_dir = Path(input_dir).expanduser()
    output_dir = Path(output_dir).expanduser()

    streets, parcels_raw, buildings = load_data(input_dir)
    cleaned_parcels = clean_parcels(parcels_raw)
    filtered_parcels = filter_parcels(cleaned_parcels)
    parcels_to_process = cleaned_parcels

    parcel_edges = decompose_parcel_edges(parcels_to_process)
    classified_parcel_edges = classify_parcel_edges(
        parcel_edges,
        parcels_to_process,
        streets,
    )
    building_edges = create_building_edges(buildings, parcels_to_process)
    yard_distances = measure_primary_building_distances(
        classified_parcel_edges,
        buildings,
        parcels_to_process,
    )

    output_paths = export_data(
        classified_parcel_edges,
        building_edges,
        yard_distances,
        output_dir,
    )
    print(
        f"Processed {len(cleaned_parcels)} parcels; "
        f"{len(filtered_parcels)} passed the parcel filter."
    )
    for name, output_path in output_paths.items():
        print(f"Wrote {name}: {output_path}")

    return {
        "cleaned_parcels": cleaned_parcels,
        "filtered_parcels": filtered_parcels,
        "parcel_edges": classified_parcel_edges,
        "building_edges": building_edges,
        "yard_distances": yard_distances,
    }


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the Mattapan parcel ETL.")
    parser.add_argument(
        "--input-dir",
        type=Path,
        default=Path("raw"),
        help="Directory containing the three GeoJSON inputs (default: raw).",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("outputs"),
        help="Directory for generated GeoJSON files (default: outputs).",
    )
    parser.add_argument(
        "--google-drive",
        action="store_true",
        help="Discover the mounted Google Drive and read from its project folder.",
    )
    return parser.parse_args()


if __name__ == "__main__":
    arguments = _parse_args()
    input_dir = (
        find_google_drive() if arguments.google_drive else arguments.input_dir
    )
    main(input_dir, arguments.output_dir)