import { App, Modal, Notice, Setting, TFile, normalizePath } from "obsidian";
import { ProjectRecord, VersionRecord } from "../types";

export interface CreateTaskInput {
  project: string;
  version?: string;
  title: string;
  owner?: string;
  priority?: string;
  due?: string;
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

    contentEl.createEl("h2", { text: "快速新建任务" });
    contentEl.createEl("p", {
      cls: "project-hub-modal-subtitle",
      text: "项目、版本、负责人和日期都可以在这里直接选择。"
    });

    const projectSetting = new Setting(contentEl)
      .setName("项目")
      .setDesc("选择任务归属的项目");
    projectSetting.controlEl.empty();
    const projectSelect = projectSetting.controlEl.createEl("select");
    for (const project of this.projects) {
      projectSelect.createEl("option", { value: project.project, text: project.project });
    }
    projectSelect.value = this.project;

    new Setting(contentEl)
      .setName("任务标题")
      .setDesc("用于生成任务文档和卡片标题")
      .addText((text) => {
        text.setPlaceholder("例如：升级 JDK17").onChange((value) => {
          this.title = value.trim();
        });
      });

    const versionSetting = new Setting(contentEl)
      .setName("版本")
      .setDesc("必须选择版本，任务会写入对应版本文件的 Tasks 区块");
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
        versionSelect.createEl("option", { value: "", text: "当前项目暂无版本" });
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
      .setName("负责人")
      .addText((text) => {
        text.setPlaceholder("例如：李四").setValue(this.owner).onChange((value) => {
          this.owner = value.trim();
        });
      });

    new Setting(contentEl)
      .setName("优先级")
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
      .setName("截止日期")
      .setDesc("点击选择日期");
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

    new Setting(contentEl)
      .addButton((button) => {
        button.setButtonText("创建任务").setCta().onClick(async () => {
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

    if (!this.title) {
      new Notice("任务标题不能为空");
      return;
    }

    if (!this.version) {
      new Notice("请选择版本");
      return;
    }

    if (this.due && !/^\d{4}-\d{2}-\d{2}$/.test(this.due)) {
      new Notice("截止日期格式必须是 YYYY-MM-DD");
      return;
    }

    const taskPath = await this.createTaskFile({
      project: this.project,
      version: this.version || undefined,
      title: this.title,
      owner: this.owner || undefined,
      priority: this.priority,
      due: this.due || undefined
    });

    const createdFile = this.app.vault.getAbstractFileByPath(taskPath);
    if (createdFile instanceof TFile) {
      await this.app.workspace.getLeaf(true).openFile(createdFile);
    }
    await this.onCreated?.();
    new Notice("任务已创建");
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
    const taskLine = buildTaskLine(input.title, input.owner, input.priority, input.due);

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

function buildTaskLine(title: string, owner?: string, priority?: string, due?: string): string {
  const tokens = [
    title,
    owner ? `@${owner}` : null,
    priority === "high" || priority === "urgent" ? "🔥" : priority === "medium" ? "⚠️" : null,
    due ? `📅 ${due}` : null
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
    `version: ${version}`,
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
