import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";
import { getConsistentNotesIndex } from "../base/helpers.js";
import { resolveLearningProjectPath } from "./helpers.js";

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

When I approve, save the roadmap using create_note from local-notes-mcp.

Project directory (use for every note in this project):
  path="${projectPath}"

If I say I'm continuing an existing roadmap for this topic, call list_notes first and ask which directory to use instead of creating a new one. Otherwise always use path="${projectPath}".

Before saving, call list_notes once to confirm the target directory.

For every create_note call, all fields are required except content may be empty string:
- name: non-empty display title (e.g. "Rust roadmap overview", "Stage 2: Ownership")
- description: searchable summary, 1–50 characters (required; truncate if needed)
- content: markdown body (see structure below)
- path: exactly "${projectPath}" (same for all notes in this project)

Main note (one per project):
- name: e.g. "${topic} — learning roadmap"
- description: short summary of the whole plan (max 50 chars)
- content sections: Overview, Prerequisites, Steps (numbered list with links to step notes), Specific topics, Links between steps, Project ideas

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
  - Progress / takeaways (placeholder section for notes I add while learning)

Create the main note first, then one note per stage, all in path="${projectPath}".`,
            },
          },
        ],
      };
    },
  );
}
