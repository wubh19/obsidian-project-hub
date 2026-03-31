import { App, FuzzyMatch, FuzzySuggestModal, normalizePath } from "obsidian";
import { ProjectRecord } from "../types";
import { ProjectHubScopeSetting, buildScopeDisplayName, normalizeScopePath } from "../settings";

interface ProjectFolderSuggestModalOptions {
  initialScope?: string | null;
  onChoose: (scopeRootPath: string | null) => void;
  onCancel?: () => void;
}

interface ProjectScopeOption {
  label: string;
  description: string;
  scopeRootPath: string | null;
}

export class ProjectFolderSuggestModal extends FuzzySuggestModal<ProjectScopeOption> {
  private readonly scopeOptions: ProjectScopeOption[];
  private readonly onChoose: (scopeRootPath: string | null) => void;
  private readonly onCancel?: () => void;
  private chosen = false;

  constructor(app: App, projects: ProjectRecord[], options: ProjectFolderSuggestModalOptions, configuredScopes: ProjectHubScopeSetting[] = []) {
    super(app);
    this.scopeOptions = buildProjectScopeOptions(projects, configuredScopes);
    this.onChoose = options.onChoose;
    this.onCancel = options.onCancel;

    this.setPlaceholder("选择要打开的项目容器目录，例如 Projects");

    const initialScope = normalizeScopeProjectPath(options.initialScope);
    if (initialScope) {
      const initialOption = this.scopeOptions.find((item) => item.scopeRootPath === initialScope);
      if (initialOption) {
        this.setInstructions([
          { command: "Enter", purpose: `打开 ${initialOption.label}` },
          { command: "Esc", purpose: "取消" }
        ]);
      }
    }
  }

  getItems(): ProjectScopeOption[] {
    return this.scopeOptions;
  }

  getItemText(item: ProjectScopeOption): string {
    return `${item.label} ${item.description}`;
  }

  renderSuggestion(match: FuzzyMatch<ProjectScopeOption>, el: HTMLElement): void {
    const item = match.item;
    el.empty();
    el.createDiv({ cls: "project-hub-scope-suggest-title", text: item.label });
    el.createDiv({ cls: "project-hub-scope-suggest-desc", text: item.description });
  }

  onChooseItem(item: ProjectScopeOption, _evt: MouseEvent | KeyboardEvent): void {
    this.chosen = true;
    this.onChoose(item.scopeRootPath);
  }

  onClose(): void {
    super.onClose();
    if (!this.chosen) {
      this.onCancel?.();
    }
  }
}

function buildProjectScopeOptions(projects: ProjectRecord[], configuredScopes: ProjectHubScopeSetting[] = []): ProjectScopeOption[] {
  const configuredOptions = configuredScopes
    .map((scope) => {
      const scopeRootPath = normalizeScopePath(scope.path);
      if (!scopeRootPath) {
        return null;
      }

      return {
        label: buildScopeDisplayName(scope),
        description: scopeRootPath,
        scopeRootPath
      };
    })
    .filter((item): item is ProjectScopeOption => Boolean(item));

  if (configuredOptions.length > 0) {
    return [
      {
        label: "全部项目",
        description: "显示所有已识别的项目目录",
        scopeRootPath: null
      },
      ...configuredOptions
    ];
  }

  const seen = new Set<string>();
  const scopedOptions = projects
    .map((project) => {
      const scopeRootPath = getProjectScopeRoot(project.projectPath);
      if (!scopeRootPath || seen.has(scopeRootPath)) {
        return null;
      }

      seen.add(scopeRootPath);
      return {
        label: scopeRootPath,
        description: `包含项目，例如 ${project.project}`,
        scopeRootPath
      };
    })
    .filter((item): item is ProjectScopeOption => Boolean(item))
    .sort((left, right) => left.label.localeCompare(right.label, "zh-Hans-CN"));

  return [
    {
      label: "全部项目",
      description: "显示所有已识别的项目目录",
      scopeRootPath: null
    },
    ...scopedOptions
  ];
}

function getProjectScopeRoot(projectPath: string): string | null {
  const normalizedProjectPath = normalizeScopeProjectPath(projectPath);
  if (!normalizedProjectPath) {
    return null;
  }

  const segments = normalizedProjectPath.split("/").filter((segment) => segment.length > 0);
  if (segments.length <= 1) {
    return normalizedProjectPath;
  }

  return segments.slice(0, -1).join("/");
}

function normalizeScopeProjectPath(value?: string | null): string | null {
  const normalizedValue = typeof value === "string" ? normalizePath(value).trim() : "";
  return normalizedValue.length > 0 ? normalizedValue : null;
}