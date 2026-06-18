import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ensureNotesDir, ensureNotesIndex } from "./helpers.js";
import { registerBaseResources } from "./resources.js";
import { registerBaseTools } from "./tools.js";

export async function initBase(): Promise<void> {
  await ensureNotesDir();
  await ensureNotesIndex();
}

export function registerBase(server: McpServer): void {
  registerBaseResources(server);
  registerBaseTools(server);
}
