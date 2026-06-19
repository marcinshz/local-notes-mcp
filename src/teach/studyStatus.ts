import {
  filterNotesByDirectory,
  readNoteFile,
  type NoteIndexEntry,
} from "../base/helpers.js";
import { notePathToRelativeFile } from "../shared/helpers.js";
import {
  findLearningProjectCandidates,
  formatProjectCandidates,
  groupNotesByProjectDirectory,
  type LearningProjectCandidate,
} from "./helpers.js";

export type StageStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "skipped";

export type StudyStageStatus = {
  number: number;
  title: string;
  status: StageStatus;
  lastSession: string | null;
  stageNoteId?: string;
  stageNoteName?: string;
};

export type StudyStatus = {
  projectPath: string;
  overviewNoteId: string;
  overviewNoteName: string;
  hasProgressSection: boolean;
  currentStageNumber: number | null;
  stages: StudyStageStatus[];
  recommendedStageNumber: number;
  recommendedReason: string;
};

export type StudyProjectResolution =
  | { type: "resolved"; projectPath: string }
  | {
      type: "pick";
      candidates: LearningProjectCandidate[];
      topic?: string;
    }
  | { type: "none" };

const STAGE_STATUSES = new Set<StageStatus>([
  "not_started",
  "in_progress",
  "completed",
  "skipped",
]);

const OVERVIEW_NAME_PATTERN =
  /roadmap|plan\s+nauki|learning\s+plan|learning\s+roadmap/i;

function extractStageNumber(name: string): number | null {
  const match = name.match(/(?:etap|stage)\s*(\d+)/i);
  return match ? Number.parseInt(match[1], 10) : null;
}

function normalizeStatus(raw: string): StageStatus {
  const normalized = raw.toLowerCase().trim().replace(/\s+/g, "_");
  return STAGE_STATUSES.has(normalized as StageStatus)
    ? (normalized as StageStatus)
    : "not_started";
}

