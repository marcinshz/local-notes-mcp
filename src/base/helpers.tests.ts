import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  filterNotesByDirectory,
  formatNotePayload,
  normalizeNoteDirectory,
  noteRelativePath,
  type NoteIndexEntry,
} from "./helpers.js";

describe("normalizeNoteDirectory", () => {
  it("returns empty string for blank input", () => {
    assert.equal(normalizeNoteDirectory(), "");
    assert.equal(normalizeNoteDirectory("  "), "");
  });

  it("normalizes slashes and trims", () => {
    assert.equal(normalizeNoteDirectory(" work/projects/ "), "work/projects");
    assert.equal(normalizeNoteDirectory("work\\projects"), "work/projects");
  });

  it("rejects parent segments and dot segments", () => {
    assert.throws(() => normalizeNoteDirectory("work/../secret"));
    assert.throws(() => normalizeNoteDirectory("work/./notes"));
  });
});

describe("noteRelativePath", () => {
  it("always uses forward slashes in metadata paths", () => {
    assert.equal(noteRelativePath("python-roadmap/overview.md"), "notes/python-roadmap/overview.md");
    assert.equal(
      noteRelativePath("work\\my-note.md"),
      "notes/work/my-note.md",
    );
  });
});

describe("formatNotePayload", () => {
  it("returns trimmed JSON with metadata and content", () => {
    const metadata = {
      name: "Test",
      id: "abc",
      description: "Short",
      path: "notes/test.md",
      created_at: "2026-01-01T00:00:00.000Z",
      modified_at: "2026-01-01T00:00:00.000Z",
    };

    const result = JSON.parse(formatNotePayload(metadata, "  hello  "));
    assert.deepEqual(result.metadata, metadata);
    assert.equal(result.content, "hello");
  });
});

describe("filterNotesByDirectory", () => {
  const entries: NoteIndexEntry[] = [
    {
      id: "1",
      name: "Overview",
      description: "Roadmap",
      path: "notes/python-roadmap/overview.md",
      created_at: "2026-01-01T00:00:00.000Z",
      modified_at: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "2",
      name: "Stage 1",
      description: "Basics",
      path: "notes/python-roadmap/stage-1.md",
      created_at: "2026-01-01T00:00:00.000Z",
      modified_at: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "3",
      name: "Other",
      description: "Misc",
      path: "notes/work/note.md",
      created_at: "2026-01-01T00:00:00.000Z",
      modified_at: "2026-01-01T00:00:00.000Z",
    },
  ];

  it("returns all entries without a directory filter", () => {
    assert.equal(filterNotesByDirectory(entries).length, 3);
  });

  it("filters by project directory including nested paths", () => {
    const filtered = filterNotesByDirectory(entries, "python-roadmap");
    assert.equal(filtered.length, 2);
    assert.ok(filtered.every((entry) => entry.path.includes("python-roadmap")));
  });
});
