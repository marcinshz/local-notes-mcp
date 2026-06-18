import path from "path";

export function notePathToRelativeFile(notePath: string): string {
  return notePath.startsWith("notes/")
    ? notePath.slice("notes/".length)
    : notePath;
}

export function noteDirectoryFromMetadataPath(metadataPath: string): string {
  const relative = notePathToRelativeFile(metadataPath);
  const directory = path.dirname(relative);
  return directory === "." ? "" : directory;
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
