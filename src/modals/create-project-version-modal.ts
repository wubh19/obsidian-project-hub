import { App, Modal, Notice, Setting } from "obsidian";
import { ProjectRecord } from "../types";
import { computeEndDatetime, parseWorkload } from "../core/parser";

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
  onSubmit: (input: { project: string; version: string; start?: string; end?: string; effort?: number }) => Promise<void> | void;
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

    contentEl.createEl("h2", { text: "New Project" });
    contentEl.createEl("p", {
      cls: "project-hub-modal-subtitle",
      text: "Create project folder and 00_Project.md from template."
    });

    if (this.scopes.length > 1) {
      const scopeSetting = new Setting(contentEl)
        .setName("Project Scope")
        .setDesc("Select the root folder for the project.");
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
      .setName("Project Name")
      .setDesc("e.g. my-project or project2")
      .addText((text) => {
        text.setPlaceholder("project2").onChange((value) => {
          this.projectName = value.trim();
        });
      });

    new Setting(contentEl)
      .addButton((button) => {
        button.setButtonText("Create Project").setCta().onClick(async () => {
          await this.submit();
        });
      })
      .addExtraButton((button) => {
        button.setIcon("cross").setTooltip("Cancel").onClick(() => {
          this.close();
        });
      });
  }

  private async submit(): Promise<void> {
    if (!this.scopePath) {
      new Notice("Please select a project scope.");
      return;
    }

    if (!this.projectName) {
      new Notice("Project name is required.");
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
  private readonly onSubmitHandler: (input: { project: string; version: string; start?: string; end?: string; effort?: number }) => Promise<void> | void;
  private project = "";
  private version = "";
  private startDate = todayString();
  private workload = "";
  private endDate = "";
  private effort: number | undefined = undefined;

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

    contentEl.createEl("h2", { text: "New Item" });
    contentEl.createEl("p", {
      cls: "project-hub-modal-subtitle",
      text: "Create version file from template."
    });

    const projectSetting = new Setting(contentEl)
      .setName("Project")
      .setDesc("Select the project for this version.");
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
      .setName("Item")
      .setDesc("e.g. 0.4.15")
      .addText((text) => {
        text.setPlaceholder("0.4.15").onChange((value) => {
          this.version = value.trim();
        });
      });

    // Start date field
    const startSetting = new Setting(contentEl)
      .setName("Start Date")
      .setDesc("Version start date");
    startSetting.controlEl.empty();
    const startInput = startSetting.controlEl.createEl("input");
    startInput.type = "date";
    startInput.value = this.startDate;
    startInput.addClass("project-hub-native-date-input");
    startInput.addEventListener("change", () => {
      this.startDate = startInput.value.trim();
      updateEndDate();
    });

    let endDateDisplay: HTMLElement;
    const updateEndDate = () => {
      const hours = parseWorkload(this.workload);
      this.effort = hours;
      if (this.startDate && hours !== undefined) {
        // For versions use day-level end date
        const days = Math.ceil(hours / 7.5);
        const endMs = new Date(`${this.startDate}T00:00:00`).getTime() + days * 86400000;
        const endDateObj = new Date(endMs);
        const y = endDateObj.getFullYear();
        const mo = String(endDateObj.getMonth() + 1).padStart(2, "0");
        const d = String(endDateObj.getDate()).padStart(2, "0");
        this.endDate = `${y}-${mo}-${d}`;
        endDateDisplay.setText(this.endDate);
      } else {
        this.endDate = "";
        endDateDisplay.setText("Auto-calculated from workload");
      }
    };

    new Setting(contentEl)
      .setName("Planned Workload")
      .setDesc("e.g. 10d, 75h (1d = 7.5h)")
      .addText((text) => {
        text.setPlaceholder("10d").onChange((value) => {
          this.workload = value.trim();
          updateEndDate();
        });
      });

    const endSetting = new Setting(contentEl)
      .setName("Estimated End (Auto)")
      .setDesc("Calculated from start + workload");
    endSetting.controlEl.empty();
    endDateDisplay = endSetting.controlEl.createEl("span", {
      cls: "project-hub-end-time-preview",
      text: "Auto-calculated from workload"
    });

    new Setting(contentEl)
      .addButton((button) => {
        button.setButtonText("Create Item").setCta().onClick(async () => {
          await this.submit();
        });
      })
      .addExtraButton((button) => {
        button.setIcon("cross").setTooltip("Cancel").onClick(() => {
          this.close();
        });
      });
  }

  private async submit(): Promise<void> {
    if (!this.project) {
      new Notice("Please select a project.");
      return;
    }

    if (!this.version) {
      new Notice("Item number is required.");
      return;
    }

    await this.onSubmitHandler({
      project: this.project,
      version: this.version,
      start: this.startDate || undefined,
      end: this.endDate || undefined,
      effort: this.effort
    });
    this.close();
  }
}

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}