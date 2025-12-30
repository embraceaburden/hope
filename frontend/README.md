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
VITE_FORGE_BACKEND_URL=http://localhost:5000
```

### AI provider configuration

The chat UI supports two providers:

* **base44** (preferred) when the `window.base44` client is injected and healthy.
* **Ollama** as a local fallback.

Configure Ollama with:

```
VITE_OLLAMA_URL=http://localhost:11434
VITE_OLLAMA_MODEL=llama3.2
```

When base44 is unavailable or unhealthy, the UI falls back to Ollama and shows a hint in the chat panel.

## Building the app

```bash
npm run build
```
