from __future__ import annotations

import base64
import io
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import OUTPUT_DIR, UPLOAD_DIR, app


def _poll_status(client, job_id: str, timeout_s: float = 12.0) -> dict:
    start = time.time()
    while time.time() - start < timeout_s:
        response = client.get(f"/api/job/{job_id}")
        assert response.status_code == 200, response.data
        payload = response.get_json()
        status = payload.get("status")
        if status in {"completed", "error"}:
            return payload
        time.sleep(0.25)
    raise TimeoutError(f"Job {job_id} did not finish within {timeout_s} seconds.")


def run_smoke() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    with app.test_client() as client:
        options_response = client.get("/api/options")
        assert options_response.status_code == 200

        carrier = io.BytesIO(b"carrier-image-bytes")
        payload = io.BytesIO(b"payload-bytes")

        carrier_upload = client.post(
            "/api/uploads",
            data={"file": (carrier, "carrier.png")},
            content_type="multipart/form-data",
        )
        assert carrier_upload.status_code == 200, carrier_upload.data
        carrier_id = carrier_upload.get_json()["id"]

        payload_upload = client.post(
            "/api/uploads",
            data={"file": (payload, "payload.bin")},
            content_type="multipart/form-data",
        )
        assert payload_upload.status_code == 200, payload_upload.data
        payload_id = payload_upload.get_json()["id"]

        encapsulation = client.post(
            "/api/encapsulate",
            json={
                "carrierFileId": carrier_id,
                "targetFileIds": [payload_id],
                "options": {"highSecurity": False},
            },
        )
        assert encapsulation.status_code == 200, encapsulation.data
        job_id = encapsulation.get_json()["jobId"]

        status_payload = _poll_status(client, job_id)
        assert status_payload.get("status") == "completed", status_payload

        download_response = client.get(f"/api/download/{job_id}")
        assert download_response.status_code == 200, download_response.data

        jobs_response = client.get("/api/jobs")
        assert jobs_response.status_code == 200, jobs_response.data
        jobs_payload = jobs_response.get_json()
        job_ids = {job.get("jobId") for job in jobs_payload.get("jobs", [])}
        assert job_id in job_ids

        geo_response = client.get(f"/api/geometric/key/{job_id}")
        assert geo_response.status_code == 200, geo_response.data

        package = io.BytesIO(b"package-bytes")
        extract_response = client.post(
            "/api/extract",
            data={"package": (package, "package.png"), "passphrase": "test-pass"},
            content_type="multipart/form-data",
        )
        assert extract_response.status_code == 200, extract_response.data
        extract_job_id = extract_response.get_json()["jobId"]

        extract_status = client.get(f"/api/extract/status/{extract_job_id}")
        assert extract_status.status_code == 200, extract_status.data

        pipeline_request = {
            "steps": ["prepare"],
            "payload": {
                "raw_bytes_b64": base64.b64encode(b"pipeline-bytes").decode("utf-8"),
                "name": "pipeline.bin",
            },
        }
        pipeline_response = client.post("/api/bridge/pipeline", json=pipeline_request)
        assert pipeline_response.status_code == 200, pipeline_response.data


if __name__ == "__main__":
    run_smoke()
    print("Smoke API checks passed.")
