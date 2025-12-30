# The Forge - Flask Backend Setup

Complete Flask-SocketIO backend for The Forge steganography application.

## Quick Start

1. **Install dependencies:**
```bash
pip install -r requirements.txt
```

2. **Run the server:**
```bash
python app.py
```

3. **Server runs on:**
   - HTTP: `http://0.0.0.0:5000`
   - WebSocket: `ws://0.0.0.0:5000`

## Integration Points

### Where to Add Your Snowflake Engine

Look for comments marked `# YOUR ENGINE HERE` in `app.py`:
exec(open("engine.py").read())

1. **Phase 1 (Triple-Smack):**
   - Line ~230: Neuroglyph binary wrapping
   - Line ~237: Zstandard compression

2. **Phase 2 (Geometric):**
   - Line ~260: PassageMath mapping
   - Line ~267: Fisher-Yates shuffle
   - Line ~274: StegoImageX embedding

3. **Phase 3 (Security):**
   - Line ~287: Reverse shuffle
   - Line ~294: Alpha masking
   - Line ~301: AES-256-GCM encryption

4. **Extraction:**
   - Line ~337: Each extraction step in the loop

### API Endpoints

- `GET /api/options` - Fetch available phases and global options
- `POST /api/uploads` - Upload a file for later use
- `POST /api/encapsulate` - Start encapsulation job
- `GET /api/jobs` - List recent jobs
- `GET /api/job/<job_id>` - Get job status (polling)
- `GET /api/download/<job_id>` - Download result
- `POST /api/extract` - Extract from package
- `GET /api/extract/status/<job_id>` - Extraction status
- `GET /api/geometric/key/<job_id>` - Get geometric key
- `POST /api/bridge/pipeline` - Run pipeline steps via the AI bridge
- `GET /api/health/ai` - AI provider health (Ollama)

### AI Bridge: `/api/bridge/pipeline`

**Request schema**

```json
{
  "steps": ["prepare", "convert", "compress", "map_and_scramble", "stego_embed", "seal"],
  "payload": {
    "raw_bytes_b64": "...",
    "file_path": "/path/to/file.bin",
    "carrier_image_b64": "...",
    "carrier_image_path": "/path/to/carrier.png"
  },
  "options": {
    "zstd_level": 22,
    "polytope_type": "cube",
    "poly_backend": "latte"
  }
}
```

**Notes**

- `steps` is optional (defaults to the full pipeline).
- `payload` and `options` must be JSON objects.
- For `prepare`, provide `raw_bytes_b64` or `file_path`.
- For `stego_embed`, provide `carrier_image_b64` or `carrier_image_path`.

### AI Health: `/api/health/ai`

Checks Ollama availability. Configure the Ollama base URL via:

```
export OLLAMA_URL=http://localhost:11434
```

### WebSocket Events

**Client → Server:**
- `subscribe_job` - Subscribe to job updates
  ```javascript
  socket.emit('subscribe_job', { jobId: 'uuid-here' })
  ```

**Server → Client:**
- `job_update` - Real-time progress updates
  ```javascript
  socket.on('job_update', (data) => {
    // data contains full job object with progress
  })
  ```

## Storage Layer

The backend now supports **two databases**:

1. **Redis (live job state)** — fast, ephemeral job state for Socket.IO updates.
2. **SQLite (persistent history)** — durable job history and audit metadata.

### Redis (Live Job State)

Set the environment variable before running the server:

```
ENV SNOWFLAKE_DB_PATH="/app/data/snowflake.db"  # for dockerfile
export REDIS_URL=redis://redis:6379/0
```

Redis keys used:

- `snowflake:job:<job_id>` → JSON serialized job object
- `snowflake:jobs:active` → Set of active job IDs
- `snowflake:jobs:archived` → Set of completed/errored job IDs

### SQLite (Persistent History)

Set (optional) database path:

```
export SNOWFLAKE_DB_PATH=./data/snowflake.db
```

Schema overview:

```
jobs (
  job_id TEXT PRIMARY KEY,
  job_type TEXT,
  status TEXT,
  created_at TEXT,
  updated_at TEXT,
  options_json TEXT,
  metrics_json TEXT,
  geometric_key TEXT,
  output_path TEXT,
  error TEXT
)

job_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT,
  event_type TEXT,
  payload_json TEXT,
  created_at TEXT
)

extraction_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT,
  filename TEXT,
  size INTEGER,
  created_at TEXT
)
```

## File Structure

```
uploads/          # Uploaded files (temporary)
output/           # Generated steganographic packages
app.py            # Main Flask server
requirements.txt  # Python dependencies
```

## Production Notes

- Run Redis for shared job state if using multiple workers
- Remove `allow_unsafe_werkzeug=True`
- Use proper secrets (change SECRET_KEY)
- Set up proper CORS origins
- Add rate limiting
- Use gunicorn: `gunicorn -k geventwebsocket.gunicorn.workers.GeventWebSocketWorker -w 1 app:app`

## Validation & Benchmarking

Run endpoint validation (health + core API flow):

```bash
python benchmarks/validate_endpoints.py --base-url http://localhost:5000
```

Run the benchmark suite (latency + completion metrics for presentation):

```bash
python benchmarks/benchmark_suite.py --base-url http://localhost:5000 --iterations 3 --output ./benchmarks/results.json
```

## Testing

```bash
# Health check
curl http://localhost:5000/

# Test encapsulation (with curl)
curl -X POST http://localhost:5000/api/encapsulate \
  -F "target_files=@file1.txt" \
  -F "carrier_image=@image.png" \
  -F 'options={"compressionMode":"lossless","passphrase":"test123"}'
```

## Frontend Connection

Update your frontend `.env`:
```
VITE_FORGE_BACKEND_URL=http://localhost:5000
```

The `snowflakeClient.js` will automatically connect to this URL.

---

**You're all set!** Just plug in your Snowflake engine code and you're ready to forge! 🔥
