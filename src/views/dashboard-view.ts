import { ItemView, Notice, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { ProjectStore } from "../core/store";
import { CreateTaskModal } from "../modals/create-task-modal";
import { BurndownPoint, ProjectRecord, TaskRecord, VersionRecord } from "../types";

export const PROJECT_HUB_VIEW_TYPE = "project-hub-dashboard";
const ALL_PROJECTS_VALUE = "__all_projects__";

type StatusOption = TaskRecord["status"];

export class ProjectHubDashboardView extends ItemView {
  private readonly plugin: Plugin;
  private readonly store: ProjectStore;
  private selectedProject: string | null = null;
  private selectedVersion: string | null = null;
  private draggingTaskId: string | null = null;
  private readonly expandedVersionGroups = new Set<string>();
  private headerEl: HTMLElement | null = null;
  private summaryEl: HTMLElement | null = null;
  private boardEl: HTMLElement | null = null;
  private kanbanEl: HTMLElement | null = null;
  private pendingProjectRowRefresh: string | null = null;
  private pendingSelection: { project: string | null; version: string | null } | null = null;
  private preferredSelection: { project: string | null; version: string | null } | null = null;
  private suppressRenderCount = 0;
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

  async onClose(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  async openQuickCreateTask(): Promise<void> {
    const projects = this.store.getProjects();
    if (projects.length === 0) {
      new Notice("未找到项目目录，无法创建任务");
      return;
    }

    new CreateTaskModal({
      app: this.app,
      projects,
      versions: this.store.getVersions(),
      initialProject: this.selectedProject === ALL_PROJECTS_VALUE ? null : this.selectedProject,
      initialVersion: this.selectedVersion,
      onCreated: async () => {
        await this.store.rebuild();
      }
    }).open();
  }

  private render(): void {
    const container = this.containerEl.children[1] as HTMLElement;
    container.addClass("project-hub-view");
    this.ensureLayout(container);

    this.renderHeader();
    this.renderSections();
  }

  private renderHeader(): void {
    if (!this.headerEl) {
      return;
    }

    this.renderDashboardHeader(this.headerEl);
  }

  private renderPartialUpdate(projectName: string): void {
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
        text: "未找到项目数据。先创建带有 type: project 的 Markdown 文件。"
      });
      return;
    }

    this.renderTaskKanban(this.kanbanEl, projects, versions);
  }

  private renderSections(): void {
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
        text: "未找到项目数据。先创建带有 type: project 的 Markdown 文件。"
      });
      return;
    }

    this.renderTaskKanban(this.kanbanEl, projects, versions);
  }

  private async syncVersionStatuses(): Promise<number> {
    let syncedCount = 0;

    for (const version of this.store.getVersions()) {
      if (!version.status) {
        continue;
      }

      const abstractFile = this.app.vault.getAbstractFileByPath(version.filePath);
      if (!(abstractFile instanceof TFile)) {
        continue;
      }

      const content = await this.app.vault.cachedRead(abstractFile);
      const nextContent = updateVersionStatusInFrontmatter(content, version.status);
      if (nextContent === content) {
        continue;
      }

      await this.app.vault.modify(abstractFile, nextContent);
      syncedCount += 1;
    }

    return syncedCount;
  }

  private ensureLayout(container: HTMLElement): void {
    const hostsMissing = !this.headerEl || !this.summaryEl || !this.boardEl || !this.kanbanEl;
    const hostsDetached = Boolean(
      this.headerEl && this.summaryEl && this.boardEl && this.kanbanEl
      && (!container.contains(this.headerEl)
        || !container.contains(this.summaryEl)
        || !container.contains(this.boardEl)
        || !container.contains(this.kanbanEl))
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

  private restorePendingSelection(projects: ProjectRecord[], versions: VersionRecord[]): void {
    if (!this.pendingSelection) {
      return;
    }

    const { project, version } = this.pendingSelection;
    this.pendingSelection = null;

    if (project === ALL_PROJECTS_VALUE) {
      this.selectedProject = ALL_PROJECTS_VALUE;
      if (version && versions.some((item) => item.version === version)) {
        this.selectedVersion = version;
      }
      this.preferredSelection = { project, version };
      return;
    }

    if (project && projects.some((item) => item.project === project)) {
      this.selectedProject = project;
      if (version && versions.some((item) => item.project === project && item.version === version)) {
        this.selectedVersion = version;
      }
      this.preferredSelection = { project, version };
    }
  }

  private syncSelection(projects: ProjectRecord[], versions: VersionRecord[]): void {
    if (projects.length === 0) {
      this.selectedProject = null;
      this.selectedVersion = null;
      return;
    }

    const preferredProject = this.preferredSelection?.project;
    if (preferredProject === ALL_PROJECTS_VALUE) {
      this.selectedProject = ALL_PROJECTS_VALUE;
    }

    if (preferredProject && projects.some((project) => project.project === preferredProject)) {
      this.selectedProject = preferredProject;
    }

    const sortedProjects = this.sortProjects(projects, versions);
    if (
      !this.selectedProject
      || (this.selectedProject !== ALL_PROJECTS_VALUE && !projects.some((project) => project.project === this.selectedProject))
    ) {
      this.selectedProject = sortedProjects[0]?.project ?? null;
    }

    const projectVersions = this.getSortedVersionsForProject(versions, this.selectedProject);
    if (
      this.preferredSelection?.project === this.selectedProject
      && this.preferredSelection.version
      && projectVersions.some((version) => version.version === this.preferredSelection?.version)
    ) {
      this.selectedVersion = this.preferredSelection.version;
      return;
    }

    if (!this.selectedVersion || !projectVersions.some((version) => version.version === this.selectedVersion)) {
      this.selectedVersion = null;
    }
  }

  private renderDashboardHeader(container: HTMLElement): void {
    container.empty();
    const header = container.createDiv({ cls: "project-hub-dashboard-header" });
    const titleWrap = header.createDiv({ cls: "project-hub-dashboard-title-wrap" });
    titleWrap.createEl("h1", { text: "Project Hub Dashboard" });
    titleWrap.createEl("p", {
      text: "一屏看全局 · 一屏管执行 | 项目行式版本看板 + 版本任务看板"
    });

    const actions = header.createDiv({ cls: "project-hub-dashboard-actions" });
    const refreshButton = actions.createEl("button", { text: "刷新" });
    refreshButton.addEventListener("click", async () => {
      await this.store.rebuild();
      const syncedCount = await this.syncVersionStatuses();
      if (syncedCount > 0) {
        await this.store.rebuild();
      }
      new Notice(
        syncedCount > 0
          ? `Project Hub 数据已刷新，并同步 ${syncedCount} 个版本状态`
          : "Project Hub 数据已刷新"
      );
    });
  }

  private renderGlobalStats(container: HTMLElement, projects: ProjectRecord[], versions: VersionRecord[], tasks: TaskRecord[]): void {
    container.empty();
    const section = container.createDiv({ cls: "project-hub-dashboard-card project-hub-summary-card" });
    const title = section.createDiv({ cls: "project-hub-section-title" });
    title.setText("全局统计区 · All Projects Summary");

    const today = todayString();
    const completedTasks = tasks.filter((task) => task.status === "done").length;
    const inProgressTasks = tasks.filter((task) => task.status === "in-progress").length;
    const delayedTasks = tasks.filter((task) => isTaskOverdue(task, today)).length;
    const completionRate = tasks.length === 0 ? 0 : Math.round((completedTasks / tasks.length) * 100);
    const statsGrid = section.createDiv({ cls: "project-hub-summary-grid" });
    for (const item of [
      [String(projects.length), "项目数"],
      [String(versions.length), "版本数"],
      [String(tasks.length), "总任务数"],
      [String(completedTasks), "完成任务"],
      [String(inProgressTasks), "进行中任务"],
      [String(delayedTasks), "延期任务"]
    ]) {
      const stat = statsGrid.createDiv({ cls: "project-hub-summary-item" });
      if (item[1] === "延期任务") {
        stat.addClass("is-warning");
      }
      stat.createDiv({ cls: "project-hub-summary-value", text: item[0] });
      stat.createDiv({ cls: "project-hub-summary-label", text: item[1] });
    }

    const trend = section.createDiv({ cls: "project-hub-summary-trend" });
    const trendHeader = trend.createDiv({ cls: "project-hub-summary-trend-header" });
    trendHeader.createSpan({ text: "任务完成趋势 (燃尽)" });
    trendHeader.createSpan({ text: `${completionRate}% 完成` });

    const progressBar = trend.createDiv({ cls: "project-hub-burnup-bar" });
    progressBar.createDiv({ cls: "project-hub-burnup-fill" }).style.width = `${completionRate}%`;

    const miniChart = trend.createDiv({ cls: "project-hub-mini-chart" });
    for (const value of buildMiniTrendValues(this.store.getBurndown(), completionRate)) {
      const bar = miniChart.createDiv({ cls: "project-hub-mini-chart-bar" });
      bar.style.height = `${Math.min(100, Math.max(14, Math.round(value)))}%`;
    }
  }

  private renderProjectVersionBoard(container: HTMLElement, projects: ProjectRecord[], versions: VersionRecord[], tasks: TaskRecord[]): void {
    container.empty();
    const section = container.createDiv({ cls: "project-hub-dashboard-card project-hub-board-card" });
    const title = section.createDiv({ cls: "project-hub-section-title" });
    title.setText("项目 & 版本状态看板 (Project Version Board) | 按版本总数排序 | 版本>3个时折叠");

    const boardRoot = section.createDiv({ cls: "project-hub-version-grid-container" });
    const grid = boardRoot.createDiv({ cls: "project-hub-version-grid" });

    const projectHeader = grid.createDiv({ cls: "project-hub-grid-header project-hub-grid-header-multiline" });
    projectHeader.createDiv({ cls: "project-hub-grid-header-line", text: "Project" });
    for (const headerText of ["Todo", "In Progress", "Done"]) {
      grid.createDiv({ cls: "project-hub-grid-header", text: headerText });
    }

    for (const project of this.sortProjects(projects, versions)) {
      this.renderProjectBoardRow(grid, project, versions, tasks);
    }
  }

  private renderProjectBoardRow(
    grid: HTMLElement,
    project: ProjectRecord,
    versions: VersionRecord[],
    tasks: TaskRecord[]
  ): HTMLElement {
    const row = grid.createDiv({ cls: "project-hub-grid-row" });
    row.dataset.project = project.project;

    const projectVersions = versions.filter((version) => version.project === project.project);
    const projectCell = row.createDiv({ cls: "project-hub-grid-cell project-hub-project-name-cell" });
    projectCell.createDiv({ cls: "project-hub-project-name", text: project.project });
    projectCell.createSpan({
      cls: "project-hub-project-badge",
      text: `版本总数：${projectVersions.length}`
    });

    for (const status of ["todo", "in-progress", "done"] as const) {
      const cell = row.createDiv({ cls: "project-hub-grid-cell" });
      this.renderVersionGroup(cell, project.project, status, projectVersions, tasks);
    }

    return row;
  }

  private refreshProjectBoardRow(
    projectName: string,
    projects: ProjectRecord[],
    versions: VersionRecord[],
    tasks: TaskRecord[]
  ): void {
    if (!this.boardEl) {
      return;
    }

    const grid = this.boardEl.querySelector(".project-hub-version-grid") as HTMLElement | null;
    if (!grid) {
      this.renderProjectVersionBoard(this.boardEl, projects, versions, tasks);
      return;
    }

    const existingRows = Array.from(grid.querySelectorAll<HTMLElement>(".project-hub-grid-row"));
    const targetRow = existingRows.find((row) => row.dataset.project === projectName);
    const project = projects.find((item) => item.project === projectName);
    if (!project) {
      targetRow?.remove();
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

  private renderVersionGroup(
    container: HTMLElement,
    project: string,
    status: "todo" | "in-progress" | "done",
    versions: VersionRecord[],
    tasks: TaskRecord[]
  ): void {
    const list = container.createDiv({ cls: "project-hub-version-cards-list" });
    const filtered = versions
      .filter((version) => normalizeVersionBoardStatus(version.status) === status)
      .sort(compareVersionRecordsDesc);

    if (filtered.length === 0) {
      list.createDiv({ cls: "project-hub-version-empty", text: "—" });
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
      toggle.setText(expanded ? "收起 ▲" : `+ ${filtered.length - 3} 更多`);
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

  private renderVersionCard(container: HTMLElement, version: VersionRecord, tasks: TaskRecord[]): void {
    const versionTasks = tasks.filter((task) => task.project === version.project && task.version === version.version);
    const doneCount = versionTasks.filter((task) => task.status === "done").length;
    const progress = versionTasks.length === 0 ? 0 : Math.round((doneCount / versionTasks.length) * 100);
    const overdue = versionTasks.filter((task) => isTaskOverdue(task, todayString())).length;
    const assignees = [...new Set(versionTasks.map((task) => task.owner).filter((owner): owner is string => Boolean(owner)))];

    const card = container.createDiv({ cls: "project-hub-version-card" });
    if (this.selectedProject === version.project && this.selectedVersion === version.version) {
      card.addClass("is-active");
    }

    card.createDiv({ cls: "project-hub-version-name", text: version.version });
    card.createDiv({
      cls: "project-hub-version-date",
      text: `${formatShortDate(version.start)} ~ ${formatShortDate(version.end)}`
    });

    const taskEffort = versionTasks.reduce((sum, task) => sum + (task.effort ?? 0), 0);
    const versionEffort = version.effort ?? taskEffort;
    const effortLabel = versionEffort > 0 ? ` · ${versionEffort}h` : "";
    card.createDiv({
      cls: "project-hub-version-summary",
      text: overdue > 0 ? `${progress}%${effortLabel} · 延期 ${overdue}` : `${progress}%${effortLabel} · 按期`
    });

    card.setAttr(
      "title",
      `任务数: ${versionTasks.length}\n工时: ${versionEffort}h\n负责人: ${assignees.join(", ") || "未分配"}\n双击打开版本文件`
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
      if (file instanceof TFile) {
        await this.plugin.app.workspace.getLeaf(true).openFile(file);
      }
    });
  }

  private renderTaskKanban(container: HTMLElement, projects: ProjectRecord[], versions: VersionRecord[]): void {
    container.empty();
    const section = container.createDiv({ cls: "project-hub-task-kanban" });

    const title = section.createDiv({ cls: "project-hub-section-title" });
    title.setText("任务看板 · Task Kanban");

    const filters = section.createDiv({ cls: "project-hub-filters" });
    const actionGroup = filters.createDiv({ cls: "project-hub-filter-actions" });
    const createButton = actionGroup.createEl("button", { cls: "mod-cta", text: "快速新建任务" });
    createButton.addEventListener("click", async () => {
      await this.openQuickCreateTask();
    });

    const projectGroup = filters.createDiv({ cls: "project-hub-filter-group" });
    projectGroup.createEl("label", { text: "Project:" });
    const projectSelect = projectGroup.createEl("select");

    projectSelect.createEl("option", { value: ALL_PROJECTS_VALUE, text: "全部项目" });
    for (const project of this.sortProjects(projects, versions)) {
      projectSelect.createEl("option", { value: project.project, text: project.project });
    }
    projectSelect.value = this.selectedProject ?? ALL_PROJECTS_VALUE;
    projectSelect.addEventListener("change", () => {
      this.selectedProject = projectSelect.value || null;
      this.selectedVersion = null;
      this.preferredSelection = {
        project: this.selectedProject,
        version: this.selectedVersion
      };
      this.renderSections();
    });

    const versionGroup = filters.createDiv({ cls: "project-hub-filter-group" });
    versionGroup.createEl("label", { text: "Version:" });
    const versionSelect = versionGroup.createEl("select");

    versionSelect.createEl("option", { value: "", text: "全部版本" });
    for (const version of this.getSortedVersionsForProject(versions, this.selectedProject)) {
      versionSelect.createEl("option", { value: version.version, text: version.version });
    }
    versionSelect.value = this.selectedVersion ?? "";
    versionSelect.addEventListener("change", () => {
      this.selectedVersion = versionSelect.value || null;
      this.preferredSelection = {
        project: this.selectedProject,
        version: this.selectedVersion
      };
      this.renderSections();
    });

    const selectedTasks = this.getKanbanTasks();

    const columns = section.createDiv({ cls: "project-hub-kanban-columns" });
    this.renderTaskColumn(columns, "todo", "TODO", selectedTasks.filter((task) => task.status === "todo"), true);
    this.renderTaskColumn(columns, "in-progress", "IN PROGRESS", selectedTasks.filter((task) => task.status === "in-progress"), true);
    this.renderTaskColumn(columns, "done", "DONE", selectedTasks.filter((task) => task.status === "done"), true);

    if (selectedTasks.length === 0) {
      columns.empty();
      columns.createDiv({
        cls: "project-hub-empty-state",
        text: this.selectedVersion
          ? "当前筛选条件下没有任务。"
          : "当前筛选条件下没有任务，可切换项目或版本查看。"
      });
    }
  }

  private renderTaskColumn(
    container: HTMLElement,
    status: string,
    label: string,
    tasks: TaskRecord[],
    droppable: boolean
  ): void {
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
        text: droppable ? `拖拽任务到 ${label}` : `${label} 列为空`
      });
      return;
    }

    for (const task of tasks) {
      this.renderTaskCard(list, task, droppable);
    }
  }

  private renderTaskCard(
    container: HTMLElement,
    task: TaskRecord,
    draggable: boolean
  ): void {
    const card = container.createDiv({ cls: "project-hub-task-card" });
    card.dataset.taskId = task.id;
    card.dataset.status = task.status;
    card.style.borderLeftColor = getTaskPriorityColor(task.priority);

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

    card.createDiv({
      cls: "project-hub-task-title",
      text: task.text
    });

    const metaParts = [
      `@${task.owner ?? "未分配"}`,
      formatTaskPriority(task.priority),
      task.due ?? "未设置",
      task.effort ? `${task.effort}h` : null
    ].filter((part): part is string => Boolean(part));
    const meta = card.createDiv({
      cls: "project-hub-task-meta",
      text: metaParts.join(" · ")
    });
    meta.setAttr("title", `来源 ${task.source}`);

    card.setAttr("title", "拖拽可变更状态，双击打开任务源文件");
    card.addEventListener("dblclick", async () => {
      await this.openTaskFile(task);
    });
  }

  private applyTaskMove(taskId: string, nextStatus: string): void {
    if (!this.kanbanEl) {
      return;
    }

    const card = this.kanbanEl.querySelector<HTMLElement>(`.project-hub-task-card[data-task-id="${cssEscape(taskId)}"]`);
    if (!card) {
      return;
    }

    const sourceList = card.parentElement as HTMLElement | null;
    const targetList = this.kanbanEl.querySelector<HTMLElement>(`.project-hub-task-list[data-status="${cssEscape(nextStatus)}"]`);
    if (!sourceList || !targetList || sourceList === targetList) {
      return;
    }

    const sourceStatus = sourceList.dataset.status ?? "";
    this.removeEmptyState(targetList);
    targetList.appendChild(card);
    card.dataset.status = nextStatus;

    this.refreshTaskColumnState(sourceList, sourceStatus);
    this.refreshTaskColumnState(targetList, nextStatus);
  }

  private refreshTaskColumnState(list: HTMLElement, status: string): void {
    const column = list.closest(".project-hub-kanban-col") as HTMLElement | null;
    if (!column) {
      return;
    }

    const count = list.querySelectorAll(":scope > .project-hub-task-card").length;
    const countEl = column.querySelector<HTMLElement>(".project-hub-kanban-col-count");
    if (countEl) {
      countEl.setText(String(count));
    }

    const empty = list.querySelector<HTMLElement>(":scope > .project-hub-empty-state");
    if (count === 0) {
      if (!empty) {
        list.createEl("div", {
          cls: "project-hub-empty-state small",
          text: `拖拽任务到 ${status.toUpperCase()}`
        });
      }
      return;
    }

    empty?.remove();
  }

  private removeEmptyState(list: HTMLElement): void {
    const empty = list.querySelector<HTMLElement>(":scope > .project-hub-empty-state");
    empty?.remove();
  }

  private sortProjects(projects: ProjectRecord[], versions: VersionRecord[]): ProjectRecord[] {
    const order = new Map(projects.map((project, index) => [project.project, index]));
    const counts = new Map<string, number>();
    for (const version of versions) {
      counts.set(version.project, (counts.get(version.project) ?? 0) + 1);
    }

    return [...projects].sort((left, right) => {
      const countDiff = (counts.get(right.project) ?? 0) - (counts.get(left.project) ?? 0);
      if (countDiff !== 0) {
        return countDiff;
      }
      return (order.get(left.project) ?? 0) - (order.get(right.project) ?? 0);
    });
  }

  private getSortedVersionsForProject(versions: VersionRecord[], project: string | null): VersionRecord[] {
    return versions
      .filter((version) => !project || project === ALL_PROJECTS_VALUE || version.project === project)
      .sort(compareVersionRecordsDesc);
  }

  private getKanbanTasks(): TaskRecord[] {
    const projectFilter = this.selectedProject && this.selectedProject !== ALL_PROJECTS_VALUE
      ? this.selectedProject
      : undefined;

    return this.store.getTasks(projectFilter).filter((task) => {
      if (!this.selectedVersion) {
        return true;
      }

      return task.version === this.selectedVersion;
    });
  }

  private async handleDrop(targetStatus: string): Promise<void> {
    const taskId = this.draggingTaskId;
    this.draggingTaskId = null;
    if (!taskId) {
      return;
    }

    const projectFilter = this.selectedProject && this.selectedProject !== ALL_PROJECTS_VALUE
      ? this.selectedProject
      : undefined;
    const task = this.store.getTasks(projectFilter).find((item) => item.id === taskId);
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
    let nextContent = updateChecklistTaskStatus(content, task, status);
    if (task.sourceType === "version-task") {
      nextContent = updateVersionStatusInFrontmatter(nextContent);
    }
    if (nextContent === content) {
      new Notice("未找到任务行，无法更新任务状态");
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
    new Notice(`任务状态已更新为 ${status}`);
  }

  private applyDragUpdate(projectName: string, taskId: string, status: string): void {
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
}

function normalizeVersionBoardStatus(status?: string): "todo" | "in-progress" | "done" {
  const normalized = (status ?? "").trim().toLowerCase();
  if (["in progress", "in-progress", "doing", "developing", "active", "开发中"].includes(normalized)) {
    return "in-progress";
  }
  if (["released", "done", "已发布"].includes(normalized)) {
    return "done";
  }
  return "todo";
}

function compareVersionRecordsDesc(left: VersionRecord, right: VersionRecord): number {
  return compareVersionNamesDesc(left.version, right.version);
}

function compareVersionNamesDesc(left: string, right: string): number {
  const leftParts = left.replace(/^[^\d]*/, "").split(".").map((part) => Number(part) || 0);
  const rightParts = right.replace(/^[^\d]*/, "").split(".").map((part) => Number(part) || 0);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (rightParts[index] ?? 0) - (leftParts[index] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return right.localeCompare(left);
}

function formatShortDate(value?: string): string {
  if (!value) {
    return "?";
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value.slice(5);
  }
  return value;
}

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatTaskPriority(priority?: string): string {
  const normalized = (priority ?? "").trim().toLowerCase();
  if (["urgent", "critical"].includes(normalized)) {
    return "紧急";
  }
  if (["high"].includes(normalized)) {
    return "高优";
  }
  if (["medium", "normal"].includes(normalized)) {
    return "中优";
  }
  if (["low"].includes(normalized)) {
    return "低优";
  }
  return "普通";
}

function getTaskPriorityColor(priority?: string): string {
  const normalized = (priority ?? "").trim().toLowerCase();
  if (["urgent", "critical"].includes(normalized)) {
    return "#991b1b";
  }
  if (normalized === "high") {
    return "#dc2626";
  }
  if (["medium", "normal"].includes(normalized)) {
    return "#f59e0b";
  }
  if (normalized === "low") {
    return "#10b981";
  }
  return "#e2e8f0";
}

function isTaskOverdue(task: TaskRecord, today: string): boolean {
  return task.status !== "done" && typeof task.due === "string" && task.due < today;
}

function buildMiniTrendValues(points: BurndownPoint[], completionRate: number): number[] {
  if (points.length === 0) {
    return [completionRate];
  }

  const maxRemaining = Math.max(...points.map((point) => point.remaining), 1);
  const completionValues = points.map((point) => 100 - Math.round((point.remaining / maxRemaining) * 100));
  const sampleSize = Math.min(5, completionValues.length);
  if (sampleSize === completionValues.length) {
    return completionValues;
  }

  const sampled: number[] = [];
  for (let index = 0; index < sampleSize; index += 1) {
    const pointIndex = Math.round((index * (completionValues.length - 1)) / Math.max(1, sampleSize - 1));
    sampled.push(completionValues[pointIndex]);
  }
  return sampled;
}

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }

  return value.replace(/([#.;?+*~':"!^$\[\]()=>|\/@])/g, "\\$1");
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
    .replace(/✅\s*\d{4}-\d{2}-\d{2}/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const nextMarker = status === "done" ? "x" : " ";
  let nextText = rawText;
  if (status === "in-progress") {
    nextText = `${rawText} 🚧`;
  } else if (status === "done") {
    nextText = `${rawText} ✅ ${todayString()}`;
  }
  lines[index] = `${match[1]}${nextMarker}${match[3]}${nextText}`;
  return lines.join("\n");
}

function updateVersionStatusInFrontmatter(content: string, status?: string): string {
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

  const derivedStatus = status ?? deriveVersionStatusFromChecklist(lines.slice(frontmatterEnd + 1));
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

function deriveVersionStatusFromChecklist(lines: string[]): string | null {
  let total = 0;
  let done = 0;
  let inProgress = 0;

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
    if (rawText.includes("🚧")) {
      inProgress += 1;
    }
  }

  if (total === 0) {
    return null;
  }
  if (done === total) {
    return "done";
  }
  if (inProgress > 0 || done > 0) {
    return "in-progress";
  }
  return "todo";
}