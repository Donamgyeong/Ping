import json
import geopandas as gpd
import csv

sido = "./data/sido.csv"
file = "./data/geodata.geojson"

gdf = gpd.read_file(file)

with open(sido, "r", encoding="utf-8") as f:
    reader = csv.reader(f)
    next(reader)  # Skip the header row
    for row in reader:
        code, name = row
        city = gdf.loc[gdf["emd_cd"].str.startswith(code), :]

        city.to_file(
            "./data/geojson/{}.geojson".format(code), driver="GeoJSON", encoding="utf-8"
        )
