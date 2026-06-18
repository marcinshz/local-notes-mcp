import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { initBase, registerBase } from "./base/base.js";

const server = new McpServer({
  name: "local-notes-mcp",
  version: "1.0.0",
});

registerBase(server);

async function main() {
  await initBase();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main();
