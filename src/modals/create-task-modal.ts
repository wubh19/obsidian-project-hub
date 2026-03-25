import { App, Modal, Notice, Setting, TFile, normalizePath } from "obsidian";
import { VersionRecord } from "../types";

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
  project: string;
  versions: VersionRecord[];
  onCreated?: () => Promise<void> | void;
}

export class CreateTaskModal extends Modal {
  private readonly project: string;
  private readonly versions: VersionRecord[];
  private readonly onCreated?: () => Promise<void> | void;

  private version = "";
  private title = "";
  private owner = "";
  private priority = "medium";
  private due = "";

  constructor(options: CreateTaskModalOptions) {
    super(options.app);
    this.project = options.project;
    this.versions = options.versions;
    this.onCreated = options.onCreated;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("project-hub-modal");

    contentEl.createEl("h2", { text: "快速新建任务" });
    contentEl.createEl("p", {
      cls: "project-hub-modal-subtitle",
      text: `项目: ${this.project}`
    });

    new Setting(contentEl)
      .setName("任务标题")
      .setDesc("用于生成任务文档和卡片标题")
      .addText((text) => {
        text.setPlaceholder("例如：升级 JDK17").onChange((value) => {
          this.title = value.trim();
        });
      });

    new Setting(contentEl)
      .setName("版本")
      .setDesc("选择版本则写入版本文件；不选则写入 Ops/Ops.md")
      .addDropdown((dropdown) => {
        dropdown.addOption("", "运维任务 (Ops)");
        for (const version of this.versions) {
          dropdown.addOption(version.version, version.version);
        }
        dropdown.onChange((value) => {
          this.version = value;
        });
      });

    new Setting(contentEl)
      .setName("负责人")
      .addText((text) => {
        text.setPlaceholder("例如：李四").onChange((value) => {
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

    new Setting(contentEl)
      .setName("截止日期")
      .setDesc("格式：YYYY-MM-DD")
      .addText((text) => {
        text.setPlaceholder("2026-03-30").onChange((value) => {
          this.due = value.trim();
        });
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
    if (!this.title) {
      new Notice("任务标题不能为空");
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
    const filePath = input.version
      ? normalizePath(`Projects/${input.project}/Versions/V${input.version}.md`)
      : normalizePath(`Projects/${input.project}/Ops/Ops.md`);

    await ensureFolder(this.app, normalizePath(filePath.split("/").slice(0, -1).join("/")));

    const abstractFile = this.app.vault.getAbstractFileByPath(filePath);
    const taskLine = buildTaskLine(input.title, input.owner, input.priority, input.due);

    if (abstractFile instanceof TFile) {
      const content = await this.app.vault.read(abstractFile);
      const nextContent = appendTaskLine(content, taskLine);
      await this.app.vault.modify(abstractFile, nextContent);
      return filePath;
    }

    const initialContent = input.version
      ? buildVersionFile(input.project, input.version, taskLine)
      : buildOpsFile(taskLine);
    await this.app.vault.create(filePath, initialContent);
    return filePath;
  }
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
    due ? `📅${due}` : null
  ].filter(Boolean);

  return `- [ ] ${tokens.join(" ")}`;
}

function appendTaskLine(content: string, taskLine: string): string {
  if (/^##\s+Tasks\s*$/m.test(content)) {
    return `${content.trimEnd()}\n${taskLine}\n`;
  }

  return `${content.trimEnd()}\n\n## Tasks\n\n${taskLine}\n`;
}

function buildVersionFile(project: string, version: string, taskLine: string): string {
  return [
    "---",
    "type: version",
    `project: ${project}`,
    `version: ${version}`,
    "status: planned",
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

function buildOpsFile(taskLine: string): string {
  return [
    "---",
    "type: ops",
    "---",
    "",
    "# 运维任务",
    "",
    "## Tasks",
    "",
    taskLine,
    ""
  ].join("\n");
}