import { randomUUID } from "crypto";
import {
  readTemplates, writeTemplates, appendAudit, nowStamp, versionStamp,
} from "./db";
import type { TemplateSchema } from "./types";

// ─── EU Fermentation PLP (NOMI) schema ────────────────────────────────────────
//
// Sheet + section IDs are kept stable so ensureTemplate() is fully idempotent.
// Column IDs align with the NOMI_PLP_PROFILE extraction column IDs (nr, rohstoff,
// menge, einheit) so buildContentJson can map rows directly without column remapping.

const EU_PLP_NOMI_SCHEMA: TemplateSchema = {
  headerFields: [
    { id: "nh-plpnr",        label: "PLP-NR",         type: "text",  required: true },
    { id: "nh-rev",          label: "REV",             type: "text",  required: false },
    { id: "nh-produktname",  label: "PRODUKTNAME",     type: "text",  required: true },
    { id: "nh-herstellform", label: "Herstellform",    type: "text",  required: false },
    { id: "nh-spezies",      label: "Spezies",         type: "text",  required: false },
    { id: "nh-dgcc",         label: "DGCC-Nr",         type: "text",  required: false },
    { id: "nh-allergen",     label: "Allergenstatus",  type: "text",  required: false },
    { id: "nh-kosher",       label: "Kosherstatus",    type: "text",  required: false },
  ],
  sheets: [
    {
      id: "sheet-allg",
      name: "Allgemeines",
      sections: [
        {
          id: "sec-allg-fields",
          type: "fieldGrid",
          title: "Kopfdaten",
          config: {
            fields: [
              { id: "nh-plpnr",        label: "PLP-NR",         type: "text",  required: true },
              { id: "nh-produktname",  label: "Produktname",    type: "text",  required: true },
              { id: "nh-herstellform", label: "Herstellform",   type: "text",  required: false },
              { id: "nh-spezies",      label: "Spezies",        type: "text",  required: false },
              { id: "nh-dgcc",         label: "DGCC-Nr",        type: "text",  required: false },
              { id: "nh-allergen",     label: "Allergenstatus", type: "text",  required: false },
              { id: "nh-kosher",       label: "Kosherstatus",   type: "text",  required: false },
            ],
          },
        },
        {
          id: "sec-allg-changes",
          type: "changeHistory",
          title: "Änderungshistorie",
          config: {},
        },
      ],
    },
    {
      id: "sheet-impf",
      name: "Impferzüchtung",
      sections: [
        {
          id: "sec-impf-table",
          type: "table",
          title: "Medienrezeptur",
          config: {
            columns: [
              { id: "nr",       label: "Nr.",      type: "text" },
              { id: "rohstoff", label: "Rohstoff", type: "text" },
              { id: "menge",    label: "Menge",    type: "text" },
              { id: "einheit",  label: "Einheit",  type: "text" },
            ],
          },
        },
        {
          id: "sec-impf-params",
          type: "parameterTable",
          title: "Prozessparameter",
          config: {},
        },
        {
          id: "sec-impf-notes",
          type: "richText",
          title: "Notizen",
          config: {},
        },
      ],
    },
    {
      id: "sheet-ferm",
      name: "Fermentation",
      sections: [
        {
          id: "sec-ferm-table",
          type: "table",
          title: "Medienrezeptur",
          config: {
            columns: [
              { id: "nr",       label: "Nr.",      type: "text" },
              { id: "rohstoff", label: "Rohstoff", type: "text" },
              { id: "menge",    label: "Menge",    type: "text" },
              { id: "einheit",  label: "Einheit",  type: "text" },
            ],
          },
        },
        {
          id: "sec-ferm-params",
          type: "parameterTable",
          title: "Prozessparameter",
          config: {},
        },
        {
          id: "sec-ferm-notes",
          type: "richText",
          title: "Notizen",
          config: {},
        },
      ],
    },
    {
      id: "sheet-schk",
      name: "Schutzkolloid",
      sections: [
        {
          id: "sec-schk-table",
          type: "table",
          title: "Rezeptur",
          config: {
            columns: [
              { id: "nr",       label: "Nr.",      type: "text" },
              { id: "rohstoff", label: "Rohstoff", type: "text" },
              { id: "menge",    label: "Menge",    type: "text" },
              { id: "einheit",  label: "Einheit",  type: "text" },
            ],
          },
        },
      ],
    },
    {
      id: "sheet-konz",
      name: "Konzentrierung",
      sections: [
        {
          id: "sec-konz-params",
          type: "parameterTable",
          title: "Prozessparameter",
          config: {},
        },
        {
          id: "sec-konz-notes",
          type: "richText",
          title: "Notizen",
          config: {},
        },
      ],
    },
    {
      id: "sheet-quel",
      name: "Quelldokument",
      sections: [
        {
          id: "sec-quel-notes",
          type: "richText",
          title: "Importnotizen",
          config: {},
        },
        {
          id: "sec-quel-media",
          type: "media",
          title: "Quelldatei",
          config: {},
        },
      ],
    },
  ],
};

