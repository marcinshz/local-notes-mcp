import matter from "gray-matter";
import path from "path";
import { promises as fs } from "fs";

export const NOTES_DIR = path.join(process.cwd(), "notes");

export interface NoteMetadata {
  name: string;
  id: string;
  description: string;
  path: string;
  created_at: string;
  modified_at: string;
}

export async function ensureNotesDir(): Promise<void> {
  await fs.mkdir(NOTES_DIR, { recursive: true });
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "note"
  );
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
): Promise<string> {
  const normalizedDirectory = normalizeNoteDirectory(directory);
  const base = `${slugify(name)}.md`;
  const basePath = normalizedDirectory
    ? path.join(normalizedDirectory, base)
    : base;

  if (
    !(await fileExists(noteAbsolutePath(basePath))) ||
    basePath === excludeRelativePath
  ) {
    return basePath;
  }

  const suffixed = `${slugify(name)}-${id.slice(0, 8)}.md`;
  const suffixedPath = normalizedDirectory
    ? path.join(normalizedDirectory, suffixed)
    : suffixed;

  if (
    !(await fileExists(noteAbsolutePath(suffixedPath))) ||
    suffixedPath === excludeRelativePath
  ) {
    return suffixedPath;
  }

  throw new Error(`Filename conflict for note: ${name}`);
}

export async function findNoteFileById(id: string): Promise<string | null> {
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
