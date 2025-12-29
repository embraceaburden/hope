"""Python API client for the Forge backend."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any
from contextlib import ExitStack

import json
import requests


@dataclass
class ForgeApiClient:
    base_url: str = "http://localhost:5000"

    def _url(self, path: str) -> str:
        return f"{self.base_url.rstrip('/')}{path}"

    def health(self) -> dict[str, Any]:
        response = requests.get(self._url("/"), timeout=10)
        response.raise_for_status()
        return response.json()

    def upload_file(self, file_path: Path) -> dict[str, Any]:
        with file_path.open("rb") as handle:
            response = requests.post(
                self._url("/api/uploads"),
                files={"file": handle},
                timeout=120,
            )
        response.raise_for_status()
        return response.json()

    def start_encapsulation(
        self,
        target_files: list[Path],
        carrier_image: Path,
        options: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        with ExitStack() as stack:
            files = [
                ("target_files", stack.enter_context(path.open("rb")))
                for path in target_files
            ]
            files.append(("carrier_image", stack.enter_context(carrier_image.open("rb"))))
            response = requests.post(
                self._url("/api/encapsulate"),
                files=files,
                data={"options": json.dumps(options or {})},
                timeout=300,
            )
        response.raise_for_status()
        return response.json()

    def get_job(self, job_id: str) -> dict[str, Any]:
        response = requests.get(self._url(f"/api/job/{job_id}"), timeout=30)
        response.raise_for_status()
        return response.json()

    def download_package(self, job_id: str, output_path: Path) -> None:
        response = requests.get(self._url(f"/api/download/{job_id}"), timeout=300)
        response.raise_for_status()
        output_path.write_bytes(response.content)

    def start_extraction(self, package_path: Path, passphrase: str) -> dict[str, Any]:
        with package_path.open("rb") as handle:
            response = requests.post(
                self._url("/api/extract"),
                files={"package": handle},
                data={"passphrase": passphrase},
                timeout=300,
            )
        response.raise_for_status()
        return response.json()

    def get_extraction_status(self, job_id: str) -> dict[str, Any]:
        response = requests.get(self._url(f"/api/extract/status/{job_id}"), timeout=30)
        response.raise_for_status()
        return response.json()

    def get_geometric_key(self, job_id: str) -> dict[str, Any]:
        response = requests.get(self._url(f"/api/geometric/key/{job_id}"), timeout=30)
        response.raise_for_status()
        return response.json()
