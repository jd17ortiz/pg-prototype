import type {
  ContentJson,
  NormalizedPayload,
  NormalizedParameter,
  TemplateSchema,
} from "./types";

/** Extract all parameterTable rows into a flat NormalizedPayload */
export function normalizeContent(
  contentJson: ContentJson,
  schema: TemplateSchema
): NormalizedPayload {
  const parameters: NormalizedParameter[] = [];

  for (const sheet of schema.sheets) {
    const sheetContent = contentJson.sheets[sheet.id];
    if (!sheetContent) continue;

    for (const section of sheet.sections) {
      if (section.type !== "parameterTable") continue;
      const sectionContent = sheetContent.sections[section.id];
      if (!sectionContent || sectionContent.type !== "parameterTable") continue;

      for (const row of sectionContent.rows) {
        parameters.push({
          id: row.id,
          name: row.name,
          value: row.value,
          unit: row.unit,
          min: row.min,
          max: row.max,
          isLocked: row.isLocked,
          isCritical: row.isCritical,
          sheetId: sheet.id,
          sheetName: sheet.name,
          sectionId: section.id,
          sectionTitle: section.title,
        });
      }
    }
  }

  return { parameters };
}

/** Build an empty ContentJson matching a template schema */
export function emptyContent(schema: TemplateSchema): ContentJson {
  const headerValues: Record<string, string> = {};
  for (const f of schema.headerFields) {
    headerValues[f.id] = f.defaultValue ?? "";
  }

  const sheets: ContentJson["sheets"] = {};
  for (const sheet of schema.sheets) {
    const sections: Record<string, ContentJson["sheets"][string]["sections"][string]> = {};
    for (const sec of sheet.sections) {
      switch (sec.type) {
        case "richText":
          sections[sec.id] = { type: "richText", html: "" };
          break;
        case "fieldGrid":
          sections[sec.id] = {
            type: "fieldGrid",
            values: Object.fromEntries((sec.config.fields ?? []).map((f) => [f.id, f.defaultValue ?? ""])),
          };
          break;
        case "table":
          sections[sec.id] = { type: "table", rows: [] };
          break;
        case "parameterTable":
          sections[sec.id] = { type: "parameterTable", rows: [] };
          break;
        case "media":
          sections[sec.id] = { type: "media", files: [] };
          break;
        case "flowDiagram":
          sections[sec.id] = { type: "flowDiagram", description: "" };
          break;
        case "changeHistory":
          sections[sec.id] = { type: "changeHistory", entries: [] };
          break;
      }
    }
    sheets[sheet.id] = { sections };
  }

  return { headerValues, sheets };
}
