import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  formatNotesIndexResource,
  getConsistentNotesIndex,
  NOTES_RESOURCE_URI,
} from "./helpers.js";

export function registerBaseResources(server: McpServer): void {
  server.registerResource(
    "notes_index",
    NOTES_RESOURCE_URI,
    {
      title: "Notes Index",
      description:
        "JSON catalog of all notes with id, name, path, created_at, modified_at, and description. Prefer the list_notes tool in clients that do not expose MCP resources.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: formatNotesIndexResource(await getConsistentNotesIndex()),
        },
      ],
    }),
  );
}
