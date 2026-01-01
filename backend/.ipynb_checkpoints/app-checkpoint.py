"""Forge Flask API - The Real Engine.
Active Intelligence Enabled.
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
from gevent import monkey
monkey.patch_all() # Patches everything

import socket
import requests
from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
from flask_socketio import SocketIO, join_room
from werkzeug.exceptions import HTTPException, RequestEntityTooLarge
from werkzeug.utils import secure_filename

# --- ACTIVE INTELLIGENCE IMPORTS ---
from ai_bridge import BridgeValidationError, run_pipeline
from compression import hyper_compress
from decompress import decompress_blob
from extract import extract_binary_data
from job_updates import emit_job_update, set_emitter
from map_and_scramble import geometric_map_and_scramble, geometric_unscramble_image
from neuro_shatter import run_ingestion_convert, validate_and_clean, is_tabular_package
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

ENGINE_MODE = os.environ.get("SNOWFLAKE_ENGINE_MODE", "engine").lower()

PHASES = [
    {
        "id": "prepare",
        "label": "Preparation & Profiling",
        "description": "Ingest data, run YData profiling, and validate integrity.",
    },
    {
        "id": "convert",
        "label": "Neuroglyph / Shatter",
        "description": "Apply intelligent serialization based on data profile.",
    },
    {
        "id": "compress",
        "label": "Hyper-Compression",
        "description": "Zstandard Level 22 (Ultra).",
    },
    {
        "id": "map_and_scramble",
        "label": "PassageMath Geometry",
        "description": "Map payload into polyhedral geometry.",
    },
    {
        "id": "stego_embed",
        "label": "Stego Embed",
        "description": "Embed payload into carrier image.",
    },
    {
        "id": "seal",
        "label": "Cryptographic Seal",
        "description": "AES-256-GCM + KDF Hardening.",
    },
]

GLOBAL_OPTIONS = {
    "highSecurity": True,
    "passageMath": True,
    "neuroShatter": "force", # Default to ACTIVE
}

UPLOAD_REGISTRY: dict[str, dict[str, Any]] = {}
OUTPUT_REGISTRY: list[dict[str, Any]] = []

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SNOWFLAKE_SECRET", "forge-secret")
app.config["SOCKET_AUTH_TOKEN"] = os.environ.get("FORGE_SOCKET_TOKEN", app.config["SECRET_KEY"])
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024 * 1024

# 1. ALLOW ALL ORIGINS (Fixes your CORS issue permanently)
CORS(app, resources={r"/*": {"origins": "*"}})

socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode="gevent",  # Explicitly requesting High Performance mode
    ping_interval=25,
    ping_timeout=60,
)
set_emitter(lambda job_id, job_data: socketio.emit("job_update", job_data, room=job_id))

jobs: dict[str, dict[str, Any]] = {}
jobs_lock = threading.Lock()
redis_store = RedisJobStore(os.environ.get("REDIS_URL"))
persistent_store = SqliteJobStore(os.environ.get("SNOWFLAKE_DB_PATH", str(BASE_DIR / "data" / "snowflake.db")))

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
        if job: return job
    return persistent_store.get_job(job_id)

def _get_job(job_id: str) -> dict[str, Any] | None:
    with jobs_lock:
        job = jobs.get(job_id)
        if job: return job
    job = _get_job_from_store(job_id)
    if job:
        with jobs_lock: jobs[job_id] = job
    return job

def _update_job(job_id: str, updates: dict[str, Any]) -> None:
    with jobs_lock:
        job = jobs.get(job_id)
    if not job:
        job = _get_job_from_store(job_id)
    if not job: return
    
    previous_status = job.get("status")
    job.update(updates)
    job["updatedAt"] = _now()
    
    with jobs_lock: jobs[job_id] = job
    redis_store.save_job(job_id, job)
    persistent_store.upsert_job(job)

    status = updates.get("status")
    if status and status != previous_status:
        persistent_store.record_event(job_id, "status_change", {"from": previous_status, "to": status})
        if status in {"completed", "error"}:
            redis_store.archive_job(job_id)

    payload = dict(job)
    if job.get("geometricTelemetry"):
        payload["geometric_telemetry"] = job["geometricTelemetry"]
    emit_job_update(job_id, payload)

def _build_progress() -> dict[str, int]:
    return {phase["id"]: 0 for phase in PHASES}

def _resolve_uploaded_file(file_id: str | None) -> str | None:
    if not file_id: return None
    metadata = UPLOAD_REGISTRY.get(file_id)
    if not metadata: return None
    return metadata["path"]

def _b64encode_bytes(payload: bytes | None) -> str | None:
    if payload is None: return None
    return base64.b64encode(payload).decode("utf-8")

def _read_upload_bytes(field: str = "file") -> tuple[bytes, str]:
    file_storage = request.files.get(field)
    if not file_storage: raise ValueError(f"Missing file upload: {field}")
    return file_storage.read(), file_storage.filename or field

def _form_int(key: str, default: int) -> int:
    raw = request.form.get(key)
    return int(raw) if raw else default

def _form_bool(key: str, default: bool) -> bool:
    raw = request.form.get(key)
    return raw.lower() in {"1", "true", "yes", "on"} if raw is not None else default

def _resolve_job_id() -> str | None:
    if request.is_json:
        payload = request.get_json(silent=True) or {}
        if payload.get("jobId"): return payload.get("jobId")
    return request.form.get("jobId") or request.args.get("jobId")

def _emit_restoration_metrics(job_id: str | None, result: dict[str, Any]) -> None:
    if job_id and result.get("rs_healing_triggered"):
        emit_job_update(job_id, {"jobId": job_id, "restoration_metrics": result.get("restoration_metrics")})

def _build_verify_response(result: dict[str, Any]) -> Any:
    return jsonify({
        "verified_data": result.get("verified_data"),
        "restoration": result.get("restoration"),
        "healed_payload_b64": _b64encode_bytes(result.get("healed_payload")),
        "restoration_metrics": result.get("restoration_metrics"),
    })

# --- ROUTES ---

@app.route("/", methods=["GET"])
def health() -> Any:
    return jsonify({"status": "online", "service": "Forge Engine", "version": "2.0-Active", "timestamp": _now()})

@app.route("/api/options", methods=["GET"])
def get_options() -> Any:
    return jsonify({"phases": PHASES, "globalOptions": GLOBAL_OPTIONS})

@app.route("/api/uploads", methods=["POST"])
def upload_file() -> Any:
    file = request.files.get("file")
    if not file: return _error_response("Missing file", 400)
    try:
        metadata = _save_upload(file)
        return jsonify(metadata)
    except Exception:
        app.logger.exception("Upload failed")
        return _error_response("Upload failed", 500)

@app.route("/api/encapsulate", methods=["POST"])
def encapsulate() -> Any:
    try:
        if request.is_json:
            payload = request.get_json(silent=True) or {}
            options = payload.get("options", {})
            target_ids = payload.get("targetFileIds", [])
            carrier_id = payload.get("carrierFileId")
            target_paths = [p for fid in target_ids if (p := _resolve_uploaded_file(fid))]
            carrier_path = _resolve_uploaded_file(carrier_id)
        else:
            options = json.loads(request.form.get("options", "{}"))
            target_files = request.files.getlist("target_files")
            carrier_file = request.files.get("carrier_image")
            target_paths = [_save_upload(f)["path"] for f in target_files]
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
                "originalSize": sum(Path(p).stat().st_size for p in target_paths),
                "compressedSize": 0,
            },
            "targetPaths": target_paths,
            "carrierPath": carrier_path,
            "options": {**GLOBAL_OPTIONS, **options},
            "createdAt": _now(),
            "updatedAt": _now(),
        }

        with jobs_lock: jobs[job_id] = job
        redis_store.save_job(job_id, job)
        persistent_store.upsert_job(job)
        
        # Start the REAL pipeline thread
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
    if not job: return _error_response("Job not found", 404)
    return jsonify({k: v for k, v in job.items() if k not in ["targetPaths", "carrierPath"]})

@app.route("/api/jobs", methods=["GET"])
def list_jobs() -> Any:
    limit = int(request.args.get("limit", "100"))
    status = request.args.get("status")
    jobs_list = persistent_store.list_jobs(limit=limit, status=status)
    return jsonify({"jobs": [j for j in jobs_list if j.get("status") != "error"]})

@app.route("/api/download/<job_id>", methods=["GET"])
def download_result(job_id: str) -> Any:
    job = _get_job(job_id)
    if not job or job.get("status") != "completed": return _error_response("Job not ready", 400)
    output_path = job.get("outputPath")
    if not output_path or not Path(output_path).exists(): return _error_response("File missing", 404)
    return send_file(output_path, mimetype="image/png", as_attachment=True, download_name=f"forge_{job_id}.png")

# --- ENGINE LOGIC (THE CONDUCTOR) ---

def _run_engine_pipeline(job_id: str, job: dict[str, Any], output_path: Path) -> dict[str, Any]:
    options = job.get("options", {})
    payload_path = Path(job["targetPaths"][0])
    carrier_path = Path(job["carrierPath"])
    progress = job.get("progress", _build_progress())
    context: dict[str, Any] = {}

    def mark_progress(phase_id: str, percent: int = 100) -> None:
        progress[phase_id] = percent
        _update_job(job_id, {"progress": progress})

    # --- PHASE 1: PREPARE & PROFILE ---
    _update_job(job_id, {"phase": 1, "phaseId": "prepare"})
    payload_bytes = payload_path.read_bytes()
    package = validate_and_clean({"file": payload_bytes, "name": payload_path.name})
    context["package"] = package
    mark_progress("prepare")

    # --- PHASE 2: INTELLIGENT CONVERSION ---
    _update_job(job_id, {"phase": 2, "phaseId": "convert"})
    
    # Active Intelligence: Check if tabular and FORCE profile
    if is_tabular_package(package):
        print(f"[{job_id}] 🧠 Intelligent Ingestion: Tabular Data Detected.")
        # Override option to ensure YData runs
        options["neuroShatter"] = "force"
        options["neuro_shatter"] = "force"
    else:
        print(f"[{job_id}] 📷 Intelligent Ingestion: Binary/Image Data Detected.")

    # Run Ingestion
    conversion_result = run_ingestion_convert(package, options)
    context.update(conversion_result)
    
    # Log findings
    if "neuro_shatter_report" in conversion_result:
        report = conversion_result["neuro_shatter_report"]
        cols = len(report.get("variables", {}))
        print(f"[{job_id}] 📊 YData Profile Complete: {cols} variables analyzed.")
    
    mark_progress("convert")

    # --- PHASE 3: HYPER COMPRESSION ---
    _update_job(job_id, {"phase": 3, "phaseId": "compress"})
    # Only compress if NeuroShatter didn't already do the job
    if context.get("compressed_blob") is None:
        context.update(hyper_compress(context["patternized_blob"], level=options.get("zstdLevel", 22)))
    mark_progress("compress")

    # --- PHASE 4: PASSAGEMATH GEOMETRY ---
    _update_job(job_id, {"phase": 4, "phaseId": "map_and_scramble"})
    polytope_type = options.get("polytopeType", "cube")
    carrier_bytes = carrier_path.read_bytes()
    
    # "Try-Hard" Logic for PassageMath
    try:
        print(f"[{job_id}] 📐 Constructing {polytope_type} Polytope via PassageMath...")
        result = geometric_map_and_scramble(
            context["compressed_blob"],
            carrier_bytes,
            polytope_type=polytope_type,
            backend="passagemath" # FORCE IT
        )
    except Exception as e:
        print(f"[{job_id}] ⚠️ PassageMath Backend Unstable: {e}")
        print(f"[{job_id}] 🔄 Rerouting to Latte Backend.")
        result = geometric_map_and_scramble(
            context["compressed_blob"],
            carrier_bytes,
            polytope_type=polytope_type,
            backend="latte" # Fallback
        )

    context.update(result)
    _update_job(job_id, {
        "geometricTelemetry": {
            "fVector": result.get("f_vector"),
            "polytopeType": polytope_type,
        },
        "geometricKey": result.get("permutation_key"),
    })
    mark_progress("map_and_scramble")

    # --- PHASE 5: STEGO EMBED ---
    _update_job(job_id, {"phase": 5, "phaseId": "stego_embed"})
    context.update(embed_steganographic(
        context["compressed_blob"],
        context["scrambled_carrier"],
        password=options.get("passphrase") or "supersecret",
        layers=options.get("stegoLayers", 2),
        dynamic=True
    ))
    context["unscrambled_image"] = geometric_unscramble_image(
        context["embedded_image"],
        context["permutation_key"],
    )
    mark_progress("stego_embed")

    # --- PHASE 6: CRYPTOGRAPHIC SEAL ---
    _update_job(job_id, {"phase": 6, "phaseId": "seal"})
    context.update(cryptographic_seal(
        context["unscrambled_image"],
        password=options.get("passphrase"),
        kdf_iterations=100_000, # Luxury Setting: 100k
        user_data={"permutation_key": context.get("permutation_key")}
    ))
    mark_progress("seal")

    # Finalize
    sealed_image = context.get("sealed_image")
    output_path.write_bytes(sealed_image)
    
    metrics = job.get("metrics", {}).copy()
    metrics["originalSize"] = job["metrics"]["originalSize"]
    metrics["compressedSize"] = len(context.get("compressed_blob") or b"")
    metrics["compressionRatio"] = context.get("compression_ratio", 1.0)
    
    return {
        "output_path": output_path,
        "metrics": metrics,
        "geometric_key": context.get("permutation_key"),
        "payload_size": metrics["compressedSize"],
    }

def _process_encapsulation(job_id: str) -> None:
    job = _get_job(job_id)
    if not job: return

    _update_job(job_id, {"status": "processing", "phase": 1, "phaseId": PHASES[0]["id"]})
    output_path = OUTPUT_DIR / f"{job_id}.png"

    try:
        # ALWAYS RUN THE ENGINE. NO MOCKS.
        result = _run_engine_pipeline(job_id, job, output_path)

        OUTPUT_REGISTRY.append({
            "jobId": job_id,
            "createdAt": job.get("createdAt"),
            "payloadSize": result.get("payload_size", 0),
            "outputPath": str(result["output_path"]),
        })

        _update_job(job_id, {
            "status": "completed",
            "metrics": result["metrics"],
            "outputPath": str(result["output_path"]),
            "geometricKey": result.get("geometric_key"),
        })
    except Exception as exc:
        app.logger.exception(f"Engine Failure {job_id}")
        _update_job(job_id, {"status": "error", "error": str(exc)})

# --- HEALTH ---
@app.route("/api/health/ai", methods=["GET"])
def ai_health() -> Any:
    ollama_url = os.environ.get("OLLAMA_URL", "http://localhost:11434")
    ollama_health = {"status": "unknown", "url": ollama_url}
    try:
        # Give Ollama 10 seconds to wake up (User Preference)
        response = requests.get(f"{ollama_url}/api/version", timeout=10)
        if response.ok:
            ollama_health.update({"status": "healthy", "version": response.json().get("version")})
        else:
            ollama_health.update({"status": "unhealthy", "error": f"HTTP {response.status_code}"})
    except Exception as e:
        ollama_health.update({"status": "unhealthy", "error": str(e)})
    
    return jsonify({"status": "ok" if ollama_health["status"]=="healthy" else "degraded", "providers": {"ollama": ollama_health}})

if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=5000, debug=True)
