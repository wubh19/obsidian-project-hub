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

interface ResolvedProjectInfo {
  project?: string;
  projectPath?: string;
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

function inferProjectFromPath(filePath: string): ResolvedProjectInfo {
  const normalizedPath = filePath.replace(/\\/g, "/");
  const segments = normalizedPath.split("/").filter((segment) => segment.length > 0);
  const projectsIndex = segments.findIndex((segment) => segment === "Projects");
  if (projectsIndex !== -1 && projectsIndex + 1 < segments.length) {
    return {
      project: segments[projectsIndex + 1],
      projectPath: segments.slice(0, projectsIndex + 2).join("/")
    };
  }

  const containerIndex = segments.findIndex(
    (segment, index) => index > 0 && ["Versions", "Docs"].includes(segment)
  );
  if (containerIndex !== -1) {
    return {
      project: segments[containerIndex - 1],
      projectPath: segments.slice(0, containerIndex).join("/")
    };
  }

  const fileName = segments[segments.length - 1] ?? "";
  if (/^(00_Project|01_Roadmap)\.md$/i.test(fileName) && segments.length >= 2) {
    return {
      project: segments[segments.length - 2],
      projectPath: segments.slice(0, -1).join("/")
    };
  }

  return {};
}

function resolveProject(frontmatter: FrontmatterLike, file: TFile): ResolvedProjectInfo {
  const inferred = inferProjectFromPath(file.path);
  return {
    project: normalizeString(frontmatter.project)
      ?? normalizeString(frontmatter.name)
      ?? inferred.project,
    projectPath: inferred.projectPath
  };
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
  return text.match(/@([^\s🔥⚠️🚧📅✅⏱]+)/u)?.[1]?.trim();
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
  return text.match(/📅\s*(\d{4}-\d{2}-\d{2})/)?.[1];
}

function extractCompleted(text: string): string | undefined {
  return text.match(/✅\s*(\d{4}-\d{2}-\d{2})/)?.[1];
}

function extractEffort(text: string): number | undefined {
  const match = text.match(/⏱(?:️)?\s*([\d.]+)h/i);
  return match ? parseFloat(match[1]) : undefined;
}

function extractStartTime(text: string): string | undefined {
  return text.match(/🗓\s*(\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2})?)/)?.[1]?.trim();
}

function extractEndTime(text: string): string | undefined {
  return text.match(/🏁\s*(\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2})?)/)?.[1]?.trim();
}

function extractRemark(text: string): string | undefined {
  const match = text.match(/💬\s*([^🗓🏁📅✅⏱@🔥⚠️🚧]+)/u);
  const value = match?.[1]?.trim();
  return value && value.length > 0 ? value : undefined;
}

export function parseWorkload(input: string): number | undefined {
  const trimmed = input.trim();
  if (!trimmed) {
    return undefined;
  }

  const chineseNumbers: Record<string, number> = {
    "一": 1, "二": 2, "两": 2, "三": 3, "四": 4,
    "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10
  };

  if (trimmed === "半天") {
    return 3.75;
  }

  for (const [ch, num] of Object.entries(chineseNumbers)) {
    if (trimmed === `${ch}天`) {
      return num * 7.5;
    }
    if (trimmed === `${ch}小时` || trimmed === `${ch}个小时`) {
      return num;
    }
  }

  const dayMatch = trimmed.match(/^([\d.]+)\s*(?:d(?:ay)?s?|天)$/i);
  if (dayMatch) {
    return parseFloat(dayMatch[1]) * 7.5;
  }

  const hourMatch = trimmed.match(/^([\d.]+)\s*(?:h(?:our)?s?|小时)$/i);
  if (hourMatch) {
    return parseFloat(hourMatch[1]);
  }

  return undefined;
}

export function computeEndDatetime(startStr: string, effortHours: number): string {
  let startMs: number;
  if (/^\d{4}-\d{2}-\d{2}$/.test(startStr)) {
    startMs = new Date(`${startStr}T09:00:00`).getTime();
  } else if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(startStr)) {
    startMs = new Date(`${startStr.replace(" ", "T")}:00`).getTime();
  } else {
    return startStr;
  }

  const endDate = new Date(startMs + effortHours * 3600 * 1000);
  const y = endDate.getFullYear();
  const mo = String(endDate.getMonth() + 1).padStart(2, "0");
  const d = String(endDate.getDate()).padStart(2, "0");
  const h = String(endDate.getHours()).padStart(2, "0");
  const min = String(endDate.getMinutes()).padStart(2, "0");
  return `${y}-${mo}-${d} ${h}:${min}`;
}

