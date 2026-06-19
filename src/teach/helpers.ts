import {
  noteDirectoryFromMetadataPath,
  slugify,
} from "../shared/helpers.js";
import {
  normalizeNoteDirectory,
  type NoteIndexEntry,
} from "../base/helpers.js";

function collectUsedDirectories(entries: NoteIndexEntry[]): Set<string> {
  const used = new Set<string>();
  for (const entry of entries) {
    const directory = noteDirectoryFromMetadataPath(entry.path);
    if (directory) {
      used.add(directory);
    }
  }
  return used;
}

export function resolveLearningProjectPath(
  topic: string,
  entries: NoteIndexEntry[],
): string {
  const base = normalizeNoteDirectory(slugify(`${topic}-roadmap`));
  const used = collectUsedDirectories(entries);

  if (!used.has(base)) {
    return base;
  }

  for (let suffix = 2; suffix < 100; suffix++) {
    const candidate = normalizeNoteDirectory(`${base}-${suffix}`);
    if (!used.has(candidate)) {
      return candidate;
    }
  }

  return normalizeNoteDirectory(`${base}-${Date.now()}`);
}

export type LearningProjectCandidate = {
  path: string;
  noteCount: number;
  noteNames: string[];
  descriptions: string[];
};

export function groupNotesByProjectDirectory(
  entries: NoteIndexEntry[],
): LearningProjectCandidate[] {
  const projects = new Map<string, LearningProjectCandidate>();

  for (const entry of entries) {
    const directory = noteDirectoryFromMetadataPath(entry.path);
    if (!directory) {
      continue;
    }

    const existing = projects.get(directory) ?? {
      path: directory,
      noteCount: 0,
      noteNames: [],
      descriptions: [],
    };

    existing.noteCount += 1;
    existing.noteNames.push(entry.name);
    existing.descriptions.push(entry.description);
    projects.set(directory, existing);
  }

  return [...projects.values()].sort((a, b) => a.path.localeCompare(b.path));
}

function scoreProjectMatch(
  project: LearningProjectCandidate,
  topic: string,
  topicSlug: string,
): number {
  const topicLower = topic.toLowerCase();
  const topicWords = topicLower.split(/\s+/).filter((word) => word.length > 2);
  let score = 0;

  if (project.path === topicSlug || project.path === `${topicSlug}-roadmap`) {
    score += 20;
  } else if (project.path.includes(topicSlug)) {
    score += 10;
  }

  if (project.path.endsWith("-roadmap") && score > 0) {
    score += 2;
  }

  for (const word of topicWords) {
    if (project.path.includes(word)) {
      score += 3;
    }

    for (const name of project.noteNames) {
      if (name.toLowerCase().includes(word)) {
        score += 2;
      }
    }

    for (const description of project.descriptions) {
      if (description.toLowerCase().includes(word)) {
        score += 1;
      }
    }
  }

  if (topicLower.length > 2) {
    for (const name of project.noteNames) {
      if (name.toLowerCase().includes(topicLower)) {
        score += 4;
      }
    }
  }

  return score;
}

export function findLearningProjectCandidates(
  topic: string,
  entries: NoteIndexEntry[],
): LearningProjectCandidate[] {
  const topicSlug = slugify(topic);

  return groupNotesByProjectDirectory(entries)
    .map((project) => ({
      project,
      score: scoreProjectMatch(project, topic, topicSlug),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.project.path.localeCompare(b.project.path))
    .map(({ project }) => project);
}

export function formatProjectCandidates(
  candidates: LearningProjectCandidate[],
): string {
  if (candidates.length === 0) {
    return "No matching project directories found.";
  }

  return candidates
    .map((candidate) => {
      const preview = candidate.noteNames.slice(0, 3).join(", ");
      const suffix =
        candidate.noteNames.length > 3
          ? ` (+${candidate.noteNames.length - 3} more)`
          : "";
      return `- path="${candidate.path}" (${candidate.noteCount} notes: ${preview}${suffix})`;
    })
    .join("\n");
}
