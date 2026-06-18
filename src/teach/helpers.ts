import {
  noteDirectoryFromMetadataPath,
  slugify,
} from "../shared/helpers.js";
import {
  normalizeNoteDirectory,
  type NoteIndexEntry,
} from "../base/helpers.js";

function collectUsedDirectories(entries: NoteIndexEntry[]): Set<string> {
  const used = new Set<string>();
  for (const entry of entries) {
    const directory = noteDirectoryFromMetadataPath(entry.path);
    if (directory) {
      used.add(directory);
    }
  }
  return used;
}

export function resolveLearningProjectPath(
  topic: string,
  entries: NoteIndexEntry[],
): string {
  const base = normalizeNoteDirectory(slugify(`${topic}-roadmap`));
  const used = collectUsedDirectories(entries);

  if (!used.has(base)) {
    return base;
  }

  for (let suffix = 2; suffix < 100; suffix++) {
    const candidate = normalizeNoteDirectory(`${base}-${suffix}`);
    if (!used.has(candidate)) {
      return candidate;
    }
  }

  return normalizeNoteDirectory(`${base}-${Date.now()}`);
}
