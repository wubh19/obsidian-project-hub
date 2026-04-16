import { ItemView, Notice, TFile, ViewStateResult, WorkspaceLeaf, normalizePath } from "obsidian";
import { buildProjectPlanWorkbook, showExcelSaveDialog, workbookToBuffer } from "../utils/excel-export";
import { ProjectStore } from "../core/store";
import { CreateTaskModal } from "../modals/create-task-modal";
import { BurndownPoint, ProjectRecord, TaskRecord, VersionRecord } from "../types";
import type ProjectHubPlugin from "../main";

export const PROJECT_HUB_VIEW_TYPE = "project-hub-dashboard";
const ALL_PROJECTS_VALUE = "__all_projects__";

type StatusOption = TaskRecord["status"];

export class ProjectHubDashboardView extends ItemView {
  private readonly plugin: ProjectHubPlugin;
  private readonly store: ProjectStore;
  private scopeRootPath: string | null = null;
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
  private taskViewMode: "kanban" | "list" = "kanban";
  private versionViewMode: "kanban" | "list" = "kanban";

  constructor(leaf: WorkspaceLeaf, plugin: ProjectHubPlugin, store: ProjectStore) {
    super(leaf);
    this.plugin = plugin;
    this.store = store;
  }

  getViewType(): string {
    return PROJECT_HUB_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.scopeRootPath ? `Project Hub · ${getPathLabel(this.scopeRootPath)}` : "Project Hub";
  }

  getIcon(): string {
    return "layout-dashboard";
  }

  override getState(): Record<string, unknown> {
    return {
      ...super.getState(),
      scopeRootPath: this.scopeRootPath,
      scopeProjectPath: this.scopeRootPath
    };
  }

  override async setState(state: unknown, result: ViewStateResult): Promise<void> {
    await super.setState(state, result);
    const stateValue = state as { scopeRootPath?: unknown; scopeProjectPath?: unknown } | null;
    const nextScopeRootPath = normalizeScopeProjectPath(stateValue?.scopeRootPath ?? stateValue?.scopeProjectPath);
    this.scopeRootPath = nextScopeRootPath;
    this.selectedProject = null;
    this.selectedVersion = null;
    this.pendingSelection = null;
    this.preferredSelection = null;

    if (this.headerEl || this.summaryEl || this.boardEl || this.kanbanEl) {
      this.render();
    }
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
    const projects = this.getScopedProjects();
    if (projects.length === 0) {
      new Notice("No projects found. Cannot create task.");
      return;
    }

    new CreateTaskModal({
      app: this.app,
      projects,
      versions: this.getScopedVersions(),
      initialProject: this.selectedProject === ALL_PROJECTS_VALUE ? null : this.selectedProject,
      initialVersion: this.selectedVersion,
      onCreated: async () => {
        await this.store.rebuild();
      }
    }).open();
  }

  async openQuickCreateProject(): Promise<void> {
    await this.plugin.openQuickCreateProject(this.scopeRootPath);
  }

  async openQuickCreateVersion(): Promise<void> {
    await this.plugin.openQuickCreateVersion(
      this.selectedProject === ALL_PROJECTS_VALUE ? null : this.selectedProject,
      this.scopeRootPath
    );
  }

  getScopeRootPath(): string | null {
    return this.scopeRootPath;
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

    const projects = this.getScopedProjects();
    const versions = this.getScopedVersions();
    const tasks = this.getScopedTasks();
    this.restorePendingSelection(projects, versions);
    this.syncSelection(projects, versions);

    this.renderGlobalStats(this.summaryEl, projects, versions, tasks);
    this.refreshProjectBoardRow(projectName, projects, versions, tasks);

    if (projects.length === 0) {
      this.kanbanEl.empty();
      this.kanbanEl.createEl("div", {
        cls: "project-hub-empty-state",
        text: "No project data found. Create a Markdown file with type: project."
      });
      return;
    }

    this.renderTaskKanban(this.kanbanEl, projects, versions);
  }

