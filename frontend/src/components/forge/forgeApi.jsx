const BASE_URL = import.meta.env.VITE_FORGE_BACKEND_URL || 'http://localhost:5000';

export const forgeApi = {
  /**
   * Health check endpoint
   */
  async health() {
    const response = await fetch(`${BASE_URL}/`);
    if (!response.ok) throw new Error('Backend health check failed');
    return response.json();
  },

  /**
   * Upload a single file to backend storage
   */
  async uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${BASE_URL}/api/uploads`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Start encapsulation pipeline
   */
  async encapsulate(targetFiles, carrierImage, options = {}) {
    const formData = new FormData();
    
    targetFiles.forEach(file => {
      formData.append('target_files', file);
    });
    formData.append('carrier_image', carrierImage);
    formData.append('options', JSON.stringify({
      compression_mode: options.compression_mode || 'high-ratio',
      noise_level: options.noise_level || 30,
      encryption: options.encryption || 'aes-256-gcm',
      hashing: options.hashing || 'sha-256',
      passphrase: options.passphrase,
      key_iterations: options.key_iterations || 100000,
      polytope_type: options.polytope_type || 'cube',
      zstd_level: options.zstd_level || 22,
      stego_layers: options.stego_layers || 2,
      stego_dynamic: options.stego_dynamic !== false,
      stego_adaptive: options.stego_adaptive !== false,
      poly_backend: options.poly_backend || 'latte'
    }));

    const response = await fetch(`${BASE_URL}/api/encapsulate`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `Encapsulation failed: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Get job status and progress
   */
  async getJobStatus(jobId) {
    const response = await fetch(`${BASE_URL}/api/job/${jobId}`);
    
    if (!response.ok) {
      throw new Error(`Failed to get job status: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Download completed package
   */
  async downloadPackage(jobId) {
    const response = await fetch(`${BASE_URL}/api/download/${jobId}`);
    
    if (!response.ok) {
      throw new Error(`Failed to download package: ${response.statusText}`);
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `forge_package_${jobId}.png`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },

  /**
   * Extract data from package
   */
  async extract(packageFile, passphrase) {
    const formData = new FormData();
    formData.append('package', packageFile);
    formData.append('passphrase', passphrase);

    const response = await fetch(`${BASE_URL}/api/extract`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `Extraction failed: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Get extraction job status
   */
  async getExtractionStatus(jobId) {
    const response = await fetch(`${BASE_URL}/api/extract/status/${jobId}`);
    
    if (!response.ok) {
      throw new Error(`Failed to get extraction status: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Get geometric key for a job
   */
  async getGeometricKey(jobId) {
    const response = await fetch(`${BASE_URL}/api/geometric/key/${jobId}`);
    
    if (!response.ok) {
      throw new Error(`Failed to get geometric key: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Run custom pipeline steps via AI bridge
   */
  async runPipeline(request) {
    const response = await fetch(`${BASE_URL}/api/bridge/pipeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `Pipeline failed: ${response.statusText}`);
    }

    return response.json();
  }
};
