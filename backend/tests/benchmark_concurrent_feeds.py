#!/usr/bin/env python3
"""
부하 및 응답시간 측정 벤치마크 스크립트 (Concurrent Multi-User Feed Latency Benchmark)

설명:
  동시에 여러 가상 사용자가 접속하여 서로 다른 대한민국 주요 도시/지역 위치 및 줌 레벨(Zoom Level)의 
  피드 데이터를 요청하고, 각 요청별 처리 소요시간(Response Time / Latency)을 측정하여 종합 성능 리포트를 생성합니다.

사용법:
  python tests/benchmark_concurrent_feeds.py --host http://localhost:8000 --users 20 --requests-per-user 5 --zoom 16
"""

import argparse
import asyncio
import json
import math
import random
import statistics
import time
from dataclasses import asdict, dataclass
from typing import Any, Dict, List, Optional

try:
    import httpx
except ImportError:
    httpx = None  # type: ignore


# ------------------------------------------------------------------------------
# 위치 데이터셋 (전국 주요 20개 지역 좌표)
# ------------------------------------------------------------------------------
LOCATIONS = [
    {"name": "서울 강남역", "lat": 37.4979, "lng": 127.0276},
    {"name": "서울 홍대입구", "lat": 37.5563, "lng": 126.9226},
    {"name": "서울 여의도", "lat": 37.5215, "lng": 126.9243},
    {"name": "서울 명동", "lat": 37.5636, "lng": 126.9837},
    {"name": "서울 성수동", "lat": 37.5445, "lng": 127.0560},
    {"name": "경기 판교역", "lat": 37.3947, "lng": 127.1112},
    {"name": "경기 수원역", "lat": 37.2656, "lng": 127.0000},
    {"name": "인천 송도", "lat": 37.3828, "lng": 126.6568},
    {"name": "인천 구월동", "lat": 37.4452, "lng": 126.7025},
    {"name": "부산 해운대", "lat": 35.1587, "lng": 129.1604},
    {"name": "부산 서면", "lat": 35.1578, "lng": 129.0592},
    {"name": "부산 광안리", "lat": 35.1532, "lng": 129.1189},
    {"name": "대구 동성로", "lat": 35.8694, "lng": 128.5944},
    {"name": "대구 수성못", "lat": 35.8278, "lng": 128.6167},
    {"name": "대전 둔산동", "lat": 36.3504, "lng": 127.3845},
    {"name": "광주 상무지구", "lat": 35.1500, "lng": 126.8500},
    {"name": "울산 삼산동", "lat": 35.5384, "lng": 129.3361},
    {"name": "제주 노형동", "lat": 33.4853, "lng": 126.4815},
    {"name": "강원 강릉 경포대", "lat": 37.7950, "lng": 128.9080},
    {"name": "세종 조치원", "lat": 36.6012, "lng": 127.2978},
]


@dataclass
class SingleRequestMetric:
    user_index: int
    request_index: int
    location_name: str
    lat: float
    lng: float
    zoom: int
    status_code: int
    latency_ms: float
    success: bool
    error_detail: str = ""


def get_bbox(lat: float, lng: float, delta: float = 0.015) -> Dict[str, Any]:
    """기준 좌표 주변의 Bounding Box 반환"""
    return {
        "SW": {"lat": round(lat - delta, 6), "long": round(lng - delta, 6)},
        "NE": {"lat": round(lat + delta, 6), "long": round(lng + delta, 6)},
    }


def calculate_percentile(values: List[float], pct: float) -> float:
    """백분위수 (Percentile) 계산"""
    if not values:
        return 0.0
    sorted_v = sorted(values)
    k = (len(sorted_v) - 1) * (pct / 100.0)
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return sorted_v[int(k)]
    return sorted_v[int(f)] * (c - k) + sorted_v[int(c)] * (k - f)


