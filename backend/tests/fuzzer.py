import requests
from requests_toolbelt import MultipartEncoder
import random

URL = "http://localhost:8000"
CNT = 50000
IMAGE = "82dcd8d5-5876-4116-acd6-238ed16ee998"

lat_rng = {"low": 33.00, "high": 43.00}
lng_rng = {"low": 124.00, "high": 132.11}

uid = "ttt16872@gmail.com"
pwd = "string"

"""
{
  "content": "string",
  "location": {
    "long": 0,
    "lat": 0
  },
  "images": [
    "string"
  ],
  "private": true
}
"""


def post(url, field_data):
    m = MultipartEncoder(fields=field_data)
    headers = {"Content-Type": m.content_type}
    res = requests.post(url, headers=headers, data=m)
    return res.status_code, res.json()


def get_token(uid: str, pwd: str) -> str:
    body = {"username": uid, "password": pwd}
    code, res = post(URL + "/auth/token", body)

    if code != 200:
        raise Exception

    return res["access_token"]


def make_feeds(token: str, lng: float, lat: float, image: str):
    body = {
        "content": "example",
        "location": {"long": lng, "lat": lat},
        "images": [image],
        "private": False,
    }
    res = requests.post(
        URL + "/feed/new", headers={"Authorization": "Bearer " + token}, json=body
    )

    if res.status_code != 200:
        print(res.json())
        raise Exception


def get_random_coordinate(lat_rng: dict, lng_rng: dict) -> tuple[float, float]:
    lng = lng_rng["low"] + (lng_rng["high"] - lng_rng["low"]) * random.random()
    lat = lat_rng["low"] + (lat_rng["high"] - lat_rng["low"]) * random.random()

    return lng, lat


try:
    token = get_token(uid, pwd)
    for _ in range(0, CNT):
        lng, lat = get_random_coordinate(lat_rng, lng_rng)
        make_feeds(token, lng, lat, IMAGE)
except Exception:
    print("error")
