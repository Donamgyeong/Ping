import json
import geopandas as gpd
import csv
import os

sido = "./data/sido.csv"
sigungu = "./data/sigungu.csv"
emd_file = "./data/emd.geojson"
sigungu_file = "./data/sigungu.geojson"

os.makedirs("./data/geojson/sido/", exist_ok=True)
os.makedirs("./data/geojson/sigungu/", exist_ok=True)

emd_gdf = gpd.read_file(emd_file)
sigungu_gdf = gpd.read_file(sigungu_file)

with open(sido, "r", encoding="utf-8") as f:
    reader = csv.reader(f)
    next(reader)  # Skip the header row
    for row in reader:
        code, name = row
        city = sigungu_gdf.loc[sigungu_gdf["sigungu_cd"].str.startswith(code), :]

        city.to_file(
            "./data/geojson/sido/{}.geojson".format(code),
            driver="GeoJSON",
            encoding="utf-8",
        )

with open(sigungu, "r", encoding="utf-8") as f:
    reader = csv.reader(f)
    next(reader)  # Skip the header row
    for row in reader:
        code, name = row
        city = emd_gdf.loc[emd_gdf["emd_cd"].str.startswith(code), :]

        os.makedirs(
            "./data/geojson/sigungu/{}/".format(code[0:2]),
            exist_ok=True,
        )

        city.to_file(
            "./data/geojson/sigungu/{}/{}.geojson".format(code[0:2], code),
            driver="GeoJSON",
            encoding="utf-8",
        )
