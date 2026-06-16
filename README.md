# local-notes-mcp

Minimal Node MCP server (stdio).

## Setup

```bash
npm install
npm run build
```

## Run

```bash
npm start
```

## Dev (Inspector)

Starts the MCP Inspector UI and your server:

```bash
npm run dev
```

The inspector opens in your browser and connects automatically. After editing `src/`, click **Disconnect** then **Connect** to reload (each connect starts a fresh process).

If Connect stops working, stale processes are usually the cause — run `npm run dev:stop`, then `npm run dev` again. The dev script uses a fixed proxy token (`local-dev`); set **Configuration → Proxy Session Token** to `local-dev` if an old browser tab still has a token from a previous run.

Headless hot-reload server for Cursor (no Inspector UI):

```bash
npm run dev:server
```

> **Note:** MCP uses stdio for JSON-RPC — stdout must not contain log noise. Do not launch the server via `npm run` in Inspector or Cursor; use `node` + `tsx` directly (see below).

## Cursor config

Production (compiled):

```json
{
  "mcpServers": {
    "local-notes-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/local-notes-mcp/dist/index.js"]
    }
  }
}
```

Development (hot refresh):

```json
{
  "mcpServers": {
    "local-notes-mcp": {
      "command": "node",
      "args": ["./node_modules/tsx/dist/cli.mjs", "watch", "--clear-screen=false", "src/index.ts"],
      "cwd": "/absolute/path/to/local-notes-mcp"
    }
  }
}
```
