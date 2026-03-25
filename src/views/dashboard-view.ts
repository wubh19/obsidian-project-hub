import { ItemView, Menu, Notice, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { ProjectStore } from "../core/store";
import { CreateTaskModal } from "../modals/create-task-modal";
import { BurndownPoint, ProjectRecord, RoadmapEntry, TaskRecord, VersionProgress } from "../types";

export const PROJECT_HUB_VIEW_TYPE = "project-hub-dashboard";

type StatusOption = TaskRecord["status"];

export class ProjectHubDashboardView extends ItemView {
  private readonly plugin: Plugin;
  private readonly store: ProjectStore;
  private selectedProject: string | null = null;
  private selectedVersion: string | null = null;
  private draggingTaskId: string | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: Plugin, store: ProjectStore) {
    super(leaf);
    this.plugin = plugin;
    this.store = store;
  }

  getViewType(): string {
    return PROJECT_HUB_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Project Hub";
  }

  getIcon(): string {
    return "layout-dashboard";
  }

  async onOpen(): Promise<void> {
    this.unsubscribe = this.store.subscribe(() => {
      this.render();
    });
    this.render();
  }

  async onClose(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  async openQuickCreateTask(): Promise<void> {
    if (!this.selectedProject) {
      new Notice("请先选择一个项目");
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

  private render(): void {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("project-hub-view");

    const projects = this.store.getProjects();
    if (!this.selectedProject && projects.length > 0) {
      this.selectedProject = projects[0].project;
    }
    if (this.selectedProject && !projects.some((item) => item.project === this.selectedProject)) {
      this.selectedProject = projects[0]?.project ?? null;
    }

    this.renderHeader(container, projects);

    if (!this.selectedProject) {
      container.createEl("div", {
        cls: "project-hub-empty-state",
        text: "未找到项目数据。先创建带有 type: project 的 Markdown 文件。"
      });
      return;
    }

    const versionProgress = this.store.getVersionProgress(this.selectedProject);
    if (!this.selectedVersion && versionProgress.length > 0) {
      this.selectedVersion = versionProgress[0].version.version;
    }
    if (this.selectedVersion && !versionProgress.some((item) => item.version.version === this.selectedVersion)) {
      this.selectedVersion = versionProgress[0]?.version.version ?? null;
    }

    this.renderStats(container, this.selectedProject);
    this.renderCharts(container, this.selectedProject);
    this.renderKanban(container, this.selectedProject);
    this.renderVersionCenter(container, versionProgress);
    this.renderRoadmap(container, this.selectedProject);
  }

  private renderHeader(container: HTMLElement, projects: ProjectRecord[]): void {
    const header = container.createDiv({ cls: "project-hub-header" });
    const titleWrap = header.createDiv();
    titleWrap.createEl("h2", { text: "Project Dashboard" });
    titleWrap.createEl("p", {
      cls: "project-hub-subtitle",
      text: "任务、版本、报表、路线图统一管理"
    });

    const actions = header.createDiv({ cls: "project-hub-header-actions" });
    const selectorWrap = actions.createDiv({ cls: "project-hub-selector" });
    selectorWrap.createEl("label", { cls: "project-hub-inline-label", text: "项目" });
    const select = selectorWrap.createEl("select");
    select.createEl("option", { value: "", text: "选择项目" });
    for (const project of projects) {
      select.createEl("option", { value: project.project, text: project.project });
    }
    select.value = this.selectedProject ?? "";
    select.addEventListener("change", () => {
      this.selectedProject = select.value || null;
      this.selectedVersion = null;
      this.render();
    });

    const createButton = actions.createEl("button", { cls: "mod-cta", text: "快速新建任务" });
    createButton.addEventListener("click", async () => {
      await this.openQuickCreateTask();
    });

    const refreshButton = actions.createEl("button", { text: "刷新" });
    refreshButton.addEventListener("click", async () => {
      await this.store.rebuild();
      new Notice("Project Hub 数据已刷新");
    });
  }

  private renderStats(container: HTMLElement, project: string): void {
    const stats = this.store.getStats(project);
    const grid = container.createDiv({ cls: "project-hub-stats-grid" });

    this.createStatCard(grid, "完成率", `${stats.completionRate}%`, "目标交付进度");
    this.createStatCard(grid, "总任务", String(stats.totalTasks), "项目范围内的任务总数");
    this.createStatCard(grid, "进行中", String(stats.doingTasks), "当前推进中的任务");
    this.createStatCard(grid, "已延期", String(stats.overdueTasks), "截止已过且未完成");
  }

  private createStatCard(container: HTMLElement, label: string, value: string, caption: string): void {
    const card = container.createDiv({ cls: "project-hub-stat-card" });
    card.createEl("span", { cls: "project-hub-stat-label", text: label });
    card.createEl("strong", { cls: "project-hub-stat-value", text: value });
    card.createEl("span", { cls: "project-hub-card-caption", text: caption });
  }

  private renderCharts(container: HTMLElement, project: string): void {
    const section = container.createDiv({ cls: "project-hub-section" });
    section.createEl("h3", { text: "Dashboard 图表" });

    const grid = section.createDiv({ cls: "project-hub-chart-grid" });
    this.renderStatusDistribution(grid, project);
    this.renderOwnerBreakdown(grid, project);
    this.renderBurndown(grid, project);
  }

  private renderStatusDistribution(container: HTMLElement, project: string): void {
    const card = container.createDiv({ cls: "project-hub-chart-card" });
    card.createEl("h4", { text: "状态分布" });
    const items = this.store.getStatusBreakdown(project);
    if (items.length === 0) {
      card.createEl("p", { cls: "project-hub-empty-state small", text: "暂无任务数据" });
      return;
    }

    const total = items.reduce((sum, item) => sum + item.count, 0);
    for (const item of items) {
      const row = card.createDiv({ cls: "project-hub-bar-row" });
      row.createEl("span", { cls: "project-hub-bar-label", text: item.status });
      const track = row.createDiv({ cls: "project-hub-bar-track" });
      track
        .createDiv({ cls: `project-hub-bar-fill ${statusClass(item.status)}` })
        .style.width = `${Math.max(8, Math.round((item.count / total) * 100))}%`;
      row.createEl("span", { cls: "project-hub-bar-value", text: String(item.count) });
    }
  }

  private renderOwnerBreakdown(container: HTMLElement, project: string): void {
    const card = container.createDiv({ cls: "project-hub-chart-card" });
    card.createEl("h4", { text: "按人统计" });
    const owners = this.store.getOwnerBreakdown(project);
    if (owners.length === 0) {
      card.createEl("p", { cls: "project-hub-empty-state small", text: "暂无负责人数据" });
      return;
    }

    for (const owner of owners.slice(0, 6)) {
      const row = card.createDiv({ cls: "project-hub-owner-row" });
      const label = row.createDiv({ cls: "project-hub-owner-header" });
      label.createEl("span", { text: owner.owner });
      label.createEl("span", { text: `${owner.done}/${owner.total} 完成` });
      const track = row.createDiv({ cls: "project-hub-bar-track" });
      track.createDiv({ cls: "project-hub-bar-fill is-owner" }).style.width = `${owner.total === 0 ? 0 : Math.round((owner.done / owner.total) * 100)}%`;
    }
  }

  private renderBurndown(container: HTMLElement, project: string): void {
    const card = container.createDiv({ cls: "project-hub-chart-card project-hub-chart-card-wide" });
    card.createEl("h4", { text: "燃尽图" });
    card.createEl("p", {
      cls: "project-hub-card-caption",
      text: "实际线基于已完成任务文件的最近修改时间估算"
    });

    const points = this.store.getBurndown(project);
    if (points.length < 2) {
      card.createEl("p", { cls: "project-hub-empty-state small", text: "数据不足，无法绘制燃尽图" });
      return;
    }

    this.renderBurndownSvg(card, points);
  }

  private renderBurndownSvg(container: HTMLElement, points: BurndownPoint[]): void {
    const width = 640;
    const height = 220;
    const padding = 24;
    const maxValue = Math.max(...points.map((point) => Math.max(point.remaining, point.idealRemaining)), 1);
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.classList.add("project-hub-burndown-svg");

    for (let index = 0; index < 4; index += 1) {
      const y = padding + ((height - padding * 2) / 3) * index;
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

  private renderKanban(container: HTMLElement, project: string): void {
    const section = container.createDiv({ cls: "project-hub-section" });
    const header = section.createDiv({ cls: "project-hub-section-header" });
    header.createEl("h3", { text: "任务看板" });
    header.createEl("p", { cls: "project-hub-card-caption", text: "支持拖拽卡片直接更新任务状态" });

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

  private renderTaskColumn(
    container: HTMLElement,
    status: string,
    label: string,
    tasks: TaskRecord[],
    droppable: boolean
  ): void {
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
        text: droppable ? `拖拽任务到 ${label}` : `${label} 列为空`
      });
      return;
    }

    for (const task of tasks) {
      this.renderTaskCard(column, task, status as StatusOption, droppable);
    }
  }

  private renderTaskCard(
    container: HTMLElement,
    task: TaskRecord,
    currentStatus: StatusOption,
    draggable: boolean
  ): void {
    const card = container.createDiv({ cls: "project-hub-task-card" });
    if (draggable) {
      card.setAttribute("draggable", "true");
      card.addEventListener("dragstart", (event) => {
        this.draggingTaskId = task.id;
        event.dataTransfer?.setData("text/plain", task.id);
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
    top.createDiv({ cls: `project-hub-priority-badge ${priorityClass(task.priority)}`, text: task.priority ?? "medium" });

    const meta = card.createDiv({ cls: "project-hub-task-meta" });
    meta.createSpan({ text: task.version ? `版本 ${task.version}` : "运维任务" });
    meta.createSpan({ text: task.owner ? `负责人 ${task.owner}` : "未分配" });
    meta.createSpan({ text: task.sourceType === "ops-task" ? "来源 Ops" : `来源 ${task.source}` });
    if (task.due) {
      meta.createSpan({ text: `截止 ${task.due}` });
    }

    const actions = card.createDiv({ cls: "project-hub-task-actions" });
    const openButton = actions.createEl("button", { text: "打开" });
    openButton.addEventListener("click", async () => {
      await this.openTaskFile(task);
    });

    const moveButton = actions.createEl("button", { text: "修改状态" });
    moveButton.addEventListener("click", (event) => {
      const menu = new Menu();
      for (const status of ["todo", "doing", "done"]) {
        menu.addItem((item) => {
          item
            .setTitle(status)
            .setChecked(status === currentStatus)
            .onClick(async () => {
              await this.updateTaskStatus(task, status);
            });
        });
      }
      menu.showAtMouseEvent(event);
    });
  }

  private renderVersionCenter(container: HTMLElement, versions: VersionProgress[]): void {
    const section = container.createDiv({ cls: "project-hub-section" });
    section.createEl("h3", { text: "版本中心" });
    if (versions.length === 0) {
      section.createEl("p", { cls: "project-hub-empty-state", text: "当前项目还没有版本文件。" });
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
      card.createEl("div", { cls: "project-hub-version-meta", text: `${item.doneTasks}/${item.totalTasks} 已完成` });
      const bar = card.createDiv({ cls: "project-hub-progress-bar" });
      bar.createDiv({ cls: "project-hub-progress-bar-fill" }).style.width = `${item.completionRate}%`;
    }

    const current = versions.find((item) => item.version.version === this.selectedVersion) ?? versions[0];
    detail.createEl("h4", { text: current.version.version });
    detail.createEl("p", {
      cls: "project-hub-card-caption",
      text: `状态 ${current.version.status ?? "unknown"} · 发布日期 ${current.version.releaseDate ?? "未设置"}`
    });

    const metrics = detail.createDiv({ cls: "project-hub-version-metrics" });
    for (const entry of [
      ["完成率", `${current.completionRate}%`],
      ["Todo", String(current.todoTasks)],
      ["Doing", String(current.doingTasks)],
      ["Done", String(current.doneTasks)],
      ["Overdue", String(current.overdueTasks)]
    ]) {
      const metric = metrics.createDiv({ cls: "project-hub-mini-card" });
      metric.createEl("span", { text: entry[0] });
      metric.createEl("strong", { text: entry[1] });
    }

    const tasks = this.store
      .getTasks(this.selectedProject ?? undefined)
      .filter((task) => task.version === current.version.version);
    const taskList = detail.createDiv({ cls: "project-hub-version-task-list" });
    for (const task of tasks.slice(0, 8)) {
      const row = taskList.createDiv({ cls: "project-hub-inline-task" });
      row.createEl("span", { text: task.text });
      const tags = row.createDiv({ cls: "project-hub-inline-task-tags" });
      tags.createSpan({ text: task.status });
      tags.createSpan({ text: task.owner ?? "未分配" });
    }
    if (tasks.length === 0) {
      taskList.createEl("p", { cls: "project-hub-empty-state small", text: "该版本暂无任务" });
    }
  }

  private renderRoadmap(container: HTMLElement, project: string): void {
    const section = container.createDiv({ cls: "project-hub-section" });
    section.createEl("h3", { text: "Roadmap" });
    const entries = this.store.getRoadmapEntries(project);
    if (entries.length === 0) {
      section.createEl("p", {
        cls: "project-hub-empty-state",
        text: "当前项目还没有可解析的 Roadmap 表格。"
      });
      return;
    }

    const minDate = entries[0].start;
    const maxDate = entries.reduce((latest, item) => (item.end > latest ? item.end : latest), entries[0].end);
    section.createDiv({ cls: "project-hub-roadmap-range", text: `${minDate} → ${maxDate}` });
    const timeline = section.createDiv({ cls: "project-hub-roadmap" });
    for (const entry of entries) {
      this.renderRoadmapRow(timeline, entry, minDate, maxDate);
    }
  }

  private renderRoadmapRow(container: HTMLElement, entry: RoadmapEntry, minDate: string, maxDate: string): void {
    const row = container.createDiv({ cls: "project-hub-roadmap-row" });
    const meta = row.createDiv({ cls: "project-hub-roadmap-meta" });
    meta.createEl("strong", { text: entry.label });
    meta.createEl("span", { text: entry.status });

    const daysTotal = diffDays(minDate, maxDate) + 1;
    const offsetDays = diffDays(minDate, entry.start);
    const durationDays = Math.max(1, diffDays(entry.start, entry.end) + 1);
    const track = row.createDiv({ cls: "project-hub-roadmap-track" });
    const bar = track.createDiv({ cls: `project-hub-roadmap-bar ${roadmapStatusClass(entry.status)}` });
    bar.style.marginLeft = `${(offsetDays / daysTotal) * 100}%`;
    bar.style.width = `${Math.max(8, (durationDays / daysTotal) * 100)}%`;
    bar.setText(`${entry.start} - ${entry.end}`);
  }

  private async handleDrop(targetStatus: string): Promise<void> {
    const taskId = this.draggingTaskId;
    this.draggingTaskId = null;
    if (!taskId) {
      return;
    }

    const task = this.store.getTasks(this.selectedProject ?? undefined).find((item) => item.id === taskId);
    if (!task) {
      return;
    }

    await this.updateTaskStatus(task, targetStatus);
  }

  private async openTaskFile(task: TaskRecord): Promise<void> {
    const file = this.plugin.app.vault.getAbstractFileByPath(task.filePath);
    if (file instanceof TFile) {
      await this.plugin.app.workspace.getLeaf(true).openFile(file);
    }
  }

  private async updateTaskStatus(task: TaskRecord, status: string): Promise<void> {
    if (task.status === status) {
      return;
    }

    const abstractFile = this.plugin.app.vault.getAbstractFileByPath(task.filePath);
    if (!(abstractFile instanceof TFile)) {
      new Notice(`未找到文件: ${task.filePath}`);
      return;
    }

    const content = await this.plugin.app.vault.read(abstractFile);
    const nextContent = updateChecklistTaskStatus(content, task, status);
    if (nextContent === content) {
      new Notice("未找到任务行，无法更新任务状态");
      return;
    }

    await this.plugin.app.vault.modify(abstractFile, nextContent);
    new Notice(`任务状态已更新为 ${status}`);
  }
}

function toPolyline(
  points: BurndownPoint[],
  width: number,
  height: number,
  padding: number,
  maxValue: number,
  key: "remaining" | "idealRemaining"
): string {
  return points
    .map((point, index) => {
      const x = padding + ((width - padding * 2) * index) / Math.max(1, points.length - 1);
      const y = height - padding - ((height - padding * 2) * point[key]) / maxValue;
      return `${x},${y}`;
    })
    .join(" ");
}

function diffDays(left: string, right: string): number {
  const start = new Date(`${left}T00:00:00`);
  const end = new Date(`${right}T00:00:00`);
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

function statusClass(status: string): string {
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

function priorityClass(priority?: string): string {
  const normalized = priority?.trim().toLowerCase() ?? "medium";
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

function roadmapStatusClass(status: string): string {
  const normalized = status.trim().toLowerCase();
  if (["开发中", "developing", "doing", "active"].includes(normalized)) {
    return "is-active";
  }
  if (["规划中", "planned", "todo"].includes(normalized)) {
    return "is-planned";
  }
  if (["已发布", "released", "done"].includes(normalized)) {
    return "is-done";
  }
  return "is-neutral";
}

function updateChecklistTaskStatus(content: string, task: TaskRecord, status: string): string {
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

  const rawText = match[4]
    .replace(/🚧/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const nextMarker = status === "done" ? "x" : " ";
  const nextText = status === "doing" ? `${rawText} 🚧` : rawText;
  lines[index] = `${match[1]}${nextMarker}${match[3]}${nextText}`;
  return lines.join("\n");
}