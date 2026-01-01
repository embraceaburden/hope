import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { 
  Server, CheckCircle2, Copy, Terminal, 
  FileCode, Package, PlayCircle, AlertCircle,
  Download, Code2, Zap
} from 'lucide-react';
import { toast } from 'sonner';

export default function BackendSetup() {
  const [activeTab, setActiveTab] = useState('quickstart');

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard!');
  };

  const pythonApiClient = `"""Python API client for the Forge backend."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any
from contextlib import ExitStack

import json
import requests


@dataclass
class ForgeApiClient:
    base_url: str = "http://127.0.0.1:5000"

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
        return response.json()`;

  const flaskBackendExample = `from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from forge_api_client import ForgeApiClient
import uuid
from pathlib import Path

app = Flask(__name__)
CORS(app)

# Job storage (use Redis/DB in production)
jobs = {}

@app.route('/')
def health():
    return jsonify({
        "status": "ok",
        "service": "Forge Backend",
        "version": "1.0.0"
    })

@app.route('/api/uploads', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({"error": "No file provided"}), 400
    
    file = request.files['file']
    file_id = str(uuid.uuid4())
    upload_path = Path(f"uploads/{file_id}_{file.filename}")
    upload_path.parent.mkdir(exist_ok=True)
    file.save(upload_path)
    
    return jsonify({
        "file_id": file_id,
        "filename": file.filename,
        "path": str(upload_path)
    })

@app.route('/api/encapsulate', methods=['POST'])
def encapsulate():
    target_files = request.files.getlist('target_files')
    carrier_image = request.files['carrier_image']
    options = json.loads(request.form.get('options', '{}'))
    
    job_id = str(uuid.uuid4())
    
    # Save files temporarily
    temp_dir = Path(f"temp/{job_id}")
    temp_dir.mkdir(parents=True, exist_ok=True)
    
    target_paths = []
    for f in target_files:
        path = temp_dir / f.filename
        f.save(path)
        target_paths.append(path)
    
    carrier_path = temp_dir / carrier_image.filename
    carrier_image.save(carrier_path)
    
    # Initialize job
    jobs[job_id] = {
        "job_id": job_id,
        "status": "queued",
        "progress": 0,
        "job_type": "embed"
    }
    
    # Start async processing (use Celery/RQ in production)
    # For now, return job ID immediately
    
    return jsonify({
        "job_id": job_id,
        "status": "queued"
    })

@app.route('/api/job/<job_id>')
def get_job(job_id):
    if job_id not in jobs:
        return jsonify({"error": "Job not found"}), 404
    return jsonify(jobs[job_id])

@app.route('/api/download/<job_id>')
def download_package(job_id):
    if job_id not in jobs:
        return jsonify({"error": "Job not found"}), 404
    
    job = jobs[job_id]
    if job['status'] != 'completed':
        return jsonify({"error": "Job not completed"}), 400
    
    package_path = Path(f"output/{job_id}_package.png")
    return send_file(package_path, mimetype='image/png')

@app.route('/api/extract', methods=['POST'])
def extract():
    package = request.files['package']
    passphrase = request.form.get('passphrase')
    
    job_id = str(uuid.uuid4())
    
    # Save package
    temp_path = Path(f"temp/{job_id}/{package.filename}")
    temp_path.parent.mkdir(parents=True, exist_ok=True)
    package.save(temp_path)
    
    jobs[job_id] = {
        "job_id": job_id,
        "status": "queued",
        "progress": 0,
        "job_type": "extract"
    }
    
    return jsonify({
        "job_id": job_id,
        "status": "queued"
    })

if __name__ == '__main__':
    app.run(debug=True, port=5000)`;

  const websocketExample = `from flask_socketio import SocketIO, emit

socketio = SocketIO(app, cors_allowed_origins="*")

@socketio.on('connect')
def handle_connect():
    print('Client connected')

@socketio.on('subscribe_job')
def handle_subscribe(data):
    job_id = data.get('jobId')
    # Join room for this job
    join_room(job_id)

def emit_job_update(job_id, job_data):
    """Emit real-time job updates"""
    socketio.emit('job_update', job_data, room=job_id)

# In your pipeline processing:
def process_job(job_id):
    for stage in pipeline_stages:
        jobs[job_id]['status'] = stage
        jobs[job_id]['progress'] += 10
        emit_job_update(job_id, jobs[job_id])
        # ... process stage ...`;

  return (
    <div
      className="min-h-screen"
      style={{ background: 'linear-gradient(135deg, var(--color-satin) 25%, var(--color-muted) 50%, var(--color-satin) 100%)' }}
    >
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold flex items-center gap-3" style={{ color: 'var(--color-pine-teal)' }}>
            <Server className="h-10 w-10" style={{ color: 'var(--color-gold)' }} />
            Backend Integration Guide
          </h1>
          <p className="text-lg mt-2" style={{ color: '#6b7280' }}>
            Connect your Python backend to The Forge Enterprise dashboard
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList
            className="mb-6"
            style={{ background: 'rgba(236, 235, 234, 0.7)', border: '1px solid rgba(188, 128, 77, 0.2)' }}
          >
            <TabsTrigger value="quickstart">Quick Start</TabsTrigger>
            <TabsTrigger value="api-client">API Client</TabsTrigger>
            <TabsTrigger value="flask-backend">Flask Backend</TabsTrigger>
            <TabsTrigger value="websocket">WebSocket</TabsTrigger>
            <TabsTrigger value="endpoints">API Endpoints</TabsTrigger>
          </TabsList>

          {/* Quick Start */}
          <TabsContent value="quickstart" className="space-y-6">
            <Card style={{ background: 'rgba(255, 255, 255, 0.9)', border: '1px solid rgba(188, 128, 77, 0.2)' }}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2" style={{ color: 'var(--color-pine-teal)' }}>
                  <PlayCircle className="h-5 w-5" style={{ color: 'var(--color-gold)' }} />
                  3-Step Setup
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex gap-4">
                    <div
                      className="flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center text-white font-bold"
                      style={{ background: 'linear-gradient(135deg, var(--color-gold) 0%, var(--color-copper) 100%)' }}
                    >
                      1
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold mb-2" style={{ color: 'var(--color-pine-teal)' }}>Install Dependencies</h3>
                      <div className="relative">
                        <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm">
pip install flask flask-cors flask-socketio requests
                        </pre>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="absolute top-2 right-2"
                          onClick={() => copyToClipboard('pip install flask flask-cors flask-socketio requests')}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div
                      className="flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center text-white font-bold"
                      style={{ background: 'linear-gradient(135deg, var(--color-gold) 0%, var(--color-copper) 100%)' }}
                    >
                      2
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold mb-2" style={{ color: 'var(--color-pine-teal)' }}>Download API Client</h3>
                      <p className="text-sm mb-3" style={{ color: '#6b7280' }}>
                        Save the API client code from the "API Client" tab as <code className="bg-gray-100 px-2 py-1 rounded">forge_api_client.py</code>
                      </p>
                        <Button
                          variant="outline"
                          onClick={() => setActiveTab('api-client')}
                          style={{ borderColor: 'var(--color-gold)', color: 'var(--color-pine-teal)' }}
                        >
                        <Download className="h-4 w-4 mr-2" />
                        View API Client Code
                      </Button>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div
                      className="flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center text-white font-bold"
                      style={{ background: 'linear-gradient(135deg, var(--color-gold) 0%, var(--color-copper) 100%)' }}
                    >
                      3
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold mb-2" style={{ color: 'var(--color-pine-teal)' }}>Start Backend Server</h3>
                      <div className="relative">
                        <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm">
python app.py
# Server starts on http://127.0.0.1:5000
                        </pre>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="absolute top-2 right-2"
                          onClick={() => copyToClipboard('python app.py')}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-lg" style={{ background: '#f0fdf4', border: '1px solid #86efac' }}>
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-green-900 mb-1">Ready to Go!</h4>
                      <p className="text-sm text-green-800">
                        Your dashboard will automatically connect to <code>http://127.0.0.1:5000</code>. 
                        Test the connection using the health check endpoint.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Architecture Overview */}
            <Card style={{ background: 'rgba(255, 255, 255, 0.9)', border: '1px solid rgba(188, 128, 77, 0.2)' }}>
              <CardHeader>
                <CardTitle style={{ color: 'var(--color-pine-teal)' }}>System Architecture</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 rounded-lg text-center" style={{ background: 'var(--color-satin)', border: '1px solid rgba(188, 128, 77, 0.3)' }}>
                      <Code2 className="h-8 w-8 mx-auto mb-2" style={{ color: 'var(--color-gold)' }} />
                      <h4 className="font-semibold mb-1" style={{ color: 'var(--color-pine-teal)' }}>Frontend</h4>
                      <p className="text-xs" style={{ color: '#6b7280' }}>React + Base44</p>
                    </div>
                    <div className="p-4 rounded-lg text-center" style={{ background: 'var(--color-satin)', border: '1px solid rgba(188, 128, 77, 0.3)' }}>
                      <Server className="h-8 w-8 mx-auto mb-2" style={{ color: 'var(--color-gold)' }} />
                      <h4 className="font-semibold mb-1" style={{ color: 'var(--color-pine-teal)' }}>Backend</h4>
                      <p className="text-xs" style={{ color: '#6b7280' }}>Flask + Python</p>
                    </div>
                    <div className="p-4 rounded-lg text-center" style={{ background: 'var(--color-satin)', border: '1px solid rgba(188, 128, 77, 0.3)' }}>
                      <Zap className="h-8 w-8 mx-auto mb-2" style={{ color: 'var(--color-gold)' }} />
                      <h4 className="font-semibold mb-1" style={{ color: 'var(--color-pine-teal)' }}>Pipeline</h4>
                      <p className="text-xs" style={{ color: '#6b7280' }}>Steganography Engine</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* API Client Tab */}
          <TabsContent value="api-client">
            <Card style={{ background: 'rgba(255, 255, 255, 0.9)', border: '1px solid rgba(188, 128, 77, 0.2)' }}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2" style={{ color: 'var(--color-pine-teal)' }}>
                    <FileCode className="h-5 w-5" style={{ color: 'var(--color-gold)' }} />
                    forge_api_client.py
                  </CardTitle>
                  <Button
                    onClick={() => copyToClipboard(pythonApiClient)}
                    style={{ background: 'linear-gradient(135deg, var(--color-gold) 0%, var(--color-copper) 100%)' }}
                    className="text-white"
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy Code
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <pre className="bg-gray-900 text-gray-100 p-6 rounded-lg overflow-x-auto text-sm max-h-[600px]">
                  {pythonApiClient}
                </pre>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Flask Backend Tab */}
          <TabsContent value="flask-backend">
            <Card style={{ background: 'rgba(255, 255, 255, 0.9)', border: '1px solid rgba(188, 128, 77, 0.2)' }}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2" style={{ color: 'var(--color-pine-teal)' }}>
                    <Terminal className="h-5 w-5" style={{ color: 'var(--color-gold)' }} />
                    app.py - Flask Backend Template
                  </CardTitle>
                  <Button
                    onClick={() => copyToClipboard(flaskBackendExample)}
                    style={{ background: 'linear-gradient(135deg, var(--color-gold) 0%, var(--color-copper) 100%)' }}
                    className="text-white"
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy Code
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <pre className="bg-gray-900 text-gray-100 p-6 rounded-lg overflow-x-auto text-sm max-h-[600px]">
                  {flaskBackendExample}
                </pre>

                <div className="mt-6 p-4 rounded-lg" style={{ background: '#fef3c7', border: '1px solid #fbbf24' }}>
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-yellow-700 mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-yellow-900 mb-1">Production Notes</h4>
                      <ul className="text-sm text-yellow-800 space-y-1">
                        <li>• Use Celery or RQ for async job processing</li>
                        <li>• Replace in-memory job storage with Redis/PostgreSQL</li>
                        <li>• Add authentication and rate limiting</li>
                        <li>• Use proper error handling and logging</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* WebSocket Tab */}
          <TabsContent value="websocket">
            <Card style={{ background: 'rgba(255, 255, 255, 0.9)', border: '1px solid rgba(188, 128, 77, 0.2)' }}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2" style={{ color: 'var(--color-pine-teal)' }}>
                    <Zap className="h-5 w-5" style={{ color: 'var(--color-gold)' }} />
                    Real-Time Updates with WebSocket
                  </CardTitle>
                  <Button
                    onClick={() => copyToClipboard(websocketExample)}
                    style={{ background: 'linear-gradient(135deg, var(--color-gold) 0%, var(--color-copper) 100%)' }}
                    className="text-white"
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy Code
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <pre className="bg-gray-900 text-gray-100 p-6 rounded-lg overflow-x-auto text-sm">
                  {websocketExample}
                </pre>

                <div>
                  <h4 className="font-semibold mb-3" style={{ color: 'var(--color-pine-teal)' }}>Integration Steps</h4>
                  <ol className="space-y-2 text-sm" style={{ color: '#6b7280' }}>
                    <li className="flex gap-2">
                      <span className="font-semibold">1.</span>
                      <span>Install Flask-SocketIO: <code className="bg-gray-100 px-2 py-1 rounded">pip install flask-socketio</code></span>
                    </li>
                    <li className="flex gap-2">
                      <span className="font-semibold">2.</span>
                      <span>Add SocketIO initialization to your Flask app</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="font-semibold">3.</span>
                      <span>Emit updates during pipeline processing</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="font-semibold">4.</span>
                      <span>Dashboard automatically subscribes and displays updates</span>
                    </li>
                  </ol>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* API Endpoints Tab */}
          <TabsContent value="endpoints">
            <div className="space-y-4">
              {[
                {
                  method: 'GET',
                  path: '/',
                  desc: 'Health check endpoint',
                  response: '{ "status": "ok", "service": "Forge Backend" }'
                },
                {
                  method: 'POST',
                  path: '/api/uploads',
                  desc: 'Upload a file',
                  body: 'FormData: file',
                  response: '{ "file_id": "...", "filename": "...", "path": "..." }'
                },
                {
                  method: 'POST',
                  path: '/api/encapsulate',
                  desc: 'Start encapsulation job',
                  body: 'FormData: target_files[], carrier_image, options',
                  response: '{ "job_id": "...", "status": "queued" }'
                },
                {
                  method: 'GET',
                  path: '/api/job/:job_id',
                  desc: 'Get job status',
                  response: '{ "job_id": "...", "status": "...", "progress": 0-100 }'
                },
                {
                  method: 'GET',
                  path: '/api/download/:job_id',
                  desc: 'Download completed package',
                  response: 'Binary file (image/png)'
                },
                {
                  method: 'POST',
                  path: '/api/extract',
                  desc: 'Extract data from package',
                  body: 'FormData: package, passphrase',
                  response: '{ "job_id": "...", "status": "queued" }'
                },
                {
                  method: 'GET',
                  path: '/api/extract/status/:job_id',
                  desc: 'Get extraction status',
                  response: '{ "job_id": "...", "status": "...", "extracted_files": [...] }'
                },
                {
                  method: 'GET',
                  path: '/api/geometric/key/:job_id',
                  desc: 'Get geometric key',
                  response: '{ "job_id": "...", "permutation_key": "...", "polytope_type": "..." }'
                }
              ].map((endpoint, idx) => (
                <Card key={idx} style={{ background: 'rgba(255, 255, 255, 0.9)', border: '1px solid rgba(188, 128, 77, 0.2)' }}>
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      <Badge 
                        className={endpoint.method === 'GET' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}
                      >
                        {endpoint.method}
                      </Badge>
                      <div className="flex-1">
                        <code className="text-sm font-mono" style={{ color: 'var(--color-pine-teal)' }}>{endpoint.path}</code>
                        <p className="text-sm mt-2" style={{ color: '#6b7280' }}>{endpoint.desc}</p>
                        {endpoint.body && (
                          <div className="mt-2">
                            <span className="text-xs font-semibold" style={{ color: '#6b7280' }}>Body:</span>
                            <code className="text-xs ml-2 bg-gray-100 px-2 py-1 rounded">{endpoint.body}</code>
                          </div>
                        )}
                        {endpoint.response && (
                          <div className="mt-2">
                            <span className="text-xs font-semibold" style={{ color: '#6b7280' }}>Response:</span>
                            <pre className="text-xs mt-1 bg-gray-100 p-2 rounded overflow-x-auto">{endpoint.response}</pre>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
