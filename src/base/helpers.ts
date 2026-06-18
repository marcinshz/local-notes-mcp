import crypto from "crypto";
import matter from "gray-matter";
import path from "path";
import { fileURLToPath } from "url";
import { promises as fs } from "fs";
import {
  noteDirectoryFromMetadataPath,
  notePathToRelativeFile,
  slugify,
} from "../shared/helpers.js";

export { slugify } from "../shared/helpers.js";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const NOTES_DIR = path.join(projectRoot, "notes");
export const NOTES_INDEX_FILE = path.join(NOTES_DIR, "index.json");
export const NOTES_RESOURCE_URI = "notes://index";

export interface NoteMetadata {
  name: string;
  id: string;
  description: string;
  path: string;
  created_at: string;
  modified_at: string;
}

export type NoteIndexEntry = NoteMetadata;

let indexCache: NoteIndexEntry[] | null = null;

function sortIndexEntries(entries: NoteIndexEntry[]): NoteIndexEntry[] {
  return [...entries].sort((a, b) => a.name.localeCompare(b.name));
}

export async function readNotesIndex(): Promise<NoteIndexEntry[]> {
  if (indexCache !== null) {
    return indexCache;
  }

  if (!(await fileExists(NOTES_INDEX_FILE))) {
    indexCache = [];
    return indexCache;
  }

  const raw = await fs.readFile(NOTES_INDEX_FILE, "utf-8");
  const parsed = JSON.parse(raw) as NoteIndexEntry[];

  if (!Array.isArray(parsed)) {
    throw new Error("Invalid notes index: expected a JSON array");
  }

  indexCache = sortIndexEntries(parsed);
  return indexCache;
}

export async function writeNotesIndex(entries: NoteIndexEntry[]): Promise<void> {
  await ensureNotesDir();
  indexCache = sortIndexEntries(entries);
  await fs.writeFile(
    NOTES_INDEX_FILE,
    `${JSON.stringify(indexCache, null, 2)}\n`,
    "utf-8",
  );
}

function indexPathsMatchDisk(
  entries: NoteIndexEntry[],
  diskPaths: Set<string>,
): boolean {
  const indexPaths = new Set(
    entries.map((entry) => notePathToRelativeFile(entry.path)),
  );

  if (diskPaths.size !== indexPaths.size) {
    return false;
  }

  for (const indexPath of indexPaths) {
    if (!diskPaths.has(indexPath)) {
      return false;
    }
  }

  return true;
}

export async function getConsistentNotesIndex(): Promise<NoteIndexEntry[]> {
  const entries = await readNotesIndex();
  const diskPaths = new Set(await listNoteFiles());

  if (indexPathsMatchDisk(entries, diskPaths)) {
    return entries;
  }

  const rebuilt = await rebuildNotesIndexFromFiles();
  await writeNotesIndex(rebuilt);
  return rebuilt;
}

export async function rebuildNotesIndexFromFiles(): Promise<NoteIndexEntry[]> {
  const entries: NoteIndexEntry[] = [];

  for (const relativePath of await listNoteFiles()) {
    const parsed = await readNoteFile(relativePath);
    const metadata = parsed.data as Partial<NoteMetadata>;

    if (
      !metadata.id ||
      !metadata.name ||
      !metadata.path ||
      !metadata.created_at ||
      !metadata.modified_at
    ) {
      continue;
    }

    entries.push({
      id: metadata.id,
      name: metadata.name,
      path: metadata.path,
      created_at: metadata.created_at,
      modified_at: metadata.modified_at,
      description: metadata.description ?? "Legacy note without description",
    });
  }

  return sortIndexEntries(entries);
}

export async function ensureNotesIndex(): Promise<NoteIndexEntry[]> {
  await ensureNotesDir();
  const entries = await getConsistentNotesIndex();

  if (!(await fileExists(NOTES_INDEX_FILE))) {
    await writeNotesIndex(entries);
  }

  return entries;
}

export async function upsertNoteInIndex(entry: NoteIndexEntry): Promise<void> {
  await upsertNotesInIndex([entry]);
}