  private renderSections(): void {
    if (!this.summaryEl || !this.boardEl || !this.kanbanEl) {
      return;
    }

    const projects = this.getScopedProjects();
    const versions = this.getScopedVersions();
    const tasks = this.getScopedTasks();

    this.restorePendingSelection(projects, versions);
    this.syncSelection(projects, versions);
    this.renderGlobalStats(this.summaryEl, projects, versions, tasks);
    this.renderProjectVersionBoard(this.boardEl, projects, versions, tasks);

    if (projects.length === 0) {
      this.kanbanEl.empty();
      this.kanbanEl.createEl("div", {
        cls: "project-hub-empty-state",
        text: "No project data found. Create a Markdown file with type: project."
      });
      return;
    }

    this.renderTaskKanban(this.kanbanEl, projects, versions);
  }

  private async syncVersionStatuses(): Promise<number> {
    let syncedCount = 0;

    for (const version of this.getScopedVersions()) {
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

  private async exportToExcel(): Promise<void> {
    const projects = this.getScopedProjects();
    const versions = this.getScopedVersions();
    const tasks = this.getScopedTasks();

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const defaultName = `${dateStr} Project Plan.xlsx`;

    const filePath = await showExcelSaveDialog(defaultName);
    if (!filePath) {
      return;
    }

    try {
      const wb = buildProjectPlanWorkbook(projects, versions, tasks);
      const buffer = workbookToBuffer(wb);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fs = (globalThis as any)["require"]?.("fs") as { writeFileSync: (p: string, d: Uint8Array) => void } | undefined;
      if (!fs) {
        new Notice("Export failed: no file system access.");
        return;
      }
      fs.writeFileSync(filePath, buffer);
      new Notice(`Exported: ${filePath}`);
    } catch (err) {
      new Notice(`Export failed: ${String(err)}`);
    }
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
      text: this.scopeRootPath
        ? `Scope: ${this.scopeRootPath}`
        : "Scope: All Projects | Overview · Execution"
    });

    const actions = header.createDiv({ cls: "project-hub-dashboard-actions" });
    const createProjectButton = actions.createEl("button", { text: "New Project" });
    createProjectButton.addEventListener("click", async () => {
      await this.openQuickCreateProject();
    });

    const createVersionButton = actions.createEl("button", { text: "New Item" });
    createVersionButton.addEventListener("click", async () => {
      await this.openQuickCreateVersion();
    });

    const refreshButton = actions.createEl("button", { text: "Refresh" });
    refreshButton.addEventListener("click", async () => {
      await this.store.rebuild();
      const syncedCount = await this.syncVersionStatuses();
      if (syncedCount > 0) {
        await this.store.rebuild();
      }
      new Notice(
        syncedCount > 0
          ? `Refreshed. Synced ${syncedCount} version status(es).`
          : "Project Hub data refreshed."
      );
    });

    const exportButton = actions.createEl("button", { text: "Export Excel" });
    exportButton.addEventListener("click", async () => {
      await this.exportToExcel();
    });
  }

  private renderGlobalStats(container: HTMLElement, projects: ProjectRecord[], versions: VersionRecord[], tasks: TaskRecord[]): void {
    container.empty();
    const section = container.createDiv({ cls: "project-hub-dashboard-card project-hub-summary-card" });
    const titleRow = section.createDiv({ cls: "project-hub-section-title-row" });
    titleRow.createSpan({ cls: "project-hub-section-title", text: "Dashboard" });

    const today = todayString();
    const completedTasks = tasks.filter((task) => task.status === "done").length;
    const inProgressTasks = tasks.filter((task) => task.status === "in-progress").length;
    const delayedTasks = tasks.filter((task) => isTaskOverdue(task, today)).length;
    const completionRate = tasks.length === 0 ? 0 : Math.round((completedTasks / tasks.length) * 100);
    const statsGrid = section.createDiv({ cls: "project-hub-summary-grid" });
    for (const item of [
      [String(projects.length), "Projects"],
      [String(versions.length), "Items"],
      [String(tasks.length), "Total Tasks"],
      [String(completedTasks), "Completed"],
      [String(inProgressTasks), "In Progress"],
      [String(delayedTasks), "Overdue"]
    ]) {
      const stat = statsGrid.createDiv({ cls: "project-hub-summary-item" });
      if (item[1] === "Overdue") {
        stat.addClass("is-warning");
      }
      stat.createDiv({ cls: "project-hub-summary-value", text: item[0] });
      stat.createDiv({ cls: "project-hub-summary-label", text: item[1] });
    }

    const trend = section.createDiv({ cls: "project-hub-summary-trend" });
    const trendHeader = trend.createDiv({ cls: "project-hub-summary-trend-header" });
    trendHeader.createSpan({ text: "Completion Trend" });
    trendHeader.createSpan({ text: `${completionRate}% Done` });

    const progressBar = trend.createDiv({ cls: "project-hub-burnup-bar" });
    progressBar.createDiv({ cls: "project-hub-burnup-fill" }).style.width = `${completionRate}%`;

    const miniChart = trend.createDiv({ cls: "project-hub-mini-chart" });
    for (const value of buildMiniTrendValues(buildBurndownPointsFromTasks(tasks), completionRate)) {
      const bar = miniChart.createDiv({ cls: "project-hub-mini-chart-bar" });
      bar.style.height = `${Math.min(100, Math.max(14, Math.round(value)))}%`;
    }
  }