class FeedLoadTester:
    def __init__(
        self,
        base_url: str,
        num_users: int,
        reqs_per_user: int,
        fixed_zoom: Optional[int] = None,
    ):
        self.base_url = base_url.rstrip("/")
        self.num_users = num_users
        self.reqs_per_user = reqs_per_user
        self.fixed_zoom = fixed_zoom
        self.metrics: List[SingleRequestMetric] = []

    async def _user_workflow(
        self, client: "httpx.AsyncClient", user_idx: int
    ) -> None:
        """가상 유저 1명의 동작 흐름 (회원가입 -> 로그인 -> N회 피드 요청)"""
        # 1. 사용자 회원가입 및 로그인
        email = f"loadtest_user_{user_idx}_{int(time.time()*1000)}@example.com"
        pwd = "TestPassword123!"

        join_payload = {
            "email": email,
            "pwd": pwd,
            "nickname": f"tester_{user_idx}",
            "birthdate": "1995-05-05",
        }

        try:
            join_resp = await client.post(
                f"{self.base_url}/user/join", json=join_payload
            )
            if join_resp.status_code != 200:
                print(
                    f"[User {user_idx}] 회원가입 실패: {join_resp.status_code} {join_resp.text}"
                )
                return

            token_resp = await client.post(
                f"{self.base_url}/auth/token",
                data={"username": email, "password": pwd},
            )
            if token_resp.status_code != 200:
                print(
                    f"[User {user_idx}] 로그인 실패: {token_resp.status_code} {token_resp.text}"
                )
                return

            token = token_resp.json().get("access_token")
            headers = {"Authorization": f"Bearer {token}"}
        except Exception as e:
            print(f"[User {user_idx}] 인증 예외 발생: {e}")
            return

        # 2. 서로 다른 위치와 줌 레벨에 대한 피드 요청 반복 수행
        for req_idx in range(1, self.reqs_per_user + 1):
            loc = random.choice(LOCATIONS)
            bbox = get_bbox(loc["lat"], loc["lng"])

            # zoom 설정 (지정되지 않은 경우 12~18 범위 무작위)
            zoom = (
                self.fixed_zoom
                if self.fixed_zoom is not None
                else random.choice([12, 14, 15, 16, 17, 18])
            )
            start_t = time.perf_counter()
            try:
                res = await client.post(
                    f"{self.base_url}/feed/get/location",
                    params={"zoom": zoom},
                    headers=headers,
                    json=bbox,
                    timeout=10.0,
                )
                elapsed_ms = (time.perf_counter() - start_t) * 1000.0
                is_ok = res.status_code == 200

                metric = SingleRequestMetric(
                    user_index=user_idx,
                    request_index=req_idx,
                    location_name=loc["name"],
                    lat=loc["lat"],
                    lng=loc["lng"],
                    zoom=zoom,
                    status_code=res.status_code,
                    latency_ms=elapsed_ms,
                    success=is_ok,
                    error_detail="" if is_ok else res.text[:100],
                )
            except Exception as exc:
                elapsed_ms = (time.perf_counter() - start_t) * 1000.0
                metric = SingleRequestMetric(
                    user_index=user_idx,
                    request_index=req_idx,
                    location_name=loc["name"],
                    lat=loc["lat"],
                    lng=loc["lng"],
                    zoom=zoom,
                    status_code=500,
                    latency_ms=elapsed_ms,
                    success=False,
                    error_detail=str(exc),
                )
            self.metrics.append(metric)

            # 지터 부여
            await asyncio.sleep(random.uniform(0.01, 0.05))

    async def run(self) -> List[SingleRequestMetric]:
        """모든 동시 유저 실행"""
        if httpx is None:
            raise RuntimeError(
                "httpx 라이브러리가 필요합니다. pip install httpx 하세요."
            )

        print(
            f"🚀 동시성 테스트 시작: {self.num_users} 사용자 x 유저당 {self.reqs_per_user}회 요청"
        )
        print(
            f"🎯 대상 서버: {self.base_url} (Zoom: {self.fixed_zoom if self.fixed_zoom is not None else '가변 (12~18)'})"
        )
        print("=" * 65)

        async with httpx.AsyncClient(timeout=15.0) as client:
            user_tasks = [
                self._user_workflow(client, i + 1) for i in range(self.num_users)
            ]
            await asyncio.gather(*user_tasks)

        return self.metrics


