import { App, Modal, Notice, Setting, TFile, normalizePath } from "obsidian";
import { ProjectRecord, VersionRecord } from "../types";
import { computeEndDatetime, parseWorkload } from "../core/parser";

export interface CreateTaskInput {
  project: string;
  version?: string;
  title: string;
  owner?: string;
  priority?: string;
  due?: string;
  startTime?: string;
  endTime?: string;
  remark?: string;
}

interface CreateTaskModalOptions {
  app: App;
  projects: ProjectRecord[];
  versions: VersionRecord[];
  initialProject?: string | null;
  initialVersion?: string | null;
  onCreated?: () => Promise<void> | void;
}

export class CreateTaskModal extends Modal {
  private readonly projects: ProjectRecord[];
  private readonly versions: VersionRecord[];
  private readonly onCreated?: () => Promise<void> | void;

  private project = "";
  private version = "";
  private title = "";
  private owner = "wubh";
  private priority = "medium";
  private due = todayString();
  private startTime = `${todayString()} 09:00`;
  private workload = "";
  private endTime = "";
  private remark = "";

  constructor(options: CreateTaskModalOptions) {
    super(options.app);
    this.projects = options.projects;
    this.versions = options.versions;
    this.project = options.initialProject ?? options.projects[0]?.project ?? "";
    this.version = normalizeVersionValue(options.initialVersion);
    this.onCreated = options.onCreated;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("project-hub-modal");

    contentEl.createEl("h2", { text: "New Task" });
    contentEl.createEl("p", {
      cls: "project-hub-modal-subtitle",
      text: "Select project, version, owner and dates here."
    });

    const projectSetting = new Setting(contentEl)
      .setName("Project")
      .setDesc("Select the project for this task");
    projectSetting.controlEl.empty();
    const projectSelect = projectSetting.controlEl.createEl("select");
    for (const project of this.projects) {
      projectSelect.createEl("option", { value: project.project, text: project.project });
    }
    projectSelect.value = this.project;

    new Setting(contentEl)
      .setName("Task Title")
      .setDesc("Used for task document and card title")
      .addText((text) => {
        text.setPlaceholder("e.g. Upgrade JDK17").onChange((value) => {
          this.title = value.trim();
        });
      });

    const versionSetting = new Setting(contentEl)
      .setName("Version")
      .setDesc("Required. Task will be written to the version's Tasks section.");
    versionSetting.controlEl.empty();
    const versionSelect = versionSetting.controlEl.createEl("select");
    const syncVersionOptions = () => {
      versionSelect.empty();
      const seenVersions = new Set<string>();
      for (const version of this.getProjectVersions()) {
        const normalizedVersion = normalizeVersionValue(version.version);
        if (!normalizedVersion || seenVersions.has(normalizedVersion)) {
          continue;
        }

        seenVersions.add(normalizedVersion);
        versionSelect.createEl("option", { value: normalizedVersion, text: normalizedVersion });
      }

      if (seenVersions.size === 0) {
        versionSelect.createEl("option", { value: "", text: "No versions for this project" });
      }

      if (!seenVersions.has(this.version)) {
        this.version = "";
      }
      versionSelect.value = this.version;
    };
    syncVersionOptions();
    projectSelect.addEventListener("change", () => {
      this.project = projectSelect.value;
      syncVersionOptions();
    });
    versionSelect.addEventListener("change", () => {
      this.version = normalizeVersionValue(versionSelect.value);
    });

    new Setting(contentEl)
      .setName("Owner")
      .addText((text) => {
        text.setPlaceholder("e.g. John").setValue(this.owner).onChange((value) => {
          this.owner = value.trim();
        });
      });

    new Setting(contentEl)
      .setName("Priority")
      .addDropdown((dropdown) => {
        for (const option of ["low", "medium", "high", "urgent"]) {
          dropdown.addOption(option, option);
        }
        dropdown.setValue(this.priority);
        dropdown.onChange((value) => {
          this.priority = value;
        });
      });

    const dueSetting = new Setting(contentEl)
      .setName("Due Date")
      .setDesc("Click to select date");
    dueSetting.controlEl.empty();
    const dueInput = dueSetting.controlEl.createEl("input");
    dueInput.type = "date";
    dueInput.value = this.due;
    dueInput.addClass("project-hub-native-date-input");
    dueInput.addEventListener("change", () => {
      this.due = dueInput.value.trim();
    });
    dueInput.addEventListener("click", () => {
      dueInput.showPicker?.();
    });
    dueInput.addEventListener("focus", () => {
      dueInput.showPicker?.();
    });

    // Start datetime field
    const startSetting = new Setting(contentEl)
      .setName("Start Time")
      .setDesc("Select start date and time");
    startSetting.controlEl.empty();
    const startDateInput = startSetting.controlEl.createEl("input");
    startDateInput.type = "date";
    startDateInput.value = this.startTime.slice(0, 10);
    startDateInput.addClass("project-hub-native-date-input");
    const startTimeSep = startSetting.controlEl.createEl("span", { text: " " });
    startTimeSep.style.margin = "0 4px";
    const startTimeInput = startSetting.controlEl.createEl("input");
    startTimeInput.type = "time";
    startTimeInput.value = this.startTime.slice(11) || "09:00";
    startTimeInput.addClass("project-hub-native-time-input");

    // Workload field with auto end-time calculation
    let endTimeDisplay: HTMLElement;
    const updateEndTime = () => {
      const dateVal = startDateInput.value;
      const timeVal = startTimeInput.value || "09:00";
      this.startTime = dateVal ? `${dateVal} ${timeVal}` : "";
      const hours = parseWorkload(this.workload);
      if (this.startTime && hours !== undefined) {
        this.endTime = computeEndDatetime(this.startTime, hours);
        endTimeDisplay.setText(`${this.endTime}`);
      } else {
        this.endTime = "";
        endTimeDisplay.setText("Auto-calculated from workload");
      }
    };
    startDateInput.addEventListener("change", updateEndTime);
    startTimeInput.addEventListener("change", updateEndTime);

    const workloadSetting = new Setting(contentEl)
      .setName("Workload")
      .setDesc("e.g. 1d, 2d, 7.5h (1d = 7.5h)")
      .addText((text) => {
        text.setPlaceholder("1d").onChange((value) => {
          this.workload = value.trim();
          updateEndTime();
        });
      });

    const endTimeSetting = new Setting(contentEl)
      .setName("End Time (Auto)")
      .setDesc("Calculated from start + workload");
    endTimeSetting.controlEl.empty();
    endTimeDisplay = endTimeSetting.controlEl.createEl("span", {
      cls: "project-hub-end-time-preview",
      text: "Auto-calculated from workload"
    });

    new Setting(contentEl)
      .setName("Remark")
      .addText((text) => {
        text.setPlaceholder("Optional remark").onChange((value) => {
          this.remark = value.trim();
        });
      });

    new Setting(contentEl)
      .addButton((button) => {
        button.setButtonText("Create Task").setCta().onClick(async () => {
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

    if (!this.title) {
      new Notice("Task title is required.");
      return;
    }

    if (!this.version) {
      new Notice("Please select a version.");
      return;
    }

    if (this.due && !/^\d{4}-\d{2}-\d{2}$/.test(this.due)) {
      new Notice("Due date must be in YYYY-MM-DD format.");
      return;
    }

    const taskPath = await this.createTaskFile({
      project: this.project,
      version: this.version || undefined,
      title: this.title,
      owner: this.owner || undefined,
      priority: this.priority,
      due: this.due || undefined,
      startTime: this.startTime || undefined,
      endTime: this.endTime || undefined,
      remark: this.remark || undefined
    });

    const createdFile = this.app.vault.getAbstractFileByPath(taskPath);
    if (createdFile instanceof TFile) {
      await this.app.workspace.getLeaf(true).openFile(createdFile);
    }
    await this.onCreated?.();
    new Notice("Task created.");
    this.close();
  }

  private async createTaskFile(input: CreateTaskInput): Promise<string> {
    const normalizedVersion = normalizeVersionValue(input.version);
    const projectPath = this.getProjectPath(input.project);
    if (!projectPath) {
      throw new Error(`Project path not found: ${input.project}`);
    }

    if (!normalizedVersion) {
      throw new Error("Version is required when creating a task");
    }

    const filePath = normalizePath(`${projectPath}/Versions/${normalizedVersion}.md`);

    await ensureFolder(this.app, normalizePath(filePath.split("/").slice(0, -1).join("/")));

    const abstractFile = this.app.vault.getAbstractFileByPath(filePath);
    const taskLine = buildTaskLine(input.title, input.owner, input.priority, input.due, input.startTime, input.endTime, input.remark);

    if (abstractFile instanceof TFile) {
      const content = await this.app.vault.read(abstractFile);
      const nextContent = appendTaskLine(content, taskLine);
      await this.app.vault.modify(abstractFile, nextContent);
      return filePath;
    }

    const initialContent = buildVersionFile(input.project, normalizedVersion, taskLine);
    await this.app.vault.create(filePath, initialContent);
    return filePath;
  }

  private getProjectVersions(): VersionRecord[] {
    return this.versions.filter((version) => version.project === this.project);
  }

  private getProjectPath(project: string): string | null {
    const projectRecord = this.projects.find((item) => item.project === project);
    return projectRecord ? normalizePath(projectRecord.projectPath) : null;
  }
}

function normalizeVersionValue(value?: string | null): string {
  return (value ?? "").trim().replace(/^V(?=\d)/i, "");
}

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

async function ensureFolder(app: App, folderPath: string): Promise<void> {
  const parts = folderPath.split("/");
  let current = "";

  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (!app.vault.getAbstractFileByPath(current)) {
      await app.vault.createFolder(current);
    }
  }
}

function buildTaskLine(title: string, owner?: string, priority?: string, due?: string, startTime?: string, endTime?: string, remark?: string): string {
  const tokens = [
    title,
    owner ? `@${owner}` : null,
    priority === "high" || priority === "urgent" ? "🔥" : priority === "medium" ? "⚠️" : null,
    due ? `📅 ${due}` : null,
    startTime ? `🗓 ${startTime}` : null,
    endTime ? `🏁 ${endTime}` : null,
    remark ? `💬 ${remark}` : null
  ].filter(Boolean);

  return `- [ ] ${tokens.join(" ")}`;
}

function appendTaskLine(content: string, taskLine: string): string {
  const lines = content.split(/\r?\n/);
  const tasksHeaderIndex = lines.findIndex((line) => /^##\s+Tasks\s*$/.test(line));
  if (tasksHeaderIndex !== -1) {
    let insertIndex = lines.length;
    for (let index = tasksHeaderIndex + 1; index < lines.length; index += 1) {
      if (/^##\s+/.test(lines[index])) {
        insertIndex = index;
        break;
      }
    }

    const nextLines = [...lines];
    const previousLine = nextLines[insertIndex - 1] ?? "";
    if (previousLine.trim().length !== 0) {
      nextLines.splice(insertIndex, 0, "");
      insertIndex += 1;
    }
    nextLines.splice(insertIndex, 0, taskLine);
    return `${nextLines.join("\n").trimEnd()}\n`;
  }

  return `${content.trimEnd()}\n\n## Tasks\n\n${taskLine}\n`;
}

function buildVersionFile(project: string, version: string, taskLine: string): string {
  return [
    "---",
    "type: version",
    `project: ${project}`,
    `item: ${version}`,
    "status: todo",
    "---",
    "",
    `# V${version}`,
    "",
    "## Tasks",
    "",
    taskLine,
    ""
  ].join("\n");
}
