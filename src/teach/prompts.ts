import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";
import { getConsistentNotesIndex } from "../base/helpers.js";
import {
  findLearningProjectCandidates,
  formatProjectCandidates,
  resolveLearningProjectPath,
} from "./helpers.js";
import {
  buildFindLearningProjectMessages,
  buildLearningRoadmapMessages,
  buildMockInterviewMessages,
  buildStartStudyingMessages,
  buildStudyStatusMessages,
} from "./promptMessages.js";
import {
  buildInterviewPreload,
  formatInterviewPreload,
} from "./interviewContext.js";
import {
  buildStudyStatus,
  formatStudyProjectPicker,
  formatStudyStatus,
  resolveStudyProject,
} from "./studyStatus.js";

export function registerTeachPrompts(server: McpServer): void {
  server.registerPrompt(
    "learning_roadmap",
    {
      title: "Build a learning roadmap",
      description:
        "Build a personalized learning plan for a topic and save it as grouped notes",
      argsSchema: {
        topic: z.string().min(1).describe("The topic I want to learn"),
      },
    },
    async ({ topic }) => {
      const entries = await getConsistentNotesIndex();
      const projectPath = resolveLearningProjectPath(topic, entries);

      return {
        messages: buildLearningRoadmapMessages(topic, projectPath),
      };
    },
  );

  server.registerPrompt(
    "find_learning_project",
    {
      title: "Find a learning project",
      description:
        "Find the project directory path for an existing learning roadmap by topic description",
      argsSchema: {
        topic: z
          .string()
          .min(1)
          .describe("Topic or description of the learning project to find"),
      },
    },
    async ({ topic }) => {
      const entries = await getConsistentNotesIndex();
      const candidates = findLearningProjectCandidates(topic, entries);
      const candidateList = formatProjectCandidates(candidates);

      return {
        messages: buildFindLearningProjectMessages(topic, candidateList),
      };
    },
  );

  server.registerPrompt(
    "start_studying",
    {
      title: "Start a study session",
      description:
        "Resume a learning roadmap, get a lesson, and save progress when done",
      argsSchema: {
        topic: z
          .string()
          .optional()
          .describe(
            "Topic or project name (e.g. Python). Leave empty to continue an existing roadmap.",
          ),
      },
    },
    async ({ topic }) => {
      const entries = await getConsistentNotesIndex();
      const resolution = resolveStudyProject(topic, entries);

      if (resolution.type === "none") {
        return {
          messages: buildStartStudyingMessages({ mode: "no_projects" }),
        };
      }

      if (resolution.type === "pick") {
        return {
          messages: buildStartStudyingMessages({
            mode: "pick_project",
            candidateList: formatStudyProjectPicker(
              resolution.candidates,
              resolution.topic,
            ),
            topic: resolution.topic,
          }),
        };
      }

      const status = await buildStudyStatus(resolution.projectPath, entries);

      return {
        messages: buildStartStudyingMessages({
          mode: "ready",
          statusSummary: formatStudyStatus(status),
        }),
      };
    },
  );

  server.registerPrompt(
    "study_status",
    {
      title: "Learning progress",
      description:
        "Quick summary of where you are in a learning roadmap — no teaching",
      argsSchema: {
        topic: z
          .string()
          .optional()
          .describe(
            "Topic or project name (e.g. Python). Leave empty for your roadmap.",
          ),
      },
    },
    async ({ topic }) => {
      const entries = await getConsistentNotesIndex();
      const resolution = resolveStudyProject(topic, entries);

      if (resolution.type === "none") {
        return {
          messages: buildStudyStatusMessages({ mode: "no_projects" }),
        };
      }

      if (resolution.type === "pick") {
        return {
          messages: buildStudyStatusMessages({
            mode: "pick_project",
            candidateList: formatStudyProjectPicker(
              resolution.candidates,
              resolution.topic,
            ),
            topic: resolution.topic,
          }),
        };
      }

      const status = await buildStudyStatus(resolution.projectPath, entries);

      return {
        messages: buildStudyStatusMessages({
          mode: "ready",
          statusSummary: formatStudyStatus(status),
        }),
      };
    },
  );

  server.registerPrompt(
    "mock_interview",
    {
      title: "Mock interview",
      description:
        "Practice interview questions from your roadmap — debrief at the end",
      argsSchema: {
        topic: z
          .string()
          .optional()
          .describe(
            "Topic or project name (e.g. Python). Leave empty for your roadmap.",
          ),
        stage: z.coerce
          .number()
          .int()
          .positive()
          .optional()
          .describe(
            "Stage number to interview on. Leave empty for the default stage.",
          ),
      },
    },
    async ({ topic, stage }) => {
      const entries = await getConsistentNotesIndex();
      const resolution = resolveStudyProject(topic, entries);

      if (resolution.type === "none") {
        return {
          messages: buildMockInterviewMessages({ mode: "no_projects" }),
        };
      }

      if (resolution.type === "pick") {
        return {
          messages: buildMockInterviewMessages({
            mode: "pick_project",
            candidateList: formatStudyProjectPicker(
              resolution.candidates,
              resolution.topic,
            ),
            topic: resolution.topic,
          }),
        };
      }

      const status = await buildStudyStatus(resolution.projectPath, entries);
      const preload = await buildInterviewPreload(status, entries, stage);

      return {
        messages: buildMockInterviewMessages({
          mode: "ready",
          interviewSummary: formatInterviewPreload(preload),
        }),
      };
    },
  );
}