def print_report(
    metrics: List[SingleRequestMetric], total_wall_time_sec: float
) -> None:
    """결과 리포트 출력"""
    if not metrics:
        print("❌ 수집된 결과 데이터가 없습니다.")
        return

    latencies = [m.latency_ms for m in metrics]
    success_metrics = [m for m in metrics if m.success]
    fail_metrics = [m for m in metrics if not m.success]

    total_reqs = len(metrics)
    success_count = len(success_metrics)
    fail_count = len(fail_metrics)
    tps = total_reqs / total_wall_time_sec if total_wall_time_sec > 0 else 0

    mean_lat = statistics.mean(latencies)
    median_lat = statistics.median(latencies)
    min_lat = min(latencies)
    max_lat = max(latencies)
    p95_lat = calculate_percentile(latencies, 95)
    p99_lat = calculate_percentile(latencies, 99)
    stdev_lat = statistics.stdev(latencies) if len(latencies) > 1 else 0.0

    print("\n=======================================================")
    print("        📊 동시 피드 요청 응답시간 종합 테스트 리포트      ")
    print("=======================================================")
    print(f" 총 요청 건수        : {total_reqs} 건")
    print(f" 성공 요청 건수      : {success_count} 건")
    print(f" 실패 요청 건수      : {fail_count} 건")
    print(f" 성공률             : {(success_count / total_reqs) * 100:.2f} %")
    print(f" 전체 테스트 소요시간  : {total_wall_time_sec:.3f} 초")
    print(f" 처리량 (Throughput) : {tps:.2f} TPS (Requests/sec)")
    print("-------------------------------------------------------")
    print("⏱️ 응답시간 (Latency) 상세 통계 (단위: ms):")
    print(f"  - 최소 응답시간 (Min)    : {min_lat:8.2f} ms")
    print(f"  - 평균 응답시간 (Mean)   : {mean_lat:8.2f} ms")
    print(f"  - 중간 응답시간 (Median) : {median_lat:8.2f} ms")
    print(f"  - 95% 백분위 (P95)      : {p95_lat:8.2f} ms")
    print(f"  - 99% 백분위 (P99)      : {p99_lat:8.2f} ms")
    print(f"  - 최대 응답시간 (Max)    : {max_lat:8.2f} ms")
    print(f"  - 표준편차 (Std Dev)    : {stdev_lat:8.2f} ms")
    print("-------------------------------------------------------")

    # Zoom 레벨별 평균 응답시간 분석
    zoom_stats: Dict[int, List[float]] = {}
    for m in metrics:
        zoom_stats.setdefault(m.zoom, []).append(m.latency_ms)

    print("🔍 Zoom 레벨별 평균 응답시간 분석:")
    for z_val, z_lats in sorted(zoom_stats.items()):
        z_avg = statistics.mean(z_lats)
        mode_desc = "Cluster/Count" if z_val < 16 else "Feed Detail"
        print(
            f"  - Zoom {z_val:<2} ({mode_desc:<13}): {z_avg:7.2f} ms (요청 {len(z_lats)}회)"
        )

    print("-------------------------------------------------------")
    # 위치별 평균 응답시간 분석
    location_stats: Dict[str, List[float]] = {}
    for m in metrics:
        location_stats.setdefault(m.location_name, []).append(m.latency_ms)

    print("📍 위치별 평균 응답시간 분석:")
    for loc_name, loc_lats in sorted(location_stats.items()):
        loc_avg = statistics.mean(loc_lats)
        print(f"  - {loc_name:<14}: {loc_avg:7.2f} ms (요청 {len(loc_lats)}회)")

    print("=======================================================\n")


def main():
    parser = argparse.ArgumentParser(
        description="동시 사용자 위치 및 줌 레벨 기반 피드 요청 벤치마크"
    )
    parser.add_argument(
        "--host", type=str, default="http://localhost:8000", help="대상 서버 URL"
    )
    parser.add_argument("--users", type=int, default=10, help="동시 접속 사용자 수")
    parser.add_argument(
        "--requests-per-user", type=int, default=3, help="유저당 요청 횟수"
    )
    parser.add_argument(
        "--zoom",
        type=int,
        default=None,
        help="고정 줌 레벨 (미지정 시 12~18 무작위 지정)",
    )
    parser.add_argument(
        "--output-json", type=str, default=None, help="결과 JSON 저장 파일 경로"
    )

    args = parser.parse_args()

    tester = FeedLoadTester(
        base_url=args.host,
        num_users=args.users,
        reqs_per_user=args.requests_per_user,
        fixed_zoom=args.zoom,
    )

    start_wall = time.perf_counter()
    metrics = asyncio.run(tester.run())
    total_wall = time.perf_counter() - start_wall

    print_report(metrics, total_wall)

    if args.output_json:
        data = [asdict(m) for m in metrics]
        with open(args.output_json, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"💾 결과가 {args.output_json} 에 저장되었습니다.")


if __name__ == "__main__":
    main()
