const DEFAULT_OLLAMA_URL = import.meta.env.VITE_OLLAMA_URL || 'http://localhost:11434';
const DEFAULT_OLLAMA_MODEL = import.meta.env.VITE_OLLAMA_MODEL || 'llama3.2';

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

export async function sendOllamaChat({ messages, model, baseUrl, signal } = {}) {
  const endpoint = `${baseUrl || DEFAULT_OLLAMA_URL}/api/chat`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model || DEFAULT_OLLAMA_MODEL,
      messages: toMessagePayload(messages || []),
      stream: false
    }),
    signal
  });

  const data = await parseResponseBody(response);
  if (!response.ok) {
    const errorMessage =
      (data && typeof data === 'object' && (data.error || data.message)) ||
      (typeof data === 'string' ? data : null) ||
      `Ollama request failed with status ${response.status}`;
    throw new Error(errorMessage);
  }

  if (data && typeof data === 'object' && data.message?.content) {
    return data.message.content;
  }

  return typeof data === 'string' ? data : '';
}

export function getOllamaConfig() {
  return {
    baseUrl: DEFAULT_OLLAMA_URL,
    model: DEFAULT_OLLAMA_MODEL
  };
}
