# Forge Backend (Flask + Socket.IO)

The backend provides the full Snowflake engine pipeline and orchestration APIs for the Forge command center. It exposes REST and Socket.IO endpoints for file uploads, encapsulation/extraction jobs, offline tooling, and engine health checks.

## Architecture Overview

**Core pipeline (hard-wired in `app.py`):**

1. **Preparation** (`preparation.validate_and_clean`)
2. **Neuroglyph Serialize** (`conversion.serialize_and_patternize`)
3. **Zstandard Compress** (`compression.hyper_compress`)
4. **Geometric Map + Scramble** (`map_and_scramble.geometric_map_and_scramble`)
5. **Stego Embed** (`stego_engine.embed_steganographic`)
6. **Cryptographic Seal** (`security.cryptographic_seal`)

The encapsulation workflow in `app.py` now runs the engine modules directly (no placeholder steps). The pipeline is driven in `_run_engine_pipeline`, with per-phase progress updates and full error propagation.

## Quick Start

1. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

2. **Create a `.env` file (optional)**
   ```bash
   cp .env.example .env
   ```

3. **Run the server**
   ```bash
   python app.py
   ```

4. **Access**
   - HTTP: `http://0.0.0.0:5000`
   - WebSocket: `ws://0.0.0.0:5000`

## Configuration

Configuration is controlled via environment variables (see `.env.example`).

| Variable | Purpose | Default |
| --- | --- | --- |
| `SNOWFLAKE_SECRET` | Flask secret key | `forge-secret` |
| `FORGE_SOCKET_TOKEN` | Socket.IO auth token | `forge-secret` |
| `SOCKETIO_PING_INTERVAL` | Socket.IO ping interval (seconds) | `25` |
| `SOCKETIO_PING_TIMEOUT` | Socket.IO ping timeout (seconds) | `60` |
| `SNOWFLAKE_DB_PATH` | SQLite database path | `./data/snowflake.db` |
| `REDIS_URL` | Redis connection string | _disabled if unset_ |
| `OLLAMA_URL` | Ollama base URL for `/api/health/ai` | `http://localhost:11434` |
| `SNOWFLAKE_ENGINE_MODE` | `engine` (real pipeline) or `mock` (simulated) | `engine` |

**Engine mode behavior**
- `engine` executes the full Snowflake pipeline (default).
- `mock` simulates phases and returns the carrier image unchanged.

`executeEngine` and `engineMode` are also accepted in `/api/encapsulate` options for per-job overrides.

## API Endpoints

### Core
- `GET /api/options` — available phases and global options
- `POST /api/uploads` — upload a file for later reference
- `POST /api/encapsulate` — start encapsulation job
- `GET /api/jobs` — list recent jobs
- `GET /api/job/<job_id>` — job status
- `GET /api/download/<job_id>` — download finished output
- `POST /api/extract` — start extraction job
- `GET /api/extract/status/<job_id>` — extraction status
- `GET /api/geometric/key/<job_id>` — retrieve permutation key

### Engine bridge and health
- `POST /api/bridge/pipeline` — run arbitrary engine steps via JSON
- `GET /api/health/ai` — Ollama health probe

### Offline tooling (multipart/form-data)
- `POST /prepare`
- `POST /compress`
- `POST /map`
- `POST /embed`
- `POST /seal`
- `POST /unlock`
- `POST /unmask`
- `POST /extract`
- `POST /unshuffle`
- `POST /decompress`
- `POST /verify`

## Running in Production

- Use a production WSGI server (gunicorn + gevent worker):
  ```bash
  gunicorn -k geventwebsocket.gunicorn.workers.GeventWebSocketWorker -w 1 app:app
  ```
- Set strong secrets for `SNOWFLAKE_SECRET` and `FORGE_SOCKET_TOKEN`.
- Configure CORS origins in `app.py` before deployment.
- Set up Redis if you run multiple workers or multiple app instances.

## Maintenance Guide

**Daily/weekly:**
- Monitor `/api/health/ai` and job error rates in logs.
- Rotate logs (or ship to a centralized log system).

**Monthly:**
- Vacuum/backup `SNOWFLAKE_DB_PATH` (SQLite) or migrate to a managed DB if needed.
- Validate Redis persistence and memory settings if using `REDIS_URL`.

**When upgrading engine dependencies:**
- Run `benchmarks/validate_endpoints.py` and `benchmarks/benchmark_suite.py`.
- Validate a full encapsulation/extraction flow before releasing.

## Local Validation

```bash
# Health check
curl http://localhost:5000/

# Encapsulation (multipart)
curl -X POST http://localhost:5000/api/encapsulate \
  -F "target_files=@file1.txt" \
  -F "carrier_image=@image.png" \
  -F 'options={"compressionMode":"lossless","passphrase":"test123"}'
```

## Dependencies (Engine Pipeline)

The full engine pipeline requires:
- `Pillow` (image processing)
- `zstandard` (compression)
- `pycryptodome` (AES-GCM sealing/unsealing)
- `stegoimagex` (steganographic embedding)
- `passagemath_polyhedra` (geometric mapping)
- `neuroglyph_quantum` or `neuroglyph_neural` (serialize/patternize)

Install all backend dependencies with:
```bash
pip install -r requirements.txt
```

## WebSocket Usage

```javascript
const socket = io("http://localhost:5000", {
  auth: { token: "your-shared-socket-token" }
});

socket.emit("subscribe_job", { jobId: "uuid-here" });

socket.on("job_update", (data) => {
  console.log("job_update", data);
});
```

## File Layout

```
backend/
  app.py
  requirements.txt
  .env.example
  uploads/
  output/
  data/
```
