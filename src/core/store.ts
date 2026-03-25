import { App, TFile } from "obsidian";
import {
  BurndownPoint,
  OwnerBreakdownItem,
  ProjectRecord,
  ProjectStats,
  ProjectStoreSnapshot,
  RoadmapEntry,
  RoadmapRecord,
  StatusBreakdownItem,
  TaskRecord,
  VersionProgress,
  VersionRecord
} from "../types";
import { parseMarkdownFile } from "./parser";

type StoreListener = () => void;

function isProject(record: unknown): record is ProjectRecord {
  return typeof record === "object" && record !== null && (record as ProjectRecord).type === "project";
}

function isVersion(record: unknown): record is VersionRecord {
  return typeof record === "object" && record !== null && (record as VersionRecord).type === "version";
}

function isTask(record: unknown): record is TaskRecord {
  return typeof record === "object" && record !== null && (record as TaskRecord).type === "task";
}

function isRoadmap(record: unknown): record is RoadmapRecord {
  return typeof record === "object" && record !== null && (record as RoadmapRecord).type === "roadmap";
}

function compareByPath<T extends { filePath: string }>(left: T, right: T): number {
  return left.filePath.localeCompare(right.filePath);
}

export class ProjectStore {
  private readonly app: App;
  private readonly listeners = new Set<StoreListener>();

  private projects: ProjectRecord[] = [];
  private versions: VersionRecord[] = [];
  private tasks: TaskRecord[] = [];
  private roadmaps: RoadmapRecord[] = [];

  constructor(app: App) {
    this.app = app;
  }

  async rebuild(): Promise<void> {
    const files = this.app.vault.getMarkdownFiles();
    const parsed = await Promise.all(files.map((file) => parseMarkdownFile(this.app, file)));

    this.projects = parsed.map((item) => item.project).filter(isProject).sort(compareByPath);
    this.versions = parsed.map((item) => item.version).filter(isVersion).sort(compareByPath);
    this.tasks = parsed.flatMap((item) => item.tasks).filter(isTask).sort(compareByPath);
    this.roadmaps = parsed.map((item) => item.roadmap).filter(isRoadmap).sort(compareByPath);
    this.emitChange();
  }

  async refreshFile(file: TFile): Promise<void> {
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

  removeFile(path: string): void {
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

  subscribe(listener: StoreListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): ProjectStoreSnapshot {
    return {
      projects: [...this.projects],
      versions: [...this.versions],
      tasks: [...this.tasks],
      roadmaps: [...this.roadmaps]
    };
  }

  getProjects(): ProjectRecord[] {
    return [...this.projects];
  }

  getTasks(project?: string): TaskRecord[] {
    return this.tasks.filter((task) => !project || task.project === project);
  }

  getVersions(project?: string): VersionRecord[] {
    return this.versions.filter((version) => !project || version.project === project);
  }

  getRoadmaps(project?: string): RoadmapRecord[] {
    return this.roadmaps.filter((roadmap) => !project || roadmap.project === project);
  }

  getStats(project?: string): ProjectStats {
    const tasks = this.getTasks(project);
    const today = new Date().toISOString().slice(0, 10);
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
      completionRate: totalTasks === 0 ? 0 : Math.round((doneTasks / totalTasks) * 100)
    };
  }

  getStatusBreakdown(project?: string): StatusBreakdownItem[] {
    const counts = new Map<string, number>();
    for (const task of this.getTasks(project)) {
      counts.set(task.status, (counts.get(task.status) ?? 0) + 1);
    }

    return [...counts.entries()]
      .map(([status, count]) => ({ status, count }))
      .sort((left, right) => right.count - left.count || left.status.localeCompare(right.status));
  }

  getOwnerBreakdown(project?: string): OwnerBreakdownItem[] {
    const owners = new Map<string, OwnerBreakdownItem>();
    for (const task of this.getTasks(project)) {
      const owner = task.owner ?? "未分配";
      const current = owners.get(owner) ?? { owner, total: 0, done: 0 };
      current.total += 1;
      if (task.status === "done") {
        current.done += 1;
      }
      owners.set(owner, current);
    }

    return [...owners.values()].sort((left, right) => right.total - left.total || left.owner.localeCompare(right.owner));
  }

  getVersionProgress(project?: string): VersionProgress[] {
    return this.getVersions(project).map((version) => {
      const versionTasks = this.getTasks(project).filter((task) => task.version === version.version);
      const today = new Date().toISOString().slice(0, 10);
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
        completionRate: totalTasks === 0 ? 0 : Math.round((doneTasks / totalTasks) * 100)
      };
    });
  }

  getBurndown(project?: string): BurndownPoint[] {
    const tasks = this.getTasks(project);
    if (tasks.length === 0) {
      return [];
    }

    const dateSet = new Set<string>();
    for (const task of tasks) {
      if (task.due) {
        dateSet.add(task.due);
      }
      if (task.status === "done") {
        dateSet.add(new Date(task.modifiedTime).toISOString().slice(0, 10));
      }
    }

    if (dateSet.size === 0) {
      const today = new Date().toISOString().slice(0, 10);
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
        Math.round(totalTasks - (totalTasks * index) / Math.max(1, allDates.length - 1))
      );

      return {
        date,
        remaining,
        idealRemaining
      };
    });
  }

  getRoadmapEntries(project?: string): RoadmapEntry[] {
    const baseYear = this.getProjectBaseYear(project);
    const entries: RoadmapEntry[] = [];

    for (const roadmap of this.getRoadmaps(project)) {
      const lines = roadmap.markdownTable.split(/\r?\n/).filter((line) => line.trim().startsWith("|"));
      if (lines.length < 3) {
        continue;
      }

      for (const line of lines.slice(2)) {
        const cells = line
          .split("|")
          .map((cell) => cell.trim())
          .filter((cell) => cell.length > 0);
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

  private getProjectBaseYear(project?: string): number {
    const projectRecord = this.projects.find((item) => item.project === project);
    if (projectRecord?.start?.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return Number(projectRecord.start.slice(0, 4));
    }

    const versionRecord = this.getVersions(project).find((item) => item.releaseDate?.match(/^\d{4}-\d{2}-\d{2}$/));
    if (versionRecord?.releaseDate) {
      return Number(versionRecord.releaseDate.slice(0, 4));
    }

    return new Date().getFullYear();
  }

  private emitChange(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

function expandDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);

  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

function normalizeRoadmapDate(rawValue: string, baseYear: number): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
    return rawValue;
  }

  if (/^\d{2}-\d{2}$/.test(rawValue)) {
    return `${baseYear}-${rawValue}`;
  }

  return null;
}