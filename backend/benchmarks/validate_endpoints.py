import argparse
import json
import os
import tempfile
import time
from pathlib import Path

import requests
import socketio
from PIL import Image


DEFAULT_TIMEOUT_S = 300


def create_payload(tmp_dir: Path) -> tuple[Path, Path]:
    text_path = tmp_dir / "payload.txt"
    text_path.write_text("Snowflake validation payload", encoding="utf-8")

    image_path = tmp_dir / "carrier.png"
    image = Image.new("RGB", (256, 256), color=(10, 20, 30))
    image.save(image_path)
    return text_path, image_path


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


def validate_socketio(base_url: str, job_id: str, socket_token: str) -> dict:
    sio = socketio.Client()
    updates = []
    completed = {"done": False}

    @sio.on("job_update")
    def on_job_update(data):
        if data.get("jobId") != job_id:
            return
        updates.append(data)
        if data.get("status") in {"completed", "error"}:
            completed["done"] = True

    sio.connect(
        base_url,
        transports=["websocket"],
        auth={"token": socket_token},
    )
    sio.emit("subscribe_job", {"jobId": job_id})

    start = time.time()
    while time.time() - start < 30:
        if updates:
            break
        time.sleep(0.2)

    sio.disconnect()
    return {
        "received_updates": len(updates) > 0,
        "total_updates": len(updates),
        "last_status": updates[-1].get("status") if updates else None,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate Snowflake API endpoints")
    parser.add_argument("--base-url", default="http://127.0.0.1:5000")
    parser.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT_S)
    parser.add_argument("--passphrase", default="validation-pass")
    parser.add_argument(
        "--socket-token",
        default=os.environ.get("FORGE_SOCKET_TOKEN"),
        help="Socket.IO auth token (defaults to FORGE_SOCKET_TOKEN env var)",
    )
    args = parser.parse_args()

    base_url = args.base_url.rstrip("/")

    if not args.socket_token:
        raise RuntimeError(
            "Socket.IO token required. Set --socket-token or FORGE_SOCKET_TOKEN."
        )

    health = requests.get(f"{base_url}/", timeout=10)
    health.raise_for_status()

    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        text_path, image_path = create_payload(tmp_dir)

        with open(text_path, "rb") as text_file, open(image_path, "rb") as image_file:
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
        job_id = response.json()["jobId"]

        socket_validation = validate_socketio(base_url, job_id, args.socket_token)
        job_payload = wait_for_job(base_url, job_id, args.timeout)

        if job_payload.get("status") != "completed":
            raise RuntimeError(f"Encapsulation failed: {job_payload}")

        geometric_key = requests.get(
            f"{base_url}/api/geometric/key/{job_id}", timeout=10
        )
        geometric_key.raise_for_status()

        download_response = requests.get(
            f"{base_url}/api/download/{job_id}", timeout=30
        )
        download_response.raise_for_status()

        package_path = tmp_dir / "package.png"
        package_path.write_bytes(download_response.content)

        with open(package_path, "rb") as package_file:
            extract_response = requests.post(
                f"{base_url}/api/extract",
                files={"package": package_file},
                data={"passphrase": args.passphrase},
                timeout=60,
            )
        extract_response.raise_for_status()
        extract_job_id = extract_response.json()["jobId"]

        extraction_payload = wait_for_extraction(base_url, extract_job_id, args.timeout)
        if extraction_payload.get("status") != "completed":
            raise RuntimeError(f"Extraction failed: {extraction_payload}")

    summary = {
        "health": health.json(),
        "socketio": socket_validation,
        "encapsulation": {
            "jobId": job_id,
            "status": job_payload.get("status"),
        },
        "extraction": {
            "jobId": extract_job_id,
            "status": extraction_payload.get("status"),
        },
    }

    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
