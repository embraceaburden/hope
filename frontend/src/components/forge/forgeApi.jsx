const BASE_URL = import.meta.env.VITE_FORGE_BACKEND_URL || 'http://127.0.0.1:5000';

const parseResponseBody = async (response) => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const handleJsonResponse = async (response, fallbackMessage) => {
  const data = await parseResponseBody(response);
  if (!response.ok) {
    const errorMessage =
      (data && typeof data === 'object' && (data.message || data.error)) ||
      (typeof data === 'string' ? data : null) ||
      fallbackMessage;
    throw new Error(errorMessage);
  }
  return data;
};

const buildEncapsulationFormData = (targetFiles, carrierImage, options = {}) => {
  const formData = new FormData();

  targetFiles.forEach((file) => {
    formData.append('target_files', file);
  });
  formData.append('carrier_image', carrierImage);
  formData.append(
    'options',
    JSON.stringify({
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
    })
  );

  return formData;
};

const encapsulateWithBaseUrl = async (baseUrl, targetFiles, carrierImage, options = {}) => {
  const formData = buildEncapsulationFormData(targetFiles, carrierImage, options);
  const response = await fetch(`${baseUrl}/api/encapsulate`, {
    method: 'POST',
    body: formData
  });

  return handleJsonResponse(response, `Encapsulation failed: ${response.statusText}`);
};

const validatePipelineRequest = (request) => {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    throw new Error('Pipeline request must be an object.');
  }
  if (request.steps !== undefined) {
    if (!Array.isArray(request.steps) || request.steps.some((step) => typeof step !== 'string')) {
      throw new Error('Pipeline steps must be an array of strings.');
    }
  }
  if (request.payload !== undefined && (typeof request.payload !== 'object' || request.payload === null)) {
    throw new Error('Pipeline payload must be an object.');
  }
  if (request.options !== undefined && (typeof request.options !== 'object' || request.options === null)) {
    throw new Error('Pipeline options must be an object.');
  }
};

export const forgeApi = {
  /**
   * Health check endpoint
   */
  async health() {
    const response = await fetch(`${BASE_URL}/`);
    return handleJsonResponse(response, 'Backend health check failed');
  },

  /**
   * AI provider health check
   */
  async aiHealth() {
    const response = await fetch(`${BASE_URL}/api/health/ai`);
    return handleJsonResponse(response, 'AI health check failed');
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

    return handleJsonResponse(response, `Upload failed: ${response.statusText}`);
  },

  /**
   * Start encapsulation pipeline
   */
  async encapsulate(targetFiles, carrierImage, options = {}) {
    return encapsulateWithBaseUrl(BASE_URL, targetFiles, carrierImage, options);
  },

  /**
   * Start encapsulation pipeline against a specific backend URL
   */
  async encapsulateWithBaseUrl(baseUrl, targetFiles, carrierImage, options = {}) {
    return encapsulateWithBaseUrl(baseUrl, targetFiles, carrierImage, options);
  },

  /**
   * Get job status and progress
   */
  async getJobStatus(jobId) {
    const response = await fetch(`${BASE_URL}/api/job/${jobId}`);
    
    return handleJsonResponse(response, `Failed to get job status: ${response.statusText}`);
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

    return handleJsonResponse(response, `Extraction failed: ${response.statusText}`);
  },

  /**
   * Get extraction job status
   */
  async getExtractionStatus(jobId) {
    const response = await fetch(`${BASE_URL}/api/extract/status/${jobId}`);
    
    return handleJsonResponse(response, `Failed to get extraction status: ${response.statusText}`);
  },

  /**
   * Get geometric key for a job
   */
  async getGeometricKey(jobId) {
    const response = await fetch(`${BASE_URL}/api/geometric/key/${jobId}`);
    
    return handleJsonResponse(response, `Failed to get geometric key: ${response.statusText}`);
  },

  /**
   * Run custom pipeline steps via AI bridge
   */
  async runPipeline(request) {
    validatePipelineRequest(request);
    const response = await fetch(`${BASE_URL}/api/bridge/pipeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    });

    return handleJsonResponse(response, `Pipeline failed: ${response.statusText}`);
  }
};
