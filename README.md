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

## Dev (hot refresh)

Restarts the server when `src/` changes:

```bash
npm run dev
```

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
      "command": "npm",
      "args": ["run", "dev"],
      "cwd": "/absolute/path/to/local-notes-mcp"
    }
  }
}
```
