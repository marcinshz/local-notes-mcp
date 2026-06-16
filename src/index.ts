import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import crypto from "crypto";
import matter from "gray-matter";
import path from "path";
import * as z from "zod";
import { promises as fs } from "fs";
import {
  ensureNoteDirectory,
  ensureNotesDir,
  findNoteFileById,
  formatNoteResponse,
  noteAbsolutePath,
  noteRelativePath,
  readNoteFile,
  resolveUniqueFileName,
  toolError,
  type NoteMetadata,
} from "./helpers.js";

const server = new McpServer({
  name: "local-notes-mcp",
  version: "1.0.0",
});

server.registerTool(
  "create_note",
  {
    description: "Create a new markdown note with YAML front matter metadata",
    inputSchema: z.object({
      name: z.string().describe("Display name of the note"),
      description: z
        .string()
        .optional()
        .describe("Short description of the note"),
      content: z
        .string()
        .optional()
        .describe("Markdown body content below the metadata section"),
      path: z
        .string()
        .optional()
        .describe(
          "Directory path for the note group, e.g. work or work/projects",
        ),
    }),
  },
  async ({ name, description = "", content = "", path: notePath }) => {
    try {
      await ensureNotesDir();
      const directory = await ensureNoteDirectory(notePath);

      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const relativePath = await resolveUniqueFileName(name, id, directory);
      const metadata: NoteMetadata = {
        name,
        id,
        description,
        path: noteRelativePath(relativePath),
        created_at: now,
        modified_at: now,
      };

      const fileContent = matter.stringify(content, metadata);
      await fs.writeFile(noteAbsolutePath(relativePath), fileContent, "utf-8");

      return {
        content: [
          {
            type: "text" as const,
            text: formatNoteResponse(matter(fileContent)),
          },
        ],
      };
    } catch (error) {
      return toolError(
        error instanceof Error ? error.message : "Failed to create note",
      );
    }
  },
);

server.registerTool(
  "read_note",
  {
    description: "Read a note by id or file name",
    inputSchema: z.object({
      id: z.string().optional().describe("Note UUID from metadata"),
      fileName: z
        .string()
        .optional()
        .describe("Note path relative to notes/, e.g. work/my-note.md"),
    }),
  },
  async ({ id, fileName }) => {
    try {
      if (!id && !fileName) {
        return toolError("Provide either id or fileName");
      }

      let resolvedFileName = fileName;
      if (id) {
        resolvedFileName = (await findNoteFileById(id)) ?? undefined;
        if (!resolvedFileName) {
          return toolError(`Note not found with id: ${id}`);
        }
      }

      const parsed = await readNoteFile(resolvedFileName!);
      return {
        content: [{ type: "text" as const, text: formatNoteResponse(parsed) }],
      };
    } catch (error) {
      return toolError(
        error instanceof Error ? error.message : "Failed to read note",
      );
    }
  },
);

server.registerTool(
  "update_note",
  {
    description: "Update an existing note by id",
    inputSchema: z.object({
      id: z.string().describe("Note UUID from metadata"),
      name: z.string().optional().describe("Updated display name"),
      description: z.string().optional().describe("Updated description"),
      content: z.string().optional().describe("Updated markdown body content"),
      path: z
        .string()
        .optional()
        .describe(
          "Move note to this directory path, e.g. work or work/projects",
        ),
    }),
  },
  async ({ id, name, description, content, path: notePath }) => {
    try {
      const currentFileName = await findNoteFileById(id);
      if (!currentFileName) {
        return toolError(`Note not found with id: ${id}`);
      }

      const parsed = await readNoteFile(currentFileName);
      const metadata = parsed.data as NoteMetadata;

      if (name !== undefined) metadata.name = name;
      if (description !== undefined) metadata.description = description;
      metadata.modified_at = new Date().toISOString();

      const body = content !== undefined ? content : parsed.content.trim();

      let targetRelativePath = currentFileName;
      if (name !== undefined || notePath !== undefined) {
        const currentDirectory = path.dirname(currentFileName);
        const directory =
          notePath !== undefined
            ? await ensureNoteDirectory(notePath)
            : currentDirectory === "."
              ? ""
              : currentDirectory;

        targetRelativePath = await resolveUniqueFileName(
          metadata.name,
          id,
          directory,
          currentFileName,
        );
      }

      metadata.path = noteRelativePath(targetRelativePath);
      const fileContent = matter.stringify(body, metadata);

      if (targetRelativePath !== currentFileName) {
        await fs.writeFile(
          noteAbsolutePath(targetRelativePath),
          fileContent,
          "utf-8",
        );
        await fs.unlink(noteAbsolutePath(currentFileName));
      } else {
        await fs.writeFile(
          noteAbsolutePath(currentFileName),
          fileContent,
          "utf-8",
        );
      }

      return {
        content: [
          {
            type: "text" as const,
            text: formatNoteResponse(matter(fileContent)),
          },
        ],
      };
    } catch (error) {
      return toolError(
        error instanceof Error ? error.message : "Failed to update note",
      );
    }
  },
);

server.registerTool(
  "delete_note",
  {
    description: "Delete a note by id",
    inputSchema: z.object({
      id: z.string().describe("Note UUID from metadata"),
    }),
  },
  async ({ id }) => {
    try {
      const fileName = await findNoteFileById(id);
      if (!fileName) {
        return toolError(`Note not found with id: ${id}`);
      }

      const parsed = await readNoteFile(fileName);
      await fs.unlink(noteAbsolutePath(fileName));

      return {
        content: [
          {
            type: "text" as const,
            text: `Deleted note: ${JSON.stringify(parsed.data as NoteMetadata, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return toolError(
        error instanceof Error ? error.message : "Failed to delete note",
      );
    }
  },
);

async function main() {
  await ensureNotesDir();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main();
