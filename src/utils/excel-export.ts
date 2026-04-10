import * as XLSX from "xlsx";
import { ProjectRecord, TaskRecord, VersionRecord } from "../types";

/**
 * Build a multi-sheet Excel workbook from project hub data.
 * Sheet 1 – Project Plan   (flat task list, reference-format columns)
 * Sheet 2 – Projects       (project summary)
 * Sheet 3 – Items          (item / version list)
 */
export function buildProjectPlanWorkbook(
  projects: ProjectRecord[],
  versions: VersionRecord[],
  tasks: TaskRecord[]
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, buildPlanSheet(projects, versions, tasks), "Project Plan");
  XLSX.utils.book_append_sheet(wb, buildProjectSheet(projects, versions, tasks), "Projects");
  XLSX.utils.book_append_sheet(wb, buildItemSheet(versions, tasks), "Items");

  return wb;
}

// ── Sheet 1: Project Plan (flat task rows) ────────────────────────────────────

function buildPlanSheet(
  _projects: ProjectRecord[],
  versions: VersionRecord[],
  tasks: TaskRecord[]
): XLSX.WorkSheet {
  const header = ["Project", "Item", "Task", "Workload", "Status", "Owner", "Priority", "Last Time", "Remark"];
  const rows: unknown[][] = [header];

  // Sort: project → item → task text
  const sorted = [...tasks].sort((a, b) => {
    const proj = a.project.localeCompare(b.project);
    if (proj !== 0) return proj;
    const item = (a.version ?? "").localeCompare(b.version ?? "");
    if (item !== 0) return item;
    return a.text.localeCompare(b.text);
  });

  for (const t of sorted) {
    const itemLabel = resolveItemLabel(t.version, versions, t.project);
    const lastTime = t.due ?? t.completed ?? "";
    rows.push([
      t.project,
      itemLabel,
      t.text,
      t.effort != null ? `${t.effort}h` : "",
      t.status,
      t.owner ?? "",
      t.priority ?? "",
      lastTime,
      ""
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 22 }, { wch: 14 }, { wch: 38 },
    { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 18 }
  ];
  return ws;
}

// ── Sheet 2: Projects ─────────────────────────────────────────────────────────

function buildProjectSheet(
  projects: ProjectRecord[],
  versions: VersionRecord[],
  tasks: TaskRecord[]
): XLSX.WorkSheet {
  const header = ["Project", "Status", "Owner", "Items", "Total Tasks", "Todo", "In Progress", "Done", "Completion(%)", "Start", "End"];
  const rows: unknown[][] = [header];

  for (const p of projects) {
    const projItems = versions.filter((v) => v.project === p.project);
    const projTasks = tasks.filter((t) => t.project === p.project);
    const todo = projTasks.filter((t) => t.status === "todo").length;
    const inProgress = projTasks.filter((t) => t.status === "in-progress").length;
    const done = projTasks.filter((t) => t.status === "done").length;
    const rate = projTasks.length === 0 ? 0 : Math.round((done / projTasks.length) * 100);
    rows.push([
      p.project,
      p.status ?? "",
      p.owner ?? "",
      projItems.length,
      projTasks.length,
      todo,
      inProgress,
      done,
      rate,
      p.start ?? "",
      p.end ?? ""
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 22 }, { wch: 12 }, { wch: 12 },
    { wch: 7 }, { wch: 11 }, { wch: 7 }, { wch: 11 }, { wch: 7 }, { wch: 13 },
    { wch: 12 }, { wch: 12 }
  ];
  return ws;
}

// ── Sheet 3: Items ────────────────────────────────────────────────────────────

function buildItemSheet(versions: VersionRecord[], tasks: TaskRecord[]): XLSX.WorkSheet {
  const header = ["Project", "Item", "Status", "Start", "End", "Release Date", "Workload(h)", "Total Tasks", "Done"];
  const rows: unknown[][] = [header];

  for (const v of versions) {
    const vTasks = tasks.filter((t) => t.project === v.project && t.version === v.version);
    const done = vTasks.filter((t) => t.status === "done").length;
    rows.push([
      v.project,
      v.version,
      v.status ?? "",
      v.start ?? "",
      v.end ?? "",
      v.releaseDate ?? "",
      v.effort ?? "",
      vTasks.length,
      done
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 22 }, { wch: 14 }, { wch: 12 },
    { wch: 12 }, { wch: 12 }, { wch: 13 }, { wch: 12 }, { wch: 11 }, { wch: 7 }
  ];
  return ws;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveItemLabel(versionId: string | undefined, versions: VersionRecord[], project: string): string {
  if (!versionId) return "";
  const match = versions.find((v) => v.project === project && v.version === versionId);
  return match ? match.version : versionId;
}

// ── Electron save-dialog helper ────────────────────────────────────────────────

interface ElectronDialog {
  showSaveDialog(options: {
    title?: string;
    defaultPath?: string;
    filters?: Array<{ name: string; extensions: string[] }>;
  }): Promise<{ canceled: boolean; filePath?: string }>;
}

export async function showExcelSaveDialog(defaultName: string): Promise<string | null> {
  try {
    // electron is in esbuild externals – available at runtime in Obsidian
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const electron = (globalThis as any)["require"]?.("electron") as Record<string, unknown> | undefined;
    const dialog = (
      (electron?.["remote"] as Record<string, unknown> | undefined)?.["dialog"]
      ?? electron?.["dialog"]
    ) as ElectronDialog | undefined;

    if (!dialog) {
      return null;
    }

    const result = await dialog.showSaveDialog({
      title: "Export Project Plan",
      defaultPath: defaultName,
      filters: [{ name: "Excel Files", extensions: ["xlsx"] }]
    });

    return result.canceled ? null : (result.filePath ?? null);
  } catch {
    return null;
  }
}

/** Serialise workbook to a Uint8Array */
export function workbookToBuffer(wb: XLSX.WorkBook): Uint8Array {
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Uint8Array;
}
