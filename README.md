# local-notes-mcp

A local-first [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that gives AI assistants structured access to your personal notes — and a guided learning workflow built on top of them.

Store markdown notes on disk, let the model read and update them through tools, and use curated prompts to build roadmaps, run study sessions, track progress, and practice with mock interviews. No cloud account, no vendor lock-in: your notes stay in plain files you own.

Built with TypeScript and the official MCP SDK. Works with **Cursor**, **Claude Desktop**, and any MCP-compatible client over stdio.

---

## Why this project

Long conversations with AI clients like Claude or Cursor tend to lose thread — context fades, earlier decisions get forgotten, and picking up a project days later means starting partly from scratch.

This server is a simple, local answer: **persistent notes on your machine** that the assistant can read and update through MCP. Important context — plans, progress, session takeaways — lives in markdown files you control, so it survives across chats and restarts.

The **teach** module shows one concrete use case: multi-week learning roadmaps where each session builds on the last, with progress written back to the notes instead of kept only in conversation history.

---

## What it does


| Module    | Role                                                                             |
| --------- | -------------------------------------------------------------------------------- |
| **base**  | CRUD for markdown notes, JSON index, path-safe file storage                      |
| **teach** | MCP prompts for learning roadmaps, study sessions, progress, and mock interviews |


```text
┌─────────────────────────────────────────────────────────┐
│  MCP client (Cursor, Claude Desktop, Inspector, …)      │
└──────────────────────────┬──────────────────────────────┘
                           │ stdio / JSON-RPC
┌──────────────────────────▼──────────────────────────────┐
│  local-notes-mcp                                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │    base     │  │    teach    │  │     shared      │  │
│  │ tools       │  │ prompts     │  │ helpers         │  │
│  │ resources   │  │ status      │  │ markdown parse  │  │
│  └──────┬──────┘  └──────┬──────┘  └─────────────────┘  │
│         │                │                              │
│         └────────┬───────┘                              │
│                  ▼                                      │
│           notes/  (markdown + index.json)               │
└─────────────────────────────────────────────────────────┘
```

### Tools (base)


| Tool                     | Description                                            |
| ------------------------ | ------------------------------------------------------ |
| `create_note`            | Create a single note with metadata                     |
| `create_notes`           | Batch-create notes (e.g. all roadmap stages at once)   |
| `list_notes`             | List notes, optionally filtered by project directory   |
| `read_note`              | Read a note by id or path                              |
| `update_note`            | Update content, metadata, or move to another directory |
| `delete_note`            | Delete a note by id                                    |
| `delete_notes_directory` | Remove a project folder and all its notes              |


Notes live under `notes/` as `.md` files with front matter (`name`, `id`, `description`, `path`, timestamps). A JSON index keeps lookups fast and stays in sync with the filesystem.

### Prompts (teach)


| Prompt                  | Description                                                                  |
| ----------------------- | ---------------------------------------------------------------------------- |
| `learning_roadmap`      | Interview you about goals, then build and save a staged learning plan        |
| `find_learning_project` | Locate an existing roadmap project by topic                                  |
| `start_studying`        | Resume a roadmap, propose a lesson, teach interactively, save session notes  |
| `study_status`          | Show progress from the roadmap overview — no teaching                        |
| `mock_interview`        | Quiz you on material from completed stages, debrief, optionally save results |


Roadmaps follow a consistent shape: an **overview note** with a Progress table and **stage notes** with objectives, topics, success criteria, and a session journal. Progress is persisted by the model via `update_note`, guided by prompt instructions.

---

## Quick start

**Requirements:** Node.js 18+

```bash
git clone <your-repo-url>
cd local-notes-mcp
npm install
npm run build
npm test    # optional — 25 unit tests
npm start   # runs the MCP server on stdio
```

Notes are always stored in `notes/` inside the project directory, regardless of where you launch the server from.

---

## Connect to your editor

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

