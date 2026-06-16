import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import path from "path";
import * as z from 'zod';
import { promises as fs } from 'fs';

const NOTES_DIR = path.join(process.cwd(), "notes");

const server = new McpServer({
  name: "local-notes-mcp",
  version: "1.0.0",
});

server.registerTool(
    'read_note',
    {
        description: 'Read existing node by file name',
        inputSchema: z.object({ fileName: z.string() })
    },
    async ({ fileName }: { fileName: string }) => {
        const filepath = path.join(NOTES_DIR, fileName);
        const content = await fs.readFile(filepath, 'utf-8');
        
        return {
            content: [{ type: 'text', text: content }]
        }
    }
);

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main();