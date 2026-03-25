import { Plugin, TAbstractFile, TFile, WorkspaceLeaf } from "obsidian";
import { ProjectStore } from "./core/store";
import { PROJECT_HUB_VIEW_TYPE, ProjectHubDashboardView } from "./views/dashboard-view";

export default class ProjectHubPlugin extends Plugin {
  private store!: ProjectStore;

  async onload(): Promise<void> {
    this.store = new ProjectStore(this.app);

    this.registerView(
      PROJECT_HUB_VIEW_TYPE,
      (leaf: WorkspaceLeaf) => new ProjectHubDashboardView(leaf, this, this.store)
    );

    this.addRibbonIcon("layout-dashboard", "Open Project Hub", async () => {
      await this.activateView();
    });

    this.addCommand({
      id: "open-project-hub",
      name: "Open Project Hub dashboard",
      callback: async () => {
        await this.activateView();
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
        const view = await this.activateView();
        await view?.openQuickCreateTask();
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
    await this.app.workspace.detachLeavesOfType(PROJECT_HUB_VIEW_TYPE);
  }

  private async activateView(): Promise<ProjectHubDashboardView | null> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(PROJECT_HUB_VIEW_TYPE)[0];

    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      await leaf?.setViewState({ type: PROJECT_HUB_VIEW_TYPE, active: true });
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
      if (leaf.view instanceof ProjectHubDashboardView) {
        return leaf.view;
      }
    }

    return null;
  }
}