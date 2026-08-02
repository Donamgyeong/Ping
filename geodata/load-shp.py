import os
import zipfile
import geopandas as gpd
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

# 1. 환경 및 데이터베이스 접속 설정
load_dotenv()
DB_URL = os.getenv("DB_URL")
engine = create_engine(DB_URL)

ZIP_FILE_PATH = "./data/"
EXTRACT_DIR = "./data/extracted"
TABLE_NAME = "emd_boundaries"


def run_pipeline():
    print("[1/4] SHP 파일 압축 해제...")

    for root, dirs, files in os.walk(ZIP_FILE_PATH):
        for file in files:
            if file.endswith(".zip"):
                zip_path = os.path.join(root, file)
                print(f"압축 해제 중: {zip_path}")
                with zipfile.ZipFile(zip_path, "r") as zip_ref:
                    zip_ref.extractall(EXTRACT_DIR)

    # 2. SHP 파일 찾기 및 GeoPandas 로드
    shp_files = [
        os.path.join(EXTRACT_DIR, f)
        for f in os.listdir(EXTRACT_DIR)
        if f.endswith(".shp")
    ]

    for shp_file in shp_files:
        print(f"[2/4] GIS 데이터 읽기: {shp_file}")

        # encoding: 한글 깨짐 방지 (SGIS/V-World는 주로 EUC-KR / CP949)

        gdf = gpd.read_file(shp_file, encoding="cp949")

        # 3. 좌표계 변환 (EPSG:5179 -> EPSG:4326 변환 예시)
        # ※ 만약 원본 CRS가 지정 안 되어 있다면 명시해 준 뒤 변환합니다.
        if gdf.crs is None:
            gdf.set_crs(epsg=5179, inplace=True)

        print("[3/4] WGS84 (EPSG:4326) 좌표계 변환 중...")
        gdf = gdf.to_crs(epsg=4326)
        gdf.rename(columns={"EMD_CD": "emd_cd", "EMD_NM": "emd_nm"}, inplace=True)

        mask = gdf["emd_cd"].str.len() == 8
        gdf_n = gdf.loc[mask, :]

        # 4. PostGIS 데이터베이스 적재
        print(f"[4/4] PostGIS 테이블({TABLE_NAME}) 적재 및 공간 인덱스 생성...")
        gdf_n.to_postgis(
            name=TABLE_NAME,
            con=engine,
            if_exists="append",  # 기존 테이블 덮어쓰기 (업데이트용)
            index=False,
            dtype={"geometry": "MultiPolygon"},
        )

    # 5. 공간 인덱스(GiST) 및 PK 명시적 추가
    with engine.begin() as conn:
        conn.execute(
            text(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_geom ON {TABLE_NAME} USING GIST (geometry);"
            )
        )
        conn.execute(text(f"ALTER TABLE {TABLE_NAME} RENAME COLUMN geometry TO geom;"))

    print("✅ 성공적으로 행정동 경계데이터 적재 파이프라인이 완료되었습니다!")


if __name__ == "__main__":
    run_pipeline()
