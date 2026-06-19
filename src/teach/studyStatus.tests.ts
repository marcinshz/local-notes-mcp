import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  attachStageNotes,
  parseProgressBlock,
  parseStepsFallback,
  resolveStudyProject,
  extractStageNumber,
} from "./studyStatus.js";
import type { NoteIndexEntry } from "../base/helpers.js";

const overviewContent = `## Overview
Plan

## Steps
1. [Stage 1: Basics](notes/python-roadmap/stage-1.md)
2. [Stage 2: Advanced](notes/python-roadmap/stage-2.md)

## Progress
| # | Stage | Status | Last session |
|---|-------|--------|--------------|
| 1 | Basics | in_progress | 2026-06-01 |
| 2 | Advanced | not_started | — |

**Current:** 1
`;

describe("parseProgressBlock", () => {
  it("parses stage rows and current stage", () => {
    const { stages, currentStageNumber } = parseProgressBlock(overviewContent);

    assert.equal(currentStageNumber, 1);
    assert.equal(stages.length, 2);
    assert.deepEqual(stages[0], {
      number: 1,
      title: "Basics",
      status: "in_progress",
      lastSession: "2026-06-01",
    });
    assert.deepEqual(stages[1], {
      number: 2,
      title: "Advanced",
      status: "not_started",
      lastSession: null,
    });
  });

  it("returns empty result when Progress section is missing", () => {
    const result = parseProgressBlock("## Overview\nNo progress here");
    assert.deepEqual(result, { stages: [], currentStageNumber: null });
  });
});

describe("parseStepsFallback", () => {
  it("parses numbered markdown links from Steps section", () => {
    const steps = parseStepsFallback(overviewContent);
    assert.deepEqual(steps, [
      { number: 1, title: "Stage 1: Basics" },
      { number: 2, title: "Stage 2: Advanced" },
    ]);
  });
});

describe("extractStageNumber", () => {
  it("extracts stage numbers from English and Polish names", () => {
    assert.equal(extractStageNumber("Stage 3: Files"), 3);
    assert.equal(extractStageNumber("Etap 2 — pętle"), 2);
    assert.equal(extractStageNumber("Overview"), null);
  });
});

describe("attachStageNotes", () => {
  const stageEntries: NoteIndexEntry[] = [
    {
      id: "stage-1-id",
      name: "Stage 1: Basics",
      description: "Basics",
      path: "notes/python-roadmap/stage-1.md",
      created_at: "2026-01-01T00:00:00.000Z",
      modified_at: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "stage-2-id",
      name: "Stage 2: Advanced",
      description: "Advanced",
      path: "notes/python-roadmap/stage-2.md",
      created_at: "2026-01-01T00:00:00.000Z",
      modified_at: "2026-01-01T00:00:00.000Z",
    },
  ];

  it("matches stages only by extracted stage number", () => {
    const attached = attachStageNotes(
      [
        {
          number: 1,
          title: "Different title",
          status: "not_started",
          lastSession: null,
        },
        {
          number: 2,
          title: "Also different",
          status: "not_started",
          lastSession: null,
        },
      ],
      stageEntries,
    );

    assert.equal(attached[0].stageNoteId, "stage-1-id");
    assert.equal(attached[1].stageNoteId, "stage-2-id");
  });

  it("leaves note id unknown when stage number does not match", () => {
    const attached = attachStageNotes(
      [
        {
          number: 99,
          title: "Missing",
          status: "not_started",
          lastSession: null,
        },
      ],
      stageEntries,
    );

    assert.equal(attached[0].stageNoteId, undefined);
  });
});

describe("resolveStudyProject", () => {
  const entries: NoteIndexEntry[] = [
    {
      id: "1",
      name: "Python — learning roadmap",
      description: "Roadmapa",
      path: "notes/python-roadmap/overview.md",
      created_at: "2026-01-01T00:00:00.000Z",
      modified_at: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "2",
      name: "Rust roadmap",
      description: "Rust",
      path: "notes/rust-roadmap/overview.md",
      created_at: "2026-01-01T00:00:00.000Z",
      modified_at: "2026-01-01T00:00:00.000Z",
    },
  ];

  it("returns no_match when topic has zero scored candidates", () => {
    const resolution = resolveStudyProject("Java", entries);
    assert.deepEqual(resolution, { type: "no_match", topic: "Java" });
  });

  it("returns resolved when exactly one candidate matches", () => {
    const resolution = resolveStudyProject("Python", entries);
    assert.deepEqual(resolution, {
      type: "resolved",
      projectPath: "python-roadmap",
    });
  });

  it("returns pick when multiple roadmap projects exist without topic", () => {
    const resolution = resolveStudyProject(undefined, entries);
    assert.equal(resolution.type, "pick");
    if (resolution.type === "pick") {
      assert.equal(resolution.candidates.length, 2);
    }
  });
});
