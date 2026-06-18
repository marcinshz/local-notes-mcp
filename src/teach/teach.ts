import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTeachPrompts } from "./prompts.js";

export function registerTeach(server: McpServer): void {
  registerTeachPrompts(server);
}
