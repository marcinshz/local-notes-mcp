import { getConsistentNotesIndex } from "../base/helpers.js";
import {
  buildInterviewPreload,
  formatInterviewPreload,
} from "./interviewContext.js";
import type { LearningProjectCandidate } from "./helpers.js";
import {
  buildStudyStatus,
  formatStudyProjectPicker,
  formatStudyStatus,
  resolveStudyProject,
  type StudyStatus,
} from "./studyStatus.js";

export type ProjectPromptContext =
  | { mode: "no_projects" }
  | { mode: "no_match"; topic: string }
  | {
      mode: "pick_project";
      candidateList: string;
      topic?: string;
    }
  | {
      mode: "ready";
      status: StudyStatus;
      statusSummary: string;
    };

export async function resolveProjectPromptContext(
  topic?: string,
): Promise<ProjectPromptContext> {
  const entries = await getConsistentNotesIndex();
  const resolution = resolveStudyProject(topic, entries);

  if (resolution.type === "none") {
    return { mode: "no_projects" };
  }

  if (resolution.type === "no_match") {
    return { mode: "no_match", topic: resolution.topic };
  }

  if (resolution.type === "pick") {
    return {
      mode: "pick_project",
      candidateList: formatStudyProjectPicker(
        resolution.candidates,
        resolution.topic,
      ),
      topic: resolution.topic,
    };
  }

  const status = await buildStudyStatus(resolution.projectPath, entries);

  return {
    mode: "ready",
    status,
    statusSummary: formatStudyStatus(status),
  };
}

export type MockInterviewPromptContext =
  | Exclude<ProjectPromptContext, { mode: "ready" }>
  | { mode: "ready"; status: StudyStatus; interviewSummary: string };

export async function resolveMockInterviewPromptContext(
  topic?: string,
  stage?: number,
): Promise<MockInterviewPromptContext> {
  const baseContext = await resolveProjectPromptContext(topic);

  if (baseContext.mode !== "ready") {
    return baseContext;
  }

  const entries = await getConsistentNotesIndex();
  const preload = await buildInterviewPreload(
    baseContext.status,
    entries,
    stage,
  );

  return {
    mode: "ready",
    status: baseContext.status,
    interviewSummary: formatInterviewPreload(preload),
  };
}

export type { LearningProjectCandidate, StudyStatus };
