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
  const normalizedPath = filePath.replace(/\\/g, "/");
  const segments = normalizedPath.split("/");
  const projectsIndex = segments.findIndex((segment) => segment === "Projects");
  if (projectsIndex === -1 || projectsIndex + 1 >= segments.length) {
    return void 0;
  }
  return segments[projectsIndex + 1];
}
function resolveProject(frontmatter, file) {
  var _a, _b;
  return (_b = (_a = normalizeString(frontmatter.project)) != null ? _a : normalizeString(frontmatter.name)) != null ? _b : inferProjectFromPath(file.path);
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
function parseChecklistTasks(content, file, project, sourceType, source, version) {
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
function parseVersion(frontmatter, file, content) {
  var _a;
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
    releaseDate: (_a = normalizeString(frontmatter.release_date)) != null ? _a : normalizeString(frontmatter.end)
  };
}
function parseTask(frontmatter, file, content) {
  var _a, _b, _c, _d;
  const project = resolveProject(frontmatter, file);
  if (!project) {
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
    project,
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
        tasks: versionRecord ? parseChecklistTasks(content, file, project, "version-task", versionRecord.version, versionRecord.version) : []
      };
    case "ops":
      if (!project) {
        return { project: null, version: null, roadmap: null, tasks: [] };
      }
      return {
        project: null,
        version: null,
        roadmap: null,
        tasks: parseChecklistTasks(content, file, project, "ops-task", "\u8FD0\u7EF4")
      };
    case "task":
      return {
        project: null,
        version: null,
        roadmap: null,
        tasks: project ? [parseTask(frontmatter, file, content)].filter((task) => Boolean(task)) : []
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
    this.projects = [];
    this.versions = [];
    this.tasks = [];
    this.roadmaps = [];
    this.app = app;
  }
  async rebuild() {
    const files = this.app.vault.getMarkdownFiles();
    const parsed = await Promise.all(files.map((file) => parseMarkdownFile(this.app, file)));
    this.projects = parsed.map((item) => item.project).filter(isProject).sort(compareByPath);
    this.versions = parsed.map((item) => item.version).filter(isVersion).sort(compareByPath);
    this.tasks = parsed.flatMap((item) => item.tasks).filter(isTask).sort(compareByPath);
    this.roadmaps = parsed.map((item) => item.roadmap).filter(isRoadmap).sort(compareByPath);
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
        this.projects.push(parsed.project);
        this.projects.sort(compareByPath);
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
    this.emitChange();
  }
  removeFile(path) {
    const beforeCounts = [this.projects.length, this.versions.length, this.tasks.length, this.roadmaps.length];
    this.projects = this.projects.filter((item) => item.filePath !== path);
    this.versions = this.versions.filter((item) => item.filePath !== path);
    this.tasks = this.tasks.filter((item) => item.filePath !== path);
    this.roadmaps = this.roadmaps.filter((item) => item.filePath !== path);
    const afterCounts = [this.projects.length, this.versions.length, this.tasks.length, this.roadmaps.length];
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
    const filePath = input.version ? (0, import_obsidian.normalizePath)(`Projects/${input.project}/Versions/V${input.version}.md`) : (0, import_obsidian.normalizePath)(`Projects/${input.project}/Ops/Ops.md`);
    await ensureFolder(this.app, (0, import_obsidian.normalizePath)(filePath.split("/").slice(0, -1).join("/")));
    const abstractFile = this.app.vault.getAbstractFileByPath(filePath);
    const taskLine = buildTaskLine(input.title, input.owner, input.priority, input.due);
    if (abstractFile instanceof import_obsidian.TFile) {
      const content = await this.app.vault.read(abstractFile);
      const nextContent = appendTaskLine(content, taskLine);
      await this.app.vault.modify(abstractFile, nextContent);
      return filePath;
    }
    const initialContent = input.version ? buildVersionFile(input.project, input.version, taskLine) : buildOpsFile(taskLine);
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
function buildOpsFile(taskLine) {
  return [
    "---",
    "type: ops",
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
    new CreateTaskModal({
      app: this.app,
      project: this.selectedProject,
      versions: this.store.getVersions(this.selectedProject),
      onCreated: async () => {
        await this.store.rebuild();
      }
    }).open();
  }
  render() {
    var _a, _b, _c, _d;
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("project-hub-view");
    const projects = this.store.getProjects();
    if (!this.selectedProject && projects.length > 0) {
      this.selectedProject = projects[0].project;
    }
    if (this.selectedProject && !projects.some((item) => item.project === this.selectedProject)) {
      this.selectedProject = (_b = (_a = projects[0]) == null ? void 0 : _a.project) != null ? _b : null;
    }
    this.renderHeader(container, projects);
    if (!this.selectedProject) {
      container.createEl("div", {
        cls: "project-hub-empty-state",
        text: "\u672A\u627E\u5230\u9879\u76EE\u6570\u636E\u3002\u5148\u521B\u5EFA\u5E26\u6709 type: project \u7684 Markdown \u6587\u4EF6\u3002"
      });
      return;
    }
    const versionProgress = this.store.getVersionProgress(this.selectedProject);
    if (!this.selectedVersion && versionProgress.length > 0) {
      this.selectedVersion = versionProgress[0].version.version;
    }
    if (this.selectedVersion && !versionProgress.some((item) => item.version.version === this.selectedVersion)) {
      this.selectedVersion = (_d = (_c = versionProgress[0]) == null ? void 0 : _c.version.version) != null ? _d : null;
    }
    this.renderStats(container, this.selectedProject);
    this.renderCharts(container, this.selectedProject);
    this.renderKanban(container, this.selectedProject);
    this.renderVersionCenter(container, versionProgress);
    this.renderRoadmap(container, this.selectedProject);
  }
  renderHeader(container, projects) {
    var _a;
    const header = container.createDiv({ cls: "project-hub-header" });
    const titleWrap = header.createDiv();
    titleWrap.createEl("h2", { text: "Project Dashboard" });
    titleWrap.createEl("p", {
      cls: "project-hub-subtitle",
      text: "\u4EFB\u52A1\u3001\u7248\u672C\u3001\u62A5\u8868\u3001\u8DEF\u7EBF\u56FE\u7EDF\u4E00\u7BA1\u7406"
    });
    const actions = header.createDiv({ cls: "project-hub-header-actions" });
    const selectorWrap = actions.createDiv({ cls: "project-hub-selector" });
    selectorWrap.createEl("label", { cls: "project-hub-inline-label", text: "\u9879\u76EE" });
    const select = selectorWrap.createEl("select");
    select.createEl("option", { value: "", text: "\u9009\u62E9\u9879\u76EE" });
    for (const project of projects) {
      select.createEl("option", { value: project.project, text: project.project });
    }
    select.value = (_a = this.selectedProject) != null ? _a : "";
    select.addEventListener("change", () => {
      this.selectedProject = select.value || null;
      this.selectedVersion = null;
      this.render();
    });
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
  renderStats(container, project) {
    const stats = this.store.getStats(project);
    const grid = container.createDiv({ cls: "project-hub-stats-grid" });
    this.createStatCard(grid, "\u5B8C\u6210\u7387", `${stats.completionRate}%`, "\u76EE\u6807\u4EA4\u4ED8\u8FDB\u5EA6");
    this.createStatCard(grid, "\u603B\u4EFB\u52A1", String(stats.totalTasks), "\u9879\u76EE\u8303\u56F4\u5185\u7684\u4EFB\u52A1\u603B\u6570");
    this.createStatCard(grid, "\u8FDB\u884C\u4E2D", String(stats.doingTasks), "\u5F53\u524D\u63A8\u8FDB\u4E2D\u7684\u4EFB\u52A1");
    this.createStatCard(grid, "\u5DF2\u5EF6\u671F", String(stats.overdueTasks), "\u622A\u6B62\u5DF2\u8FC7\u4E14\u672A\u5B8C\u6210");
  }
  createStatCard(container, label, value, caption) {
    const card = container.createDiv({ cls: "project-hub-stat-card" });
    card.createEl("span", { cls: "project-hub-stat-label", text: label });
    card.createEl("strong", { cls: "project-hub-stat-value", text: value });
    card.createEl("span", { cls: "project-hub-card-caption", text: caption });
  }
  renderCharts(container, project) {
    const section = container.createDiv({ cls: "project-hub-section" });
    section.createEl("h3", { text: "Dashboard \u56FE\u8868" });
    const grid = section.createDiv({ cls: "project-hub-chart-grid" });
    this.renderStatusDistribution(grid, project);
    this.renderOwnerBreakdown(grid, project);
    this.renderBurndown(grid, project);
  }
  renderStatusDistribution(container, project) {
    const card = container.createDiv({ cls: "project-hub-chart-card" });
    card.createEl("h4", { text: "\u72B6\u6001\u5206\u5E03" });
    const items = this.store.getStatusBreakdown(project);
    if (items.length === 0) {
      card.createEl("p", { cls: "project-hub-empty-state small", text: "\u6682\u65E0\u4EFB\u52A1\u6570\u636E" });
      return;
    }
    const total = items.reduce((sum, item) => sum + item.count, 0);
    for (const item of items) {
      const row = card.createDiv({ cls: "project-hub-bar-row" });
      row.createEl("span", { cls: "project-hub-bar-label", text: item.status });
      const track = row.createDiv({ cls: "project-hub-bar-track" });
      track.createDiv({ cls: `project-hub-bar-fill ${statusClass(item.status)}` }).style.width = `${Math.max(8, Math.round(item.count / total * 100))}%`;
      row.createEl("span", { cls: "project-hub-bar-value", text: String(item.count) });
    }
  }
  renderOwnerBreakdown(container, project) {
    const card = container.createDiv({ cls: "project-hub-chart-card" });
    card.createEl("h4", { text: "\u6309\u4EBA\u7EDF\u8BA1" });
    const owners = this.store.getOwnerBreakdown(project);
    if (owners.length === 0) {
      card.createEl("p", { cls: "project-hub-empty-state small", text: "\u6682\u65E0\u8D1F\u8D23\u4EBA\u6570\u636E" });
      return;
    }
    for (const owner of owners.slice(0, 6)) {
      const row = card.createDiv({ cls: "project-hub-owner-row" });
      const label = row.createDiv({ cls: "project-hub-owner-header" });
      label.createEl("span", { text: owner.owner });
      label.createEl("span", { text: `${owner.done}/${owner.total} \u5B8C\u6210` });
      const track = row.createDiv({ cls: "project-hub-bar-track" });
      track.createDiv({ cls: "project-hub-bar-fill is-owner" }).style.width = `${owner.total === 0 ? 0 : Math.round(owner.done / owner.total * 100)}%`;
    }
  }
  renderBurndown(container, project) {
    const card = container.createDiv({ cls: "project-hub-chart-card project-hub-chart-card-wide" });
    card.createEl("h4", { text: "\u71C3\u5C3D\u56FE" });
    card.createEl("p", {
      cls: "project-hub-card-caption",
      text: "\u5B9E\u9645\u7EBF\u57FA\u4E8E\u5DF2\u5B8C\u6210\u4EFB\u52A1\u6587\u4EF6\u7684\u6700\u8FD1\u4FEE\u6539\u65F6\u95F4\u4F30\u7B97"
    });
    const points = this.store.getBurndown(project);
    if (points.length < 2) {
      card.createEl("p", { cls: "project-hub-empty-state small", text: "\u6570\u636E\u4E0D\u8DB3\uFF0C\u65E0\u6CD5\u7ED8\u5236\u71C3\u5C3D\u56FE" });
      return;
    }
    this.renderBurndownSvg(card, points);
  }
  renderBurndownSvg(container, points) {
    const width = 640;
    const height = 220;
    const padding = 24;
    const maxValue = Math.max(...points.map((point) => Math.max(point.remaining, point.idealRemaining)), 1);
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.classList.add("project-hub-burndown-svg");
    for (let index = 0; index < 4; index += 1) {
      const y = padding + (height - padding * 2) / 3 * index;
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", String(padding));
      line.setAttribute("x2", String(width - padding));
      line.setAttribute("y1", String(y));
      line.setAttribute("y2", String(y));
      line.setAttribute("class", "project-hub-grid-line");
      svg.appendChild(line);
    }
    const actualPolyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    actualPolyline.setAttribute("fill", "none");
    actualPolyline.setAttribute("class", "project-hub-line-actual");
    actualPolyline.setAttribute("points", toPolyline(points, width, height, padding, maxValue, "remaining"));
    svg.appendChild(actualPolyline);
    const idealPolyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    idealPolyline.setAttribute("fill", "none");
    idealPolyline.setAttribute("class", "project-hub-line-ideal");
    idealPolyline.setAttribute("points", toPolyline(points, width, height, padding, maxValue, "idealRemaining"));
    svg.appendChild(idealPolyline);
    container.appendChild(svg);
    const labels = container.createDiv({ cls: "project-hub-burndown-labels" });
    labels.createSpan({ text: points[0].date });
    labels.createSpan({ text: points[points.length - 1].date });
  }
  renderKanban(container, project) {
    const section = container.createDiv({ cls: "project-hub-section" });
    const header = section.createDiv({ cls: "project-hub-section-header" });
    header.createEl("h3", { text: "\u4EFB\u52A1\u770B\u677F" });
    header.createEl("p", { cls: "project-hub-card-caption", text: "\u652F\u6301\u62D6\u62FD\u5361\u7247\u76F4\u63A5\u66F4\u65B0\u4EFB\u52A1\u72B6\u6001" });
    const tasks = this.store.getTasks(project);
    const columns = section.createDiv({ cls: "project-hub-task-columns" });
    this.renderTaskColumn(columns, "todo", "Todo", tasks.filter((task) => task.status === "todo"), true);
    this.renderTaskColumn(columns, "doing", "Doing", tasks.filter((task) => task.status === "doing"), true);
    this.renderTaskColumn(columns, "done", "Done", tasks.filter((task) => task.status === "done"), true);
    const otherTasks = tasks.filter((task) => !["todo", "doing", "done"].includes(task.status));
    if (otherTasks.length > 0) {
      this.renderTaskColumn(columns, "other", "Other", otherTasks, false);
    }
  }
  renderTaskColumn(container, status, label, tasks, droppable) {
    const column = container.createDiv({ cls: "project-hub-task-column" });
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
    const header = column.createDiv({ cls: "project-hub-task-column-header" });
    header.createEl("span", { text: label });
    header.createEl("span", { cls: "project-hub-count-badge", text: String(tasks.length) });
    if (tasks.length === 0) {
      column.createEl("div", {
        cls: "project-hub-empty-state small",
        text: droppable ? `\u62D6\u62FD\u4EFB\u52A1\u5230 ${label}` : `${label} \u5217\u4E3A\u7A7A`
      });
      return;
    }
    for (const task of tasks) {
      this.renderTaskCard(column, task, status, droppable);
    }
  }
  renderTaskCard(container, task, currentStatus, draggable) {
    var _a;
    const card = container.createDiv({ cls: "project-hub-task-card" });
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
    const top = card.createDiv({ cls: "project-hub-task-card-top" });
    top.createEl("div", { cls: "project-hub-task-title", text: task.text });
    top.createDiv({ cls: `project-hub-priority-badge ${priorityClass(task.priority)}`, text: (_a = task.priority) != null ? _a : "medium" });
    const meta = card.createDiv({ cls: "project-hub-task-meta" });
    meta.createSpan({ text: task.version ? `\u7248\u672C ${task.version}` : "\u8FD0\u7EF4\u4EFB\u52A1" });
    meta.createSpan({ text: task.owner ? `\u8D1F\u8D23\u4EBA ${task.owner}` : "\u672A\u5206\u914D" });
    meta.createSpan({ text: task.sourceType === "ops-task" ? "\u6765\u6E90 Ops" : `\u6765\u6E90 ${task.source}` });
    if (task.due) {
      meta.createSpan({ text: `\u622A\u6B62 ${task.due}` });
    }
    const actions = card.createDiv({ cls: "project-hub-task-actions" });
    const openButton = actions.createEl("button", { text: "\u6253\u5F00" });
    openButton.addEventListener("click", async () => {
      await this.openTaskFile(task);
    });
    const moveButton = actions.createEl("button", { text: "\u4FEE\u6539\u72B6\u6001" });
    moveButton.addEventListener("click", (event) => {
      const menu = new import_obsidian2.Menu();
      for (const status of ["todo", "doing", "done"]) {
        menu.addItem((item) => {
          item.setTitle(status).setChecked(status === currentStatus).onClick(async () => {
            await this.updateTaskStatus(task, status);
          });
        });
      }
      menu.showAtMouseEvent(event);
    });
  }
  renderVersionCenter(container, versions) {
    var _a, _b, _c, _d, _e;
    const section = container.createDiv({ cls: "project-hub-section" });
    section.createEl("h3", { text: "\u7248\u672C\u4E2D\u5FC3" });
    if (versions.length === 0) {
      section.createEl("p", { cls: "project-hub-empty-state", text: "\u5F53\u524D\u9879\u76EE\u8FD8\u6CA1\u6709\u7248\u672C\u6587\u4EF6\u3002" });
      return;
    }
    const layout = section.createDiv({ cls: "project-hub-version-center" });
    const list = layout.createDiv({ cls: "project-hub-version-list" });
    const detail = layout.createDiv({ cls: "project-hub-version-detail" });
    for (const item of versions) {
      const card = list.createDiv({ cls: "project-hub-version-item" });
      if (item.version.version === this.selectedVersion) {
        card.addClass("is-active");
      }
      card.addEventListener("click", () => {
        this.selectedVersion = item.version.version;
        this.render();
      });
      card.createEl("div", { cls: "project-hub-version-title", text: item.version.version });
      card.createEl("div", { cls: "project-hub-version-meta", text: `${item.doneTasks}/${item.totalTasks} \u5DF2\u5B8C\u6210` });
      const bar = card.createDiv({ cls: "project-hub-progress-bar" });
      bar.createDiv({ cls: "project-hub-progress-bar-fill" }).style.width = `${item.completionRate}%`;
    }
    const current = (_a = versions.find((item) => item.version.version === this.selectedVersion)) != null ? _a : versions[0];
    detail.createEl("h4", { text: current.version.version });
    detail.createEl("p", {
      cls: "project-hub-card-caption",
      text: `\u72B6\u6001 ${(_b = current.version.status) != null ? _b : "unknown"} \xB7 \u53D1\u5E03\u65E5\u671F ${(_c = current.version.releaseDate) != null ? _c : "\u672A\u8BBE\u7F6E"}`
    });
    const metrics = detail.createDiv({ cls: "project-hub-version-metrics" });
    for (const entry of [
      ["\u5B8C\u6210\u7387", `${current.completionRate}%`],
      ["Todo", String(current.todoTasks)],
      ["Doing", String(current.doingTasks)],
      ["Done", String(current.doneTasks)],
      ["Overdue", String(current.overdueTasks)]
    ]) {
      const metric = metrics.createDiv({ cls: "project-hub-mini-card" });
      metric.createEl("span", { text: entry[0] });
      metric.createEl("strong", { text: entry[1] });
    }
    const tasks = this.store.getTasks((_d = this.selectedProject) != null ? _d : void 0).filter((task) => task.version === current.version.version);
    const taskList = detail.createDiv({ cls: "project-hub-version-task-list" });
    for (const task of tasks.slice(0, 8)) {
      const row = taskList.createDiv({ cls: "project-hub-inline-task" });
      row.createEl("span", { text: task.text });
      const tags = row.createDiv({ cls: "project-hub-inline-task-tags" });
      tags.createSpan({ text: task.status });
      tags.createSpan({ text: (_e = task.owner) != null ? _e : "\u672A\u5206\u914D" });
    }
    if (tasks.length === 0) {
      taskList.createEl("p", { cls: "project-hub-empty-state small", text: "\u8BE5\u7248\u672C\u6682\u65E0\u4EFB\u52A1" });
    }
  }
  renderRoadmap(container, project) {
    const section = container.createDiv({ cls: "project-hub-section" });
    section.createEl("h3", { text: "Roadmap" });
    const entries = this.store.getRoadmapEntries(project);
    if (entries.length === 0) {
      section.createEl("p", {
        cls: "project-hub-empty-state",
        text: "\u5F53\u524D\u9879\u76EE\u8FD8\u6CA1\u6709\u53EF\u89E3\u6790\u7684 Roadmap \u8868\u683C\u3002"
      });
      return;
    }
    const minDate = entries[0].start;
    const maxDate = entries.reduce((latest, item) => item.end > latest ? item.end : latest, entries[0].end);
    section.createDiv({ cls: "project-hub-roadmap-range", text: `${minDate} \u2192 ${maxDate}` });
    const timeline = section.createDiv({ cls: "project-hub-roadmap" });
    for (const entry of entries) {
      this.renderRoadmapRow(timeline, entry, minDate, maxDate);
    }
  }
  renderRoadmapRow(container, entry, minDate, maxDate) {
    const row = container.createDiv({ cls: "project-hub-roadmap-row" });
    const meta = row.createDiv({ cls: "project-hub-roadmap-meta" });
    meta.createEl("strong", { text: entry.label });
    meta.createEl("span", { text: entry.status });
    const daysTotal = diffDays(minDate, maxDate) + 1;
    const offsetDays = diffDays(minDate, entry.start);
    const durationDays = Math.max(1, diffDays(entry.start, entry.end) + 1);
    const track = row.createDiv({ cls: "project-hub-roadmap-track" });
    const bar = track.createDiv({ cls: `project-hub-roadmap-bar ${roadmapStatusClass(entry.status)}` });
    bar.style.marginLeft = `${offsetDays / daysTotal * 100}%`;
    bar.style.width = `${Math.max(8, durationDays / daysTotal * 100)}%`;
    bar.setText(`${entry.start} - ${entry.end}`);
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
    const nextContent = updateChecklistTaskStatus(content, task, status);
    if (nextContent === content) {
      new import_obsidian2.Notice("\u672A\u627E\u5230\u4EFB\u52A1\u884C\uFF0C\u65E0\u6CD5\u66F4\u65B0\u4EFB\u52A1\u72B6\u6001");
      return;
    }
    await this.plugin.app.vault.modify(abstractFile, nextContent);
    new import_obsidian2.Notice(`\u4EFB\u52A1\u72B6\u6001\u5DF2\u66F4\u65B0\u4E3A ${status}`);
  }
};
function toPolyline(points, width, height, padding, maxValue, key) {
  return points.map((point, index) => {
    const x = padding + (width - padding * 2) * index / Math.max(1, points.length - 1);
    const y = height - padding - (height - padding * 2) * point[key] / maxValue;
    return `${x},${y}`;
  }).join(" ");
}
function diffDays(left, right) {
  const start = /* @__PURE__ */ new Date(`${left}T00:00:00`);
  const end = /* @__PURE__ */ new Date(`${right}T00:00:00`);
  return Math.round((end.getTime() - start.getTime()) / 864e5);
}
function statusClass(status) {
  const normalized = status.trim().toLowerCase();
  if (normalized === "todo") {
    return "is-todo";
  }
  if (normalized === "doing") {
    return "is-doing";
  }
  if (normalized === "done") {
    return "is-done";
  }
  return "is-neutral";
}
function priorityClass(priority) {
  var _a;
  const normalized = (_a = priority == null ? void 0 : priority.trim().toLowerCase()) != null ? _a : "medium";
  if (["urgent", "critical"].includes(normalized)) {
    return "is-urgent";
  }
  if (normalized === "high") {
    return "is-high";
  }
  if (normalized === "low") {
    return "is-low";
  }
  return "is-medium";
}
function roadmapStatusClass(status) {
  const normalized = status.trim().toLowerCase();
  if (["\u5F00\u53D1\u4E2D", "developing", "doing", "active"].includes(normalized)) {
    return "is-active";
  }
  if (["\u89C4\u5212\u4E2D", "planned", "todo"].includes(normalized)) {
    return "is-planned";
  }
  if (["\u5DF2\u53D1\u5E03", "released", "done"].includes(normalized)) {
    return "is-done";
  }
  return "is-neutral";
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
