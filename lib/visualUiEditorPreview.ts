import fs from "fs";
import path from "path";
import { mindMapPagesFromMasterPlan, readMasterPlanFile } from "./nebulaIdeWorkspaceArtifacts";
import { visualEditorPreviewAbs } from "./visualUiEditorWorkspace";

type PreviewNode = {
  id: string;
  role: string;
  type: string;
  text?: string;
  children?: string[];
  style: Record<string, string | number>;
};

type PreviewModel = {
  pages: Record<string, { rootId: string; nodes: Record<string, PreviewNode> }>;
};

const baseStyle = (): Record<string, string | number> => ({
  backgroundColor: "#0f172a",
  color: "#e2e8f0",
  paddingTop: 16,
  paddingRight: 16,
  paddingBottom: 16,
  paddingLeft: 16,
  marginTop: 0,
  marginRight: 0,
  marginBottom: 0,
  marginLeft: 0,
  width: "100%",
  height: "auto",
  borderRadius: 8,
  boxShadow: "0 1px 3px rgba(0,0,0,0.35)",
  opacity: 1,
});

function pageModel(label: string, slug: string): { rootId: string; nodes: Record<string, PreviewNode> } {
  const root = `root-${slug}`;
  const title = `title-${slug}`;
  const sub = `sub-${slug}`;
  return {
    rootId: root,
    nodes: {
      [root]: {
        id: root,
        role: "page-root",
        type: "container",
        children: [title, sub],
        style: { ...baseStyle(), backgroundColor: "#080A14", paddingTop: 24, paddingLeft: 24, paddingRight: 24 },
      },
      [title]: {
        id: title,
        role: "hero-title",
        type: "text",
        text: label,
        style: {
          ...baseStyle(),
          backgroundColor: "transparent",
          color: "#E8EAED",
          paddingTop: 0,
          paddingBottom: 8,
          borderRadius: 0,
          boxShadow: "none",
        },
      },
      [sub]: {
        id: sub,
        role: "hero-sub",
        type: "text",
        text: `v0-generated UI · ${label} — edit layout then Save Changes & Update Code`,
        style: {
          ...baseStyle(),
          backgroundColor: "transparent",
          color: "#6E7681",
          paddingTop: 0,
          borderRadius: 0,
          boxShadow: "none",
        },
      },
    },
  };
}

export function buildPreviewModelFromMasterPlan(
  plan: Record<string, string>,
  projectLabel: string
): PreviewModel {
  const specs = mindMapPagesFromMasterPlan(plan, projectLabel);
  const labels = specs.length
    ? specs.map((s) => s.label)
    : ["Home", "Dashboard", "Settings"];
  const pages: PreviewModel["pages"] = {};
  for (const label of labels) {
    const slug = label.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase().slice(0, 24) || "page";
    pages[label] = pageModel(label, slug);
  }
  return { pages };
}

export function writePreviewModel(workspaceRoot: string, model: PreviewModel): void {
  const abs = visualEditorPreviewAbs(workspaceRoot);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(model, null, 2), "utf8");
}

export function seedPreviewModelFromMasterPlan(
  workspaceRoot: string,
  masterPlanPath: string,
  projectLabel: string
): void {
  const plan = readMasterPlanFile(masterPlanPath);
  const model = buildPreviewModelFromMasterPlan(plan, projectLabel);
  writePreviewModel(workspaceRoot, model);
}
