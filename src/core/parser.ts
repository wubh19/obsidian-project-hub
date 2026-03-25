import { App, TFile } from "obsidian";
import {
  ProjectRecord,
  RoadmapRecord,
  TaskRecord,
  VersionRecord
} from "../types";

export interface ParsedMarkdownFile {
  project: ProjectRecord | null;
  version: VersionRecord | null;
  roadmap: RoadmapRecord | null;
  tasks: TaskRecord[];
}

interface FrontmatterLike {
  [key: string]: unknown;
}

function parseFrontmatterFromContent(content: string): FrontmatterLike | undefined {
  if (!content.startsWith("---")) {
    return undefined;
  }

  const lines = content.split(/\r?\n/);
  if (lines[0].trim() !== "---") {
    return undefined;
  }

  const frontmatter: FrontmatterLike = {};
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === "---") {
      return frontmatter;
    }

    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) {
      continue;
    }

    const key = match[1];
    const value = match[2].trim().replace(/^['"]|['"]$/g, "");
    frontmatter[key] = value;
  }

  return undefined;
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function inferProjectFromPath(filePath: string): string | undefined {
  const normalizedPath = filePath.replace(/\\/g, "/");
  const segments = normalizedPath.split("/");
  const projectsIndex = segments.findIndex((segment) => segment === "Projects");
  if (projectsIndex === -1 || projectsIndex + 1 >= segments.length) {
    return undefined;
  }

  return segments[projectsIndex + 1];
}

function resolveProject(frontmatter: FrontmatterLike, file: TFile): string | undefined {
  return normalizeString(frontmatter.project)
    ?? normalizeString(frontmatter.name)
    ?? inferProjectFromPath(file.path);
}

function getTitleFromBody(content: string, file: TFile): string {
  const heading = content
    .split(/\r?\n/)
    .find((line) => line.trim().startsWith("# "));

  return heading ? heading.replace(/^#\s+/, "").trim() : file.basename;
}

function getTaskText(content: string, file: TFile): string {
  const lines = content.split(/\r?\n/);
  const checkboxLine = lines.find((line) => /^\s*- \[[ xX]\]\s+/.test(line));
  if (checkboxLine) {
    return checkboxLine.replace(/^\s*- \[[ xX]\]\s+/, "").trim();
  }

  const firstContentLine = lines.find((line) => line.trim().length > 0 && !line.trim().startsWith("---"));
  return firstContentLine?.trim() || file.basename;
}

function getRoadmapTable(content: string): string {
  return content
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith("|"))
    .join("\n");
}

function stripFrontmatter(content: string): { body: string; startLine: number } {
  if (!content.startsWith("---")) {
    return { body: content, startLine: 1 };
  }

  const lines = content.split(/\r?\n/);
  let delimiterCount = 0;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() === "---") {
      delimiterCount += 1;
      if (delimiterCount === 2) {
        return {
          body: lines.slice(index + 1).join("\n"),
          startLine: index + 2
        };
      }
    }
  }

  return { body: content, startLine: 1 };
}

function extractOwner(text: string): string | undefined {
  return text.match(/@([^\s🔥⚠️🚧📅]+)/u)?.[1]?.trim();
}

function extractPriority(text: string): string {
  if (text.includes("🔥")) {
    return "high";
  }
  if (text.includes("⚠️")) {
    return "medium";
  }
  return "normal";
}

function extractDue(text: string): string | undefined {
  return text.match(/📅(\d{4}-\d{2}-\d{2})/)?.[1];
}