  private renderProjectVersionBoard(container: HTMLElement, projects: ProjectRecord[], versions: VersionRecord[], tasks: TaskRecord[]): void {
    container.empty();
    const section = container.createDiv({ cls: "project-hub-dashboard-card project-hub-board-card" });

    const titleRow = section.createDiv({ cls: "project-hub-section-title-row" });
    titleRow.createSpan({ cls: "project-hub-section-title", text: "Project Item" });
    const versionViewToggleBtn = titleRow.createEl("button", {
      cls: "project-hub-view-toggle-btn",
      text: this.versionViewMode === "kanban" ? "📝 List" : "📌 Board"
    });
    versionViewToggleBtn.addEventListener("click", () => {
      this.versionViewMode = this.versionViewMode === "kanban" ? "list" : "kanban";
      this.renderProjectVersionBoard(container, projects, versions, tasks);
    });

    if (this.versionViewMode === "list") {
      this.renderProjectVersionList(section, projects, versions, tasks);
    } else {
      const boardRoot = section.createDiv({ cls: "project-hub-version-grid-container" });
      const grid = boardRoot.createDiv({ cls: "project-hub-version-grid" });

      const projectHeader = grid.createDiv({ cls: "project-hub-grid-header project-hub-grid-header-multiline" });
      projectHeader.createDiv({ cls: "project-hub-grid-header-line", text: "Project" });
      for (const headerText of ["Todo", "In Progress", "Completed"]) {
        grid.createDiv({ cls: "project-hub-grid-header", text: headerText });
      }

      for (const project of this.sortProjects(projects, versions)) {
        this.renderProjectBoardRow(grid, project, versions, tasks);
      }
    }
  }

