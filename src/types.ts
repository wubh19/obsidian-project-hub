export type ProjectStatus = "active" | "planned" | "paused" | "done" | "archived" | string;
export type TaskStatus = "todo" | "doing" | "done" | string;
export type VersionStatus = "planned" | "developing" | "released" | string;

export interface BaseEntity {
  filePath: string;
  title: string;
  modifiedTime: number;
}

export interface ProjectRecord extends BaseEntity {
  type: "project";
  project: string;
  projectPath: string;
  owner?: string;
  status?: ProjectStatus;
  start?: string;
  end?: string;
}

export interface VersionRecord extends BaseEntity {
  type: "version";
  project: string;
  projectPath: string;
  version: string;
  status?: VersionStatus;
  start?: string;
  end?: string;
  releaseDate?: string;
}

export interface TaskRecord extends BaseEntity {
  id: string;
  type: "task";
  project: string;
  projectPath: string;
  version?: string;
  owner?: string;
  priority?: string;
  status: TaskStatus;
  start?: string;
  due?: string;
  source: string;
  sourceType: "version-task" | "ops-task";
  lineNumber: number;
  rawText: string;
  text: string;
}

export interface RoadmapRecord extends BaseEntity {
  type: "roadmap";
  project: string;
  projectPath: string;
  markdownTable: string;
}

export interface ProjectStats {
  totalTasks: number;
  todoTasks: number;
  doingTasks: number;
  doneTasks: number;
  overdueTasks: number;
  completionRate: number;
}

export interface StatusBreakdownItem {
  status: string;
  count: number;
}

export interface OwnerBreakdownItem {
  owner: string;
  total: number;
  done: number;
}

export interface VersionProgress {
  version: VersionRecord;
  totalTasks: number;
  todoTasks: number;
  doingTasks: number;
  doneTasks: number;
  overdueTasks: number;
  completionRate: number;
}

export interface BurndownPoint {
  date: string;
  remaining: number;
  idealRemaining: number;
}

export interface RoadmapEntry {
  label: string;
  start: string;
  end: string;
  status: string;
}

export interface ProjectStoreSnapshot {
  projects: ProjectRecord[];
  versions: VersionRecord[];
  tasks: TaskRecord[];
  roadmaps: RoadmapRecord[];
}