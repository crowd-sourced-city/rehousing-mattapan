# rehousing-mattapan

## Recreating the Environment

```bash
conda env create -f environment.yml
```



Run the complete ETL from the repository root:

```bash
python main.py
```

Parcel filtering excludes the two identified outlier parcel IDs and keeps parcels
whose area-to-minimum-rotated-rectangle ratio is greater than `0.9`. The cleaning,
filtering, matching, distance measurement, and export steps live in `src/`;
notebooks are intended for visualization and exploration.
For compatibility with the notebook, edge matching and distance calculations
currently run on all cleaned parcels; `main.py` exposes this choice as
`parcels_to_process` so it can be switched to `filtered_parcels` when desired.

nov10 7am notes: `main.py` is not functional, but `/notebooks/og_parcel_encoding.ipynb` works as intended.
I am in the process of refactoring the code so that it runs a little smoother and we can add more things to it later. But the notebook works fine for now.

For the next team, you can find the tables you need in `/outputs/XXXX.gpkg`