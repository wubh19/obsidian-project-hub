export type ProjectStatus = "todo" | "in-progress" | "done" | string;
export type TaskStatus = "todo" | "in-progress" | "done" | string;
export type VersionStatus = "todo" | "in-progress" | "done" | string;

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
  effort?: number;
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
  endTime?: string;
  due?: string;
  completed?: string;
  effort?: number;
  remark?: string;
  source: string;
  sourceType: "version-task" | "task-file";
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
  inProgressTasks: number;
  doneTasks: number;
  overdueTasks: number;
  completionRate: number;
  totalEffort: number;
  doneEffort: number;
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
  inProgressTasks: number;
  doneTasks: number;
  overdueTasks: number;
  completionRate: number;
  totalEffort: number;
  doneEffort: number;
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