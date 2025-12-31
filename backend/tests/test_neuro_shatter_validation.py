from __future__ import annotations

import io

from pathlib import Path

from neuro_shatter import DataPackage, select_ingestion_mode, validate_and_clean


def test_validate_and_clean_accepts_bytes_like() -> None:
    payload = b"forge-bytes"
    package = validate_and_clean({"file": payload, "name": "payload.bin"})

    assert package.raw_bytes == payload
    assert package.name == "payload.bin"
    assert package.type == "binary"


def test_validate_and_clean_accepts_bytearray_memoryview() -> None:
    payload = bytearray(b"forge-bytearray")
    package = validate_and_clean({"file": memoryview(payload), "name": "payload.bin"})

    assert isinstance(package.raw_bytes, bytes)
    assert package.raw_bytes == b"forge-bytearray"


def test_validate_and_clean_accepts_file_like() -> None:
    stream = io.BytesIO(b"forge-stream")
    package = validate_and_clean({"file": stream, "name": "payload.bin"})

    assert package.raw_bytes == b"forge-stream"


def test_validate_and_clean_accepts_path(tmp_path: Path) -> None:
    target = tmp_path / "payload.bin"
    target.write_bytes(b"forge-path")

    package = validate_and_clean({"file": str(target)})

    assert package.raw_bytes == b"forge-path"
    assert package.name == "payload.bin"


def test_select_ingestion_mode_prefers_neuro_for_tabular() -> None:
    package = DataPackage(raw_bytes=b"col\n1\n", name="data.csv", type="text/csv")

    assert select_ingestion_mode(package) == "neuro"


def test_select_ingestion_mode_respects_options() -> None:
    package = DataPackage(raw_bytes=b"data", name="payload.bin", type="binary")

    assert select_ingestion_mode(package, {"neuroShatter": "off"}) == "legacy"
