import matter from "gray-matter";
import path from "path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { promises as fs } from "fs";
import * as z from "zod";
import {
  createNotes,
  deleteNotesDirectory,
  ensureNoteDirectory,
  findNoteFileById,
  filterNotesByDirectory,
  formatNotePayload,
  formatNoteResponse,
  formatNotesPayload,
  formatNotesIndexResource,
  noteAbsolutePath,
  noteRelativePath,
  getConsistentNotesIndex,
  readNoteFile,
  removeNoteFromIndex,
  resolveUniqueFileName,
  toolError,
  upsertNoteInIndex,
  type NoteMetadata,
} from "./helpers.js";

type ToolTextResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

function registerToolSafe<InputSchema extends z.ZodTypeAny>(
  server: McpServer,
  name: string,
  config: {
    description: string;
    inputSchema: InputSchema;
    annotations?: {
      readOnlyHint?: boolean;
      destructiveHint?: boolean;
    };
  },
  handler: (args: z.infer<InputSchema>) => Promise<ToolTextResult>,
  fallbackMessage: string,
): void {
  const wrappedHandler = async (args: z.infer<InputSchema>) => {
    try {
      return await handler(args);
    } catch (error) {
      return toolError(
        error instanceof Error ? error.message : fallbackMessage,
      );
    }
  };

  server.registerTool(
    name,
    config as Parameters<McpServer["registerTool"]>[1],
    wrappedHandler as Parameters<McpServer["registerTool"]>[2],
  );
}

function textResult(text: string): ToolTextResult {
  return { content: [{ type: "text" as const, text }] };
}

const noteDescriptionSchema = z
  .string()
  .min(1)
  .max(50)
  .describe(
    "Specific searchable summary (max 50 chars). Include topic, purpose, and key entities so the note can be found quickly.",
  );

const noteInputSchema = z.object({
  name: z
    .string()
    .min(1)
    .describe("Display name of the note"),
  description: noteDescriptionSchema,
  content: z
    .string()
    .optional()
    .describe("Markdown body content below the metadata section"),
});

export function registerBaseTools(server: McpServer): void {
  registerToolSafe(
    server,
    "create_note",
    {
      description: "Create a new markdown note with YAML front matter metadata",
      inputSchema: z.object({
        name: z
          .string()
          .min(1)
          .describe("Display name of the note"),
        description: noteDescriptionSchema,
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
    async ({ name, description, content = "", path: notePath }) => {
      const [created] = await createNotes(
        [{ name, description, content }],
        notePath,
      );

      return textResult(formatNotePayload(created.metadata, created.content));
    },
    "Failed to create note",
  );

  registerToolSafe(
    server,
    "create_notes",
    {
      description:
        "Create multiple markdown notes in one call. Faster than repeated create_note when saving several notes at once (e.g. roadmap stages).",
      inputSchema: z.object({
        path: z
          .string()
          .optional()
          .describe(
            "Shared directory path for all notes, e.g. rust-roadmap or work/projects",
          ),
        notes: z
          .array(noteInputSchema)
          .min(1)
          .describe("Notes to create, in order"),
      }),
    },
    async ({ path: notePath, notes }) => {
      const created = await createNotes(notes, notePath);
      return textResult(formatNotesPayload(created));
    },
    "Failed to create notes",
  );

  registerToolSafe(
    server,
    "list_notes",
    {
      description:
        "List notes with id, name, path, created_at, modified_at, and description. Optionally filter by project directory path.",
      inputSchema: z.object({
        path: z
          .string()
          .optional()
          .describe(
            "Filter to notes in this directory, e.g. rust-roadmap or work/projects",
          ),
      }),
      annotations: {
        readOnlyHint: true,
      },
    },
    async ({ path: directoryPath }) => {
      const entries = filterNotesByDirectory(
        await getConsistentNotesIndex(),
        directoryPath,
      );
      return textResult(formatNotesIndexResource(entries));
    },
    "Failed to list notes",
  );

  registerToolSafe(
    server,
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
      return textResult(formatNoteResponse(parsed));
    },
    "Failed to read note",
  );

  registerToolSafe(
    server,
    "update_note",
    {
      description: "Update an existing note by id",
      inputSchema: z.object({
        id: z.string().describe("Note UUID from metadata"),
        name: z.string().optional().describe("Updated display name"),
        description: noteDescriptionSchema
          .optional()
          .describe(
            "Updated searchable summary (max 50 chars). Provide a new description when content, name, or path meaningfully changes; omit to keep the current description for minor edits (typos, formatting, small clarifications).",
          ),
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
      const currentFileName = await findNoteFileById(id);
      if (!currentFileName) {
        return toolError(`Note not found with id: ${id}`);
      }

      const parsed = await readNoteFile(currentFileName);
      const metadata = parsed.data as NoteMetadata;

      if (name !== undefined) metadata.name = name;
      if (description !== undefined) metadata.description = description;
      metadata.modified_at = new Date().toISOString();

      if (!metadata.description?.trim()) {
        return toolError(
          "Note description is required (1-50 characters). Provide description when updating legacy notes.",
        );
      }
      if (metadata.description.length > 50) {
        return toolError("Note description must be at most 50 characters.");
      }

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

      await upsertNoteInIndex(metadata);

      return textResult(formatNoteResponse(matter(fileContent)));
    },
    "Failed to update note",
  );

  registerToolSafe(
    server,
    "delete_note",
    {
      description: "Delete a note by id",
      inputSchema: z.object({
        id: z.string().describe("Note UUID from metadata"),
      }),
      annotations: {
        destructiveHint: true,
        readOnlyHint: false,
      },
    },
    async ({ id }) => {
      const fileName = await findNoteFileById(id);
      if (!fileName) {
        return toolError(`Note not found with id: ${id}`);
      }

      const parsed = await readNoteFile(fileName);
      await fs.unlink(noteAbsolutePath(fileName));
      await removeNoteFromIndex(id);

      return textResult(
        `Deleted note: ${JSON.stringify(parsed.data as NoteMetadata, null, 2)}`,
      );
    },
    "Failed to delete note",
  );

  registerToolSafe(
    server,
    "delete_notes_directory",
    {
      description:
        "Delete a note project directory and all notes inside it (including subdirectories). Cannot delete the notes root.",
      inputSchema: z.object({
        path: z
          .string()
          .min(1)
          .describe(
            "Directory path to delete, e.g. rust-roadmap or work/projects",
          ),
      }),
      annotations: {
        destructiveHint: true,
        readOnlyHint: false,
      },
    },
    async ({ path: directoryPath }) => {
      const { path: deletedPath, deletedNotes } =
        await deleteNotesDirectory(directoryPath);

      return textResult(
        JSON.stringify(
          {
            path: deletedPath,
            deletedCount: deletedNotes.length,
            deletedNotes,
          },
          null,
          2,
        ),
      );
    },
    "Failed to delete notes directory",
  );
}
