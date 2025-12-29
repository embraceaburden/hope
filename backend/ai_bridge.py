"""Example bridge to route UI chat JSON into engine modules.

This script is intentionally minimal: it demonstrates how the UI can send a
structured payload describing which tool steps to execute and returns a JSON
response with base64-encoded binary artifacts.
"""

from __future__ import annotations

import argparse
import base64
import json
from pathlib import Path
from typing import Any

from preparation import validate_and_clean
from conversion import serialize_and_patternize
from compression import hyper_compress
from map_and_scramble import geometric_map_and_scramble
from stego_engine import embed_steganographic
from security import cryptographic_seal


def _b64_decode(value: str | None) -> bytes | None:
    if not value:
        return None
    return base64.b64decode(value.encode("utf-8"))


def _b64_encode(value: bytes | None) -> str | None:
    if value is None:
        return None
    return base64.b64encode(value).decode("utf-8")


def _load_bytes(payload: dict[str, Any], key: str, alt_path_key: str) -> bytes | None:
    if key in payload and payload[key]:
        return _b64_decode(payload[key])
    if alt_path_key in payload and payload[alt_path_key]:
        return Path(payload[alt_path_key]).read_bytes()
    return None


def _load_request(path: Path | None) -> dict[str, Any]:
    if path:
        return json.loads(path.read_text(encoding="utf-8"))
    return json.loads(input())


def run_pipeline(request: dict[str, Any]) -> dict[str, Any]:
    steps = request.get("steps") or [
        "prepare",
        "convert",
        "compress",
        "map_and_scramble",
        "stego_embed",
        "seal",
    ]
    payload = request.get("payload", {})
    options = request.get("options", {})

    context: dict[str, Any] = {"payload": payload, "options": options}

    for step in steps:
        if step == "prepare":
            file_bytes = _load_bytes(payload, "raw_bytes_b64", "file_path")
            if not file_bytes:
                raise ValueError("prepare step requires raw_bytes_b64 or file_path")
            package = validate_and_clean({
                "file": file_bytes,
                "name": payload.get("name", "payload"),
                "metadata": payload.get("metadata", {}),
                "type": payload.get("type"),
            })
            context["package"] = package
        elif step == "convert":
            context.update(serialize_and_patternize(context["package"]))
        elif step == "compress":
            context.update(
                hyper_compress(
                    context["patternized_blob"],
                    zstd_dict=_load_bytes(payload, "zstd_dict_b64", "zstd_dict_path"),
                    level=options.get("zstd_level", 22),
                )
            )
        elif step == "map_and_scramble":
            context.update(
                geometric_map_and_scramble(
                    context["compressed_blob"],
                    polytope_type=options.get("polytope_type", "cube"),
                    backend=options.get("poly_backend", "latte"),
                )
            )
        elif step == "stego_embed":
            carrier_image = _load_bytes(payload, "carrier_image_b64", "carrier_image_path")
            if not carrier_image:
                raise ValueError("stego_embed step requires carrier_image_b64 or carrier_image_path")
            context.update(
                embed_steganographic(
                    context["scrambled_blob"],
                    carrier_image,
                    password=options.get("stego_password", "supersecret"),
                    layers=options.get("stego_layers", 2),
                    dynamic=options.get("stego_dynamic", True),
                    compress=options.get("stego_compress", True),
                    adaptive=options.get("stego_adaptive", True),
                    logging_enabled=options.get("stego_logging", False),
                )
            )
        elif step == "seal":
            alpha_layer = _load_bytes(payload, "alpha_layer_b64", "alpha_layer_path")
            context.update(
                cryptographic_seal(
                    context["embedded_image"],
                    password=options.get("seal_password"),
                    key=_load_bytes(payload, "seal_key_b64", "seal_key_path"),
                    alpha_layer=alpha_layer,
                    kdf_iterations=options.get("kdf_iterations", 100_000),
                )
            )
        else:
            raise ValueError(f"Unknown step: {step}")

    return {
        "status": "ok",
        "steps": steps,
        "artifacts": {
            "patternized_blob_b64": _b64_encode(context.get("patternized_blob")),
            "compressed_blob_b64": _b64_encode(context.get("compressed_blob")),
            "scrambled_blob_b64": _b64_encode(context.get("scrambled_blob")),
            "embedded_image_b64": _b64_encode(context.get("embedded_image")),
            "sealed_image_b64": _b64_encode(context.get("sealed_image")),
        },
        "metadata": {
            "compression_ratio": context.get("compression_ratio"),
            "permutation_key": context.get("permutation_key"),
            "crypto_metadata": context.get("crypto_metadata"),
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Forge AI bridge example")
    parser.add_argument("--input", type=Path, help="Path to JSON request file")
    args = parser.parse_args()

    request = _load_request(args.input)
    response = run_pipeline(request)
    print(json.dumps(response, indent=2))


if __name__ == "__main__":
    main()
