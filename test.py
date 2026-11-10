import geopandas as gpd

from src.step01_connect_to_drive import find_google_drive
from src.step02_load_data import load_data
from src.step03_clean_data import clean_parcels, filter_parcels, create_bounding_box
from src.step04_process_data import (
    classify_parcel_edges,
    create_building_edges,
    decompose_parcel_edges,
    measure_primary_building_distances,
)
from src.step05_export_data import export_data
from src.step06_clean_up import clean_up_directory

# Connect to data and load the three spatial layers.
drive_path = find_google_drive()
loaded_streets, loaded_parcels, loaded_buildings = load_data(drive_path)
print(f"Loaded {len(loaded_streets)} streets, {len(loaded_parcels)} parcels, and {len(loaded_buildings)} buildings.")

# Delete previous intermediate files
clean_up_directory("data/working")

# Clean the parcels and filter them based on the bounding box ratio.
test_cleaned_parcels = clean_parcels(loaded_parcels)
test_cleaned_buildings = loaded_buildings
test_cleaned_streets = loaded_streets
parcel_bounding_boxes = create_bounding_box(test_cleaned_parcels.copy())
print(test_cleaned_parcels.head())

# Create a temporary output in the working folder.
test_cleaned_parcels.to_file("data/working/cleaned_parcels.gpkg", driver="GPKG")
test_cleaned_buildings.to_file("data/working/cleaned_buildings.gpkg", driver="GPKG")
test_cleaned_streets.to_file("data/working/cleaned_streets.gpkg", driver="GPKG")
parcel_bounding_boxes.to_file("data/working/parcel_bounding_boxes.gpkg", driver="GPKG")

