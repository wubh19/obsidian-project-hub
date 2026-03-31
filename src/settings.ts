import { App, PluginSettingTab, Setting, normalizePath } from "obsidian";
import type ProjectHubPlugin from "./main";

export interface ProjectHubScopeSetting {
  id: string;
  path: string;
  icon: string;
}

export interface ProjectHubPluginSettings {
  scopes: ProjectHubScopeSetting[];
}

export const DEFAULT_SETTINGS: ProjectHubPluginSettings = {
  scopes: [
    {
      id: createScopeId(),
      path: "wubh",
      icon: "layout-dashboard"
    }
  ]
};

const DEFAULT_SCOPE_ICON = "layout-dashboard";

export class ProjectHubSettingTab extends PluginSettingTab {
  private readonly plugin: ProjectHubPlugin;

  constructor(app: App, plugin: ProjectHubPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Project Hub" });
    containerEl.createEl("p", {
      text: "配置项目容器目录。每个已配置目录都会在左侧工具栏显示一个默认看板图标。"
    });

    new Setting(containerEl)
      .setName("项目路径")
      .setDesc("例如 wubh。每一项配置一个项目容器路径。")
      .addButton((button) => {
        button.setButtonText("新增路径").setCta().onClick(async () => {
          this.plugin.settings.scopes.push({
            id: createScopeId(),
            path: "",
            icon: DEFAULT_SCOPE_ICON
          });
          this.display();
        });
      });

    if (this.plugin.settings.scopes.length === 0) {
      containerEl.createDiv({
        cls: "project-hub-empty-state",
        text: "当前没有配置项目路径。新增一条后，左侧工具栏会出现对应看板图标。"
      });
      return;
    }

    this.plugin.settings.scopes.forEach((scope, index) => {
      this.renderScopeSetting(containerEl, scope, index);
    });
  }

  private renderScopeSetting(containerEl: HTMLElement, scope: ProjectHubScopeSetting, index: number): void {
    const setting = new Setting(containerEl)
      .setName(`项目路径 ${index + 1}`);

    const refreshPreview = (path: string): void => {
      const normalizedPath = normalizeScopePath(path);
      if (!normalizedPath) {
        setting.setDesc("路径使用 Vault 内相对路径，例如 wubh 或 Team/wubh");
        return;
      }

      const projectFolders = this.plugin.getProjectFolderNamesForScope(normalizedPath);
      if (projectFolders.length === 0) {
        setting.setDesc(`未识别到项目文件夹: ${normalizedPath}`);
        return;
      }

      const names = projectFolders.slice(0, 4).join("、");
      const countText = projectFolders.length > 4 ? ` 等 ${projectFolders.length} 个项目` : ` 共 ${projectFolders.length} 个项目`;
      setting.setDesc(`已识别: ${names}${countText}`);
    };

    setting.addText((text) => {
      text
        .setPlaceholder("wubh")
        .setValue(scope.path)
        .onChange((value) => {
          scope.path = value;
          refreshPreview(value);
        });
      text.inputEl.style.width = "18rem";
      text.inputEl.addEventListener("blur", () => {
        void this.plugin.saveSettings();
      });
    });

    setting.addExtraButton((button) => {
      button.setIcon("cross").setTooltip("删除该路径").onClick(async () => {
        this.plugin.settings.scopes = this.plugin.settings.scopes.filter((s) => s.id !== scope.id);
        await this.plugin.saveSettings();
        this.display();
      });
    });

    refreshPreview(scope.path);
  }
}

export function normalizeSettings(data: unknown): ProjectHubPluginSettings {
  if (!data || typeof data !== "object" || !("scopes" in data)) {
    return {
      scopes: [...DEFAULT_SETTINGS.scopes]
    };
  }

  const scopes = Array.isArray((data as { scopes?: unknown } | null)?.scopes)
    ? (data as { scopes: unknown[] }).scopes
    : [];

  const normalizedScopes = scopes
    .map((scope) => normalizeScopeSetting(scope))
    .filter((scope): scope is ProjectHubScopeSetting => Boolean(scope))
    .filter((scope) => scope.path.length > 0);

  return {
    scopes: normalizedScopes
  };
}

export function normalizeScopePath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  return normalizePath(trimmed).replace(/^\/+|\/+$/g, "");
}

export function buildScopeDisplayName(scope: ProjectHubScopeSetting): string {
  return scope.path;
}

export function normalizeScopeIcon(value: string | undefined): string {
  return DEFAULT_SCOPE_ICON;
}

function normalizeScopeSetting(value: unknown): ProjectHubScopeSetting | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as { id?: unknown; path?: unknown; icon?: unknown };
  const rawPath = typeof candidate.path === "string" ? normalizeScopePath(candidate.path) : "";
  const path = normalizeLegacyScopePath(rawPath);
  const id = typeof candidate.id === "string" && candidate.id.trim().length > 0 ? candidate.id.trim() : createScopeId();
  const icon = typeof candidate.icon === "string" ? normalizeScopeIcon(candidate.icon) : DEFAULT_SCOPE_ICON;

  return {
    id,
    path,
    icon
  };
}

function createScopeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeLegacyScopePath(rawPath: string): string {
  return rawPath;
}
