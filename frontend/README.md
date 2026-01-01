# The Forge


It's a Vite+React app that communicates with the node API.

## Running the app

```bash
npm install
npm run dev
```

## Environment variables

Create a `.env` file to point the UI at the Forge backend:

```
VITE_FORGE_BACKEND_URL=http://127.0.0.1:5000
VITE_FORGE_SOCKET_TOKEN=your-shared-socket-token
```

The Socket.IO client uses `VITE_FORGE_SOCKET_TOKEN` (or `localStorage` key
`forgeSocketToken`) to authenticate the WebSocket connection.

### AI provider configuration

The chat UI supports two providers:

* **base44** (preferred) when the `window.base44` client is injected and healthy.
* **Ollama** as a local fallback.

Configure Ollama with:

```
VITE_OLLAMA_URL=http://localhost:11434
VITE_OLLAMA_MODEL=granite3.3:2b
```

When base44 is unavailable or unhealthy, the UI falls back to Ollama and shows a hint in the chat panel.

## Offline Mode Operation

The dashboard automatically switches to offline mode when the backend is unreachable. Jobs created while
offline are queued locally in IndexedDB and synced to `/api/encapsulate` once connectivity is restored.

**Requirements**

- A local Forge backend with the offline endpoints enabled (`/prepare`, `/compress`, `/map`, etc.).
- Optional: an Ollama instance for local AI fallback.

To check that Ollama has the configured model pulled, ensure:

```
VITE_OLLAMA_URL=http://localhost:11434
VITE_OLLAMA_MODEL=granite3.3:2b
```

The client will query `/api/tags` on the Ollama host to verify the model is available.

## Building the app

```bash
npm run build
```
