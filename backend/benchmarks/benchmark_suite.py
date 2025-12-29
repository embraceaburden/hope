import argparse
import json
import statistics
import tempfile
import time
from pathlib import Path

import requests
import socketio
from PIL import Image


DEFAULT_TIMEOUT_S = 300


def create_payload(tmp_dir: Path) -> tuple[Path, Path]:
    text_path = tmp_dir / "payload.txt"
    text_path.write_text("Snowflake benchmark payload", encoding="utf-8")

    image_path = tmp_dir / "carrier.png"
    image = Image.new("RGB", (512, 512), color=(25, 40, 65))
    image.save(image_path)
    return text_path, image_path


def percentile(values: list[float], percent: float) -> float:
    if not values:
        return 0.0
    values_sorted = sorted(values)
    k = (len(values_sorted) - 1) * (percent / 100)
    f = int(k)
    c = min(f + 1, len(values_sorted) - 1)
    if f == c:
        return values_sorted[f]
    d0 = values_sorted[f] * (c - k)
    d1 = values_sorted[c] * (k - f)
    return d0 + d1


def summarize(values: list[float]) -> dict:
    if not values:
        return {}
    return {
        "count": len(values),
        "min_ms": min(values),
        "max_ms": max(values),
        "avg_ms": statistics.mean(values),
        "p50_ms": percentile(values, 50),
        "p95_ms": percentile(values, 95),
    }


def wait_for_job(base_url: str, job_id: str, timeout_s: int) -> dict:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        response = requests.get(f"{base_url}/api/job/{job_id}", timeout=10)
        response.raise_for_status()
        payload = response.json()
        if payload.get("status") in {"completed", "error"}:
            return payload
        time.sleep(1)
    raise TimeoutError(f"Timed out waiting for job {job_id}")


def wait_for_extraction(base_url: str, job_id: str, timeout_s: int) -> dict:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        response = requests.get(f"{base_url}/api/extract/status/{job_id}", timeout=10)
        response.raise_for_status()
        payload = response.json()
        if payload.get("status") in {"completed", "error"}:
            return payload
        time.sleep(1)
    raise TimeoutError(f"Timed out waiting for extraction {job_id}")


def measure_socket_updates(base_url: str, job_id: str) -> dict:
    sio = socketio.Client()
    first_update_time = None
    completion_time = None
    done = {"completed": False}

    @sio.on("job_update")
    def on_job_update(data):
        nonlocal first_update_time, completion_time
        if data.get("jobId") != job_id:
            return
        now = time.perf_counter()
        if first_update_time is None:
            first_update_time = now
        if data.get("status") in {"completed", "error"}:
            completion_time = now
            done["completed"] = True

    sio.connect(base_url, transports=["websocket"])
    start = time.perf_counter()
    sio.emit("subscribe_job", {"jobId": job_id})

    timeout_s = 60
    while time.perf_counter() - start < timeout_s:
        if done["completed"]:
            break
        time.sleep(0.1)

    sio.disconnect()

    return {
        "first_update_ms": (first_update_time - start) * 1000 if first_update_time else None,
        "completion_ms": (completion_time - start) * 1000 if completion_time else None,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark Snowflake API")
    parser.add_argument("--base-url", default="http://localhost:5000")
    parser.add_argument("--iterations", type=int, default=3)
    parser.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT_S)
    parser.add_argument("--output", default=None, help="Write JSON report to file")
    parser.add_argument("--passphrase", default="benchmark-pass")
    args = parser.parse_args()

    base_url = args.base_url.rstrip("/")

    submit_latencies = []
    completion_times = []
    extraction_times = []
    download_latencies = []
    compression_ratios = []
    socket_metrics = []

    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        text_path, image_path = create_payload(tmp_dir)

        for iteration in range(args.iterations):
            with open(text_path, "rb") as text_file, open(image_path, "rb") as image_file:
                start = time.perf_counter()
                response = requests.post(
                    f"{base_url}/api/encapsulate",
                    files={
                        "target_files": text_file,
                        "carrier_image": image_file,
                    },
                    data={
                        "options": json.dumps({
                            "compressionMode": "lossless",
                            "passphrase": args.passphrase,
                        })
                    },
                    timeout=60,
                )
            response.raise_for_status()
            submit_latencies.append((time.perf_counter() - start) * 1000)

            job_id = response.json()["jobId"]

            if iteration == 0:
                socket_metrics.append(measure_socket_updates(base_url, job_id))

            start = time.perf_counter()
            job_payload = wait_for_job(base_url, job_id, args.timeout)
            completion_times.append((time.perf_counter() - start) * 1000)

            if job_payload.get("status") != "completed":
                raise RuntimeError(f"Encapsulation failed: {job_payload}")

            if job_payload.get("metrics"):
                compression_ratios.append(job_payload["metrics"].get("compressionRatio", 0))

            start = time.perf_counter()
            download_response = requests.get(
                f"{base_url}/api/download/{job_id}", timeout=30
            )
            download_response.raise_for_status()
            download_latencies.append((time.perf_counter() - start) * 1000)

            package_path = tmp_dir / f"package_{job_id}.png"
            package_path.write_bytes(download_response.content)

            with open(package_path, "rb") as package_file:
                start = time.perf_counter()
                extract_response = requests.post(
                    f"{base_url}/api/extract",
                    files={"package": package_file},
                    data={"passphrase": args.passphrase},
                    timeout=60,
                )
            extract_response.raise_for_status()
            extract_job_id = extract_response.json()["jobId"]

            extraction_payload = wait_for_extraction(base_url, extract_job_id, args.timeout)
            extraction_times.append((time.perf_counter() - start) * 1000)

            if extraction_payload.get("status") != "completed":
                raise RuntimeError(f"Extraction failed: {extraction_payload}")

    report = {
        "base_url": base_url,
        "iterations": args.iterations,
        "submit_latency_ms": summarize(submit_latencies),
        "completion_time_ms": summarize(completion_times),
        "download_latency_ms": summarize(download_latencies),
        "extraction_time_ms": summarize(extraction_times),
        "compression_ratio": summarize(compression_ratios),
        "socketio": socket_metrics,
        "raw": {
            "submit_latency_ms": submit_latencies,
            "completion_time_ms": completion_times,
            "download_latency_ms": download_latencies,
            "extraction_time_ms": extraction_times,
            "compression_ratio": compression_ratios,
        },
    }

    output = json.dumps(report, indent=2)
    print(output)

    if args.output:
        Path(args.output).write_text(output, encoding="utf-8")


if __name__ == "__main__":
    main()
