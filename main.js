"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => ProjectHubPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian3 = require("obsidian");

// src/core/parser.ts
function parseFrontmatterFromContent(content) {
  if (!content.startsWith("---")) {
    return void 0;
  }
  const lines = content.split(/\r?\n/);
  if (lines[0].trim() !== "---") {
    return void 0;
  }
  const frontmatter = {};
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
  return void 0;
}
function normalizeString(value) {
  if (typeof value !== "string") {
    return void 0;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : void 0;
}
function inferProjectFromPath(filePath) {
  var _a;
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
    (segment, index) => index > 0 && ["Versions", "Ops", "Docs"].includes(segment)
  );
  if (containerIndex !== -1) {
    return {
      project: segments[containerIndex - 1],
      projectPath: segments.slice(0, containerIndex).join("/")
    };
  }
  const fileName = (_a = segments[segments.length - 1]) != null ? _a : "";
  if (/^(00_Project|01_Roadmap)\.md$/i.test(fileName) && segments.length >= 2) {
    return {
      project: segments[segments.length - 2],
      projectPath: segments.slice(0, -1).join("/")
    };
  }
  return {};
}
function resolveProject(frontmatter, file) {
  var _a, _b;
  const inferred = inferProjectFromPath(file.path);
  return {
    project: (_b = (_a = normalizeString(frontmatter.project)) != null ? _a : normalizeString(frontmatter.name)) != null ? _b : inferred.project,
    projectPath: inferred.projectPath
  };
}
function getTitleFromBody(content, file) {
  const heading = content.split(/\r?\n/).find((line) => line.trim().startsWith("# "));
  return heading ? heading.replace(/^#\s+/, "").trim() : file.basename;
}
function getTaskText(content, file) {
  const lines = content.split(/\r?\n/);
  const checkboxLine = lines.find((line) => /^\s*- \[[ xX]\]\s+/.test(line));
  if (checkboxLine) {
    return checkboxLine.replace(/^\s*- \[[ xX]\]\s+/, "").trim();
  }
  const firstContentLine = lines.find((line) => line.trim().length > 0 && !line.trim().startsWith("---"));
  return (firstContentLine == null ? void 0 : firstContentLine.trim()) || file.basename;
}
function getRoadmapTable(content) {
  return content.split(/\r?\n/).filter((line) => line.trim().startsWith("|")).join("\n");
}
function stripFrontmatter(content) {
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
function extractOwner(text) {
  var _a, _b;
  return (_b = (_a = text.match(/@([^\s🔥⚠️🚧📅]+)/u)) == null ? void 0 : _a[1]) == null ? void 0 : _b.trim();
}
function extractPriority(text) {
  if (text.includes("\u{1F525}")) {
    return "high";
  }
  if (text.includes("\u26A0\uFE0F")) {
    return "medium";
  }
  return "normal";
}
function extractDue(text) {
  var _a;
  return (_a = text.match(/📅(\d{4}-\d{2}-\d{2})/)) == null ? void 0 : _a[1];
}
function extractTaskTitle(text) {
  return text.replace(/@([^\s🔥⚠️🚧📅]+)/gu, "").replace(/[🔥⚠️🚧]/gu, "").replace(/📅\d{4}-\d{2}-\d{2}/g, "").replace(/\s+/g, " ").trim();
}
function parseChecklistTasks(content, file, project, projectPath, sourceType, source, version) {
  const { body, startLine } = stripFrontmatter(content);
  const tasks = [];
  const lines = body.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(/^\s*-\s\[([ xX])\]\s+(.+)$/);
    if (!match) {
      continue;
    }
    const rawText = match[2].trim();
    const done = match[1].toLowerCase() === "x";
    const status = done ? "done" : rawText.includes("\u{1F6A7}") ? "doing" : "todo";
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
function parseProject(frontmatter, file, content) {
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
function parseVersion(frontmatter, file, content) {
  var _a;
  const projectInfo = resolveProject(frontmatter, file);
  const version = normalizeString(frontmatter.version);
  if (!projectInfo.project || !projectInfo.projectPath || !version) {
    return null;
  }
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
    releaseDate: (_a = normalizeString(frontmatter.release_date)) != null ? _a : normalizeString(frontmatter.end)
  };
}
function parseTask(frontmatter, file, content) {
  var _a, _b, _c, _d;
  const projectInfo = resolveProject(frontmatter, file);
  if (!projectInfo.project || !projectInfo.projectPath) {
    return null;
  }
  const status = (_a = normalizeString(frontmatter.status)) != null ? _a : "todo";
  const taskTitle = (_b = normalizeString(frontmatter.title)) != null ? _b : getTitleFromBody(content, file);
  const taskText = (_c = normalizeString(frontmatter.title)) != null ? _c : getTaskText(content, file);
  return {
    id: `${file.path}#legacy-task`,
    type: "task",
    filePath: file.path,
    title: taskTitle,
    modifiedTime: file.stat.mtime,
    project: projectInfo.project,
    projectPath: projectInfo.projectPath,
    version: normalizeString(frontmatter.version),
    owner: normalizeString(frontmatter.owner),
    priority: normalizeString(frontmatter.priority),
    status,
    start: normalizeString(frontmatter.start),
    due: normalizeString(frontmatter.due),
    source: (_d = normalizeString(frontmatter.version)) != null ? _d : "legacy-task",
    sourceType: normalizeString(frontmatter.version) ? "version-task" : "ops-task",
    lineNumber: 1,
    rawText: taskText,
    text: taskText
  };
}
function parseRoadmap(frontmatter, file, content) {
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
async function parseMarkdownFile(app, file) {
  var _a;
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
  const type = (_a = normalizeString(frontmatter.type)) == null ? void 0 : _a.toLowerCase();
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
        tasks: versionRecord ? parseChecklistTasks(
          content,
          file,
          versionRecord.project,
          versionRecord.projectPath,
          "version-task",
          versionRecord.version,
          versionRecord.version
        ) : []
      };
    case "ops":
      if (!projectInfo.project || !projectInfo.projectPath) {
        return { project: null, version: null, roadmap: null, tasks: [] };
      }
      return {
        project: null,
        version: null,
        roadmap: null,
        tasks: parseChecklistTasks(content, file, projectInfo.project, projectInfo.projectPath, "ops-task", "\u8FD0\u7EF4")
      };
    case "task":
      return {
        project: null,
        version: null,
        roadmap: null,
        tasks: projectInfo.project ? [parseTask(frontmatter, file, content)].filter((task) => Boolean(task)) : []
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

// src/core/store.ts
function isProject(record) {
  return typeof record === "object" && record !== null && record.type === "project";
}
function isVersion(record) {
  return typeof record === "object" && record !== null && record.type === "version";
}
function isTask(record) {
  return typeof record === "object" && record !== null && record.type === "task";
}
function isRoadmap(record) {
  return typeof record === "object" && record !== null && record.type === "roadmap";
}
function compareByPath(left, right) {
  return left.filePath.localeCompare(right.filePath);
}
var ProjectStore = class {
  constructor(app) {
    this.listeners = /* @__PURE__ */ new Set();
    this.declaredProjects = [];
    this.projects = [];
    this.versions = [];
    this.tasks = [];
    this.roadmaps = [];
    this.app = app;
  }
  async rebuild() {
    const files = this.app.vault.getMarkdownFiles();
    const parsed = await Promise.all(files.map((file) => parseMarkdownFile(this.app, file)));
    this.declaredProjects = parsed.map((item) => item.project).filter(isProject).sort(compareByPath);
    this.versions = parsed.map((item) => item.version).filter(isVersion).sort(compareByPath);
    this.tasks = parsed.flatMap((item) => item.tasks).filter(isTask).sort(compareByPath);
    this.roadmaps = parsed.map((item) => item.roadmap).filter(isRoadmap).sort(compareByPath);
    this.projects = buildProjectRecords(this.declaredProjects, this.versions, this.tasks, this.roadmaps);
    this.emitChange();
  }
  async refreshFile(file) {
    if (file.extension !== "md") {
      return;
    }
    this.removeFile(file.path);
    const parsed = await parseMarkdownFile(this.app, file);
    if (parsed.project) {
      if (isProject(parsed.project)) {
        this.declaredProjects.push(parsed.project);
        this.declaredProjects.sort(compareByPath);
      }
    }
    if (parsed.version && isVersion(parsed.version)) {
      this.versions.push(parsed.version);
      this.versions.sort(compareByPath);
    }
    if (parsed.tasks.length > 0) {
      this.tasks.push(...parsed.tasks.filter(isTask));
      this.tasks.sort(compareByPath);
    }
    if (parsed.roadmap && isRoadmap(parsed.roadmap)) {
      this.roadmaps.push(parsed.roadmap);
      this.roadmaps.sort(compareByPath);
    }
    this.projects = buildProjectRecords(this.declaredProjects, this.versions, this.tasks, this.roadmaps);
    this.emitChange();
  }
  removeFile(path) {
    const beforeCounts = [this.declaredProjects.length, this.projects.length, this.versions.length, this.tasks.length, this.roadmaps.length];
    this.declaredProjects = this.declaredProjects.filter((item) => item.filePath !== path);
    this.versions = this.versions.filter((item) => item.filePath !== path);
    this.tasks = this.tasks.filter((item) => item.filePath !== path);
    this.roadmaps = this.roadmaps.filter((item) => item.filePath !== path);
    this.projects = buildProjectRecords(this.declaredProjects, this.versions, this.tasks, this.roadmaps);
    const afterCounts = [this.declaredProjects.length, this.projects.length, this.versions.length, this.tasks.length, this.roadmaps.length];
    const changed = beforeCounts.some((count, index) => count !== afterCounts[index]);
    if (changed) {
      this.emitChange();
    }
  }
  subscribe(listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  getSnapshot() {
    return {
      projects: [...this.projects],
      versions: [...this.versions],
      tasks: [...this.tasks],
      roadmaps: [...this.roadmaps]
    };
  }
  getProjects() {
    return [...this.projects];
  }
  getTasks(project) {
    return this.tasks.filter((task) => !project || task.project === project);
  }
  getVersions(project) {
    return this.versions.filter((version) => !project || version.project === project);
  }
  getRoadmaps(project) {
    return this.roadmaps.filter((roadmap) => !project || roadmap.project === project);
  }
  getStats(project) {
    const tasks = this.getTasks(project);
    const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const todoTasks = tasks.filter((task) => task.status === "todo").length;
    const doingTasks = tasks.filter((task) => task.status === "doing").length;
    const doneTasks = tasks.filter((task) => task.status === "done").length;
    const overdueTasks = tasks.filter((task) => task.status !== "done" && Boolean(task.due) && task.due < today).length;
    const totalTasks = tasks.length;
    return {
      totalTasks,
      todoTasks,
      doingTasks,
      doneTasks,
      overdueTasks,
      completionRate: totalTasks === 0 ? 0 : Math.round(doneTasks / totalTasks * 100)
    };
  }
  getStatusBreakdown(project) {
    var _a;
    const counts = /* @__PURE__ */ new Map();
    for (const task of this.getTasks(project)) {
      counts.set(task.status, ((_a = counts.get(task.status)) != null ? _a : 0) + 1);
    }
    return [...counts.entries()].map(([status, count]) => ({ status, count })).sort((left, right) => right.count - left.count || left.status.localeCompare(right.status));
  }
  getOwnerBreakdown(project) {
    var _a, _b;
    const owners = /* @__PURE__ */ new Map();
    for (const task of this.getTasks(project)) {
      const owner = (_a = task.owner) != null ? _a : "\u672A\u5206\u914D";
      const current = (_b = owners.get(owner)) != null ? _b : { owner, total: 0, done: 0 };
      current.total += 1;
      if (task.status === "done") {
        current.done += 1;
      }
      owners.set(owner, current);
    }
    return [...owners.values()].sort((left, right) => right.total - left.total || left.owner.localeCompare(right.owner));
  }
  getVersionProgress(project) {
    return this.getVersions(project).map((version) => {
      const versionTasks = this.getTasks(project).filter((task) => task.version === version.version);
      const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      const todoTasks = versionTasks.filter((task) => task.status === "todo").length;
      const doingTasks = versionTasks.filter((task) => task.status === "doing").length;
      const doneTasks = versionTasks.filter((task) => task.status === "done").length;
      const overdueTasks = versionTasks.filter(
        (task) => task.status !== "done" && Boolean(task.due) && task.due < today
      ).length;
      const totalTasks = versionTasks.length;
      return {
        version,
        totalTasks,
        todoTasks,
        doingTasks,
        doneTasks,
        overdueTasks,
        completionRate: totalTasks === 0 ? 0 : Math.round(doneTasks / totalTasks * 100)
      };
    });
  }
  getBurndown(project) {
    const tasks = this.getTasks(project);
    if (tasks.length === 0) {
      return [];
    }
    const dateSet = /* @__PURE__ */ new Set();
    for (const task of tasks) {
      if (task.due) {
        dateSet.add(task.due);
      }
      if (task.status === "done") {
        dateSet.add(new Date(task.modifiedTime).toISOString().slice(0, 10));
      }
    }
    if (dateSet.size === 0) {
      const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      return [{ date: today, remaining: tasks.filter((task) => task.status !== "done").length, idealRemaining: 0 }];
    }
    const orderedDates = [...dateSet].sort();
    const startDate = orderedDates[0];
    const endDate = orderedDates[orderedDates.length - 1];
    const totalTasks = tasks.length;
    const allDates = expandDateRange(startDate, endDate);
    return allDates.map((date, index) => {
      const completedByDate = tasks.filter(
        (task) => task.status === "done" && new Date(task.modifiedTime).toISOString().slice(0, 10) <= date
      ).length;
      const remaining = totalTasks - completedByDate;
      const idealRemaining = Math.max(
        0,
        Math.round(totalTasks - totalTasks * index / Math.max(1, allDates.length - 1))
      );
      return {
        date,
        remaining,
        idealRemaining
      };
    });
  }
  getRoadmapEntries(project) {
    const baseYear = this.getProjectBaseYear(project);
    const entries = [];
    for (const roadmap of this.getRoadmaps(project)) {
      const lines = roadmap.markdownTable.split(/\r?\n/).filter((line) => line.trim().startsWith("|"));
      if (lines.length < 3) {
        continue;
      }
      for (const line of lines.slice(2)) {
        const cells = line.split("|").map((cell) => cell.trim()).filter((cell) => cell.length > 0);
        if (cells.length < 4) {
          continue;
        }
        const start = normalizeRoadmapDate(cells[1], baseYear);
        const end = normalizeRoadmapDate(cells[2], baseYear);
        if (!start || !end) {
          continue;
        }
        entries.push({
          label: cells[0],
          start,
          end,
          status: cells[3]
        });
      }
    }
    return entries.sort((left, right) => left.start.localeCompare(right.start));
  }
  getProjectBaseYear(project) {
    var _a;
    const projectRecord = this.projects.find((item) => item.project === project);
    if ((_a = projectRecord == null ? void 0 : projectRecord.start) == null ? void 0 : _a.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return Number(projectRecord.start.slice(0, 4));
    }
    const versionRecord = this.getVersions(project).find((item) => {
      var _a2;
      return (_a2 = item.releaseDate) == null ? void 0 : _a2.match(/^\d{4}-\d{2}-\d{2}$/);
    });
    if (versionRecord == null ? void 0 : versionRecord.releaseDate) {
      return Number(versionRecord.releaseDate.slice(0, 4));
    }
    return (/* @__PURE__ */ new Date()).getFullYear();
  }
  emitChange() {
    for (const listener of this.listeners) {
      listener();
    }
  }
};
function expandDateRange(startDate, endDate) {
  const dates = [];
  const cursor = /* @__PURE__ */ new Date(`${startDate}T00:00:00`);
  const end = /* @__PURE__ */ new Date(`${endDate}T00:00:00`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}
function normalizeRoadmapDate(rawValue, baseYear) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
    return rawValue;
  }
  if (/^\d{2}-\d{2}$/.test(rawValue)) {
    return `${baseYear}-${rawValue}`;
  }
  return null;
}
function buildProjectRecords(declaredProjects, versions, tasks, roadmaps) {
  const projects = /* @__PURE__ */ new Map();
  for (const project of declaredProjects) {
    projects.set(project.project, project);
  }
  for (const record of [...versions, ...tasks, ...roadmaps]) {
    if (projects.has(record.project)) {
      continue;
    }
    projects.set(record.project, {
      type: "project",
      filePath: record.filePath,
      title: record.project,
      modifiedTime: record.modifiedTime,
      project: record.project,
      projectPath: record.projectPath
    });
  }
  return [...projects.values()].sort(compareByPath);
}

// src/views/dashboard-view.ts
var import_obsidian2 = require("obsidian");

// src/modals/create-task-modal.ts
var import_obsidian = require("obsidian");
var CreateTaskModal = class extends import_obsidian.Modal {
  constructor(options) {
    super(options.app);
    this.version = "";
    this.title = "";
    this.owner = "";
    this.priority = "medium";
    this.due = "";
    this.project = options.project;
    this.projectPath = (0, import_obsidian.normalizePath)(options.projectPath);
    this.versions = options.versions;
    this.onCreated = options.onCreated;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("project-hub-modal");
    contentEl.createEl("h2", { text: "\u5FEB\u901F\u65B0\u5EFA\u4EFB\u52A1" });
    contentEl.createEl("p", {
      cls: "project-hub-modal-subtitle",
      text: `\u9879\u76EE: ${this.project}`
    });
    new import_obsidian.Setting(contentEl).setName("\u4EFB\u52A1\u6807\u9898").setDesc("\u7528\u4E8E\u751F\u6210\u4EFB\u52A1\u6587\u6863\u548C\u5361\u7247\u6807\u9898").addText((text) => {
      text.setPlaceholder("\u4F8B\u5982\uFF1A\u5347\u7EA7 JDK17").onChange((value) => {
        this.title = value.trim();
      });
    });
    new import_obsidian.Setting(contentEl).setName("\u7248\u672C").setDesc("\u9009\u62E9\u7248\u672C\u5219\u5199\u5165\u7248\u672C\u6587\u4EF6\uFF1B\u4E0D\u9009\u5219\u5199\u5165 Ops/Ops.md").addDropdown((dropdown) => {
      dropdown.addOption("", "\u8FD0\u7EF4\u4EFB\u52A1 (Ops)");
      for (const version of this.versions) {
        dropdown.addOption(version.version, version.version);
      }
      dropdown.onChange((value) => {
        this.version = value;
      });
    });
    new import_obsidian.Setting(contentEl).setName("\u8D1F\u8D23\u4EBA").addText((text) => {
      text.setPlaceholder("\u4F8B\u5982\uFF1A\u674E\u56DB").onChange((value) => {
        this.owner = value.trim();
      });
    });
    new import_obsidian.Setting(contentEl).setName("\u4F18\u5148\u7EA7").addDropdown((dropdown) => {
      for (const option of ["low", "medium", "high", "urgent"]) {
        dropdown.addOption(option, option);
      }
      dropdown.setValue(this.priority);
      dropdown.onChange((value) => {
        this.priority = value;
      });
    });
    new import_obsidian.Setting(contentEl).setName("\u622A\u6B62\u65E5\u671F").setDesc("\u683C\u5F0F\uFF1AYYYY-MM-DD").addText((text) => {
      text.setPlaceholder("2026-03-30").onChange((value) => {
        this.due = value.trim();
      });
    });
    new import_obsidian.Setting(contentEl).addButton((button) => {
      button.setButtonText("\u521B\u5EFA\u4EFB\u52A1").setCta().onClick(async () => {
        await this.submit();
      });
    }).addExtraButton((button) => {
      button.setIcon("cross").setTooltip("\u53D6\u6D88").onClick(() => {
        this.close();
      });
    });
  }
  async submit() {
    var _a;
    if (!this.title) {
      new import_obsidian.Notice("\u4EFB\u52A1\u6807\u9898\u4E0D\u80FD\u4E3A\u7A7A");
      return;
    }
    if (this.due && !/^\d{4}-\d{2}-\d{2}$/.test(this.due)) {
      new import_obsidian.Notice("\u622A\u6B62\u65E5\u671F\u683C\u5F0F\u5FC5\u987B\u662F YYYY-MM-DD");
      return;
    }
    const taskPath = await this.createTaskFile({
      project: this.project,
      version: this.version || void 0,
      title: this.title,
      owner: this.owner || void 0,
      priority: this.priority,
      due: this.due || void 0
    });
    const createdFile = this.app.vault.getAbstractFileByPath(taskPath);
    if (createdFile instanceof import_obsidian.TFile) {
      await this.app.workspace.getLeaf(true).openFile(createdFile);
    }
    await ((_a = this.onCreated) == null ? void 0 : _a.call(this));
    new import_obsidian.Notice("\u4EFB\u52A1\u5DF2\u521B\u5EFA");
    this.close();
  }
  async createTaskFile(input) {
    const filePath = input.version ? (0, import_obsidian.normalizePath)(`${this.projectPath}/Versions/V${input.version}.md`) : (0, import_obsidian.normalizePath)(`${this.projectPath}/Ops/Ops.md`);
    await ensureFolder(this.app, (0, import_obsidian.normalizePath)(filePath.split("/").slice(0, -1).join("/")));
    const abstractFile = this.app.vault.getAbstractFileByPath(filePath);
    const taskLine = buildTaskLine(input.title, input.owner, input.priority, input.due);
    if (abstractFile instanceof import_obsidian.TFile) {
      const content = await this.app.vault.read(abstractFile);
      const nextContent = appendTaskLine(content, taskLine);
      await this.app.vault.modify(abstractFile, nextContent);
      return filePath;
    }
    const initialContent = input.version ? buildVersionFile(input.project, input.version, taskLine) : buildOpsFile(input.project, taskLine);
    await this.app.vault.create(filePath, initialContent);
    return filePath;
  }
};
async function ensureFolder(app, folderPath) {
  const parts = folderPath.split("/");
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (!app.vault.getAbstractFileByPath(current)) {
      await app.vault.createFolder(current);
    }
  }
}
function buildTaskLine(title, owner, priority, due) {
  const tokens = [
    title,
    owner ? `@${owner}` : null,
    priority === "high" || priority === "urgent" ? "\u{1F525}" : priority === "medium" ? "\u26A0\uFE0F" : null,
    due ? `\u{1F4C5}${due}` : null
  ].filter(Boolean);
  return `- [ ] ${tokens.join(" ")}`;
}
function appendTaskLine(content, taskLine) {
  if (/^##\s+Tasks\s*$/m.test(content)) {
    return `${content.trimEnd()}
${taskLine}
`;
  }
  return `${content.trimEnd()}

## Tasks

${taskLine}
`;
}
function buildVersionFile(project, version, taskLine) {
  return [
    "---",
    "type: version",
    `project: ${project}`,
    `version: ${version}`,
    "status: planned",
    "---",
    "",
    `# V${version}`,
    "",
    "## Tasks",
    "",
    taskLine,
    ""
  ].join("\n");
}
function buildOpsFile(project, taskLine) {
  return [
    "---",
    "type: ops",
    `project: ${project}`,
    "---",
    "",
    "# \u8FD0\u7EF4\u4EFB\u52A1",
    "",
    "## Tasks",
    "",
    taskLine,
    ""
  ].join("\n");
}

// src/views/dashboard-view.ts
var PROJECT_HUB_VIEW_TYPE = "project-hub-dashboard";
var ProjectHubDashboardView = class extends import_obsidian2.ItemView {
  constructor(leaf, plugin, store) {
    super(leaf);
    this.selectedProject = null;
    this.selectedVersion = null;
    this.draggingTaskId = null;
    this.expandedVersionGroups = /* @__PURE__ */ new Set();
    this.headerEl = null;
    this.summaryEl = null;
    this.boardEl = null;
    this.kanbanEl = null;
    this.pendingProjectRowRefresh = null;
    this.pendingSelection = null;
    this.preferredSelection = null;
    this.suppressRenderCount = 0;
    this.unsubscribe = null;
    this.plugin = plugin;
    this.store = store;
  }
  getViewType() {
    return PROJECT_HUB_VIEW_TYPE;
  }
  getDisplayText() {
    return "Project Hub";
  }
  getIcon() {
    return "layout-dashboard";
  }
  async onOpen() {
    this.unsubscribe = this.store.subscribe(() => {
      if (this.suppressRenderCount > 0) {
        this.suppressRenderCount -= 1;
        return;
      }
      if (this.pendingProjectRowRefresh) {
        const project = this.pendingProjectRowRefresh;
        this.pendingProjectRowRefresh = null;
        this.renderPartialUpdate(project);
        return;
      }
      this.render();
    });
    this.render();
  }
  async onClose() {
    var _a;
    (_a = this.unsubscribe) == null ? void 0 : _a.call(this);
    this.unsubscribe = null;
  }
  async openQuickCreateTask() {
    if (!this.selectedProject) {
      new import_obsidian2.Notice("\u8BF7\u5148\u9009\u62E9\u4E00\u4E2A\u9879\u76EE");
      return;
    }
    const projectRecord = this.store.getProjects().find((item) => item.project === this.selectedProject);
    if (!projectRecord) {
      new import_obsidian2.Notice("\u672A\u627E\u5230\u9879\u76EE\u76EE\u5F55\uFF0C\u65E0\u6CD5\u521B\u5EFA\u4EFB\u52A1");
      return;
    }
    new CreateTaskModal({
      app: this.app,
      project: this.selectedProject,
      projectPath: projectRecord.projectPath,
      versions: this.store.getVersions(this.selectedProject),
      onCreated: async () => {
        await this.store.rebuild();
      }
    }).open();
  }
  render() {
    const container = this.containerEl.children[1];
    container.addClass("project-hub-view");
    this.ensureLayout(container);
    this.renderHeader();
    this.renderSections();
  }
  renderHeader() {
    if (!this.headerEl) {
      return;
    }
    this.renderDashboardHeader(this.headerEl);
  }
  renderPartialUpdate(projectName) {
    if (!this.summaryEl || !this.boardEl || !this.kanbanEl) {
      this.render();
      return;
    }
    const projects = this.store.getProjects();
    const versions = this.store.getVersions();
    const tasks = this.store.getTasks();
    this.restorePendingSelection(projects, versions);
    this.syncSelection(projects, versions);
    this.renderGlobalStats(this.summaryEl, projects, versions, tasks);
    this.refreshProjectBoardRow(projectName, projects, versions, tasks);
    if (projects.length === 0) {
      this.kanbanEl.empty();
      this.kanbanEl.createEl("div", {
        cls: "project-hub-empty-state",
        text: "\u672A\u627E\u5230\u9879\u76EE\u6570\u636E\u3002\u5148\u521B\u5EFA\u5E26\u6709 type: project \u7684 Markdown \u6587\u4EF6\u3002"
      });
      return;
    }
    this.renderTaskKanban(this.kanbanEl, projects, versions);
  }
  renderSections() {
    if (!this.summaryEl || !this.boardEl || !this.kanbanEl) {
      return;
    }
    const projects = this.store.getProjects();
    const versions = this.store.getVersions();
    const tasks = this.store.getTasks();
    this.restorePendingSelection(projects, versions);
    this.syncSelection(projects, versions);
    this.renderGlobalStats(this.summaryEl, projects, versions, tasks);
    this.renderProjectVersionBoard(this.boardEl, projects, versions, tasks);
    if (projects.length === 0) {
      this.kanbanEl.empty();
      this.kanbanEl.createEl("div", {
        cls: "project-hub-empty-state",
        text: "\u672A\u627E\u5230\u9879\u76EE\u6570\u636E\u3002\u5148\u521B\u5EFA\u5E26\u6709 type: project \u7684 Markdown \u6587\u4EF6\u3002"
      });
      return;
    }
    this.renderTaskKanban(this.kanbanEl, projects, versions);
  }
  ensureLayout(container) {
    const hostsMissing = !this.headerEl || !this.summaryEl || !this.boardEl || !this.kanbanEl;
    const hostsDetached = Boolean(
      this.headerEl && this.summaryEl && this.boardEl && this.kanbanEl && (!container.contains(this.headerEl) || !container.contains(this.summaryEl) || !container.contains(this.boardEl) || !container.contains(this.kanbanEl))
    );
    if (!hostsMissing && !hostsDetached) {
      return;
    }
    container.empty();
    this.headerEl = container.createDiv({ cls: "project-hub-header-host" });
    this.summaryEl = container.createDiv({ cls: "project-hub-summary-host" });
    this.boardEl = container.createDiv({ cls: "project-hub-board-host" });
    this.kanbanEl = container.createDiv({ cls: "project-hub-kanban-host" });
  }
  restorePendingSelection(projects, versions) {
    if (!this.pendingSelection) {
      return;
    }
    const { project, version } = this.pendingSelection;
    this.pendingSelection = null;
    if (project && projects.some((item) => item.project === project)) {
      this.selectedProject = project;
      if (version && versions.some((item) => item.project === project && item.version === version)) {
        this.selectedVersion = version;
      }
      this.preferredSelection = { project, version };
    }
  }
  syncSelection(projects, versions) {
    var _a, _b, _c, _d, _e, _f;
    if (projects.length === 0) {
      this.selectedProject = null;
      this.selectedVersion = null;
      return;
    }
    if (((_a = this.preferredSelection) == null ? void 0 : _a.project) && projects.some((project) => project.project === this.preferredSelection.project)) {
      this.selectedProject = this.preferredSelection.project;
    }
    const sortedProjects = this.sortProjects(projects, versions);
    if (!this.selectedProject || !projects.some((project) => project.project === this.selectedProject)) {
      this.selectedProject = (_c = (_b = sortedProjects[0]) == null ? void 0 : _b.project) != null ? _c : null;
    }
    const projectVersions = this.getSortedVersionsForProject(versions, this.selectedProject);
    if (((_d = this.preferredSelection) == null ? void 0 : _d.project) === this.selectedProject && this.preferredSelection.version && projectVersions.some((version) => {
      var _a2;
      return version.version === ((_a2 = this.preferredSelection) == null ? void 0 : _a2.version);
    })) {
      this.selectedVersion = this.preferredSelection.version;
      return;
    }
    if (!this.selectedVersion || !projectVersions.some((version) => version.version === this.selectedVersion)) {
      this.selectedVersion = (_f = (_e = projectVersions[0]) == null ? void 0 : _e.version) != null ? _f : null;
    }
  }
  renderDashboardHeader(container) {
    container.empty();
    const header = container.createDiv({ cls: "project-hub-dashboard-header" });
    const titleWrap = header.createDiv({ cls: "project-hub-dashboard-title-wrap" });
    titleWrap.createEl("h1", { text: "Project Hub Dashboard" });
    titleWrap.createEl("p", {
      text: "\u4E00\u5C4F\u770B\u5168\u5C40 \xB7 \u4E00\u5C4F\u7BA1\u6267\u884C | \u9879\u76EE\u884C\u5F0F\u7248\u672C\u770B\u677F + \u7248\u672C\u4EFB\u52A1\u770B\u677F"
    });
    const actions = header.createDiv({ cls: "project-hub-dashboard-actions" });
    const createButton = actions.createEl("button", { cls: "mod-cta", text: "\u5FEB\u901F\u65B0\u5EFA\u4EFB\u52A1" });
    createButton.addEventListener("click", async () => {
      await this.openQuickCreateTask();
    });
    const refreshButton = actions.createEl("button", { text: "\u5237\u65B0" });
    refreshButton.addEventListener("click", async () => {
      await this.store.rebuild();
      new import_obsidian2.Notice("Project Hub \u6570\u636E\u5DF2\u5237\u65B0");
    });
  }
  renderGlobalStats(container, projects, versions, tasks) {
    container.empty();
    const section = container.createDiv({ cls: "project-hub-dashboard-card project-hub-summary-card" });
    const title = section.createDiv({ cls: "project-hub-section-title" });
    title.setText("\u5168\u5C40\u7EDF\u8BA1\u533A \xB7 All Projects Summary");
    const today = todayString();
    const completedTasks = tasks.filter((task) => task.status === "done").length;
    const doingTasks = tasks.filter((task) => task.status === "doing").length;
    const delayedTasks = tasks.filter((task) => isTaskOverdue(task, today)).length;
    const completionRate = tasks.length === 0 ? 0 : Math.round(completedTasks / tasks.length * 100);
    const statsGrid = section.createDiv({ cls: "project-hub-summary-grid" });
    for (const item of [
      [String(projects.length), "\u9879\u76EE\u6570"],
      [String(versions.length), "\u7248\u672C\u6570"],
      [String(tasks.length), "\u603B\u4EFB\u52A1\u6570"],
      [String(completedTasks), "\u5B8C\u6210\u4EFB\u52A1"],
      [String(doingTasks), "\u8FDB\u884C\u4E2D\u4EFB\u52A1"],
      [String(delayedTasks), "\u5EF6\u671F\u4EFB\u52A1"]
    ]) {
      const stat = statsGrid.createDiv({ cls: "project-hub-summary-item" });
      if (item[1] === "\u5EF6\u671F\u4EFB\u52A1") {
        stat.addClass("is-warning");
      }
      stat.createDiv({ cls: "project-hub-summary-value", text: item[0] });
      stat.createDiv({ cls: "project-hub-summary-label", text: item[1] });
    }
    const trend = section.createDiv({ cls: "project-hub-summary-trend" });
    const trendHeader = trend.createDiv({ cls: "project-hub-summary-trend-header" });
    trendHeader.createSpan({ text: "\u4EFB\u52A1\u5B8C\u6210\u8D8B\u52BF (\u71C3\u5C3D)" });
    trendHeader.createSpan({ text: `${completionRate}% \u5B8C\u6210` });
    const progressBar = trend.createDiv({ cls: "project-hub-burnup-bar" });
    progressBar.createDiv({ cls: "project-hub-burnup-fill" }).style.width = `${completionRate}%`;
    const miniChart = trend.createDiv({ cls: "project-hub-mini-chart" });
    for (const value of buildMiniTrendValues(this.store.getBurndown(), completionRate)) {
      const bar = miniChart.createDiv({ cls: "project-hub-mini-chart-bar" });
      bar.style.height = `${Math.min(100, Math.max(14, Math.round(value)))}%`;
    }
  }
  renderProjectVersionBoard(container, projects, versions, tasks) {
    container.empty();
    const section = container.createDiv({ cls: "project-hub-dashboard-card project-hub-board-card" });
    const title = section.createDiv({ cls: "project-hub-section-title" });
    title.setText("\u9879\u76EE & \u7248\u672C\u72B6\u6001\u770B\u677F (Project Version Board) | \u6309\u7248\u672C\u603B\u6570\u6392\u5E8F | \u7248\u672C>3\u4E2A\u65F6\u6298\u53E0");
    const boardRoot = section.createDiv({ cls: "project-hub-version-grid-container" });
    const grid = boardRoot.createDiv({ cls: "project-hub-version-grid" });
    const projectHeader = grid.createDiv({ cls: "project-hub-grid-header project-hub-grid-header-multiline" });
    projectHeader.createDiv({ cls: "project-hub-grid-header-line", text: "\u9879\u76EE" });
    projectHeader.createDiv({ cls: "project-hub-grid-header-line", text: "\u7248\u672C\u603B\u6570" });
    for (const headerText of ["Todo", "Doing", "Done"]) {
      grid.createDiv({ cls: "project-hub-grid-header", text: headerText });
    }
    for (const project of this.sortProjects(projects, versions)) {
      this.renderProjectBoardRow(grid, project, versions, tasks);
    }
  }
  renderProjectBoardRow(grid, project, versions, tasks) {
    const row = grid.createDiv({ cls: "project-hub-grid-row" });
    row.dataset.project = project.project;
    const projectVersions = versions.filter((version) => version.project === project.project);
    const projectCell = row.createDiv({ cls: "project-hub-grid-cell project-hub-project-name-cell" });
    projectCell.createDiv({ cls: "project-hub-project-name", text: project.project });
    projectCell.createSpan({
      cls: "project-hub-project-badge",
      text: `\u7248\u672C\u603B\u6570\uFF1A${projectVersions.length}`
    });
    for (const status of ["todo", "doing", "done"]) {
      const cell = row.createDiv({ cls: "project-hub-grid-cell" });
      this.renderVersionGroup(cell, project.project, status, projectVersions, tasks);
    }
    return row;
  }
  refreshProjectBoardRow(projectName, projects, versions, tasks) {
    if (!this.boardEl) {
      return;
    }
    const grid = this.boardEl.querySelector(".project-hub-version-grid");
    if (!grid) {
      this.renderProjectVersionBoard(this.boardEl, projects, versions, tasks);
      return;
    }
    const existingRows = Array.from(grid.querySelectorAll(".project-hub-grid-row"));
    const targetRow = existingRows.find((row) => row.dataset.project === projectName);
    const project = projects.find((item) => item.project === projectName);
    if (!project) {
      targetRow == null ? void 0 : targetRow.remove();
      return;
    }
    if (!targetRow) {
      this.renderProjectVersionBoard(this.boardEl, projects, versions, tasks);
      return;
    }
    const nextSibling = targetRow.nextElementSibling;
    targetRow.remove();
    const newRow = this.renderProjectBoardRow(grid, project, versions, tasks);
    if (nextSibling) {
      grid.insertBefore(newRow, nextSibling);
    }
  }
  renderVersionGroup(container, project, status, versions, tasks) {
    const list = container.createDiv({ cls: "project-hub-version-cards-list" });
    const filtered = versions.filter((version) => normalizeVersionBoardStatus(version.status) === status).sort(compareVersionRecordsDesc);
    if (filtered.length === 0) {
      list.createDiv({ cls: "project-hub-version-empty", text: "\u2014" });
      return;
    }
    const groupKey = `${project}::${status}`;
    const expanded = this.expandedVersionGroups.has(groupKey);
    const visibleVersions = expanded ? filtered : filtered.slice(0, 3);
    for (const version of visibleVersions) {
      this.renderVersionCard(list, version, tasks);
    }
    if (filtered.length > 3) {
      const toggle = list.createEl("button", { cls: "project-hub-expand-btn" });
      toggle.setText(expanded ? "\u6536\u8D77 \u25B2" : `+ ${filtered.length - 3} \u66F4\u591A`);
      toggle.addEventListener("click", () => {
        if (expanded) {
          this.expandedVersionGroups.delete(groupKey);
        } else {
          this.expandedVersionGroups.add(groupKey);
        }
        this.renderSections();
      });
    }
  }
  renderVersionCard(container, version, tasks) {
    const versionTasks = tasks.filter((task) => task.project === version.project && task.version === version.version);
    const doneCount = versionTasks.filter((task) => task.status === "done").length;
    const progress = versionTasks.length === 0 ? 0 : Math.round(doneCount / versionTasks.length * 100);
    const overdue = versionTasks.filter((task) => isTaskOverdue(task, todayString())).length;
    const assignees = [...new Set(versionTasks.map((task) => task.owner).filter((owner) => Boolean(owner)))];
    const card = container.createDiv({ cls: "project-hub-version-card" });
    if (this.selectedProject === version.project && this.selectedVersion === version.version) {
      card.addClass("is-active");
    }
    card.createDiv({ cls: "project-hub-version-name", text: version.version });
    card.createDiv({
      cls: "project-hub-version-date",
      text: `${formatShortDate(version.start)} ~ ${formatShortDate(version.end)}`
    });
    card.createDiv({
      cls: "project-hub-version-summary",
      text: overdue > 0 ? `${progress}% \xB7 \u5EF6\u671F ${overdue}` : `${progress}% \xB7 \u6309\u671F`
    });
    card.setAttr(
      "title",
      `\u4EFB\u52A1\u6570: ${versionTasks.length}
\u8D1F\u8D23\u4EBA: ${assignees.join(", ") || "\u672A\u5206\u914D"}
\u53CC\u51FB\u6253\u5F00\u7248\u672C\u6587\u4EF6`
    );
    card.addEventListener("click", () => {
      this.selectedProject = version.project;
      this.selectedVersion = version.version;
      this.preferredSelection = {
        project: this.selectedProject,
        version: this.selectedVersion
      };
      this.renderSections();
    });
    card.addEventListener("dblclick", async () => {
      const file = this.plugin.app.vault.getAbstractFileByPath(version.filePath);
      if (file instanceof import_obsidian2.TFile) {
        await this.plugin.app.workspace.getLeaf(true).openFile(file);
      }
    });
  }
  renderTaskKanban(container, projects, versions) {
    var _a, _b, _c;
    container.empty();
    const section = container.createDiv({ cls: "project-hub-task-kanban" });
    const title = section.createDiv({ cls: "project-hub-section-title" });
    title.setText("\u7248\u672C\u4EFB\u52A1\u770B\u677F \xB7 Version Task Kanban");
    const filters = section.createDiv({ cls: "project-hub-filters" });
    const projectGroup = filters.createDiv({ cls: "project-hub-filter-group" });
    projectGroup.createEl("label", { text: "Project:" });
    const projectSelect = projectGroup.createEl("select");
    for (const project of this.sortProjects(projects, versions)) {
      projectSelect.createEl("option", { value: project.project, text: project.project });
    }
    projectSelect.value = (_a = this.selectedProject) != null ? _a : "";
    projectSelect.addEventListener("change", () => {
      var _a2, _b2;
      this.selectedProject = projectSelect.value || null;
      const projectVersions = this.getSortedVersionsForProject(versions, this.selectedProject);
      this.selectedVersion = (_b2 = (_a2 = projectVersions[0]) == null ? void 0 : _a2.version) != null ? _b2 : null;
      this.preferredSelection = {
        project: this.selectedProject,
        version: this.selectedVersion
      };
      this.renderSections();
    });
    const versionGroup = filters.createDiv({ cls: "project-hub-filter-group" });
    versionGroup.createEl("label", { text: "Version:" });
    const versionSelect = versionGroup.createEl("select");
    for (const version of this.getSortedVersionsForProject(versions, this.selectedProject)) {
      versionSelect.createEl("option", { value: version.version, text: version.version });
    }
    versionSelect.value = (_b = this.selectedVersion) != null ? _b : "";
    versionSelect.addEventListener("change", () => {
      this.selectedVersion = versionSelect.value || null;
      this.preferredSelection = {
        project: this.selectedProject,
        version: this.selectedVersion
      };
      this.renderSections();
    });
    const selectedTasks = this.store.getTasks((_c = this.selectedProject) != null ? _c : void 0).filter((task) => {
      if (!this.selectedVersion) {
        return false;
      }
      return task.version === this.selectedVersion;
    });
    const columns = section.createDiv({ cls: "project-hub-kanban-columns" });
    this.renderTaskColumn(columns, "todo", "TODO", selectedTasks.filter((task) => task.status === "todo"), true);
    this.renderTaskColumn(columns, "doing", "DOING", selectedTasks.filter((task) => task.status === "doing"), true);
    this.renderTaskColumn(columns, "done", "DONE", selectedTasks.filter((task) => task.status === "done"), true);
    if (!this.selectedVersion) {
      columns.empty();
      columns.createDiv({ cls: "project-hub-empty-state", text: "\u5F53\u524D\u9879\u76EE\u6CA1\u6709\u53EF\u7528\u7248\u672C\uFF0C\u8BF7\u5148\u521B\u5EFA\u7248\u672C\u6587\u4EF6\u3002" });
    }
  }
  renderTaskColumn(container, status, label, tasks, droppable) {
    const column = container.createDiv({ cls: "project-hub-kanban-col" });
    column.dataset.status = status;
    if (droppable) {
      column.addClass("is-droppable");
      column.addEventListener("dragover", (event) => {
        event.preventDefault();
        column.addClass("is-drag-over");
      });
      column.addEventListener("dragleave", () => {
        column.removeClass("is-drag-over");
      });
      column.addEventListener("drop", async (event) => {
        event.preventDefault();
        column.removeClass("is-drag-over");
        await this.handleDrop(status);
      });
    }
    const header = column.createEl("h3", { cls: "project-hub-kanban-col-title" });
    header.createSpan({ text: label });
    header.createSpan({ cls: "project-hub-kanban-col-count", text: String(tasks.length) });
    const list = column.createDiv({ cls: "project-hub-task-list" });
    list.dataset.status = status;
    if (tasks.length === 0) {
      list.createEl("div", {
        cls: "project-hub-empty-state small",
        text: droppable ? `\u62D6\u62FD\u4EFB\u52A1\u5230 ${label}` : `${label} \u5217\u4E3A\u7A7A`
      });
      return;
    }
    for (const task of tasks) {
      this.renderTaskCard(list, task, droppable);
    }
  }
  renderTaskCard(container, task, draggable) {
    var _a, _b;
    const card = container.createDiv({ cls: "project-hub-task-card" });
    card.dataset.taskId = task.id;
    card.dataset.status = task.status;
    card.style.borderLeftColor = task.priority === "high" ? "#dc2626" : "#e2e8f0";
    if (draggable) {
      card.setAttribute("draggable", "true");
      card.addEventListener("dragstart", (event) => {
        var _a2;
        this.draggingTaskId = task.id;
        (_a2 = event.dataTransfer) == null ? void 0 : _a2.setData("text/plain", task.id);
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setDragImage(card, 20, 20);
        }
        card.addClass("is-dragging");
      });
      card.addEventListener("dragend", () => {
        this.draggingTaskId = null;
        card.removeClass("is-dragging");
      });
    }
    card.createDiv({
      cls: "project-hub-task-title",
      text: task.text
    });
    const meta = card.createDiv({
      cls: "project-hub-task-meta",
      text: `@${(_a = task.owner) != null ? _a : "\u672A\u5206\u914D"} \xB7 ${(_b = task.due) != null ? _b : "\u672A\u8BBE\u7F6E"}`
    });
    meta.setAttr("title", task.sourceType === "ops-task" ? "\u6765\u6E90 Ops" : `\u6765\u6E90 ${task.source}`);
    card.setAttr("title", "\u62D6\u62FD\u53EF\u53D8\u66F4\u72B6\u6001\uFF0C\u53CC\u51FB\u6253\u5F00\u4EFB\u52A1\u6E90\u6587\u4EF6");
    card.addEventListener("dblclick", async () => {
      await this.openTaskFile(task);
    });
  }
  applyTaskMove(taskId, nextStatus) {
    var _a;
    if (!this.kanbanEl) {
      return;
    }
    const card = this.kanbanEl.querySelector(`.project-hub-task-card[data-task-id="${cssEscape(taskId)}"]`);
    if (!card) {
      return;
    }
    const sourceList = card.parentElement;
    const targetList = this.kanbanEl.querySelector(`.project-hub-task-list[data-status="${cssEscape(nextStatus)}"]`);
    if (!sourceList || !targetList || sourceList === targetList) {
      return;
    }
    const sourceStatus = (_a = sourceList.dataset.status) != null ? _a : "";
    this.removeEmptyState(targetList);
    targetList.appendChild(card);
    card.dataset.status = nextStatus;
    this.refreshTaskColumnState(sourceList, sourceStatus);
    this.refreshTaskColumnState(targetList, nextStatus);
  }
  refreshTaskColumnState(list, status) {
    const column = list.closest(".project-hub-kanban-col");
    if (!column) {
      return;
    }
    const count = list.querySelectorAll(":scope > .project-hub-task-card").length;
    const countEl = column.querySelector(".project-hub-kanban-col-count");
    if (countEl) {
      countEl.setText(String(count));
    }
    const empty = list.querySelector(":scope > .project-hub-empty-state");
    if (count === 0) {
      if (!empty) {
        list.createEl("div", {
          cls: "project-hub-empty-state small",
          text: `\u62D6\u62FD\u4EFB\u52A1\u5230 ${status.toUpperCase()}`
        });
      }
      return;
    }
    empty == null ? void 0 : empty.remove();
  }
  removeEmptyState(list) {
    const empty = list.querySelector(":scope > .project-hub-empty-state");
    empty == null ? void 0 : empty.remove();
  }
  sortProjects(projects, versions) {
    var _a;
    const order = new Map(projects.map((project, index) => [project.project, index]));
    const counts = /* @__PURE__ */ new Map();
    for (const version of versions) {
      counts.set(version.project, ((_a = counts.get(version.project)) != null ? _a : 0) + 1);
    }
    return [...projects].sort((left, right) => {
      var _a2, _b, _c, _d;
      const countDiff = ((_a2 = counts.get(right.project)) != null ? _a2 : 0) - ((_b = counts.get(left.project)) != null ? _b : 0);
      if (countDiff !== 0) {
        return countDiff;
      }
      return ((_c = order.get(left.project)) != null ? _c : 0) - ((_d = order.get(right.project)) != null ? _d : 0);
    });
  }
  getSortedVersionsForProject(versions, project) {
    return versions.filter((version) => !project || version.project === project).sort(compareVersionRecordsDesc);
  }
  async handleDrop(targetStatus) {
    var _a;
    const taskId = this.draggingTaskId;
    this.draggingTaskId = null;
    if (!taskId) {
      return;
    }
    const task = this.store.getTasks((_a = this.selectedProject) != null ? _a : void 0).find((item) => item.id === taskId);
    if (!task) {
      return;
    }
    await this.updateTaskStatus(task, targetStatus);
  }
  async openTaskFile(task) {
    const file = this.plugin.app.vault.getAbstractFileByPath(task.filePath);
    if (file instanceof import_obsidian2.TFile) {
      await this.plugin.app.workspace.getLeaf(true).openFile(file);
    }
  }
  async updateTaskStatus(task, status) {
    if (task.status === status) {
      return;
    }
    const abstractFile = this.plugin.app.vault.getAbstractFileByPath(task.filePath);
    if (!(abstractFile instanceof import_obsidian2.TFile)) {
      new import_obsidian2.Notice(`\u672A\u627E\u5230\u6587\u4EF6: ${task.filePath}`);
      return;
    }
    const content = await this.plugin.app.vault.read(abstractFile);
    let nextContent = updateChecklistTaskStatus(content, task, status);
    if (task.sourceType === "version-task") {
      nextContent = updateVersionStatusInFrontmatter(nextContent);
    }
    if (nextContent === content) {
      new import_obsidian2.Notice("\u672A\u627E\u5230\u4EFB\u52A1\u884C\uFF0C\u65E0\u6CD5\u66F4\u65B0\u4EFB\u52A1\u72B6\u6001");
      return;
    }
    this.pendingSelection = {
      project: this.selectedProject,
      version: this.selectedVersion
    };
    this.preferredSelection = {
      project: this.selectedProject,
      version: this.selectedVersion
    };
    this.pendingProjectRowRefresh = null;
    this.suppressRenderCount = 2;
    await this.plugin.app.vault.modify(abstractFile, nextContent);
    await this.store.refreshFile(abstractFile);
    this.applyDragUpdate(task.project, task.id, status);
    new import_obsidian2.Notice(`\u4EFB\u52A1\u72B6\u6001\u5DF2\u66F4\u65B0\u4E3A ${status}`);
  }
  applyDragUpdate(projectName, taskId, status) {
    const projects = this.store.getProjects();
    const versions = this.store.getVersions();
    const tasks = this.store.getTasks();
    this.restorePendingSelection(projects, versions);
    this.syncSelection(projects, versions);
    if (this.summaryEl) {
      this.renderGlobalStats(this.summaryEl, projects, versions, tasks);
    }
    this.refreshProjectBoardRow(projectName, projects, versions, tasks);
    this.applyTaskMove(taskId, status);
  }
};
function normalizeVersionBoardStatus(status) {
  const normalized = (status != null ? status : "").trim().toLowerCase();
  if (["doing", "developing", "active", "\u5F00\u53D1\u4E2D"].includes(normalized)) {
    return "doing";
  }
  if (["released", "done", "\u5DF2\u53D1\u5E03"].includes(normalized)) {
    return "done";
  }
  return "todo";
}
function compareVersionRecordsDesc(left, right) {
  return compareVersionNamesDesc(left.version, right.version);
}
function compareVersionNamesDesc(left, right) {
  var _a, _b;
  const leftParts = left.replace(/^[^\d]*/, "").split(".").map((part) => Number(part) || 0);
  const rightParts = right.replace(/^[^\d]*/, "").split(".").map((part) => Number(part) || 0);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const diff = ((_a = rightParts[index]) != null ? _a : 0) - ((_b = leftParts[index]) != null ? _b : 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return right.localeCompare(left);
}
function formatShortDate(value) {
  if (!value) {
    return "?";
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value.slice(5);
  }
  return value;
}
function todayString() {
  return (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
}
function isTaskOverdue(task, today) {
  return task.status !== "done" && Boolean(task.due) && task.due < today;
}
function buildMiniTrendValues(points, completionRate) {
  if (points.length === 0) {
    return [completionRate];
  }
  const maxRemaining = Math.max(...points.map((point) => point.remaining), 1);
  const completionValues = points.map((point) => 100 - Math.round(point.remaining / maxRemaining * 100));
  const sampleSize = Math.min(5, completionValues.length);
  if (sampleSize === completionValues.length) {
    return completionValues;
  }
  const sampled = [];
  for (let index = 0; index < sampleSize; index += 1) {
    const pointIndex = Math.round(index * (completionValues.length - 1) / Math.max(1, sampleSize - 1));
    sampled.push(completionValues[pointIndex]);
  }
  return sampled;
}
function cssEscape(value) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/([#.;?+*~':"!^$\[\]()=>|\/@])/g, "\\$1");
}
function updateChecklistTaskStatus(content, task, status) {
  const lines = content.split(/\r?\n/);
  const index = task.lineNumber - 1;
  const line = lines[index];
  if (!line) {
    return content;
  }
  const match = line.match(/^(\s*-\s\[)([ xX])(\]\s+)(.+)$/);
  if (!match) {
    return content;
  }
  const rawText = match[4].replace(/🚧/g, "").replace(/\s+/g, " ").trim();
  const nextMarker = status === "done" ? "x" : " ";
  const nextText = status === "doing" ? `${rawText} \u{1F6A7}` : rawText;
  lines[index] = `${match[1]}${nextMarker}${match[3]}${nextText}`;
  return lines.join("\n");
}
function updateVersionStatusInFrontmatter(content) {
  if (!content.startsWith("---")) {
    return content;
  }
  const lines = content.split(/\r?\n/);
  let frontmatterEnd = -1;
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index].trim() === "---") {
      frontmatterEnd = index;
      break;
    }
  }
  if (frontmatterEnd === -1) {
    return content;
  }
  const derivedStatus = deriveVersionStatusFromChecklist(lines.slice(frontmatterEnd + 1));
  if (!derivedStatus) {
    return content;
  }
  const statusIndex = lines.findIndex((line, index) => index > 0 && index < frontmatterEnd && /^status\s*:/i.test(line));
  if (statusIndex !== -1) {
    lines[statusIndex] = `status: ${derivedStatus}`;
  } else {
    lines.splice(frontmatterEnd, 0, `status: ${derivedStatus}`);
  }
  return lines.join("\n");
}
function deriveVersionStatusFromChecklist(lines) {
  let total = 0;
  let done = 0;
  let doing = 0;
  for (const line of lines) {
    const match = line.match(/^\s*-\s\[([ xX])\]\s+(.+)$/);
    if (!match) {
      continue;
    }
    total += 1;
    const rawText = match[2].trim();
    if (match[1].toLowerCase() === "x") {
      done += 1;
      continue;
    }
    if (rawText.includes("\u{1F6A7}")) {
      doing += 1;
    }
  }
  if (total === 0) {
    return null;
  }
  if (done === total) {
    return "released";
  }
  if (doing > 0 || done > 0) {
    return "developing";
  }
  return "planned";
}

// src/main.ts
var ProjectHubPlugin = class extends import_obsidian3.Plugin {
  async onload() {
    this.store = new ProjectStore(this.app);
    this.registerView(
      PROJECT_HUB_VIEW_TYPE,
      (leaf) => new ProjectHubDashboardView(leaf, this, this.store)
    );
    this.addRibbonIcon("layout-dashboard", "Open Project Hub", async () => {
      await this.activateView();
    });
    this.addCommand({
      id: "open-project-hub",
      name: "Open Project Hub dashboard",
      callback: async () => {
        await this.activateView();
      }
    });
    this.addCommand({
      id: "refresh-project-hub",
      name: "Refresh Project Hub data",
      callback: async () => {
        await this.store.rebuild();
      }
    });
    this.addCommand({
      id: "quick-create-project-task",
      name: "Quick create project task",
      callback: async () => {
        const view = await this.activateView();
        await (view == null ? void 0 : view.openQuickCreateTask());
      }
    });
    await this.store.rebuild();
    this.registerEvent(
      this.app.vault.on("create", async (file) => {
        if (file instanceof import_obsidian3.TFile) {
          await this.store.refreshFile(file);
        }
      })
    );
    this.registerEvent(
      this.app.vault.on("modify", async (file) => {
        if (file instanceof import_obsidian3.TFile) {
          await this.store.refreshFile(file);
        }
      })
    );
    this.registerEvent(
      this.app.vault.on("delete", async (file) => {
        if (file instanceof import_obsidian3.TFile) {
          this.store.removeFile(file.path);
        }
      })
    );
  }
  async onunload() {
    await this.app.workspace.detachLeavesOfType(PROJECT_HUB_VIEW_TYPE);
  }
  async activateView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(PROJECT_HUB_VIEW_TYPE)[0];
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      await (leaf == null ? void 0 : leaf.setViewState({ type: PROJECT_HUB_VIEW_TYPE, active: true }));
    }
    if (leaf) {
      workspace.revealLeaf(leaf);
      if (leaf.view instanceof ProjectHubDashboardView) {
        return leaf.view;
      }
    }
    return null;
  }
};
