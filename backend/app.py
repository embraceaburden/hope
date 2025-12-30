"""Forge Flask API aligned with the command center UI.

Provides REST + Socket.IO endpoints with phase-aware progress and configurable
options per pipeline phase. This is a lightweight orchestration layer that can
optionally invoke the local engine modules via ai_bridge.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import threading
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

import requests
from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
from flask_socketio import SocketIO, emit, join_room
from werkzeug.exceptions import HTTPException, RequestEntityTooLarge
from werkzeug.utils import secure_filename

from ai_bridge import BridgeValidationError, run_pipeline
from compression import hyper_compress
from decompress import decompress_blob
from extract import extract_binary_data
from job_updates import emit_job_update, set_emitter
from map_and_scramble import geometric_map_and_scramble
from preparation import validate_and_clean
from security import cryptographic_seal
from storage import RedisJobStore, SqliteJobStore
from stego_engine import embed_steganographic
from unmask import unmask_alpha_layers
from unlock import unlock_and_decrypt
from unshuffle import reverse_geometric_scramble
from verify import verify_and_restore

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "uploads"
OUTPUT_DIR = BASE_DIR / "output"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

PHASES = [
    {
        "id": "prepare",
        "label": "Preparation",
        "description": "Validate inputs, normalize images, and extract metadata.",
        "options": {
            "dpiThreshold": 300,
            "requireAlpha": False,
        },
    },
    {
        "id": "convert",
        "label": "Neuroglyph Serialize",
        "description": "Serialize payload using Neuroglyph codecs.",
        "options": {
            "codecProfile": "balanced",
        },
    },
    {
        "id": "compress",
        "label": "Zstandard Compress",
        "description": "Apply Zstandard hyper-compression.",
        "options": {
            "compressionMode": "lossless",
            "zstdLevel": 22,
        },
    },
    {
        "id": "map_and_scramble",
        "label": "Geometric Map",
        "description": "Map payload into polyhedral geometry and scramble.",
        "options": {
            "polytopeType": "cube",
            "polyBackend": "latte",
        },
    },
    {
        "id": "stego_embed",
        "label": "Stego Embed",
        "description": "Embed payload into carrier image with steganography.",
        "options": {
            "stegoLayers": 2,
            "stegoDynamic": True,
            "stegoAdaptive": True,
        },
    },
    {
        "id": "seal",
        "label": "Cryptographic Seal",
        "description": "Seal output with AES-256-GCM and optional alpha masking.",
        "options": {
            "kdfIterations": 100_000,
            "passphrase": None,
        },
    },
]

GLOBAL_OPTIONS = {
    "highSecurity": False,
    "passageMath": False,
    "offlineMode": False,
    "batchMode": False,
    "batchCount": 1,
    "passphrase": None,
    "theme": "light",
    "executeEngine": False,
}

UPLOAD_REGISTRY: dict[str, dict[str, Any]] = {}
OUTPUT_REGISTRY: list[dict[str, Any]] = []

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SNOWFLAKE_SECRET", "forge-secret")
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024 * 1024

CORS(
    app,
    resources={
        r"/api/*": {
            "origins": [
                "http://localhost:5173",
                "http://localhost:3000",
                "http://127.0.0.1:5173",
                "http://127.0.0.1:3000",
            ]
        },
        r"/(prepare|compress|map|embed|seal|unlock|unmask|extract|unshuffle|decompress|verify)": {
            "origins": [
                "http://localhost:5173",
                "http://localhost:3000",
                "http://127.0.0.1:5173",
                "http://127.0.0.1:3000",
            ]
        },
    },
)

socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")
set_emitter(lambda job_id, job_data: socketio.emit("job_update", job_data, room=job_id))

jobs: dict[str, dict[str, Any]] = {}
jobs_lock = threading.Lock()
redis_store = RedisJobStore(os.environ.get("REDIS_URL"))
persistent_store = SqliteJobStore(
    os.environ.get("SNOWFLAKE_DB_PATH", str(BASE_DIR / "data" / "snowflake.db"))
)

def _now() -> str:
    return datetime.now().isoformat()


def _error_response(message: str, status_code: int = 400) -> tuple[Any, int]:
    return jsonify({"error": message}), status_code


def _save_upload(file_storage) -> dict[str, Any]:
    if not file_storage:
        raise ValueError("Missing file upload")
    file_id = str(uuid.uuid4())
    filename = secure_filename(file_storage.filename or "upload.bin")
    path = UPLOAD_DIR / f"{file_id}_{filename}"
    file_storage.save(path)
    metadata = {
        "id": file_id,
        "name": filename,
        "path": str(path),
        "size": path.stat().st_size,
        "mime": file_storage.mimetype or "application/octet-stream",
    }
    UPLOAD_REGISTRY[file_id] = metadata
    return metadata


def _get_job_from_store(job_id: str) -> dict[str, Any] | None:
    if redis_store.enabled():
        job = redis_store.get_job(job_id)
        if job:
            return job
    return persistent_store.get_job(job_id)


def _get_job(job_id: str) -> dict[str, Any] | None:
    with jobs_lock:
        job = jobs.get(job_id)
        if job:
            return job
    job = _get_job_from_store(job_id)
    if job:
        with jobs_lock:
            jobs[job_id] = job
    return job


def _update_job(job_id: str, updates: dict[str, Any]) -> None:
    with jobs_lock:
        job = jobs.get(job_id)
    if not job:
        job = _get_job_from_store(job_id)
    if not job:
        return
    previous_status = job.get("status")
    job.update(updates)
    job["updatedAt"] = _now()
    with jobs_lock:
        jobs[job_id] = job
    redis_store.save_job(job_id, job)
    persistent_store.upsert_job(job)

    status = updates.get("status")
    if status and status != previous_status:
        persistent_store.record_event(
            job_id,
            "status_change",
            {
                "from": previous_status,
                "to": status,
            },
        )
        if status in {"completed", "error"}:
            redis_store.archive_job(job_id)

    emit_job_update(job_id, job)


def _build_progress() -> dict[str, int]:
    return {phase["id"]: 0 for phase in PHASES}


def _resolve_uploaded_file(file_id: str | None) -> str | None:
    if not file_id:
        return None
    metadata = UPLOAD_REGISTRY.get(file_id)
    if not metadata:
        return None
    return metadata["path"]


def _safe_b64decode(value: str | None) -> bytes | None:
    if not value:
        return None
    return base64.b64decode(value.encode("utf-8"))

def _b64encode_bytes(payload: bytes | None) -> str | None:
    if payload is None:
        return None
    return base64.b64encode(payload).decode("utf-8")


def _read_upload_bytes(field: str = "file") -> tuple[bytes, str]:
    file_storage = request.files.get(field)
    if not file_storage:
        raise ValueError(f"Missing file upload: {field}")
    return file_storage.read(), file_storage.filename or field


def _form_int(key: str, default: int) -> int:
    raw = request.form.get(key)
    if raw is None or raw == "":
        return default
    return int(raw)


def _form_bool(key: str, default: bool) -> bool:
    raw = request.form.get(key)
    if raw is None:
        return default
    return raw.lower() in {"1", "true", "yes", "on"}


def _offline_error(exc: Exception, fallback: str) -> tuple[Any, int]:
    app.logger.exception(fallback)
    if isinstance(exc, (ValueError, ImportError)):
        return _error_response(str(exc), 400)
    return _error_response(fallback, 500)

def _hash_file(path: Path, chunk_size: int = 1024 * 1024) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            chunk = handle.read(chunk_size)
            if not chunk:
                break
            hasher.update(chunk)
    return hasher.hexdigest()


def _files_match(left_path: Path, right_path: Path) -> bool:
    if left_path.stat().st_size != right_path.stat().st_size:
        return False
    return _hash_file(left_path) == _hash_file(right_path)


@app.errorhandler(RequestEntityTooLarge)
def handle_request_entity_too_large(_: RequestEntityTooLarge) -> Any:
    return _error_response("Payload too large", 413)


@app.errorhandler(HTTPException)
def handle_http_exception(exc: HTTPException) -> Any:
    return _error_response(exc.description, exc.code or 500)


@app.errorhandler(Exception)
def handle_unexpected_exception(exc: Exception) -> Any:
    app.logger.exception("Unhandled exception: %s", exc)
    return _error_response("Unexpected server error", 500)


@app.route("/", methods=["GET"])
def health() -> Any:
    return jsonify(
        {
            "status": "online",
            "service": "Snowflake API",
            "version": "1.1",
            "timestamp": _now(),
        }
    )


@app.route("/api/options", methods=["GET"])
def get_options() -> Any:
    return jsonify(
        {
            "phases": PHASES,
            "globalOptions": GLOBAL_OPTIONS,
        }
    )


@app.route("/api/uploads", methods=["POST"])
def upload_file() -> Any:
    file = request.files.get("file")
    if not file:
        return _error_response("Missing file", 400)
    try:
        metadata = _save_upload(file)
    except Exception:
        app.logger.exception("Upload failed")
        return _error_response("Upload failed", 500)
    return jsonify(
        {
            "id": metadata["id"],
            "name": metadata["name"],
            "size": metadata["size"],
            "mime": metadata["mime"],
        }
    )


@app.route("/api/encapsulate", methods=["POST"])
def encapsulate() -> Any:
    try:
        if request.is_json:
            payload = request.get_json(silent=True)
            if payload is None:
                return _error_response("Invalid JSON payload", 400)
            options = payload.get("options", {})
            target_ids = payload.get("targetFileIds", [])
            carrier_id = payload.get("carrierFileId")
            target_paths = [
                path for file_id in target_ids if (path := _resolve_uploaded_file(file_id))
            ]
            carrier_path = _resolve_uploaded_file(carrier_id)
        else:
            options_str = request.form.get("options", "{}")
            try:
                options = json.loads(options_str)
            except json.JSONDecodeError:
                return _error_response("Invalid options JSON", 400)
            target_files = request.files.getlist("target_files")
            carrier_file = request.files.get("carrier_image")
            target_paths = [_save_upload(file)["path"] for file in target_files]
            carrier_path = _save_upload(carrier_file)["path"] if carrier_file else None

        if not target_paths or not carrier_path:
            return _error_response("Missing target files or carrier image", 400)

        job_id = str(uuid.uuid4())
        job = {
            "jobId": job_id,
            "type": "encapsulation",
            "status": "queued",
            "phase": 0,
            "phaseId": None,
            "progress": _build_progress(),
            "metrics": {
                "compressionRatio": 0,
                "originalSize": sum(Path(path).stat().st_size for path in target_paths),
                "compressedSize": 0,
                "estimatedCapacity": 0,
            },
            "geometricKey": None,
            "targetPaths": target_paths,
            "carrierPath": carrier_path,
            "options": {**GLOBAL_OPTIONS, **options},
            "createdAt": _now(),
            "updatedAt": _now(),
        }

        with jobs_lock:
            jobs[job_id] = job
        redis_store.save_job(job_id, job)
        persistent_store.upsert_job(job)
        persistent_store.record_event(job_id, "created", {"status": "queued"})

        thread = threading.Thread(target=_process_encapsulation, args=(job_id,))
        thread.daemon = True
        thread.start()

        return jsonify({"jobId": job_id, "status": "queued"}), 200
    except Exception:
        app.logger.exception("Encapsulation request failed")
        return _error_response("Failed to start encapsulation", 500)


@app.route("/api/job/<job_id>", methods=["GET"])
def get_job_status(job_id: str) -> Any:
    job = _get_job(job_id)
    if not job:
        return _error_response("Job not found", 404)
    response = {k: v for k, v in job.items() if k not in ["targetPaths", "carrierPath"]}
    return jsonify(response)


@app.route("/api/jobs", methods=["GET"])
def list_jobs() -> Any:
    limit = request.args.get("limit", "100")
    status = request.args.get("status")
    try:
        limit_value = max(1, min(int(limit), 500))
    except ValueError:
        return _error_response("Invalid limit value", 400)
    jobs_list = persistent_store.list_jobs(limit=limit_value, status=status)
    response_jobs = []
    for job in jobs_list:
        sanitized = {
            k: v
            for k, v in job.items()
            if k
            not in [
                "targetPaths",
                "carrierPath",
                "packagePath",
                "passphrase",
            ]
        }
        if sanitized.get("status") == "error":
            sanitized["status"] = "failed"
        response_jobs.append(sanitized)
    return jsonify({"jobs": response_jobs})


@app.route("/api/download/<job_id>", methods=["GET"])
def download_result(job_id: str) -> Any:
    job = _get_job(job_id)
    if not job:
        return _error_response("Job not found", 404)
    if job.get("status") != "completed":
        return _error_response("Job not completed", 400)
    output_path = job.get("outputPath")
    if not output_path or not Path(output_path).exists():
        return _error_response("Output file not found", 404)
    return send_file(
        output_path,
        mimetype="image/png",
        as_attachment=True,
        download_name=f"snowflake_package_{job_id}.png",
    )


@app.route("/api/extract", methods=["POST"])
def extract() -> Any:
    try:
        if request.is_json:
            payload = request.get_json(silent=True)
            if payload is None:
                return _error_response("Invalid JSON payload", 400)
            package_file_id = payload.get("packageFileId")
            passphrase = payload.get("passphrase")
            package_path = _resolve_uploaded_file(package_file_id)
            if not package_path or passphrase is None:
                return _error_response("Missing package or passphrase", 400)
            package_meta = {
                "path": package_path,
                "name": UPLOAD_REGISTRY.get(package_file_id, {}).get("name", "package.bin"),
            }
        else:
            package = request.files.get("package")
            passphrase = request.form.get("passphrase")
            if not package or passphrase is None:
                return _error_response("Missing package or passphrase", 400)
            package_meta = _save_upload(package)
        job_id = str(uuid.uuid4())
        job = {
            "jobId": job_id,
            "type": "extraction",
            "status": "queued",
            "progress": 0,
            "packagePath": package_meta["path"],
            "passphrase": passphrase,
            "files": [],
            "outputFiles": [],
            "createdAt": _now(),
            "updatedAt": _now(),
        }
        with jobs_lock:
            jobs[job_id] = job
        redis_store.save_job(job_id, job)
        persistent_store.upsert_job(job)
        persistent_store.record_event(job_id, "created", {"status": "queued"})

        thread = threading.Thread(target=_process_extraction, args=(job_id,))
        thread.daemon = True
        thread.start()

        return jsonify({"jobId": job_id, "status": "queued"}), 200
    except Exception:
        app.logger.exception("Extraction request failed")
        return _error_response("Failed to start extraction", 500)


@app.route("/api/extract/status/<job_id>", methods=["GET"])
def get_extraction_status(job_id: str) -> Any:
    job = _get_job(job_id)
    if not job:
        return _error_response("Job not found", 404)
    response = {k: v for k, v in job.items() if k not in ["packagePath", "passphrase"]}
    return jsonify(response)


@app.route("/api/extract/download/<job_id>/<file_name>", methods=["GET"])
def download_extracted_file(job_id: str, file_name: str) -> Any:
    job = _get_job(job_id)
    if not job:
        return _error_response("Job not found", 404)
    output_files = job.get("outputFiles", [])
    selected = next((file for file in output_files if file.get("name") == file_name), None)
    if not selected:
        return _error_response("File not found", 404)
    output_path = selected.get("path")
    if not output_path or not Path(output_path).exists():
        return _error_response("File missing on disk", 404)
    return send_file(output_path, as_attachment=True, download_name=file_name)


@app.route("/api/scan", methods=["POST"])
def scan_carrier() -> Any:
    try:
        payload = request.get_json(silent=True)
        if payload is None:
            return _error_response("Invalid JSON payload", 400)
        carrier_file_id = payload.get("carrierFileId")
        carrier_path = _resolve_uploaded_file(carrier_file_id)
        if not carrier_path:
            return _error_response("Missing carrier file", 400)
        carrier_file = Path(carrier_path)
        registry_entry = next(
            (
                entry
                for entry in OUTPUT_REGISTRY
                if entry.get("outputPath")
                and Path(entry["outputPath"]).exists()
                and _files_match(carrier_file, Path(entry["outputPath"]))
            ),
            None,
        )
        if registry_entry:
            return jsonify(
                {
                    "hasPayload": True,
                    "payloadSize": registry_entry.get("payloadSize", 0),
                    "metadata": {
                        "jobId": registry_entry.get("jobId"),
                        "createdAt": registry_entry.get("createdAt"),
                    },
                }
            )
        return jsonify(
            {
                "hasPayload": False,
                "payloadSize": 0,
                "metadata": {
                    "note": "No registered payload signature detected.",
                },
            }
        )
    except Exception:
        app.logger.exception("Carrier scan failed")
        return _error_response("Carrier scan failed", 500)


@app.route("/api/geometric/key/<job_id>", methods=["GET"])
def get_geometric_key(job_id: str) -> Any:
    job = _get_job(job_id)
    if not job:
        return _error_response("Job not found", 404)
    if not job.get("geometricKey"):
        return _error_response("Geometric key not generated yet", 400)
    return jsonify(
        {
            "geometricKey": job["geometricKey"],
            "metadata": {
                "algorithm": job.get("options", {}).get("polytopeType", "cube"),
                "timestamp": job.get("createdAt"),
            },
        }
    )


@app.route("/api/bridge/pipeline", methods=["POST"])
def bridge_pipeline() -> Any:
    payload = request.get_json(silent=True)
    if payload is None:
        return _error_response("Invalid JSON payload", 400)
    try:
        response = run_pipeline(payload)
    except BridgeValidationError as exc:
        return _error_response(str(exc), 400)
    except Exception:
        app.logger.exception("Pipeline execution failed")
        return _error_response("Pipeline execution failed", 500)
    return jsonify(response)


@app.route("/api/health/ai", methods=["GET"])
def ai_health() -> Any:
    ollama_url = os.environ.get("OLLAMA_URL", "http://localhost:11434")
    ollama_health = {"status": "unknown", "latencyMs": None, "error": None, "url": ollama_url}
    start = time.monotonic()
    try:
        response = requests.get(f"{ollama_url}/api/version", timeout=2)
        latency_ms = int((time.monotonic() - start) * 1000)
        if response.ok:
            data = response.json() if response.headers.get("content-type", "").startswith("application/json") else {}
            ollama_health.update(
                {
                    "status": "healthy",
                    "latencyMs": latency_ms,
                    "version": data.get("version"),
                }
            )
        else:
            ollama_health.update(
                {
                    "status": "unhealthy",
                    "latencyMs": latency_ms,
                    "error": f"HTTP {response.status_code}",
                }
            )
    except requests.RequestException as exc:
        ollama_health.update({"status": "unhealthy", "error": str(exc)})

    overall_status = "ok" if ollama_health["status"] == "healthy" else "degraded"
    return jsonify({"status": overall_status, "providers": {"ollama": ollama_health}})

@app.route("/prepare", methods=["POST"])
def offline_prepare() -> Any:
    try:
        file_bytes, filename = _read_upload_bytes()
        package = validate_and_clean({"file": file_bytes, "name": filename})
        return jsonify(
            {
                "name": package.name,
                "type": package.type,
                "metadata": package.metadata,
                "raw_bytes_b64": _b64encode_bytes(package.raw_bytes),
            }
        )
    except Exception as exc:
        return _offline_error(exc, "Offline preparation failed")


@app.route("/compress", methods=["POST"])
def offline_compress() -> Any:
    try:
        file_bytes, _ = _read_upload_bytes()
        level = _form_int("compression_level", 22)
        result = hyper_compress(file_bytes, level=level)
        return jsonify(
            {
                "compressed_blob_b64": _b64encode_bytes(result.get("compressed_blob")),
                "compression_ratio": result.get("compression_ratio"),
                "frame_parameters": result.get("frame_parameters"),
                "frame_content_size": result.get("frame_content_size"),
                "zstd_level": result.get("zstd_level"),
            }
        )
    except Exception as exc:
        return _offline_error(exc, "Offline compression failed")


@app.route("/map", methods=["POST"])
def offline_map() -> Any:
    try:
        file_bytes, _ = _read_upload_bytes()
        polytope_type = request.form.get("polytope_type", "cube")
        backend = request.form.get("poly_backend", "latte")
        result = geometric_map_and_scramble(file_bytes, polytope_type=polytope_type, backend=backend)
        return jsonify(
            {
                "scrambled_blob_b64": _b64encode_bytes(result.get("scrambled_blob")),
                "permutation_key": result.get("permutation_key"),
                "polytope_type": result.get("polytope_type"),
                "backend": result.get("backend"),
                "block_size": result.get("block_size"),
                "f_vector": result.get("f_vector"),
            }
        )
    except Exception as exc:
        return _offline_error(exc, "Offline mapping failed")


@app.route("/embed", methods=["POST"])
def offline_embed() -> Any:
    try:
        scrambled_blob, _ = _read_upload_bytes()
        carrier_image = request.files.get("carrier")
        carrier_bytes = carrier_image.read() if carrier_image else scrambled_blob
        password = request.form.get("password", "supersecret")
        layers = _form_int("layers", 2)
        dynamic = _form_bool("dynamic", True)
        adaptive = _form_bool("adaptive", True)
        compress = _form_bool("compress", True)
        result = embed_steganographic(
            scrambled_blob,
            carrier_bytes,
            password=password,
            layers=layers,
            dynamic=dynamic,
            compress=compress,
            adaptive=adaptive,
        )
        return jsonify(
            {
                "embedded_image_b64": _b64encode_bytes(result.get("embedded_image")),
                "embedding_metadata": result.get("embedding_metadata"),
            }
        )
    except Exception as exc:
        return _offline_error(exc, "Offline steganographic embedding failed")


@app.route("/seal", methods=["POST"])
def offline_seal() -> Any:
    try:
        embedded_image, _ = _read_upload_bytes()
        password = request.form.get("password")
        kdf_iterations = _form_int("kdf_iterations", 100_000)
        result = cryptographic_seal(
            embedded_image,
            password=password,
            kdf_iterations=kdf_iterations,
        )
        return jsonify(
            {
                "sealed_image_b64": _b64encode_bytes(result.get("sealed_image")),
                "crypto_metadata": result.get("crypto_metadata"),
            }
        )
    except Exception as exc:
        return _offline_error(exc, "Offline cryptographic seal failed")


@app.route("/unlock", methods=["POST"])
def offline_unlock() -> Any:
    try:
        sealed_image, _ = _read_upload_bytes()
        password = request.form.get("password")
        nonce = request.form.get("nonce")
        tag = request.form.get("tag")
        salt = request.form.get("salt")
        kdf_iterations = _form_int("kdf_iterations", 100_000)
        result = unlock_and_decrypt(
            sealed_image,
            password=password,
            nonce=nonce,
            tag=tag,
            salt=salt,
            kdf_iterations=kdf_iterations,
        )
        return jsonify({"decrypted_image_b64": _b64encode_bytes(result.get("decrypted_image"))})
    except Exception as exc:
        return _offline_error(exc, "Offline unlock failed")


@app.route("/unmask", methods=["POST"])
def offline_unmask() -> Any:
    try:
        decrypted_image, _ = _read_upload_bytes()
        result = unmask_alpha_layers(decrypted_image)
        return jsonify(
            {
                "image_a_b64": _b64encode_bytes(result.get("image_a")),
                "image_b_b64": _b64encode_bytes(result.get("image_b")),
                "metadata": result.get("metadata"),
            }
        )
    except Exception as exc:
        return _offline_error(exc, "Offline unmask failed")


@app.route("/extract", methods=["POST"])
def offline_extract() -> Any:
    try:
        embedded_image, _ = _read_upload_bytes()
        password = request.form.get("password", "supersecret")
        layers = _form_int("layers", 2)
        dynamic = _form_bool("dynamic", True)
        adaptive = _form_bool("adaptive", True)
        compress = _form_bool("compress", True)
        result = extract_binary_data(
            embedded_image,
            password=password,
            layers=layers,
            dynamic=dynamic,
            compress=compress,
            adaptive=adaptive,
        )
        return jsonify(
            {
                "binary_blob_b64": _b64encode_bytes(result.get("binary_blob")),
                "extraction_metadata": result.get("extraction_metadata"),
            }
        )
    except Exception as exc:
        return _offline_error(exc, "Offline extraction failed")


@app.route("/unshuffle", methods=["POST"])
def offline_unshuffle() -> Any:
    try:
        image_b, _ = _read_upload_bytes()
        permutation_key = request.form.get("permutation_key")
        if not permutation_key:
            raise ValueError("Missing permutation key")
        polytope_type = request.form.get("polytope_type", "cube")
        backend = request.form.get("poly_backend", "latte")
        block_size_raw = request.form.get("block_size")
        block_size = int(block_size_raw) if block_size_raw else None
        result = reverse_geometric_scramble(
            image_b,
            permutation_key=permutation_key,
            polytope_type=polytope_type,
            backend=backend,
            block_size=block_size,
        )
        return jsonify(
            {
                "sequential_data_b64": _b64encode_bytes(result.get("sequential_data")),
                "metadata": result.get("metadata"),
            }
        )
    except Exception as exc:
        return _offline_error(exc, "Offline unshuffle failed")


@app.route("/decompress", methods=["POST"])
def offline_decompress() -> Any:
    try:
        binary_blob, _ = _read_upload_bytes()
        result = decompress_blob(binary_blob)
        return jsonify(
            {
                "decompressed_data_b64": _b64encode_bytes(result.get("decompressed_data")),
                "frame_content_size": result.get("frame_content_size"),
            }
        )
    except Exception as exc:
        return _offline_error(exc, "Offline decompression failed")


@app.route("/verify", methods=["POST"])
def offline_verify() -> Any:
    try:
        payload_bytes, _ = _read_upload_bytes()
        result = verify_and_restore(payload_bytes)
        return jsonify(result)
    except Exception as exc:
        return _offline_error(exc, "Offline verification failed")


@socketio.on('connect')
def handle_connect():
    print('Client connected')

@socketio.on('subscribe_job')
def handle_subscribe(data):
    job_id = data.get('jobId')
    join_room(job_id)

def emit_job_update(job_id, job_data):
    """Call this function from anywhere in your pipeline"""
    socketio.emit('job_update', job_data, room=job_id)

def _process_encapsulation(job_id: str) -> None:
    job = _get_job(job_id)
    if not job:
        return

    options = job.get("options", {})
    phase_delay = 0.15 if options.get("highSecurity") else 0.1

    _update_job(job_id, {"status": "processing", "phase": 1, "phaseId": PHASES[0]["id"]})

    try:
        for index, phase in enumerate(PHASES, start=1):
            _update_job(job_id, {"phase": index, "phaseId": phase["id"]})
            for progress in range(0, 101, 10):
                current_progress = job.get("progress", {}).copy()
                current_progress[phase["id"]] = progress
                _update_job(job_id, {"progress": current_progress})
                time.sleep(phase_delay)

        output_path = OUTPUT_DIR / f"{job_id}.png"
        carrier_path = Path(job["carrierPath"])
        output_path.write_bytes(carrier_path.read_bytes())

        if options.get("executeEngine"):
            _run_engine_pipeline(job, output_path)

        compression_ratio = 1.0
        if options.get("highSecurity"):
            compression_ratio = 8.5
        if options.get("passageMath"):
            compression_ratio += 1.5

        metrics = job.get("metrics", {}).copy()
        metrics["compressionRatio"] = compression_ratio
        metrics["compressedSize"] = int(metrics["originalSize"] / compression_ratio)
        metrics["estimatedCapacity"] = metrics["compressedSize"]

        OUTPUT_REGISTRY.append(
            {
                "jobId": job_id,
                "createdAt": job.get("createdAt"),
                "payloadSize": metrics.get("compressedSize", 0),
                "outputPath": str(output_path),
            }
        )

        _update_job(
            job_id,
            {
                "status": "completed",
                "metrics": metrics,
                "outputPath": str(output_path),
                "geometricKey": str(uuid.uuid4()),
            },
        )
    except Exception:
        app.logger.exception("Encapsulation pipeline failed for job %s", job_id)
        _update_job(job_id, {"status": "error", "error": "Processing failed"})


def _run_engine_pipeline(job: dict[str, Any], output_path: Path) -> None:
    payload_path = Path(job["targetPaths"][0])
    carrier_path = Path(job["carrierPath"])

    request_payload = {
        "steps": [phase["id"] for phase in PHASES],
        "payload": {
            "file_path": str(payload_path),
            "carrier_image_path": str(carrier_path),
        },
        "options": {
            "zstd_level": job.get("options", {}).get("zstdLevel", 22),
            "polytope_type": job.get("options", {}).get("polytopeType", "cube"),
            "poly_backend": job.get("options", {}).get("polyBackend", "latte"),
            "stego_layers": job.get("options", {}).get("stegoLayers", 2),
            "stego_dynamic": job.get("options", {}).get("stegoDynamic", True),
            "stego_adaptive": job.get("options", {}).get("stegoAdaptive", True),
            "kdf_iterations": job.get("options", {}).get("kdfIterations", 100_000),
            "seal_password": job.get("options", {}).get("passphrase"),
        },
    }

    response = run_pipeline(request_payload)
    sealed_b64 = response.get("artifacts", {}).get("sealed_image_b64")
    sealed_bytes = _safe_b64decode(sealed_b64)
    if sealed_bytes:
        output_path.write_bytes(sealed_bytes)


def _process_extraction(job_id: str) -> None:
    job = _get_job(job_id)
    if not job:
        return

    _update_job(job_id, {"status": "extracting"})

    try:
        for progress in range(0, 101, 20):
            _update_job(job_id, {"progress": progress})
            time.sleep(0.2)

        extracted_bytes = b"mock-payload"
        output_path = OUTPUT_DIR / f"{job_id}_payload.bin"
        output_path.write_bytes(extracted_bytes)
        extracted_files = [
            {
                "name": "payload.bin",
                "size": len(extracted_bytes),
            }
        ]
        output_files = [
            {
                "name": "payload.bin",
                "path": str(output_path),
                "size": len(extracted_bytes),
            }
        ]
        persistent_store.record_extracted_files(job_id, extracted_files)

        _update_job(
            job_id,
            {"status": "completed", "files": extracted_files, "outputFiles": output_files},
        )
    except Exception:
        app.logger.exception("Extraction pipeline failed for job %s", job_id)
        _update_job(job_id, {"status": "error", "error": "Processing failed"})


if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=5000, debug=True)
