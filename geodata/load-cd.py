import os
import pandas as pd
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

# 1. 환경 및 데이터베이스 접속 설정
load_dotenv()

DB_URL = os.getenv("DB_URL")
engine = create_engine(DB_URL)

DATA_DIR = "./data/"


def run_pipeline():
    pdf = pd.read_csv(os.path.join(DATA_DIR, "sido.csv"), encoding="utf-8")
    pdf = pdf.astype({"sido_cd": str, "sido_nm": str})
    pdf.to_sql(name="sido", con=engine, if_exists="replace", index=False)

    pdf2 = pd.read_csv(os.path.join(DATA_DIR, "sigungu.csv"), encoding="utf-8")
    pdf2 = pdf2.astype({"sigungu_cd": str, "sgg_nm": str})
    pdf2.to_sql(name="sigungu", con=engine, if_exists="replace", index=False)


if __name__ == "__main__":
    run_pipeline()