  private renderProjectVersionList(container: HTMLElement, projects: ProjectRecord[], versions: VersionRecord[], tasks: TaskRecord[]): void {
    const tableWrap = container.createDiv({ cls: "project-hub-task-table-wrap" });
    const table = tableWrap.createEl("table", { cls: "project-hub-task-table" });
    const thead = table.createEl("thead");
    const headerRow = thead.createEl("tr");
    for (const col of ["Project", "Item", "Status", "Start", "End", "Effort", "Progress", "Tasks"]) {
      headerRow.createEl("th", { text: col });
    }
    const tbody = table.createEl("tbody");
    const sortedVersions = [...versions].sort((a, b) => {
      const pa = a.project.localeCompare(b.project);
      return pa !== 0 ? pa : compareVersionNamesDesc(a.version, b.version);
    });
    for (const version of sortedVersions) {
      const versionTasks = tasks.filter((t) => t.project === version.project && t.version === version.version);
      const doneCount = versionTasks.filter((t) => t.status === "done").length;
      const progress = versionTasks.length === 0 ? 0 : Math.round((doneCount / versionTasks.length) * 100);
      const row = tbody.createEl("tr", { cls: "project-hub-task-row" });
      row.createEl("td", { text: version.project, cls: "col-project" });
      row.createEl("td", { text: version.version, cls: "col-item" });
      row.createEl("td", { cls: "col-status" }).createEl("span", {
        cls: `project-hub-status-badge status-${normalizeVersionBoardStatus(version.status)}`,
        text: formatStatus(normalizeVersionBoardStatus(version.status))
      });
      row.createEl("td", { text: version.start ?? "—", cls: "col-lasttime" });
      row.createEl("td", { text: version.end ?? "—", cls: "col-lasttime" });
      row.createEl("td", { text: version.effort ? `${version.effort}h` : "—", cls: "col-workload" });
      row.createEl("td", { text: `${progress}%`, cls: "col-workload" });
      row.createEl("td", { text: String(versionTasks.length), cls: "col-workload" });
      row.addEventListener("dblclick", async () => {
        const file = this.plugin.app.vault.getAbstractFileByPath(version.filePath);
        if (file instanceof TFile) {
          await this.plugin.app.workspace.getLeaf(true).openFile(file);
        }
      });
    }
    if (sortedVersions.length === 0) {
      const emptyRow = tbody.createEl("tr");
      emptyRow.createEl("td", { attr: { colspan: "8" }, text: "No versions found.", cls: "project-hub-table-empty" });
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
      text: `Versions: ${projectVersions.length}`
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
      toggle.setText(expanded ? "Collapse ▲" : `+ ${filtered.length - 3} more`);
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

    const topRow = card.createDiv({ cls: "project-hub-version-row project-hub-version-row-top" });
    topRow.createDiv({ cls: "project-hub-version-name", text: version.version });
    topRow.createDiv({
      cls: "project-hub-version-date",
      text: `${formatShortDate(version.start)} ~ ${formatShortDate(version.end)}`
    });

    const taskEffort = versionTasks.reduce((sum, task) => sum + (task.effort ?? 0), 0);
    const versionEffort = version.effort ?? taskEffort;
    const effortLabel = versionEffort > 0 ? `${versionEffort}h` : "N/A";
    const summaryParts = [`${progress}%`, effortLabel, overdue > 0 ? `Overdue ${overdue}` : "On track"];
    card.createDiv({
      cls: "project-hub-version-summary",
      text: summaryParts.join(" · ")
    });

    card.setAttr(
      "title",
      `Tasks: ${versionTasks.length}\nEffort: ${versionEffort}h\nOwners: ${assignees.join(", ") || "unassigned"}\nDouble-click to open`
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

    // Title row with view toggle
    const titleRow = section.createDiv({ cls: "project-hub-section-title-row" });
    titleRow.createSpan({ cls: "project-hub-section-title", text: "Task" });
    const viewToggleBtn = titleRow.createEl("button", {
      cls: "project-hub-view-toggle-btn",
      text: this.taskViewMode === "kanban" ? "📝 List" : "📌 Board"
    });
    viewToggleBtn.addEventListener("click", () => {
      this.taskViewMode = this.taskViewMode === "kanban" ? "list" : "kanban";
      this.renderTaskKanban(container, projects, versions);
    });

    const filters = section.createDiv({ cls: "project-hub-filters" });
    const actionGroup = filters.createDiv({ cls: "project-hub-filter-actions" });
    const createButton = actionGroup.createEl("button", { cls: "mod-cta", text: "New Task" });
    createButton.addEventListener("click", async () => {
      await this.openQuickCreateTask();
    });

    const projectGroup = filters.createDiv({ cls: "project-hub-filter-group" });
    projectGroup.createEl("label", { text: "Project:" });
    const projectSelect = projectGroup.createEl("select");

    projectSelect.createEl("option", { value: ALL_PROJECTS_VALUE, text: "All Projects" });
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
    versionGroup.createEl("label", { text: "Item:" });
    const versionSelect = versionGroup.createEl("select");

    versionSelect.createEl("option", { value: "", text: "All Items" });
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

    if (this.taskViewMode === "list") {
      this.renderTaskList(section, selectedTasks);
    } else {
      const columns = section.createDiv({ cls: "project-hub-kanban-columns" });
      this.renderTaskColumn(columns, "todo", "TODO", selectedTasks.filter((task) => task.status === "todo"), true);
      this.renderTaskColumn(columns, "in-progress", "IN PROGRESS", selectedTasks.filter((task) => task.status === "in-progress"), true);
      this.renderTaskColumn(columns, "done", "COMPLETED", selectedTasks.filter((task) => task.status === "done"), true);

      if (selectedTasks.length === 0) {
        columns.empty();
        columns.createDiv({
          cls: "project-hub-empty-state",
          text: this.selectedVersion
            ? "No tasks found."
            : "No tasks found. Switch project or version to view more."
        });
      }
    }
  }

  private renderTaskList(container: HTMLElement, tasks: TaskRecord[]): void {
    const conflictIds = detectConflictingTasks(tasks);
    const sortedTasks = sortTasksByPriority(tasks);

    if (conflictIds.size > 0) {
      const conflictBanner = container.createDiv({ cls: "project-hub-conflict-banner" });
      conflictBanner.createEl("span", { cls: "project-hub-conflict-icon", text: "⚠️" });
      conflictBanner.createEl("span", {
        text: `${conflictIds.size} task(s) have time conflicts (same owner overlap). Sorted by priority.`
      });
    }

    const tableWrap = container.createDiv({ cls: "project-hub-task-table-wrap" });
    const table = tableWrap.createEl("table", { cls: "project-hub-task-table" });
    const thead = table.createEl("thead");
    const headerRow = thead.createEl("tr");
    for (const col of ["Project", "Item", "Task", "Workload", "Status", "Owner", "Priority", "Start Time", "Due Date", "Remark"]) {
      headerRow.createEl("th", { text: col });
    }

    const tbody = table.createEl("tbody");
    for (const task of sortedTasks) {
      const row = tbody.createEl("tr", { cls: "project-hub-task-row" });
      if (conflictIds.has(task.id)) {
        row.addClass("is-conflict");
      }
      if (task.status === "done") {
        row.addClass("is-done");
      }

      row.createEl("td", { text: task.project, cls: "col-project" });
      row.createEl("td", { text: task.version ?? "—", cls: "col-item" });
      const taskCell = row.createEl("td", { cls: "col-task" });
      if (conflictIds.has(task.id)) {
        taskCell.createEl("span", { cls: "project-hub-conflict-dot", text: "⚠️ " });
      }
      taskCell.createEl("span", { text: task.text });
      row.createEl("td", { text: task.effort ? `${task.effort}h` : "—", cls: "col-workload" });
      row.createEl("td", { cls: "col-status" }).createEl("span", {
        cls: `project-hub-status-badge status-${task.status}`,
        text: formatStatus(task.status)
      });
      row.createEl("td", { text: task.owner ?? "—", cls: "col-owner" });
      row.createEl("td", { cls: "col-priority" }).createEl("span", {
        cls: `project-hub-priority-badge priority-${task.priority ?? "normal"}`,
        text: formatTaskPriority(task.priority)
      });
      row.createEl("td", { text: task.start ?? "—", cls: "col-lasttime" });
      row.createEl("td", { text: task.due ?? "—", cls: "col-lasttime" });
      row.createEl("td", { text: task.remark ?? "", cls: "col-remark" });

      row.addEventListener("dblclick", async () => {
        await this.openTaskFile(task);
      });
    }

    if (sortedTasks.length === 0) {
      const emptyRow = tbody.createEl("tr");
      emptyRow.createEl("td", { attr: { colspan: "10" }, text: "No tasks.", cls: "project-hub-table-empty" });
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
        text: droppable ? `Drop tasks here` : `${label} empty`
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
      `@${task.owner ?? "unassigned"}`,
      formatTaskPriority(task.priority),
      task.due ?? "no due date",
      task.effort ? `${task.effort}h` : null
    ].filter((part): part is string => Boolean(part));
    const meta = card.createDiv({
      cls: "project-hub-task-meta",
      text: metaParts.join(" · ")
    });
    meta.setAttr("title", `Source: ${task.source}`);

    card.setAttr("title", "Drag to change status · Double-click to open");
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
          text: `Drop tasks here`
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
    const scopedTasks = this.getScopedTasks();
    return scopedTasks.filter((task) => {
      if (this.selectedProject && this.selectedProject !== ALL_PROJECTS_VALUE && task.project !== this.selectedProject) {
        return false;
      }

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

    const task = this.getKanbanTasks().find((item) => item.id === taskId);
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
      new Notice(`File not found: ${task.filePath}`);
      return;
    }

    const content = await this.plugin.app.vault.read(abstractFile);
    let nextContent = updateChecklistTaskStatus(content, task, status);
    if (task.sourceType === "version-task") {
      nextContent = updateVersionStatusInFrontmatter(nextContent);
    }
    if (nextContent === content) {
      new Notice("Task line not found. Cannot update status.");
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
    new Notice(`Task status updated to: ${status}`);
  }

  private applyDragUpdate(projectName: string, taskId: string, status: string): void {
    const projects = this.getScopedProjects();
    const versions = this.getScopedVersions();
    const tasks = this.getScopedTasks();

    this.restorePendingSelection(projects, versions);
    this.syncSelection(projects, versions);

    if (this.summaryEl) {
      this.renderGlobalStats(this.summaryEl, projects, versions, tasks);
    }
    this.refreshProjectBoardRow(projectName, projects, versions, tasks);
    this.applyTaskMove(taskId, status);
  }

  private getScopedProjects(): ProjectRecord[] {
    return this.store.getProjects().filter((project) => this.matchesScope(project.projectPath));
  }

  private getScopedVersions(): VersionRecord[] {
    return this.store.getVersions().filter((version) => this.matchesScope(version.projectPath));
  }

  private getScopedTasks(): TaskRecord[] {
    return this.store.getTasks().filter((task) => this.matchesScope(task.projectPath));
  }

  private matchesScope(projectPath: string): boolean {
    if (!this.scopeRootPath) {
      return true;
    }

    const normalizedProjectPath = normalizePath(projectPath);
    return normalizedProjectPath === this.scopeRootPath || normalizedProjectPath.startsWith(`${this.scopeRootPath}/`);
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
    return "Urgent";
  }
  if (["high"].includes(normalized)) {
    return "High";
  }
  if (["medium", "normal"].includes(normalized)) {
    return "Medium";
  }
  if (["low"].includes(normalized)) {
    return "Low";
  }
  return "Normal";
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

function buildBurndownPointsFromTasks(tasks: TaskRecord[]): BurndownPoint[] {
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
    const today = todayString();
    return [{ date: today, remaining: tasks.filter((task) => task.status !== "done").length, idealRemaining: 0 }];
  }

  const orderedDates = [...dateSet].sort();
  const totalTasks = tasks.length;
  return expandDateRange(orderedDates[0], orderedDates[orderedDates.length - 1]).map((date, index, allDates) => {
    const completedByDate = tasks.filter(
      (task) => task.status === "done" && new Date(task.modifiedTime).toISOString().slice(0, 10) <= date
    ).length;
    return {
      date,
      remaining: totalTasks - completedByDate,
      idealRemaining: Math.max(
        0,
        Math.round(totalTasks - (totalTasks * index) / Math.max(1, allDates.length - 1))
      )
    };
  });
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

function getPathLabel(projectPath: string): string {
  const segments = normalizePath(projectPath).split("/").filter((segment) => segment.length > 0);
  return segments[segments.length - 1] ?? projectPath;
}

function normalizeScopeProjectPath(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = normalizePath(value).trim();
  return normalized.length > 0 ? normalized : null;
}

const PRIORITY_RANK: Record<string, number> = {
  urgent: 0, critical: 0, high: 1, medium: 2, normal: 2, low: 3
};

function sortTasksByPriority(tasks: TaskRecord[]): TaskRecord[] {
  return [...tasks].sort((a, b) => {
    const pa = PRIORITY_RANK[(a.priority ?? "normal").toLowerCase()] ?? 2;
    const pb = PRIORITY_RANK[(b.priority ?? "normal").toLowerCase()] ?? 2;
    if (pa !== pb) {
      return pa - pb;
    }
    // Secondary sort: undone before done
    if (a.status === "done" && b.status !== "done") {
      return 1;
    }
    if (a.status !== "done" && b.status === "done") {
      return -1;
    }
    return 0;
  });
}

function detectConflictingTasks(tasks: TaskRecord[]): Set<string> {
  const conflictIds = new Set<string>();
  // Group tasks by owner that have both start and endTime
  const timedTasks = tasks.filter((t) => t.start && t.endTime && t.status !== "done");
  const byOwner = new Map<string, TaskRecord[]>();
  for (const task of timedTasks) {
    const owner = task.owner ?? "__unowned__";
    const group = byOwner.get(owner) ?? [];
    group.push(task);
    byOwner.set(owner, group);
  }

  for (const ownerTasks of byOwner.values()) {
    for (let i = 0; i < ownerTasks.length; i += 1) {
      for (let j = i + 1; j < ownerTasks.length; j += 1) {
        const a = ownerTasks[i]!;
        const b = ownerTasks[j]!;
        const startA = a.start!;
        const endA = a.endTime!;
        const startB = b.start!;
        const endB = b.endTime!;
        if (startA < endB && endA > startB) {
          conflictIds.add(a.id);
          conflictIds.add(b.id);
        }
      }
    }
  }

  return conflictIds;
}

function formatStatus(status: string): string {
  switch (status) {
    case "todo": return "Todo";
    case "in-progress": return "In Progress";
    case "done": return "Completed";
    default: return status;
  }
}