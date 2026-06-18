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
  formatNoteResponse,
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

function formatCreatedNoteResponse(note: {
  metadata: NoteMetadata;
  content: string;
}): string {
  return JSON.stringify(
    {
      metadata: note.metadata,
      content: note.content.trim(),
    },
    null,
    2,
  );
}

function formatCreatedNotesResponse(
  notes: { metadata: NoteMetadata; content: string }[],
): string {
  return JSON.stringify(
    notes.map(({ metadata, content }) => ({
      metadata,
      content: content.trim(),
    })),
    null,
    2,
  );
}

export function registerBaseTools(server: McpServer): void {
  server.registerTool(
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
      try {
        const [created] = await createNotes(
          [{ name, description, content }],
          notePath,
        );

        return {
          content: [
            {
              type: "text" as const,
              text: formatCreatedNoteResponse(created),
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
      try {
        const created = await createNotes(notes, notePath);

        return {
          content: [
            {
              type: "text" as const,
              text: formatCreatedNotesResponse(created),
            },
          ],
        };
      } catch (error) {
        return toolError(
          error instanceof Error ? error.message : "Failed to create notes",
        );
      }
    },
  );

  server.registerTool(
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
      try {
        const entries = filterNotesByDirectory(
          await getConsistentNotesIndex(),
          directoryPath,
        );
        return {
          content: [
            {
              type: "text" as const,
              text: formatNotesIndexResource(entries),
            },
          ],
        };
      } catch (error) {
        return toolError(
          error instanceof Error ? error.message : "Failed to list notes",
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
      annotations: {
        destructiveHint: true,
        readOnlyHint: false,
      },
    },
    async ({ id }) => {
      try {
        const fileName = await findNoteFileById(id);
        if (!fileName) {
          return toolError(`Note not found with id: ${id}`);
        }

        const parsed = await readNoteFile(fileName);
        await fs.unlink(noteAbsolutePath(fileName));
        await removeNoteFromIndex(id);

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

  server.registerTool(
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
    async ({ path: directoryPath } ) => {
      try {
        const { path: deletedPath, deletedNotes } =
          await deleteNotesDirectory(directoryPath);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  path: deletedPath,
                  deletedCount: deletedNotes.length,
                  deletedNotes,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return toolError(
          error instanceof Error
            ? error.message
            : "Failed to delete notes directory",
        );
      }
    },
  );
}