function extractTaskTitle(text: string): string {
  return text
    .replace(/@([^\s🔥⚠️🚧📅✅⏱🗓🏁💬]+)/gu, "")
    .replace(/[🔥⚠️🚧]/gu, "")
    .replace(/📅\s*\d{4}-\d{2}-\d{2}/g, "")
    .replace(/✅\s*\d{4}-\d{2}-\d{2}/g, "")
    .replace(/⏱(?:️)?\s*[\d.]+h/gi, "")
    .replace(/🗓\s*\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2})?/g, "")
    .replace(/🏁\s*\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2})?/g, "")
    .replace(/💬[^]*$/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseChecklistTasks(
  content: string,
  file: TFile,
  project: string,
  projectPath: string,
  sourceType: "version-task",
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
    const status = done
      ? "done"
      : rawText.includes("🚧")
        ? "in-progress"
        : "todo";
    const title = extractTaskTitle(rawText);

    tasks.push({
      id: `${file.path}#L${startLine + index}`,
      type: "task",
      filePath: file.path,
      title,
      modifiedTime: file.stat.mtime,
      project,
      projectPath,
      version,
      owner: extractOwner(rawText),
      priority: extractPriority(rawText),
      status,
      start: extractStartTime(rawText),
      endTime: extractEndTime(rawText),
      due: extractDue(rawText),
      completed: extractCompleted(rawText),
      effort: extractEffort(rawText),
      remark: extractRemark(rawText),
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
  const projectInfo = resolveProject(frontmatter, file);
  if (!projectInfo.project || !projectInfo.projectPath) {
    return null;
  }

  return {
    type: "project",
    filePath: file.path,
    title: getTitleFromBody(content, file),
    modifiedTime: file.stat.mtime,
    project: projectInfo.project,
    projectPath: projectInfo.projectPath,
    owner: normalizeString(frontmatter.owner),
    status: normalizeString(frontmatter.status),
    start: normalizeString(frontmatter.start),
    end: normalizeString(frontmatter.end)
  };
}

function parseVersion(frontmatter: FrontmatterLike, file: TFile, content: string): VersionRecord | null {
  const projectInfo = resolveProject(frontmatter, file);
  const version = normalizeString(frontmatter.item) ?? normalizeString(frontmatter.version);
  if (!projectInfo.project || !projectInfo.projectPath || !version) {
    return null;
  }

  const effortRaw = normalizeString(frontmatter.effort);
  const effort = effortRaw ? parseFloat(effortRaw) : undefined;

  return {
    type: "version",
    filePath: file.path,
    title: getTitleFromBody(content, file),
    modifiedTime: file.stat.mtime,
    project: projectInfo.project,
    projectPath: projectInfo.projectPath,
    version,
    status: normalizeString(frontmatter.status),
    start: normalizeString(frontmatter.start),
    end: normalizeString(frontmatter.end),
    releaseDate: normalizeString(frontmatter.release_date) ?? normalizeString(frontmatter.end),
    effort: Number.isFinite(effort) ? effort : undefined
  };
}

function parseTask(frontmatter: FrontmatterLike, file: TFile, content: string): TaskRecord | null {
  const projectInfo = resolveProject(frontmatter, file);
  if (!projectInfo.project || !projectInfo.projectPath) {
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
    project: projectInfo.project,
    projectPath: projectInfo.projectPath,
    version: normalizeString(frontmatter.item) ?? normalizeString(frontmatter.version),
    owner: normalizeString(frontmatter.owner),
    priority: normalizeString(frontmatter.priority),
    status,
    start: normalizeString(frontmatter.start),
    endTime: normalizeString(frontmatter.endTime) ?? normalizeString(frontmatter.end_time),
    due: normalizeString(frontmatter.due),
    effort: (() => { const v = normalizeString(frontmatter.effort); return v ? parseFloat(v) : undefined; })(),
    remark: normalizeString(frontmatter.remark),
    source: normalizeString(frontmatter.item) ?? normalizeString(frontmatter.version) ?? "legacy-task",
    sourceType: (normalizeString(frontmatter.item) ?? normalizeString(frontmatter.version)) ? "version-task" : "task-file",
    lineNumber: 1,
    rawText: taskText,
    text: taskText
  };
}

function parseRoadmap(frontmatter: FrontmatterLike, file: TFile, content: string): RoadmapRecord | null {
  const projectInfo = resolveProject(frontmatter, file);
  if (!projectInfo.project || !projectInfo.projectPath) {
    return null;
  }

  return {
    type: "roadmap",
    filePath: file.path,
    title: getTitleFromBody(content, file),
    modifiedTime: file.stat.mtime,
    project: projectInfo.project,
    projectPath: projectInfo.projectPath,
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
  const projectInfo = resolveProject(frontmatter, file);

  switch (type) {
    case "project":
      return {
        project: parseProject(frontmatter, file, content),
        version: null,
        roadmap: null,
        tasks: []
      };
    case "version":
      if (!projectInfo.project) {
        return { project: null, version: null, roadmap: null, tasks: [] };
      }
      const versionRecord = parseVersion(frontmatter, file, content);
      return {
        project: null,
        version: versionRecord,
        roadmap: null,
        tasks: versionRecord
          ? parseChecklistTasks(
            content,
            file,
            versionRecord.project,
            versionRecord.projectPath,
            "version-task",
            versionRecord.version,
            versionRecord.version
          )
          : []
      };
    case "task":
      return {
        project: null,
        version: null,
        roadmap: null,
        tasks: projectInfo.project
          ? [parseTask(frontmatter, file, content)].filter((task): task is TaskRecord => Boolean(task))
          : []
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