function parseProgressBlock(content: string): {
  stages: Array<{
    number: number;
    title: string;
    status: StageStatus;
    lastSession: string | null;
  }>;
  currentStageNumber: number | null;
} {
  const headingMatch = content.match(/^## Progress\s*$/im);
  if (!headingMatch || headingMatch.index === undefined) {
    return { stages: [], currentStageNumber: null };
  }

  const afterHeading = content.slice(headingMatch.index + headingMatch[0].length);
  const nextSection = afterHeading.search(/^## /m);
  const block =
    nextSection === -1 ? afterHeading : afterHeading.slice(0, nextSection);

  const currentMatch = block.match(/\*\*Current:\*\*\s*(\d+)/i);
  const currentStageNumber = currentMatch
    ? Number.parseInt(currentMatch[1], 10)
    : null;

  const stages: Array<{
    number: number;
    title: string;
    status: StageStatus;
    lastSession: string | null;
  }> = [];

  for (const line of block.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) {
      continue;
    }

    const lower = trimmed.toLowerCase();
    if (
      lower.includes("---") ||
      lower.includes("| # |") ||
      lower.includes("|#|")
    ) {
      continue;
    }

    const cells = trimmed
      .split("|")
      .map((cell) => cell.trim())
      .filter((cell) => cell.length > 0);

    if (cells.length < 4) {
      continue;
    }

    const number = Number.parseInt(cells[0], 10);
    if (Number.isNaN(number)) {
      continue;
    }

    const lastSessionRaw = cells[3];
    const lastSession =
      lastSessionRaw === "—" || lastSessionRaw === "-" || lastSessionRaw === ""
        ? null
        : lastSessionRaw;

    stages.push({
      number,
      title: cells[1],
      status: normalizeStatus(cells[2]),
      lastSession,
    });
  }

  return { stages, currentStageNumber };
}

function parseStepsFallback(content: string): Array<{ number: number; title: string }> {
  const headingMatch = content.match(/^## (?:Steps|Etap(?:y)?)\s*$/im);
  if (!headingMatch || headingMatch.index === undefined) {
    return [];
  }

  const afterHeading = content.slice(headingMatch.index + headingMatch[0].length);
  const nextSection = afterHeading.search(/^## /m);
  const block =
    nextSection === -1 ? afterHeading : afterHeading.slice(0, nextSection);

  const stages: Array<{ number: number; title: string }> = [];

  for (const line of block.split("\n")) {
    const match = line.match(/^\s*(\d+)\.\s*\[([^\]]+)\]/);
    if (!match) {
      continue;
    }

    stages.push({
      number: Number.parseInt(match[1], 10),
      title: match[2].trim(),
    });
  }

  return stages;
}

function isOverviewNote(entry: NoteIndexEntry, content: string): boolean {
  if (OVERVIEW_NAME_PATTERN.test(entry.name)) {
    return true;
  }

  return /^## (?:Steps|Etap(?:y)?)\s*$/im.test(content);
}

function findOverviewEntry(
  projectEntries: NoteIndexEntry[],
  contentsById: Map<string, string>,
): NoteIndexEntry | null {
  const withContent = projectEntries
    .map((entry) => ({
      entry,
      content: contentsById.get(entry.id) ?? "",
    }))
    .filter(({ entry, content }) => isOverviewNote(entry, content));

  if (withContent.length === 0) {
    return null;
  }

  return withContent.sort((a, b) => {
    const aHasProgress = /^## Progress\s*$/im.test(a.content) ? 1 : 0;
    const bHasProgress = /^## Progress\s*$/im.test(b.content) ? 1 : 0;
    if (aHasProgress !== bHasProgress) {
      return bHasProgress - aHasProgress;
    }

    const aOverview = OVERVIEW_NAME_PATTERN.test(a.entry.name) ? 1 : 0;
    const bOverview = OVERVIEW_NAME_PATTERN.test(b.entry.name) ? 1 : 0;
    return bOverview - aOverview;
  })[0].entry;
}

function orderStageEntries(
  projectEntries: NoteIndexEntry[],
  overviewId: string,
): NoteIndexEntry[] {
  return projectEntries
    .filter((entry) => entry.id !== overviewId)
    .sort((a, b) => {
      const numberA = extractStageNumber(a.name) ?? Number.MAX_SAFE_INTEGER;
      const numberB = extractStageNumber(b.name) ?? Number.MAX_SAFE_INTEGER;
      return numberA - numberB || a.name.localeCompare(b.name);
    });
}

function attachStageNotes(
  stages: Array<{
    number: number;
    title: string;
    status: StageStatus;
    lastSession: string | null;
  }>,
  stageEntries: NoteIndexEntry[],
): StudyStageStatus[] {
  const byNumber = new Map(
    stageEntries
      .map((entry) => [extractStageNumber(entry.name), entry] as const)
      .filter(([number]) => number !== null),
  );

  return stages.map((stage, index) => {
    const matched =
      byNumber.get(stage.number) ??
      stageEntries[index] ??
      stageEntries.find((entry) => entry.name.includes(stage.title));

    return {
      ...stage,
      stageNoteId: matched?.id,
      stageNoteName: matched?.name,
    };
  });
}

function recommendStage(
  stages: StudyStageStatus[],
  currentStageNumber: number | null,
): { number: number; reason: string } {
  if (currentStageNumber !== null) {
    const current = stages.find((stage) => stage.number === currentStageNumber);
    if (current && current.status !== "completed") {
      return {
        number: currentStageNumber,
        reason: "Marked as Current in the Progress table",
      };
    }
  }

  const notStarted = stages.find((stage) => stage.status === "not_started");
  if (notStarted) {
    return {
      number: notStarted.number,
      reason: "First stage not yet started",
    };
  }

  const inProgress = stages.find((stage) => stage.status === "in_progress");
  if (inProgress) {
    return {
      number: inProgress.number,
      reason: "Stage in progress",
    };
  }

  if (stages.length > 0) {
    return {
      number: stages[stages.length - 1].number,
      reason: "All stages complete — revisit or capstone",
    };
  }

  return { number: 1, reason: "Default first stage" };
}

export function resolveStudyProject(
  topic: string | undefined,
  entries: NoteIndexEntry[],
): StudyProjectResolution {
  const trimmedTopic = topic?.trim();

  if (trimmedTopic) {
    const candidates = findLearningProjectCandidates(trimmedTopic, entries);
    if (candidates.length === 1) {
      return { type: "resolved", projectPath: candidates[0].path };
    }

    return { type: "pick", candidates, topic: trimmedTopic };
  }

  const candidates = groupNotesByProjectDirectory(entries).filter((project) =>
    project.path.endsWith("-roadmap"),
  );

  if (candidates.length === 1) {
    return { type: "resolved", projectPath: candidates[0].path };
  }

  if (candidates.length > 1) {
    return { type: "pick", candidates };
  }

  return { type: "none" };
}

export async function buildStudyStatus(
  projectPath: string,
  entries: NoteIndexEntry[],
): Promise<StudyStatus> {
  const projectEntries = filterNotesByDirectory(entries, projectPath);
  const contentsById = new Map<string, string>();

  for (const entry of projectEntries) {
    const relativePath = notePathToRelativeFile(entry.path);
    const parsed = await readNoteFile(relativePath);
    contentsById.set(entry.id, parsed.content.trim());
  }

  const overviewEntry = findOverviewEntry(projectEntries, contentsById);
  if (!overviewEntry) {
    throw new Error(
      `No overview note found in project "${projectPath}". Expected a note with Steps/Etapy section.`,
    );
  }

  const overviewContent = contentsById.get(overviewEntry.id) ?? "";
  const { stages: progressStages, currentStageNumber } =
    parseProgressBlock(overviewContent);
  const hasProgressSection = progressStages.length > 0;

  const fallbackStages = parseStepsFallback(overviewContent).map((stage) => ({
    number: stage.number,
    title: stage.title,
    status: "not_started" as const,
    lastSession: null,
  }));

  const stageEntries = orderStageEntries(projectEntries, overviewEntry.id);
  const baseStages = hasProgressSection ? progressStages : fallbackStages;

  const stages =
    baseStages.length > 0
      ? attachStageNotes(baseStages, stageEntries)
      : attachStageNotes(
          stageEntries.map((entry, index) => ({
            number: extractStageNumber(entry.name) ?? index + 1,
            title: entry.name,
            status: "not_started" as const,
            lastSession: null,
          })),
          stageEntries,
        );

  const recommendation = recommendStage(
    stages,
    hasProgressSection ? currentStageNumber : 1,
  );

  return {
    projectPath,
    overviewNoteId: overviewEntry.id,
    overviewNoteName: overviewEntry.name,
    hasProgressSection,
    currentStageNumber: hasProgressSection ? currentStageNumber : 1,
    stages,
    recommendedStageNumber: recommendation.number,
    recommendedReason: recommendation.reason,
  };
}

export function formatStudyStatus(status: StudyStatus): string {
  const lines = [
    `project_path="${status.projectPath}"`,
    `overview_note_id="${status.overviewNoteId}"`,
    `overview_note_name="${status.overviewNoteName}"`,
    `has_progress_section=${status.hasProgressSection}`,
    `current_stage=${status.currentStageNumber ?? "—"}`,
    `recommended_stage=${status.recommendedStageNumber} (${status.recommendedReason})`,
    "",
    "Stages:",
    ...status.stages.map((stage) => {
      const noteRef = stage.stageNoteId
        ? `note_id="${stage.stageNoteId}"`
        : "note_id=unknown";
      const last = stage.lastSession ?? "—";
      return `  ${stage.number}. ${stage.title} — ${stage.status}, last session: ${last}, ${noteRef}`;
    }),
  ];

  return lines.join("\n");
}

export function formatStudyProjectPicker(
  candidates: LearningProjectCandidate[],
  topic?: string,
): string {
  if (candidates.length === 0) {
    if (topic) {
      return `No matching learning projects found for "${topic}".`;
    }
    return "No learning roadmap projects found.";
  }

  return formatProjectCandidates(candidates);
}