// ─── Preset registry ──────────────────────────────────────────────────────────

interface TemplatePreset {
  family: string;
  templateId: string;   // stable fixed ID for idempotency
  versionId: string;    // stable fixed ID for first ACTIVE version
  name: string;
  description: string;
  schema: TemplateSchema;
}

const PRESETS: TemplatePreset[] = [
  {
    family: "EU_PLP_NOMI",
    templateId: "tmpl-eu-plp-nomi",
    versionId:  "tmplv-eu-plp-nomi-1",
    name: "EU Fermentation PLP (NOMI)",
    description: "Niebull NOMI Processleitplan — auto-created by Migration Studio. Sheets: Allgemeines, Impferzüchtung, Fermentation, Schutzkolloid, Konzentrierung, Quelldokument.",
    schema: EU_PLP_NOMI_SCHEMA,
  },
];

// ─── ensureTemplate ───────────────────────────────────────────────────────────

export interface EnsuredTemplate {
  templateVersionId: string;
  templateId: string;
  templateName: string;
  versionNumber: number;
  createdNow: boolean;
}

/**
 * Idempotent: guarantees an ACTIVE TemplateVersion exists for the given family.
 * - If ACTIVE version already exists → return it unchanged (no write).
 * - If template exists but no ACTIVE version → create a new ACTIVE version.
 * - If template does not exist → create Template + ACTIVE v1 from preset.
 *
 * Returns null if no preset is registered for the family.
 */
export function ensureTemplate(family: string): EnsuredTemplate | null {
  const preset = PRESETS.find(p => p.family === family);
  if (!preset) return null;

  const store = readTemplates();

  // Find existing template by family field OR by fixed ID
  const existingTpl = store.templates.find(
    t => t.family === family || t.id === preset.templateId
  );

  if (existingTpl) {
    const activeV = store.versions.find(
      v => v.templateId === existingTpl.id && v.status === "ACTIVE"
    );
    if (activeV) {
      return {
        templateVersionId: activeV.id,
        templateId: existingTpl.id,
        templateName: existingTpl.name,
        versionNumber: activeV.versionNumber,
        createdNow: false,
      };
    }
  }

  // ── Need to create ────────────────────────────────────────────────────────
  const now = nowStamp();
  const templateId = existingTpl?.id ?? preset.templateId;

  if (!existingTpl) {
    store.templates.push({
      id: templateId,
      name: preset.name,
      description: preset.description,
      family: preset.family,
      createdAt: now,
      updatedAt: now,
    });
  }

  // Use the stable fixed versionId for the first ACTIVE version; generate a
  // new UUID if that ID is already taken (e.g. was ARCHIVED and re-created).
  const idTaken = store.versions.some(v => v.id === preset.versionId);
  const versionId = idTaken ? randomUUID() : preset.versionId;
  const existingVersions = store.versions.filter(v => v.templateId === templateId);
  const versionNumber = existingVersions.length > 0
    ? Math.max(...existingVersions.map(v => v.versionNumber)) + 1
    : 1;

  store.versions.push({
    id: versionId,
    templateId,
    versionNumber,
    status: "ACTIVE",
    schemaJson: preset.schema,
    createdAt: now,
    updatedAt: now,
    versionStamp: versionStamp(),
    publishedBy: "system",
  });

  writeTemplates(store);

  appendAudit({
    id: randomUUID(),
    entityType: "TemplateVersion",
    entityId: versionId,
    action: "PUBLISHED",
    userId:   "system",
    userName: "Migration Studio (ensureTemplate)",
    data: { family, templateId, versionNumber, source: "preset" },
    createdAt: now,
  });

  return {
    templateVersionId: versionId,
    templateId,
    templateName: preset.name,
    versionNumber,
    createdNow: true,
  };
}
