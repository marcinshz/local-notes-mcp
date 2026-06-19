import { readNoteFile, type NoteIndexEntry } from "../base/helpers.js";
import { notePathToRelativeFile } from "../shared/helpers.js";
import type { StudyStageStatus, StudyStatus } from "./studyStatus.js";

const INTERVIEW_SECTIONS = [
  "Specific topics",
  "Success criteria",
  "Deliverables",
  "Progress / takeaways",
] as const;

export type InterviewPreload = {
  status: StudyStatus;
  defaultStageNumber: number;
  defaultStage: StudyStageStatus;
  stageBrief: string;
  eligibleStages: StudyStageStatus[];
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractMarkdownSection(content: string, sectionName: string): string {
  const headingMatch = content.match(
    new RegExp(`^## ${escapeRegExp(sectionName)}\\s*$`, "im"),
  );
  if (!headingMatch || headingMatch.index === undefined) {
    return "";
  }

  const afterHeading = content.slice(
    headingMatch.index + headingMatch[0].length,
  );
  const nextSection = afterHeading.search(/^## /m);
  return (
    nextSection === -1 ? afterHeading : afterHeading.slice(0, nextSection)
  ).trim();
}

export function resolveInterviewStageNumber(
  status: StudyStatus,
  requestedStage?: number,
): number {
  if (requestedStage !== undefined) {
    const found = status.stages.find((stage) => stage.number === requestedStage);
    if (found) {
      return requestedStage;
    }
  }

  const inProgress = status.stages.filter(
    (stage) => stage.status === "in_progress",
  );
  if (inProgress.length > 0) {
    return inProgress[inProgress.length - 1].number;
  }

  const completed = status.stages.filter((stage) => stage.status === "completed");
  if (completed.length > 0) {
    return completed[completed.length - 1].number;
  }

  if (status.currentStageNumber !== null) {
    const current = status.stages.find(
      (stage) => stage.number === status.currentStageNumber,
    );
    if (current && current.status !== "not_started") {
      return status.currentStageNumber;
    }
  }

  return status.recommendedStageNumber;
}

export function getInterviewEligibleStages(
  status: StudyStatus,
): StudyStageStatus[] {
  return status.stages.filter(
    (stage) =>
      stage.status === "completed" ||
      stage.status === "in_progress" ||
      stage.status === "skipped",
  );
}

function formatStageInterviewBrief(
  content: string,
  stage: StudyStageStatus,
): string {
  const lines = [
    `Stage ${stage.number}: ${stage.title} (status: ${stage.status})`,
    `note_id="${stage.stageNoteId ?? "unknown"}"`,
    "",
  ];

  for (const section of INTERVIEW_SECTIONS) {
    const body = extractMarkdownSection(content, section);
    if (body) {
      lines.push(`### ${section}`, body, "");
    }
  }

  return lines.join("\n").trim();
}

async function loadStageBrief(
  stage: StudyStageStatus,
  entries: NoteIndexEntry[],
): Promise<string> {
  if (!stage.stageNoteId) {
    return `Stage ${stage.number}: ${stage.title} (no note id)`;
  }

  const entry = entries.find((item) => item.id === stage.stageNoteId);
  if (!entry) {
    return `Stage ${stage.number}: ${stage.title} (note not found)`;
  }

  const parsed = await readNoteFile(notePathToRelativeFile(entry.path));
  return formatStageInterviewBrief(parsed.content.trim(), stage);
}

export async function buildInterviewPreload(
  status: StudyStatus,
  entries: NoteIndexEntry[],
  requestedStage?: number,
): Promise<InterviewPreload> {
  const defaultStageNumber = resolveInterviewStageNumber(status, requestedStage);
  const defaultStage = status.stages.find(
    (stage) => stage.number === defaultStageNumber,
  );

  if (!defaultStage) {
    throw new Error(`Stage ${defaultStageNumber} not found in project status.`);
  }

  const eligibleStages = getInterviewEligibleStages(status);
  const stageBrief = await loadStageBrief(defaultStage, entries);

  return {
    status,
    defaultStageNumber,
    defaultStage,
    stageBrief,
    eligibleStages,
  };
}

export function formatInterviewPreload(preload: InterviewPreload): string {
  const eligibleSummary =
    preload.eligibleStages.length > 0
      ? preload.eligibleStages
          .map(
            (stage) =>
              `${stage.number} (${stage.status}): ${stage.title}, note_id="${stage.stageNoteId ?? "unknown"}"`,
          )
          .join("\n  ")
      : "none — no stages started yet";

  const defaultIsEligible = preload.eligibleStages.some(
    (stage) => stage.number === preload.defaultStageNumber,
  );

  return [
    `project_path="${preload.status.projectPath}"`,
    `overview_note_id="${preload.status.overviewNoteId}"`,
    `default_interview_stage=${preload.defaultStageNumber}`,
    `default_stage_eligible=${defaultIsEligible}`,
    "",
    "Eligible stages for interview (completed / in_progress / skipped):",
    `  ${eligibleSummary}`,
    "",
    "Default stage material (questions must come only from this plan content):",
    preload.stageBrief,
  ].join("\n");
}
