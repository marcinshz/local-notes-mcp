export function buildLearningRoadmapMessages(
  topic: string,
  projectPath: string,
) {
  return [
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
- how I prefer to learn — e.g. reading, worked examples, hands-on tasks, Q&A dialog, or a mix (describe what works best for me)

Based on my answers, propose a learning roadmap as numbered stages with concrete outcomes, shaped to match my preferred learning style.
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
- content sections: Overview, Prerequisites, Steps (numbered markdown links to each step note's metadata.path), Progress, Specific topics, Links between steps, Project ideas

Progress section (required — source of truth for overall stage status; place after Steps):
- Heading: ## Progress
- A markdown table with one row per roadmap stage (same order and count as Steps), columns exactly:
  | # | Stage | Status | Last session |
- Status values (use only these four, lowercase): not_started | in_progress | completed | skipped
- Last session: ISO date (YYYY-MM-DD) when a study session touched that stage, or — if never
- Stage column: short stage title only (no markdown links)
- After the table, one line: **Current:** N (stage number to focus on next; initialize to 1)
- When creating a new roadmap, set every row to not_started and Last session to —

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
  - Progress / takeaways (session journal — detailed notes from each study session; leave empty at creation; do not use this section to track overall stage status — that lives in the main note Progress table)`,
      },
    },
  ];
}

export function buildFindLearningProjectMessages(
  topic: string,
  candidateList: string,
) {
  return [
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
  ];
}

export type StartStudyingContext =
  | { mode: "ready"; statusSummary: string }
  | { mode: "pick_project"; candidateList: string; topic?: string }
  | { mode: "no_projects" };

export function buildStartStudyingMessages(context: StartStudyingContext) {
  const preamble =
    context.mode === "no_projects"
      ? `I want to start a study session, but no learning roadmap projects were found.

Tell me to run the learning_roadmap prompt first to create a plan, then try again.`
      : context.mode === "pick_project"
        ? `I want to start a study session${context.topic ? ` for: ${context.topic}` : ""}.

Pre-filtered learning project candidates:
${context.candidateList}

Phase 1 — Resolve project (do this first):
1. If one candidate is a clear match, confirm project_path="<directory>" and continue to Phase 2.
2. If several could match, list the top options and ask me to pick one — do not teach until I confirm.
3. If none look right, call list_notes (no path filter) or with path filters, then read_note on overview notes as needed.
4. Once project_path is confirmed, call read_note on the overview note (id from list_notes) to load the ## Progress table, then continue to Phase 2.`
        : `I want to start a study session.

Pre-resolved project status (from the overview note — do not re-discover unless I correct it):
${context.statusSummary}

project_path is confirmed. Skip Phase 1 discovery and go straight to Phase 2.`;

  return [
    {
      role: "user" as const,
      content: {
        type: "text" as const,
        text: `${preamble}

Phase 2 — Status summary and lesson proposal (wait for my approval):
Reply with:
1. A short status summary (3–5 bullets): project, current focus, what's done vs open.
2. A recommended lesson: stage number and title, objective, 2–3 topics, estimated time (from the stage note after you read it).
3. Alternatives: up to 2 other stages I could pick, or a custom focus within a stage.
4. End with: reply **start**, **pick N**, or **custom: …** — do not begin teaching until I confirm.

When I confirm, call read_note on the chosen stage note (use note_id from the status above) before teaching.

Phase 3 — Teach (interactive, no writes):
- Teach from the stage note: Objective → Specific topics → Success criteria → Deliverables / project ideas as appropriate.
- Use short chunks, questions, and mini exercises matched to my answers.
- Offer hints before full answers if I seem stuck.
- Do not call update_note during teaching.
- Stop when success criteria are reasonably met or I say "wrap up" / "end session".

Phase 4 — Wrap-up and save (only with my explicit confirmation):
1. Summarize the session as a markdown block for the stage note's ## Progress / takeaways section:

### YYYY-MM-DD — Session
- Covered: ...
- Takeaways: ...
- Still unclear: ...
- Next: ...

2. Show the exact markdown you will append to the stage note AND the Progress table row changes for the overview note.
3. Ask: "Save this progress? (yes / edit / no)"
4. Only on **yes**:
   a. update_note on the stage note (note_id from status) — append the session block to ## Progress / takeaways.
   b. update_note on the overview note (overview_note_id from status) — update only the Progress table row for this stage (Status, Last session) and **Current:** if the next stage should change.
5. Progress table rules (overview note):
   - Status values: not_started | in_progress | completed | skipped
   - Last session: today's date (YYYY-MM-DD) for the stage we studied
   - Set status to in_progress when we studied but did not finish; completed when success criteria were met
   - Update **Current:** to the next not_started stage when a stage is completed
6. If I say edit, revise and ask again. If no, do not write anything.`,
      },
    },
  ];
}
