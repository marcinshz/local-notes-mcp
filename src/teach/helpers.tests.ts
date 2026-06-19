import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  findLearningProjectCandidates,
  resolveLearningProjectPath,
} from "./helpers.js";
import type { NoteIndexEntry } from "../base/helpers.js";

const sampleEntries: NoteIndexEntry[] = [
  {
    id: "1",
    name: "Python — learning roadmap",
    description: "Roadmapa Pythona",
    path: "notes/python-roadmap/overview.md",
    created_at: "2026-01-01T00:00:00.000Z",
    modified_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "2",
    name: "Stage 1: Basics",
    description: "Podstawy",
    path: "notes/python-roadmap/stage-1.md",
    created_at: "2026-01-01T00:00:00.000Z",
    modified_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "3",
    name: "Rust roadmap",
    description: "Rust plan",
    path: "notes/rust-roadmap/overview.md",
    created_at: "2026-01-01T00:00:00.000Z",
    modified_at: "2026-01-01T00:00:00.000Z",
  },
];

describe("resolveLearningProjectPath", () => {
  it("returns slugified roadmap path when unused", () => {
    assert.equal(
      resolveLearningProjectPath("Go", []),
      "go-roadmap",
    );
  });

  it("adds numeric suffix when base path is taken", () => {
    assert.equal(
      resolveLearningProjectPath("Python", sampleEntries),
      "python-roadmap-2",
    );
  });
});

describe("findLearningProjectCandidates", () => {
  it("matches projects by topic slug and note names", () => {
    const candidates = findLearningProjectCandidates("Python", sampleEntries);
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].path, "python-roadmap");
  });

  it("returns empty list when nothing matches", () => {
    const candidates = findLearningProjectCandidates("Java", sampleEntries);
    assert.deepEqual(candidates, []);
  });

  it("ranks rust-roadmap when topic mentions rust", () => {
    const candidates = findLearningProjectCandidates("rust", sampleEntries);
    assert.equal(candidates[0].path, "rust-roadmap");
  });
});

describe("LearningProjectCandidate shape", () => {
  it("groups note metadata by directory", () => {
    const [candidate] = findLearningProjectCandidates("python", sampleEntries);
    assert.equal(candidate.noteCount, 2);
    assert.ok(candidate.noteNames.includes("Python — learning roadmap"));
  });
});