export async function upsertNotesInIndex(
  newEntries: NoteIndexEntry[],
): Promise<void> {
  const byId = new Map((await readNotesIndex()).map((note) => [note.id, note]));

  for (const entry of newEntries) {
    byId.set(entry.id, entry);
  }

  await writeNotesIndex([...byId.values()]);
}

export async function removeNoteFromIndex(id: string): Promise<void> {
  await removeNotesFromIndex([id]);
}

export async function removeNotesFromIndex(ids: string[]): Promise<void> {
  if (ids.length === 0) {
    return;
  }

  const idSet = new Set(ids);
  const entries = await readNotesIndex();
  await writeNotesIndex(entries.filter((note) => !idSet.has(note.id)));
}

export function formatNotesIndexResource(entries: NoteIndexEntry[]): string {
  return JSON.stringify(entries, null, 2);
}

export function filterNotesByDirectory(
  entries: NoteIndexEntry[],
  directory?: string,
): NoteIndexEntry[] {
  if (!directory?.trim()) {
    return entries;
  }

  const normalized = normalizeNoteDirectory(directory);
  return entries.filter((entry) => {
    const entryDirectory = noteDirectoryFromMetadataPath(entry.path);
    return (
      entryDirectory === normalized ||
      entryDirectory.startsWith(`${normalized}/`)
    );
  });
}

export async function ensureNotesDir(): Promise<void> {
  await fs.mkdir(NOTES_DIR, { recursive: true });
}

export function normalizeNoteDirectory(directory?: string): string {
  if (!directory?.trim()) {
    return "";
  }

  const normalized = directory
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");

  if (!normalized) {
    return "";
  }

  if (path.isAbsolute(normalized) || normalized.split("/").includes("..")) {
    throw new Error("Invalid note path: must be relative to notes directory");
  }

  for (const segment of normalized.split("/")) {
    if (!segment || segment === ".") {
      throw new Error("Invalid note path segment");
    }
  }

  return normalized;
}

export function noteRelativePath(relativePath: string): string {
  return path.join("notes", relativePath);
}

export function noteAbsolutePath(relativePath: string): string {
  const absolute = path.resolve(NOTES_DIR, relativePath);
  const notesRoot = path.resolve(NOTES_DIR);

  if (absolute !== notesRoot && !absolute.startsWith(`${notesRoot}${path.sep}`)) {
    throw new Error("Invalid note path");
  }

  return absolute;
}

export async function ensureNoteDirectory(directory?: string): Promise<string> {
  const normalizedDirectory = normalizeNoteDirectory(directory);
  if (normalizedDirectory) {
    await fs.mkdir(noteAbsolutePath(normalizedDirectory), { recursive: true });
  }
  return normalizedDirectory;
}

export async function fileExists(filepath: string): Promise<boolean> {
  try {
    await fs.access(filepath);
    return true;
  } catch {
    return false;
  }
}

export async function listNoteFiles(): Promise<string[]> {
  await ensureNotesDir();
  const files: string[] = [];

  async function walk(currentDir: string, prefix: string): Promise<void> {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const relativePath = prefix
        ? path.join(prefix, entry.name)
        : entry.name;

      if (entry.isDirectory()) {
        await walk(path.join(currentDir, entry.name), relativePath);
        continue;
      }

      if (entry.isFile() && entry.name.endsWith(".md")) {
        files.push(relativePath);
      }
    }
  }

  await walk(NOTES_DIR, "");
  return files;
}

export async function resolveUniqueFileName(
  name: string,
  id: string,
  directory = "",
  excludeRelativePath?: string,
  reservedPaths: ReadonlySet<string> = new Set(),
): Promise<string> {
  const normalizedDirectory = normalizeNoteDirectory(directory);
  const base = `${slugify(name)}.md`;
  const basePath = normalizedDirectory
    ? path.join(normalizedDirectory, base)
    : base;

  if (
    basePath === excludeRelativePath ||
    (!(await fileExists(noteAbsolutePath(basePath))) &&
      !reservedPaths.has(basePath))
  ) {
    return basePath;
  }

  const suffixed = `${slugify(name)}-${id.slice(0, 8)}.md`;
  const suffixedPath = normalizedDirectory
    ? path.join(normalizedDirectory, suffixed)
    : suffixed;

  if (
    suffixedPath === excludeRelativePath ||
    (!(await fileExists(noteAbsolutePath(suffixedPath))) &&
      !reservedPaths.has(suffixedPath))
  ) {
    return suffixedPath;
  }

  throw new Error(`Filename conflict for note: ${name}`);
}

