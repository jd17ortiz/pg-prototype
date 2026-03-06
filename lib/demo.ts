import { readGuidelines } from "@/lib/db";

export interface DiffDemoInfo {
  guidelineId: string;
  guidelineName: string;
  activeVersionId: string;
  activeVersionNumber: number;
  draftVersionId: string;
  draftVersionNumber: number;
  draftStatus: string;
}

export function getDiffDemo(): DiffDemoInfo {
  const store = readGuidelines();

  const guideline = store.guidelines.find(g => g.identifier === "DEMO-DIFF");
  if (!guideline) {
    throw new Error("DEMO-DIFF guideline not found — run npm run seed");
  }

  const versions = store.versions.filter(v => v.guidelineId === guideline.id);
  const active = versions.find(v => v.status === "ACTIVE");
  const draft = versions.find(v => v.status === "DRAFT" || v.status === "REVIEW");

  if (!active) throw new Error("DEMO-DIFF has no ACTIVE version — run npm run seed");
  if (!draft)  throw new Error("DEMO-DIFF has no DRAFT/REVIEW version — run npm run seed");

  return {
    guidelineId: guideline.id,
    guidelineName: guideline.name,
    activeVersionId: active.id,
    activeVersionNumber: active.versionNumber,
    draftVersionId: draft.id,
    draftVersionNumber: draft.versionNumber,
    draftStatus: draft.status,
  };
}
