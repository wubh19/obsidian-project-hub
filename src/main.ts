import { Notice, Plugin, TAbstractFile, TFile, TFolder, WorkspaceLeaf, normalizePath } from "obsidian";
import { ProjectStore } from "./core/store";
import { CreateProjectModal, CreateVersionModal } from "./modals/create-project-version-modal";
import { ProjectFolderSuggestModal } from "./modals/project-folder-suggest-modal";
import {
  buildScopeDisplayName,
  DEFAULT_SETTINGS,
  normalizeScopeIcon,
  normalizeScopePath,
  normalizeSettings,
  ProjectHubPluginSettings,
  ProjectHubScopeSetting,
  ProjectHubSettingTab
} from "./settings";
import { PROJECT_HUB_VIEW_TYPE, ProjectHubDashboardView } from "./views/dashboard-view";

const DEFAULT_SCOPE_PATH = "wubh";
const PROJECT_TEMPLATE_PATH = "Templates/Project.md";
const VERSION_TEMPLATE_PATH = "Templates/Version.md";

export default class ProjectHubPlugin extends Plugin {
  private store!: ProjectStore;
  settings: ProjectHubPluginSettings = DEFAULT_SETTINGS;
  private ribbonIcons: HTMLElement[] = [];

  async onload(): Promise<void> {
    await this.loadSettings();
    this.store = new ProjectStore(this.app);

    this.registerView(
      PROJECT_HUB_VIEW_TYPE,
      (leaf: WorkspaceLeaf) => new ProjectHubDashboardView(leaf, this, this.store)
    );

    this.addSettingTab(new ProjectHubSettingTab(this.app, this));

    this.refreshRibbonIcons();

    this.addCommand({
      id: "open-project-hub",
      name: "Open Project Hub dashboard",
      callback: async () => {
        await this.openDashboardWithPicker({ openInNewLeaf: true });
      }
    });

    this.addCommand({
      id: "open-project-hub-in-current-leaf",
      name: "Open Project Hub dashboard in current leaf",
      callback: async () => {
        const activeLeaf = this.app.workspace.activeLeaf;
        await this.openDashboardWithPicker({
          targetLeaf: activeLeaf ?? undefined,
          openInNewLeaf: false
        });
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
        const activeView = this.app.workspace.getActiveViewOfType(ProjectHubDashboardView) ?? null;
        const view = activeView ?? await this.openDashboardWithPicker({ openInNewLeaf: true });
        await view?.openQuickCreateTask();
      }
    });

    this.addCommand({
      id: "quick-create-project",
      name: "Quick create project",
      callback: async () => {
        await this.openQuickCreateProject();
      }
    });

    this.addCommand({
      id: "quick-create-version",
      name: "Quick create version",
      callback: async () => {
        await this.openQuickCreateVersion();
      }
    });

    await this.store.rebuild();

    this.registerEvent(
      this.app.vault.on("create", async (file: TAbstractFile) => {
        if (file instanceof TFile) {
          await this.store.refreshFile(file);
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("modify", async (file: TAbstractFile) => {
        if (file instanceof TFile) {
          await this.store.refreshFile(file);
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("delete", async (file: TAbstractFile) => {
        if (file instanceof TFile) {
          this.store.removeFile(file.path);
        }
      })
    );
  }

  async onunload(): Promise<void> {
    this.clearRibbonIcons();
    await this.app.workspace.detachLeavesOfType(PROJECT_HUB_VIEW_TYPE);
  }

  async loadSettings(): Promise<void> {
    const loaded = await this.loadData();
    this.settings = normalizeSettings(loaded);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.refreshRibbonIcons();
  }

  async rebuildStore(): Promise<void> {
    await this.store.rebuild();
  }

  async addScopeSetting(): Promise<void> {
    this.settings.scopes = [
      ...this.settings.scopes,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        path: "wubh",
        icon: "layout-dashboard"
      }
    ];
    await this.saveSettings();
  }

  async updateScopeSetting(scopeId: string, patch: { path?: string; icon?: string }): Promise<void> {
    const nextScopes = this.settings.scopes.map((scope) => {
      if (scope.id !== scopeId) {
        return scope;
      }

      const nextPath = typeof patch.path === "string" ? normalizeScopePath(patch.path) : scope.path;
      return {
        ...scope,
        path: nextPath,
        icon: typeof patch.icon === "string" ? normalizeScopeIcon(patch.icon) : scope.icon
      };
    });

    this.settings = { scopes: nextScopes };
    await this.saveSettings();
  }

  async replaceScopeSettings(scopes: ProjectHubScopeSetting[]): Promise<void> {
    this.settings = {
      scopes: scopes.map((scope) => ({
        ...scope,
        path: normalizeScopePath(scope.path),
        icon: normalizeScopeIcon(scope.icon)
      }))
    };
    await this.saveSettings();
  }

  async removeScopeSetting(scopeId: string): Promise<void> {
    this.settings = {
      scopes: this.settings.scopes.filter((scope) => scope.id !== scopeId)
    };
    await this.saveSettings();
  }

  getConfiguredScopes(): ProjectHubScopeSetting[] {
    const seen = new Set<string>();

    return this.settings.scopes
      .map((scope) => ({
        ...scope,
        path: normalizeScopePath(scope.path),
        icon: normalizeScopeIcon(scope.icon)
      }))
      .filter((scope) => scope.path.length > 0)
      .filter((scope) => {
        const key = scope.path.toLowerCase();
        if (seen.has(key)) {
          return false;
        }

        seen.add(key);
        return true;
      });
  }

  getProjectsForScope(scopePath: string) {
    const normalizedScopePath = normalizeScopePath(scopePath);
    return this.store.getProjects().filter((project) => isProjectInScope(project.projectPath, normalizedScopePath));
  }

  getProjectFolderNamesForScope(scopePath: string): string[] {
    const normalizedScopePath = normalizeScopePath(scopePath);
    if (!normalizedScopePath) {
      return [];
    }

    const abstractFile = this.app.vault.getAbstractFileByPath(normalizedScopePath);
    if (!(abstractFile instanceof TFolder)) {
      return [];
    }

    return abstractFile.children
      .filter((child): child is TFolder => child instanceof TFolder)
      .map((folder) => folder.name)
      .sort((left, right) => left.localeCompare(right, "zh-Hans-CN"));
  }

  async pickProjectScope(initialScope?: string | null): Promise<string | null | undefined> {
    const configuredScopes = this.getConfiguredScopes().map((scope) => scope.path);
    const scopeRootPaths = configuredScopes.length > 0
      ? configuredScopes
      : [...new Set(
        this.store.getProjects()
          .map((project) => getProjectScopeRoot(project.projectPath))
          .filter((value): value is string => Boolean(value))
      )];

    if (scopeRootPaths.length === 0) {
      return null;
    }

    if (scopeRootPaths.length === 1) {
      return scopeRootPaths[0] ?? null;
    }

    return new Promise((resolve) => {
      new ProjectFolderSuggestModal(
        this.app,
        this.store.getProjects(),
        {
          initialScope,
          onChoose: (scopeRootPath) => {
            resolve(scopeRootPath);
          },
          onCancel: () => {
            resolve(undefined);
          }
        },
        this.getConfiguredScopes()
      ).open();
    });
  }

  async openDashboardWithPicker(options?: {
    targetLeaf?: WorkspaceLeaf;
    openInNewLeaf?: boolean;
    initialScope?: string | null;
  }): Promise<ProjectHubDashboardView | null> {
    const scopeRootPath = await this.pickProjectScope(options?.initialScope);
    if (scopeRootPath === undefined) {
      return null;
    }

    return this.activateView({
      targetLeaf: options?.targetLeaf,
      openInNewLeaf: options?.openInNewLeaf,
      scopeRootPath
    });
  }

  async activateView(options?: {
    targetLeaf?: WorkspaceLeaf;
    openInNewLeaf?: boolean;
    scopeRootPath?: string | null;
  }): Promise<ProjectHubDashboardView | null> {
    const { workspace } = this.app;
    const existingLeaf = !options?.targetLeaf ? await this.findOpenDashboardLeaf(options?.scopeRootPath ?? null) : null;
    if (existingLeaf?.view instanceof ProjectHubDashboardView) {
      workspace.revealLeaf(existingLeaf);
      return existingLeaf.view;
    }

    let leaf = options?.targetLeaf ?? workspace.getLeaf(options?.openInNewLeaf ?? false);

    const state = {
      scopeRootPath: options?.scopeRootPath ?? null,
      scopeProjectPath: options?.scopeRootPath ?? null
    };

    await leaf?.setViewState({
      type: PROJECT_HUB_VIEW_TYPE,
      active: true,
      state
    });

    if (leaf) {
      workspace.revealLeaf(leaf);
      if (leaf.view instanceof ProjectHubDashboardView) {
        return leaf.view;
      }

      const fallbackLeaf = workspace.getLeavesOfType(PROJECT_HUB_VIEW_TYPE)
        .find((candidate) => candidate === leaf) ?? workspace.getLeavesOfType(PROJECT_HUB_VIEW_TYPE).at(-1);
      if (fallbackLeaf?.view instanceof ProjectHubDashboardView) {
        workspace.revealLeaf(fallbackLeaf);
        return fallbackLeaf.view;
      }
    }

    return null;
  }

  async openConfiguredScope(scopePath: string, options?: { openInNewLeaf?: boolean; targetLeaf?: WorkspaceLeaf }): Promise<ProjectHubDashboardView | null> {
    const normalizedScopePath = normalizeScopePath(scopePath);
    if (!normalizedScopePath) {
      new Notice("Project Hub: scope path cannot be empty.");
      return null;
    }

    return this.activateView({
      targetLeaf: options?.targetLeaf,
      openInNewLeaf: options?.openInNewLeaf ?? true,
      scopeRootPath: normalizedScopePath
    });
  }

  async openQuickCreateProject(scopeRootPath?: string | null): Promise<void> {
    const scopes = this.getConfiguredScopes();
    const initialScopePath = scopeRootPath ?? scopes[0]?.path ?? DEFAULT_SCOPE_PATH;

    new CreateProjectModal({
      app: this.app,
      scopes: scopes.length > 0 ? scopes.map((scope) => ({ path: scope.path })) : [{ path: initialScopePath }],
      initialScopePath,
      onSubmit: async ({ scopePath, projectName }) => {
        await this.createProjectNote(scopePath, projectName);
      }
    }).open();
  }

  async openQuickCreateVersion(initialProject?: string | null, scopeRootPath?: string | null): Promise<void> {
    const projects = scopeRootPath
      ? this.getProjectsForScope(scopeRootPath)
      : this.store.getProjects();
    if (projects.length === 0) {
      new Notice("No projects in this scope. Cannot create version.");
      return;
    }

    new CreateVersionModal({
      app: this.app,
      projects,
      initialProject,
      onSubmit: async ({ project, version, start, end, effort }) => {
        await this.createVersionNote(project, version, { start, end, effort });
      }
    }).open();
  }

  private refreshRibbonIcons(): void {
    this.clearRibbonIcons();

    const scopes = this.getConfiguredScopes();
    if (scopes.length === 0) {
      const iconEl = this.addRibbonIcon("layout-dashboard", "Open Project Hub", async () => {
        await this.openDashboardWithPicker({ openInNewLeaf: true });
      });
      this.ribbonIcons.push(iconEl);
      return;
    }

    for (const scope of scopes) {
      const title = `Open Project Hub: ${buildScopeDisplayName(scope)}`;
      const iconEl = this.addRibbonIcon(normalizeScopeIcon(scope.icon), title, async () => {
        await this.openConfiguredScope(scope.path, { openInNewLeaf: true });
      });
      iconEl.addClass("project-hub-ribbon-icon");
      iconEl.setAttr("aria-label", title);
      this.ribbonIcons.push(iconEl);
    }
  }

  private clearRibbonIcons(): void {
    for (const iconEl of this.ribbonIcons) {
      iconEl.remove();
    }
    this.ribbonIcons = [];
  }

  private async findOpenDashboardLeaf(scopeRootPath: string | null): Promise<WorkspaceLeaf | null> {
    const targetScope = normalizeNullableScope(scopeRootPath);

    for (const leaf of this.app.workspace.getLeavesOfType(PROJECT_HUB_VIEW_TYPE)) {
      if (leaf.isDeferred) {
        await leaf.loadIfDeferred();
      }

      const viewState = leaf.getViewState();
      const leafScope = normalizeNullableScope((viewState.state as { scopeRootPath?: unknown; scopeProjectPath?: unknown } | undefined)?.scopeRootPath
        ?? (viewState.state as { scopeRootPath?: unknown; scopeProjectPath?: unknown } | undefined)?.scopeProjectPath);

      if (leafScope === targetScope) {
        return leaf;
      }
    }

    return null;
  }

  private async createProjectNote(scopePath: string, projectName: string): Promise<void> {
    const normalizedScopePath = normalizeScopePath(scopePath);
    const normalizedProjectName = sanitizePathSegment(projectName);
    if (!normalizedScopePath || !normalizedProjectName) {
      new Notice("Invalid project path or name.");
      return;
    }

    const projectFolderPath = normalizePath(`${normalizedScopePath}/${normalizedProjectName}`);
    const projectFilePath = normalizePath(`${projectFolderPath}/00_Project.md`);
    const roadmapFilePath = normalizePath(`${projectFolderPath}/01_Roadmap.md`);
    const versionsFolderPath = normalizePath(`${projectFolderPath}/Versions`);

    await ensureFolder(this.app, projectFolderPath);
    await ensureFolder(this.app, versionsFolderPath);
    await ensureFile(this.app, roadmapFilePath);
    const projectFileResult = await ensureFile(this.app, projectFilePath);

    await this.initializeProjectFile(projectFileResult.file, normalizedProjectName, projectFileResult.created);
    await this.store.rebuild();
  }

  private async createVersionNote(projectName: string, versionName: string, meta?: { start?: string; end?: string; effort?: number }): Promise<void> {
    const projectRecord = this.store.getProjects().find((project) => project.project === projectName);
    if (!projectRecord) {
      new Notice(`Project not found: ${projectName}`);
      return;
    }

    const normalizedVersion = normalizeVersionName(versionName);
    if (!normalizedVersion) {
      new Notice("Invalid version number.");
      return;
    }

    const filePath = normalizePath(`${projectRecord.projectPath}/Versions/${normalizedVersion}.md`);
    const versionFileResult = await ensureFile(this.app, filePath);
    await this.initializeVersionFile(versionFileResult.file, projectRecord.project, normalizedVersion, versionFileResult.created, meta);
    await this.store.rebuild();
  }

  private async initializeProjectFile(file: TFile, projectName: string, isNewFile: boolean): Promise<void> {
    const templateApplied = isNewFile
      ? await this.writeQuickCreateFile(
        file,
        buildProjectFrontmatter(projectName),
        PROJECT_TEMPLATE_PATH,
        buildDefaultProjectBody(projectName),
        {
          project: projectName,
          title: projectName
        }
      )
      : false;

    await this.openCreatedFile(file, "Project created", isNewFile, templateApplied ? PROJECT_TEMPLATE_PATH : null);
  }

  private async initializeVersionFile(file: TFile, projectName: string, versionName: string, isNewFile: boolean, meta?: { start?: string; end?: string; effort?: number }): Promise<void> {
    const templateApplied = isNewFile
      ? await this.writeQuickCreateFile(
        file,
        buildVersionFrontmatter(projectName, versionName, meta),
        VERSION_TEMPLATE_PATH,
        buildDefaultVersionBody(versionName),
        {
          project: projectName,
          version: versionName,
          title: `V${versionName}`
        }
      )
      : false;

    await this.openCreatedFile(file, "Version created", isNewFile, templateApplied ? VERSION_TEMPLATE_PATH : null);
  }

  private async writeQuickCreateFile(
    file: TFile,
    frontmatter: string,
    templatePath: string,
    fallbackBody: string,
    templateContext: Record<string, string>
  ): Promise<boolean> {
    const templateBody = await this.loadQuickCreateTemplate(templatePath, templateContext);
    const content = buildQuickCreateContent(frontmatter, templateBody ?? fallbackBody).replace(/\n{3,}/g, "\n\n");
    await this.app.vault.modify(file, content.trimEnd() + "\n");
    return templateBody !== null;
  }

  private async loadQuickCreateTemplate(templatePath: string, templateContext: Record<string, string>): Promise<string | null> {
    const templateFile = this.app.vault.getAbstractFileByPath(templatePath);
    if (!(templateFile instanceof TFile)) {
      return null;
    }

    const templateContent = await this.app.vault.cachedRead(templateFile);
    const renderedTemplate = renderQuickCreateTemplate(templateContent, {
      ...templateContext,
      today: getTodayString(),
      fileName: templateFile.basename
    }).trim();
    if (!renderedTemplate) {
      return null;
    }

    return renderedTemplate;
  }

  private async openCreatedFile(
    file: TFile,
    successMessage: string,
    isNewFile: boolean,
    templatePath: string | null
  ): Promise<void> {
    const leaf = this.app.workspace.getLeaf(true);
    await leaf.openFile(file);
    this.app.workspace.revealLeaf(leaf);

    if (!isNewFile) {
      new Notice(`${successMessage} — file already exists, opened directly.`);
      return;
    }

    new Notice(templatePath ? `${successMessage} — initialized from ${templatePath}` : `${successMessage} — default frontmatter written.`);
  }
}

function getProjectScopeRoot(projectPath: string): string | null {
  const segments = projectPath.replace(/\\/g, "/").split("/").filter((segment) => segment.length > 0);
  if (segments.length <= 1) {
    return segments[0] ?? null;
  }

  return segments.slice(0, -1).join("/");
}

function isProjectInScope(projectPath: string, scopePath: string): boolean {
  const normalizedProjectPath = normalizeScopePath(projectPath);
  return normalizedProjectPath === scopePath || normalizedProjectPath.startsWith(`${scopePath}/`);
}

function normalizeNullableScope(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? normalizeScopePath(value) : null;
}

async function ensureFolder(app: AppWithVault, folderPath: string): Promise<void> {
  const parts = normalizePath(folderPath).split("/").filter((part) => part.length > 0);
  let current = "";

  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (!app.vault.getAbstractFileByPath(current)) {
      await app.vault.createFolder(current);
    }
  }
}

async function ensureFile(app: AppWithVault, filePath: string): Promise<{ file: TFile; created: boolean }> {
  const normalizedFilePath = normalizePath(filePath);
  const existing = app.vault.getAbstractFileByPath(normalizedFilePath);
  if (existing instanceof TFile) {
    return { file: existing, created: false };
  }

  await ensureFolder(app, normalizedFilePath.split("/").slice(0, -1).join("/"));
  return { file: await app.vault.create(normalizedFilePath, ""), created: true };
}

function sanitizePathSegment(value: string): string {
  return value.trim().replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ");
}

function normalizeVersionName(value: string): string {
  return sanitizePathSegment(value).replace(/^V(?=\d)/i, "");
}

interface AppWithVault {
  vault: {
    getAbstractFileByPath(path: string): TAbstractFile | null;
    cachedRead(file: TFile): Promise<string>;
    modify(file: TFile, data: string): Promise<void>;
    createFolder(path: string): Promise<TFolder>;
    create(path: string, data: string): Promise<TFile>;
  };
}

function buildProjectFrontmatter(projectName: string): string {
  const today = getTodayString();
  return [
    "---",
    "type: project",
    `name: ${projectName}`,
    "owner:",
    "status: active",
    `start: ${today}`,
    "end:",
    "---",
    ""
  ].join("\n");
}

function buildVersionFrontmatter(projectName: string, versionName: string, meta?: { start?: string; end?: string; effort?: number }): string {
  const today = getTodayString();
  const start = meta?.start ?? today;
  const end = meta?.end ?? "";
  const effortVal = meta?.effort !== undefined ? String(meta.effort) : "";
  return [
    "---",
    "type: version",
    `project: ${projectName}`,
    `item: ${versionName}`,
    "status: todo",
    `start: ${start}`,
    `end: ${end}`,
    `effort: ${effortVal}`,
    "---",
    ""
  ].join("\n");
}

function buildDefaultProjectBody(projectName: string): string {
  return [
    `# ${projectName}`,
    "",
    "## Overview",
    "",
    "## Goals",
    "",
    "- [ ] "
  ].join("\n");
}

function buildDefaultVersionBody(versionName: string): string {
  return [
    `# V${versionName}`,
    "",
    "## Goal",
    "",
    "## Tasks",
    "",
    "- [ ] "
  ].join("\n");
}

function renderQuickCreateTemplate(template: string, context: Record<string, string>): string {
  return template.replace(/{{\s*([^}]+)\s*}}/g, (match, rawKey: string) => {
    const key = rawKey.trim();
    if (key === "date:YYYY-MM-DD") {
      return context.today ?? match;
    }
    if (key === "title") {
      return context.title ?? context.fileName ?? match;
    }
    return context[key] ?? match;
  });
}

function getTodayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function buildQuickCreateContent(requiredFrontmatter: string, templateContent: string): string {
  const templateParts = splitFrontmatter(templateContent);
  if (!templateParts.frontmatter) {
    return `${requiredFrontmatter}${templateContent}`;
  }

  const mergedFrontmatter = new Map<string, string>();
  for (const [key, value] of parseFrontmatterEntries(templateParts.frontmatter)) {
    mergedFrontmatter.set(key, value);
  }
  for (const [key, value] of parseFrontmatterEntries(requiredFrontmatter)) {
    mergedFrontmatter.set(key, value);
  }

  return `${serializeFrontmatter(mergedFrontmatter)}${templateParts.body.trimStart()}`;
}

function splitFrontmatter(content: string): { frontmatter: string | null; body: string } {
  if (!content.startsWith("---")) {
    return { frontmatter: null, body: content };
  }

  const lines = content.split(/\r?\n/);
  if (lines[0].trim() !== "---") {
    return { frontmatter: null, body: content };
  }

  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index].trim() === "---") {
      return {
        frontmatter: lines.slice(0, index + 1).join("\n"),
        body: lines.slice(index + 1).join("\n")
      };
    }
  }

  return { frontmatter: null, body: content };
}

function parseFrontmatterEntries(frontmatterBlock: string): Array<[string, string]> {
  const entries: Array<[string, string]> = [];
  const lines = frontmatterBlock.split(/\r?\n/);
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === "---") {
      break;
    }

    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) {
      continue;
    }

    entries.push([match[1], match[2]]);
  }

  return entries;
}

function serializeFrontmatter(entries: Map<string, string>): string {
  const lines = ["---"];
  for (const [key, value] of entries) {
    lines.push(value.length > 0 ? `${key}: ${value}` : `${key}:`);
  }
  lines.push("---", "");
  return lines.join("\n");
}