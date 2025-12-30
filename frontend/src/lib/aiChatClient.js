const DEFAULT_OLLAMA_URL = import.meta.env.VITE_OLLAMA_URL || 'http://localhost:11434';
const DEFAULT_OLLAMA_MODEL = import.meta.env.VITE_OLLAMA_MODEL || 'llama3.2';
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_BACKOFF_MS = 400;

const toMessagePayload = (messages) =>
  messages
    .filter((message) => message?.role && message?.content)
    .map((message) => ({
      role: message.role,
      content: message.content
    }));

const parseResponseBody = async (response) => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isTransientStatus = (status) => [408, 429, 500, 502, 503, 504].includes(status);

const createAbortController = (timeoutMs, externalSignal) => {
  const controller = new AbortController();
  let timeoutId;
  if (timeoutMs) {
    timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  }
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort(externalSignal.reason);
    } else {
      externalSignal.addEventListener(
        'abort',
        () => controller.abort(externalSignal.reason),
        { once: true }
      );
    }
  }
  return {
    signal: controller.signal,
    cleanup: () => {
      if (timeoutId) clearTimeout(timeoutId);
    }
  };
};

const logProviderMetric = ({ provider, latencyMs, ok, attempts, error }) => {
  const payload = {
    provider,
    latencyMs,
    ok,
    attempts,
    error
  };
  if (ok) {
    console.info('[AI Telemetry]', payload);
  } else {
    console.warn('[AI Telemetry]', payload);
  }
};

const fetchWithRetry = async (url, options, { timeoutMs, maxRetries, backoffMs } = {}) => {
  let attempt = 0;
  const retries = typeof maxRetries === 'number' ? maxRetries : DEFAULT_MAX_RETRIES;
  const baseDelay = typeof backoffMs === 'number' ? backoffMs : DEFAULT_BACKOFF_MS;

  while (attempt <= retries) {
    const { signal, cleanup } = createAbortController(timeoutMs, options?.signal);
    try {
      const response = await fetch(url, { ...options, signal });
      cleanup();
      if (!response.ok && isTransientStatus(response.status) && attempt < retries) {
        attempt += 1;
        await sleep(baseDelay * 2 ** (attempt - 1));
        continue;
      }
      return { response, attempts: attempt + 1 };
    } catch (error) {
      cleanup();
      const isAbort = error?.name === 'AbortError';
      const isNetwork = error instanceof TypeError;
      if ((isAbort || isNetwork) && attempt < retries) {
        attempt += 1;
        await sleep(baseDelay * 2 ** (attempt - 1));
        continue;
      }
      throw { error, attempts: attempt + 1 };
    }
  }

  throw new Error('Retry attempts exhausted');
};

export async function sendOllamaChat({
  messages,
  model,
  baseUrl,
  signal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxRetries = DEFAULT_MAX_RETRIES,
  backoffMs = DEFAULT_BACKOFF_MS
} = {}) {
  const endpoint = `${baseUrl || DEFAULT_OLLAMA_URL}/api/chat`;
  const start = performance?.now ? performance.now() : Date.now();
  let response;
  let attempts = 1;
  try {
    const result = await fetchWithRetry(
      endpoint,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model || DEFAULT_OLLAMA_MODEL,
          messages: toMessagePayload(messages || []),
          stream: false
        }),
        signal
      },
      { timeoutMs, maxRetries, backoffMs }
    );
    response = result.response;
    attempts = result.attempts;
  } catch (wrapped) {
    const latencyMs = Math.round((performance?.now ? performance.now() : Date.now()) - start);
    logProviderMetric({
      provider: 'ollama',
      latencyMs,
      ok: false,
      attempts: wrapped?.attempts || attempts,
      error: wrapped?.error?.message || wrapped?.message || 'Network error'
    });
    throw wrapped?.error || wrapped;
  }

  const data = await parseResponseBody(response);
  if (!response.ok) {
    const errorMessage =
      (data && typeof data === 'object' && (data.error || data.message)) ||
      (typeof data === 'string' ? data : null) ||
      `Ollama request failed with status ${response.status}`;
    const latencyMs = Math.round((performance?.now ? performance.now() : Date.now()) - start);
    logProviderMetric({
      provider: 'ollama',
      latencyMs,
      ok: false,
      attempts,
      error: errorMessage
    });
    throw new Error(errorMessage);
  }

  if (data && typeof data === 'object' && data.message?.content) {
    const latencyMs = Math.round((performance?.now ? performance.now() : Date.now()) - start);
    logProviderMetric({
      provider: 'ollama',
      latencyMs,
      ok: true,
      attempts
    });
    return data.message.content;
  }
  const latencyMs = Math.round((performance?.now ? performance.now() : Date.now()) - start);
  logProviderMetric({
    provider: 'ollama',
    latencyMs,
    ok: true,
    attempts
  });

  return typeof data === 'string' ? data : '';
}

export function getOllamaConfig() {
  return {
    baseUrl: DEFAULT_OLLAMA_URL,
    model: DEFAULT_OLLAMA_MODEL,
    timeoutMs: DEFAULT_TIMEOUT_MS
  };
}