export type CreateNoteInput = {
  name: string;
  description: string;
  content?: string;
  path?: string;
};

export type CreatedNote = {
  metadata: NoteMetadata;
  content: string;
};

export async function createNotes(
  notes: CreateNoteInput[],
  sharedPath?: string,
): Promise<CreatedNote[]> {
  if (notes.length === 0) {
    return [];
  }

  await ensureNotesDir();
  const directory = await ensureNoteDirectory(sharedPath);
  const now = new Date().toISOString();
  const reservedPaths = new Set<string>();
  const created: CreatedNote[] = [];

  for (const note of notes) {
    const id = crypto.randomUUID();
    const noteDirectory =
      note.path !== undefined
        ? await ensureNoteDirectory(note.path)
        : directory;
    const relativePath = await resolveUniqueFileName(
      note.name,
      id,
      noteDirectory,
      undefined,
      reservedPaths,
    );
    reservedPaths.add(relativePath);

    const metadata: NoteMetadata = {
      name: note.name,
      id,
      description: note.description,
      path: noteRelativePath(relativePath),
      created_at: now,
      modified_at: now,
    };

    const body = note.content ?? "";
    await fs.writeFile(
      noteAbsolutePath(relativePath),
      matter.stringify(body, metadata),
      "utf-8",
    );
    created.push({ metadata, content: body.trim() });
  }

  await upsertNotesInIndex(created.map(({ metadata }) => metadata));
  return created;
}

export type DeletedNotesDirectory = {
  path: string;
  deletedNotes: NoteIndexEntry[];
};

export async function deleteNotesDirectory(
  directory: string,
): Promise<DeletedNotesDirectory> {
  const normalized = normalizeNoteDirectory(directory);
  if (!normalized) {
    throw new Error(
      "Cannot delete the notes root; provide a project subdirectory path",
    );
  }

  const deletedNotes = filterNotesByDirectory(
    await getConsistentNotesIndex(),
    normalized,
  );

  await Promise.all(
    deletedNotes.map(async (entry) => {
      const relativePath = notePathToRelativeFile(entry.path);
      const absolutePath = noteAbsolutePath(relativePath);
      if (await fileExists(absolutePath)) {
        await fs.unlink(absolutePath);
      }
    }),
  );

  const directoryAbsolutePath = noteAbsolutePath(normalized);
  if (await fileExists(directoryAbsolutePath)) {
    await fs.rm(directoryAbsolutePath, { recursive: true, force: true });
  }

  await removeNotesFromIndex(deletedNotes.map((entry) => entry.id));

  return { path: normalized, deletedNotes };
}

export async function findNoteFileById(id: string): Promise<string | null> {
  const index = await readNotesIndex();
  const entry = index.find((note) => note.id === id);

  if (entry) {
    const relativePath = notePathToRelativeFile(entry.path);
    if (await fileExists(noteAbsolutePath(relativePath))) {
      return relativePath;
    }
  }

  for (const relativePath of await listNoteFiles()) {
    const raw = await fs.readFile(noteAbsolutePath(relativePath), "utf-8");
    const parsed = matter(raw);
    if (parsed.data.id === id) {
      return relativePath;
    }
  }

  return null;
}

export async function readNoteFile(relativePath: string) {
  const filepath = noteAbsolutePath(relativePath);
  if (!(await fileExists(filepath))) {
    throw new Error(`Note not found: ${relativePath}`);
  }
  const raw = await fs.readFile(filepath, "utf-8");
  return matter(raw);
}

export function formatNoteResponse(parsed: matter.GrayMatterFile<string>) {
  const metadata = parsed.data as NoteMetadata;
  return JSON.stringify(
    {
      metadata,
      content: parsed.content.trim(),
    },
    null,
    2,
  );
}

export function toolError(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}
