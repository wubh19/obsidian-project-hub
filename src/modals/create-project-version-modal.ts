import { App, Modal, Notice, Setting } from "obsidian";
import { ProjectRecord } from "../types";

interface ScopeOption {
  path: string;
}

interface CreateProjectModalOptions {
  app: App;
  scopes: ScopeOption[];
  initialScopePath?: string | null;
  onSubmit: (input: { scopePath: string; projectName: string }) => Promise<void> | void;
}

interface CreateVersionModalOptions {
  app: App;
  projects: ProjectRecord[];
  initialProject?: string | null;
  onSubmit: (input: { project: string; version: string }) => Promise<void> | void;
}

export class CreateProjectModal extends Modal {
  private readonly scopes: ScopeOption[];
  private readonly onSubmitHandler: (input: { scopePath: string; projectName: string }) => Promise<void> | void;
  private scopePath = "";
  private projectName = "";

  constructor(options: CreateProjectModalOptions) {
    super(options.app);
    this.scopes = options.scopes;
    this.scopePath = options.initialScopePath ?? options.scopes[0]?.path ?? "";
    this.onSubmitHandler = options.onSubmit;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("project-hub-modal");

    contentEl.createEl("h2", { text: "快速新增项目" });
    contentEl.createEl("p", {
      cls: "project-hub-modal-subtitle",
      text: "创建项目目录和 00_Project.md，并按 Templates/Project.md 初始化正文。"
    });

    if (this.scopes.length > 1) {
      const scopeSetting = new Setting(contentEl)
        .setName("项目容器")
        .setDesc("选择项目要创建到哪个根目录下");
      scopeSetting.controlEl.empty();
      const scopeSelect = scopeSetting.controlEl.createEl("select");
      for (const scope of this.scopes) {
        scopeSelect.createEl("option", { value: scope.path, text: scope.path });
      }
      scopeSelect.value = this.scopePath;
      scopeSelect.addEventListener("change", () => {
        this.scopePath = scopeSelect.value;
      });
    }

    new Setting(contentEl)
      .setName("项目名称")
      .setDesc("例如 obsidian-project-hub 或 project2")
      .addText((text) => {
        text.setPlaceholder("project2").onChange((value) => {
          this.projectName = value.trim();
        });
      });

    new Setting(contentEl)
      .addButton((button) => {
        button.setButtonText("创建项目").setCta().onClick(async () => {
          await this.submit();
        });
      })
      .addExtraButton((button) => {
        button.setIcon("cross").setTooltip("取消").onClick(() => {
          this.close();
        });
      });
  }

  private async submit(): Promise<void> {
    if (!this.scopePath) {
      new Notice("请选择项目容器");
      return;
    }

    if (!this.projectName) {
      new Notice("项目名称不能为空");
      return;
    }

    await this.onSubmitHandler({
      scopePath: this.scopePath,
      projectName: this.projectName
    });
    this.close();
  }
}

export class CreateVersionModal extends Modal {
  private readonly projects: ProjectRecord[];
  private readonly onSubmitHandler: (input: { project: string; version: string }) => Promise<void> | void;
  private project = "";
  private version = "";

  constructor(options: CreateVersionModalOptions) {
    super(options.app);
    this.projects = options.projects;
    this.project = options.initialProject ?? options.projects[0]?.project ?? "";
    this.onSubmitHandler = options.onSubmit;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("project-hub-modal");

    contentEl.createEl("h2", { text: "快速新增版本" });
    contentEl.createEl("p", {
      cls: "project-hub-modal-subtitle",
      text: "创建版本文件，并按 Templates/Version.md 初始化正文。"
    });

    const projectSetting = new Setting(contentEl)
      .setName("项目")
      .setDesc("选择版本归属的项目");
    projectSetting.controlEl.empty();
    const projectSelect = projectSetting.controlEl.createEl("select");
    for (const project of this.projects) {
      projectSelect.createEl("option", { value: project.project, text: project.project });
    }
    projectSelect.value = this.project;
    projectSelect.addEventListener("change", () => {
      this.project = projectSelect.value;
    });

    new Setting(contentEl)
      .setName("版本号")
      .setDesc("例如 0.4.15")
      .addText((text) => {
        text.setPlaceholder("0.4.15").onChange((value) => {
          this.version = value.trim();
        });
      });

    new Setting(contentEl)
      .addButton((button) => {
        button.setButtonText("创建版本").setCta().onClick(async () => {
          await this.submit();
        });
      })
      .addExtraButton((button) => {
        button.setIcon("cross").setTooltip("取消").onClick(() => {
          this.close();
        });
      });
  }

  private async submit(): Promise<void> {
    if (!this.project) {
      new Notice("请选择项目");
      return;
    }

    if (!this.version) {
      new Notice("版本号不能为空");
      return;
    }

    await this.onSubmitHandler({
      project: this.project,
      version: this.version
    });
    this.close();
  }
}