function extractTaskTitle(text: string): string {
  return text
    .replace(/@([^\s🔥⚠️🚧📅]+)/gu, "")
    .replace(/[🔥⚠️🚧]/gu, "")
    .replace(/📅\d{4}-\d{2}-\d{2}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseChecklistTasks(
  content: string,
  file: TFile,
  project: string,
  sourceType: "version-task" | "ops-task",
  source: string,
  version?: string
): TaskRecord[] {
  const { body, startLine } = stripFrontmatter(content);
  const tasks: TaskRecord[] = [];
  const lines = body.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(/^\s*-\s\[([ xX])\]\s+(.+)$/);
    if (!match) {
      continue;
    }

    const rawText = match[2].trim();
    const done = match[1].toLowerCase() === "x";
    const status = done ? "done" : rawText.includes("🚧") ? "doing" : "todo";
    const title = extractTaskTitle(rawText);

    tasks.push({
      id: `${file.path}#L${startLine + index}`,
      type: "task",
      filePath: file.path,
      title,
      modifiedTime: file.stat.mtime,
      project,
      version,
      owner: extractOwner(rawText),
      priority: extractPriority(rawText),
      status,
      due: extractDue(rawText),
      source,
      sourceType,
      lineNumber: startLine + index,
      rawText,
      text: title
    });
  }

  return tasks;
}

function parseProject(frontmatter: FrontmatterLike, file: TFile, content: string): ProjectRecord | null {
  const project = resolveProject(frontmatter, file);
  if (!project) {
    return null;
  }

  return {
    type: "project",
    filePath: file.path,
    title: getTitleFromBody(content, file),
    modifiedTime: file.stat.mtime,
    project,
    owner: normalizeString(frontmatter.owner),
    status: normalizeString(frontmatter.status),
    start: normalizeString(frontmatter.start),
    end: normalizeString(frontmatter.end)
  };
}

function parseVersion(frontmatter: FrontmatterLike, file: TFile, content: string): VersionRecord | null {
  const project = resolveProject(frontmatter, file);
  const version = normalizeString(frontmatter.version);
  if (!project || !version) {
    return null;
  }

  return {
    type: "version",
    filePath: file.path,
    title: getTitleFromBody(content, file),
    modifiedTime: file.stat.mtime,
    project,
    version,
    status: normalizeString(frontmatter.status),
    start: normalizeString(frontmatter.start),
    end: normalizeString(frontmatter.end),
    releaseDate: normalizeString(frontmatter.release_date) ?? normalizeString(frontmatter.end)
  };
}

function parseTask(frontmatter: FrontmatterLike, file: TFile, content: string): TaskRecord | null {
  const project = resolveProject(frontmatter, file);
  if (!project) {
    return null;
  }

  const status = normalizeString(frontmatter.status) ?? "todo";
  const taskTitle = normalizeString(frontmatter.title) ?? getTitleFromBody(content, file);
  const taskText = normalizeString(frontmatter.title) ?? getTaskText(content, file);

  return {
    id: `${file.path}#legacy-task`,
    type: "task",
    filePath: file.path,
    title: taskTitle,
    modifiedTime: file.stat.mtime,
    project,
    version: normalizeString(frontmatter.version),
    owner: normalizeString(frontmatter.owner),
    priority: normalizeString(frontmatter.priority),
    status,
    start: normalizeString(frontmatter.start),
    due: normalizeString(frontmatter.due),
    source: normalizeString(frontmatter.version) ?? "legacy-task",
    sourceType: normalizeString(frontmatter.version) ? "version-task" : "ops-task",
    lineNumber: 1,
    rawText: taskText,
    text: taskText
  };
}

function parseRoadmap(frontmatter: FrontmatterLike, file: TFile, content: string): RoadmapRecord | null {
  const project = resolveProject(frontmatter, file);
  if (!project) {
    return null;
  }

  return {
    type: "roadmap",
    filePath: file.path,
    title: getTitleFromBody(content, file),
    modifiedTime: file.stat.mtime,
    project,
    markdownTable: getRoadmapTable(content)
  };
}

export async function parseMarkdownFile(app: App, file: TFile): Promise<ParsedMarkdownFile> {
  const content = await app.vault.cachedRead(file);
  const frontmatter = parseFrontmatterFromContent(content);

  if (!frontmatter) {
    return {
      project: null,
      version: null,
      roadmap: null,
      tasks: []
    };
  }

  const type = normalizeString(frontmatter.type)?.toLowerCase();
  if (!type) {
    return {
      project: null,
      version: null,
      roadmap: null,
      tasks: []
    };
  }
  const project = resolveProject(frontmatter, file);

  switch (type) {
    case "project":
      return {
        project: parseProject(frontmatter, file, content),
        version: null,
        roadmap: null,
        tasks: []
      };
    case "version":
      if (!project) {
        return { project: null, version: null, roadmap: null, tasks: [] };
      }
      const versionRecord = parseVersion(frontmatter, file, content);
      return {
        project: null,
        version: versionRecord,
        roadmap: null,
        tasks: versionRecord
          ? parseChecklistTasks(content, file, project, "version-task", versionRecord.version, versionRecord.version)
          : []
      };
    case "ops":
      if (!project) {
        return { project: null, version: null, roadmap: null, tasks: [] };
      }
      return {
        project: null,
        version: null,
        roadmap: null,
        tasks: parseChecklistTasks(content, file, project, "ops-task", "运维")
      };
    case "task":
      return {
        project: null,
        version: null,
        roadmap: null,
        tasks: project ? [parseTask(frontmatter, file, content)].filter((task): task is TaskRecord => Boolean(task)) : []
      };
    case "roadmap":
      return {
        project: null,
        version: null,
        roadmap: parseRoadmap(frontmatter, file, content),
        tasks: []
      };
    default:
      return {
        project: null,
        version: null,
        roadmap: null,
        tasks: []
      };
  }
}