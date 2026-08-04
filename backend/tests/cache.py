import requests
import time

payload = {
    "bbox": {
        "SW": {"lat": 37.49, "long": 127.02},
        "NE": {"lat": 37.51, "long": 127.04},
    },
    "zoom": 16,
}

URL = "http://localhost:8000"

login_response = requests.post(
    URL + "/auth/token",
    data={"username": "ttt16872@gmail.com", "password": "string"},
)
token = login_response.json().get("access_token")

print(token)

start = time.time_ns()
res = requests.post(
    URL + "/feed/get/location",
    json=payload,
    headers={"Authorization": "Bearer " + token},
)
print("uncached " + (time.time_ns() - start).__str__())

assert res.status_code == 200
assert len(res.json()["feeds"]) > 0

for i in range(32):
    res = requests.post(
        URL + "/feed/get/location",
        json=payload,
        headers={"Authorization": "Bearer " + token},
    )

start = time.time_ns()
res = requests.post(
    URL + "/feed/get/location",
    json=payload,
    headers={"Authorization": "Bearer " + token},
)
print("cached " + (time.time_ns() - start).__str__())
