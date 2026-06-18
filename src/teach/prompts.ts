import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";
import { getConsistentNotesIndex } from "../base/helpers.js";
import {
  findLearningProjectCandidates,
  formatProjectCandidates,
  resolveLearningProjectPath,
} from "./helpers.js";

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
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `I want to learn: ${topic}.

Before building a roadmap, ask me these questions (one round is fine):
- my current experience level with this topic
- how much time per week I can dedicate to learning
- my specific goal (project, certification, career change, curiosity, etc.)
- which parts of this topic matter most to me or feel most interesting to focus on

Based on my answers, propose a learning roadmap as numbered stages with concrete outcomes.
Present the full roadmap and wait for my explicit approval before saving anything.
If I want changes, revise the roadmap first — do not call create_note until I approve.

When I approve, save the roadmap using create_notes and create_note from local-notes-mcp.

Project directory (use for every note in this project):
  path="${projectPath}"

Before saving, call list_notes with path="${projectPath}" to confirm the directory is empty.

For every note, all fields are required except content may be empty string:
- name: non-empty display title (e.g. "Rust roadmap overview", "Stage 2: Ownership")
- description: searchable summary, 1–50 characters (required; count characters and truncate to fit)
- content: markdown body (see structure below)
- path: exactly "${projectPath}" (same for all notes in this project)

Save order (required for correct links — use only TWO tool calls when possible):
1. Call create_notes once with path="${projectPath}" and all step notes in the notes array (one entry per roadmap stage). The response is an array — record each item's metadata.path for linking.
2. Call create_note once for the main overview note, with the Steps section linking to each stage using markdown links built from those metadata.path values, e.g. [Stage 1: Foundations](notes/${projectPath}/stage-1-foundations.md).
3. If you already created the main note by mistake, fix it with update_note once all step notes exist.

Prefer create_notes over repeated create_note calls — it is much faster for multiple notes.

Main note (one per project):
- name: e.g. "${topic} — learning roadmap"
- description: short summary of the whole plan (max 50 chars)
- content sections: Overview, Prerequisites, Steps (numbered markdown links to each step note's metadata.path), Specific topics, Links between steps, Project ideas

Step notes (one per roadmap stage):
- name: stage title (e.g. "Stage 1: Foundations")
- description: stage focus in ≤50 chars
- content sections:
  - Objective
  - Specific topics (each with a short description)
  - Resources
  - Estimated time
  - Success criteria
  - Deliverables
  - Project ideas (concrete mini-projects for this stage)
  - Progress / takeaways (placeholder section for notes I add while learning)`,
            },
          },
        ],
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
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `Find the learning project directory for: ${topic}.

Pre-filtered candidates from the notes index:
${candidateList}

Your task:
1. If one candidate is a clear match, state its path and briefly explain why.
2. If several could match, list the top options and ask me to pick one.
3. If none look right, call list_notes (no path filter) and search note names/descriptions for "${topic}".
4. To inspect a candidate, call list_notes with path set to that directory, then read_note on the main overview note if needed.
5. Reply with the chosen project path in a clear form: project_path="<directory>" (e.g. project_path="rust-roadmap").

Do not create or update notes — only find and report the project path.`,
            },
          },
        ],
      };
    },
  );
}
