/**
 * Import Niebull PLPs from PDF files in /imports/
 *
 * Usage:
 *   npm run import:niebull
 *
 * Place PDFs in the /imports/ folder before running.
 * Expected filenames:
 *   7034 Rev.5 Na-Formiat 50% NOMI.pdf
 *   7194 Rev.26 Lb. acidophilus LA-11 NOMI.pdf
 *   7203 Rev.2 Kefir.pdf
 *   7253 Rev.3 Holdbac Listeria NOMI.pdf
 *
 * Idempotent: re-running skips guidelines that already exist (matched by
 * identifier + siteId). Use --force to overwrite existing data.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { randomUUID } from "crypto";

const require = createRequire(import.meta.url);
let PDFParse;
try {
  ({ PDFParse } = require("pdf-parse"));
} catch {
  console.error("ERROR: pdf-parse not installed. Run: npm install pdf-parse");
  process.exit(1);
}

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR    = path.join(__dirname, "..");
const DATA_DIR    = path.join(ROOT_DIR, "data");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
const IMPORTS_DIR = path.join(ROOT_DIR, "imports");

const FORCE = process.argv.includes("--force");

// ─── Atomic write (same-dir temp to avoid cross-device rename on Windows) ─────
function write(name, data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const dest = path.join(DATA_DIR, `${name}.json`);
  const tmp  = path.join(DATA_DIR, `.tmp-${name}-${Date.now()}.json`);
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmp, dest);
}

function readJSON(name, defaultVal) {
  const p = path.join(DATA_DIR, `${name}.json`);
  if (!fs.existsSync(p)) return defaultVal;
  try { return JSON.parse(fs.readFileSync(p, "utf-8")); }
  catch { return defaultVal; }
}

const now = () => new Date().toISOString();
const vs  = () => Date.now().toString();

// ─── Site + Users ─────────────────────────────────────────────────────────────
const NIEBULL_SITE = {
  id:   "site-niebull",
  name: "Niebull",
  code: "NIE-DE",
};

const NIEBULL_USERS = [
  {
    id:     "u-nie-mte1",
    name:   "Lars Petersen",
    email:  "lars@niebull.plant",
    role:   "MT_ENGINEER",
    siteId: "site-niebull",
  },
  {
    id:     "u-nie-apr1",
    name:   "Dr. Eva Schmidt",
    email:  "eva@niebull.plant",
    role:   "APPROVER",
    siteId: "site-niebull",
  },
];

// ─── NOMI Template schema ─────────────────────────────────────────────────────
const NOMI_TMPL_ID  = "tmpl-nomi-plp";
const NOMI_TMPLV_ID = "tmplv-nomi-plp-1";

const NOMI_SCHEMA = {
  headerFields: [
    { id: "nh-plpnr",        label: "PLP-NR",        type: "text",   required: true,  defaultValue: "" },
    { id: "nh-rev",          label: "REV",            type: "text",   required: true,  defaultValue: "" },
    { id: "nh-produktname",  label: "PRODUKTNAME",    type: "text",   required: true,  defaultValue: "" },
    { id: "nh-erstellt",     label: "Erstellt am",    type: "date",   required: false, defaultValue: "" },
    { id: "nh-herstellform", label: "Herstellform",   type: "select", required: false, defaultValue: "",
      options: ["Lyophilisat", "Flüssig", "Granulat", "Pulver", "Suspension"] },
    { id: "nh-spezies",      label: "Spezies",        type: "text",   required: false, defaultValue: "" },
    { id: "nh-dgcc",         label: "DGCC-Nr",        type: "text",   required: false, defaultValue: "" },
    { id: "nh-allergen",     label: "Allergenstatus", type: "select", required: false, defaultValue: "",
      options: ["Allergenfrei", "Enthält Allergen", "Unbekannt"] },
    { id: "nh-kosher",       label: "Kosherstatus",   type: "select", required: false, defaultValue: "",
      options: ["Kosher", "Nicht Kosher", "Unbekannt"] },
  ],
  sheets: [
    {
      id: "ns-uebersicht", name: "Übersicht",
      sections: [
        { id: "ns-ueb-rte",   type: "richText",      title: "Übersicht",              config: { placeholder: "Allgemeine Beschreibung des Prozesses…" } },
        { id: "ns-ueb-media", type: "media",          title: "Anhänge / Dokumente",    config: {} },
      ],
    },
    {
      id: "ns-impf", name: "Impferzüchtung",
      sections: [
        { id: "ns-impf-rte", type: "richText",       title: "Prozessbeschreibung",     config: {} },
        { id: "ns-impf-pt",  type: "parameterTable", title: "Prozessparameter",        config: {} },
      ],
    },
    {
      id: "ns-ferm", name: "Fermentation",
      sections: [
        { id: "ns-ferm-rte", type: "richText",       title: "Prozessbeschreibung",     config: {} },
        { id: "ns-ferm-pt",  type: "parameterTable", title: "Prozessparameter",        config: {} },
      ],
    },
    {
      id: "ns-konz", name: "Konzentrierung",
      sections: [
        { id: "ns-konz-rte", type: "richText",       title: "Prozessbeschreibung",     config: {} },
        { id: "ns-konz-pt",  type: "parameterTable", title: "Prozessparameter",        config: {} },
      ],
    },
    {
      id: "ns-schk", name: "Schutzkolloid",
      sections: [
        { id: "ns-schk-rte", type: "richText",       title: "Prozessbeschreibung",     config: {} },
        { id: "ns-schk-pt",  type: "parameterTable", title: "Prozessparameter",        config: {} },
      ],
    },
    {
      id: "ns-pell", name: "Pelletierung",
      sections: [
        { id: "ns-pell-rte", type: "richText",       title: "Prozessbeschreibung",     config: {} },
        { id: "ns-pell-pt",  type: "parameterTable", title: "Prozessparameter",        config: {} },
      ],
    },
    {
      id: "ns-gefrtr", name: "Gefriertrocknung",
      sections: [
        { id: "ns-gefrtr-rte", type: "richText",     title: "Prozessbeschreibung",     config: {} },
        { id: "ns-gefrtr-pt",  type: "parameterTable", title: "Prozessparameter",      config: {} },
      ],
    },
    {
      id: "ns-aendh", name: "Änderungshistorie",
      sections: [
        { id: "ns-aendh-ch", type: "changeHistory",  title: "Änderungshistorie",       config: {} },
      ],
    },
  ],
};

// ─── Filename parser ──────────────────────────────────────────────────────────
// Supports: "7034 Rev.5 Na-Formiat 50% NOMI.pdf"  → { plpNr: "7034", rev: "5", produktname: "Na-Formiat 50%" }
//           "7203 Rev.2 Kefir.pdf"                 → { plpNr: "7203", rev: "2", produktname: "Kefir" }
function parsePdfFilename(filename) {
  const base = path.basename(filename, path.extname(filename));
  // Pattern: <number> Rev.<number> <name> [NOMI]
  const m = base.match(/^(\d+)\s+Rev\.(\d+)\s+(.+?)(?:\s+NOMI)?$/i);
  if (!m) return null;
  return {
    plpNr:       m[1].trim(),
    rev:         m[2].trim(),
    produktname: m[3].trim(),
  };
}

// ─── Build empty contentJson for NOMI schema ──────────────────────────────────
function buildNomiContent(meta, pdfText, mediaFile) {
  // Sanitize PDF text into safe HTML paragraphs
  const htmlParagraphs = (pdfText || "")
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean)
    .slice(0, 80) // cap at 80 paragraphs to avoid huge blobs
    .map(p => `<p>${p.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`)
    .join("\n");

  const mediaFiles = mediaFile ? [mediaFile] : [];

  return {
    headerValues: {
      "nh-plpnr":        meta.plpNr,
      "nh-rev":          meta.rev,
      "nh-produktname":  meta.produktname,
      "nh-erstellt":     "",
      "nh-herstellform": "Lyophilisat",
      "nh-spezies":      "",
      "nh-dgcc":         "",
      "nh-allergen":     "Unbekannt",
      "nh-kosher":       "Unbekannt",
    },
    sheets: {
      "ns-uebersicht": {
        sections: {
          "ns-ueb-rte":   { type: "richText", html: htmlParagraphs || "<p>(Kein Inhalt extrahiert)</p>" },
          "ns-ueb-media": { type: "media", files: mediaFiles },
        },
      },
      "ns-impf": {
        sections: {
          "ns-impf-rte": { type: "richText", html: "<p></p>" },
          "ns-impf-pt":  { type: "parameterTable", rows: [] },
        },
      },
      "ns-ferm": {
        sections: {
          "ns-ferm-rte": { type: "richText", html: "<p></p>" },
          "ns-ferm-pt":  { type: "parameterTable", rows: [] },
        },
      },
      "ns-konz": {
        sections: {
          "ns-konz-rte": { type: "richText", html: "<p></p>" },
          "ns-konz-pt":  { type: "parameterTable", rows: [] },
        },
      },
      "ns-schk": {
        sections: {
          "ns-schk-rte": { type: "richText", html: "<p></p>" },
          "ns-schk-pt":  { type: "parameterTable", rows: [] },
        },
      },
      "ns-pell": {
        sections: {
          "ns-pell-rte": { type: "richText", html: "<p></p>" },
          "ns-pell-pt":  { type: "parameterTable", rows: [] },
        },
      },
      "ns-gefrtr": {
        sections: {
          "ns-gefrtr-rte": { type: "richText", html: "<p></p>" },
          "ns-gefrtr-pt":  { type: "parameterTable", rows: [] },
        },
      },
      "ns-aendh": {
        sections: {
          "ns-aendh-ch": {
            type: "changeHistory",
            entries: [
              {
                id:          randomUUID(),
                date:        new Date().toISOString().slice(0, 10),
                author:      "Lars Petersen",
                description: `Importiert aus PDF: PLP ${meta.plpNr} Rev.${meta.rev}`,
                version:     meta.rev,
              },
            ],
          },
        },
      },
    },
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("── Niebull PLP Importer ──────────────────────────────────────");

  // 0. Ensure directories
  fs.mkdirSync(IMPORTS_DIR,  { recursive: true });
  fs.mkdirSync(UPLOADS_DIR,  { recursive: true });

  // 1. Discover PDFs in /imports/
  const pdfFiles = fs.readdirSync(IMPORTS_DIR)
    .filter(f => f.toLowerCase().endsWith(".pdf"))
    .sort();

  if (pdfFiles.length === 0) {
    console.log(`\nNo PDFs found in ${IMPORTS_DIR}`);
    console.log("Place your PDF files there and re-run: npm run import:niebull\n");
    console.log("Expected files:");
    console.log("  7034 Rev.5 Na-Formiat 50% NOMI.pdf");
    console.log("  7194 Rev.26 Lb. acidophilus LA-11 NOMI.pdf");
    console.log("  7203 Rev.2 Kefir.pdf");
    console.log("  7253 Rev.3 Holdbac Listeria NOMI.pdf");
    process.exit(0);
  }

  console.log(`\nFound ${pdfFiles.length} PDF(s):`);
  pdfFiles.forEach(f => console.log(`  ${f}`));

  // 2. Add Niebull site
  const sitesStore = readJSON("sites", { sites: [] });
  if (!sitesStore.sites.find(s => s.id === NIEBULL_SITE.id)) {
    sitesStore.sites.push(NIEBULL_SITE);
    write("sites", sitesStore);
    console.log(`\n✓ Added site: ${NIEBULL_SITE.name} (${NIEBULL_SITE.id})`);
  } else {
    console.log(`\n· Site already exists: ${NIEBULL_SITE.name}`);
  }

  // 3. Add Niebull users
  const usersStore = readJSON("users", { users: [] });
  let usersAdded = 0;
  for (const u of NIEBULL_USERS) {
    if (!usersStore.users.find(x => x.id === u.id)) {
      usersStore.users.push(u);
      usersAdded++;
    }
  }
  if (usersAdded > 0) {
    write("users", usersStore);
    console.log(`✓ Added ${usersAdded} Niebull user(s)`);
  } else {
    console.log("· Niebull users already exist");
  }

  // 4. Add NOMI template
  const tplStore = readJSON("templates", { templates: [], versions: [] });
  if (!tplStore.templates.find(t => t.id === NOMI_TMPL_ID)) {
    tplStore.templates.push({
      id:          NOMI_TMPL_ID,
      name:        "EU Processleitplan (NOMI)",
      description: "Niebull NOMI process documentation: 8 sheets, 9 header fields",
      createdAt:   now(),
      updatedAt:   now(),
    });
    tplStore.versions.push({
      id:            NOMI_TMPLV_ID,
      templateId:    NOMI_TMPL_ID,
      versionNumber: 1,
      status:        "ACTIVE",
      schemaJson:    NOMI_SCHEMA,
      createdAt:     now(),
      updatedAt:     now(),
      versionStamp:  vs(),
      publishedBy:   "u-nie-apr1",
    });
    write("templates", tplStore);
    console.log(`✓ Added template: EU Processleitplan (NOMI)`);
  } else {
    console.log("· NOMI template already exists");
  }

  // 5. Load guidelines store once
  const glStore = readJSON("guidelines", { guidelines: [], versions: [], approvals: [] });

  // 6. Process each PDF
  let created = 0, skipped = 0, errors = 0;

  for (const pdfFile of pdfFiles) {
    const srcPath = path.join(IMPORTS_DIR, pdfFile);
    console.log(`\n── Processing: ${pdfFile}`);

    // Parse filename
    const meta = parsePdfFilename(pdfFile);
    if (!meta) {
      console.warn(`  WARN: Cannot parse filename, skipping. Expected: "<number> Rev.<number> <name>.pdf"`);
      errors++;
      continue;
    }

    const identifier = `PLP-${meta.plpNr}`;
    console.log(`  PLP-NR: ${meta.plpNr}  REV: ${meta.rev}  PRODUKTNAME: ${meta.produktname}`);
    console.log(`  Identifier: ${identifier}`);

    // Idempotency check
    const existing = glStore.guidelines.find(
      g => g.identifier === identifier && g.siteId === "site-niebull"
    );
    if (existing && !FORCE) {
      console.log(`  · Already exists (id: ${existing.id}) — skipping. Use --force to overwrite.`);
      skipped++;
      continue;
    }

    // Parse PDF
    let pdfText = "";
    try {
      const buffer = fs.readFileSync(srcPath);
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      pdfText = result.text || "";
      console.log(`  ✓ PDF parsed: ${pdfText.length} chars`);
    } catch (err) {
      console.warn(`  WARN: PDF parse failed (${err.message}). Importing with empty content.`);
    }

    // Copy PDF to uploads
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    const fileId   = randomUUID();
    const ext      = path.extname(pdfFile);
    const destPath = path.join(UPLOADS_DIR, `${fileId}${ext}`);
    fs.copyFileSync(srcPath, destPath);
    const stat = fs.statSync(srcPath);
    console.log(`  ✓ Copied to uploads/${fileId}${ext}`);

    const mediaFile = {
      id:          randomUUID(),
      fileName:    pdfFile,
      fileType:    "application/pdf",
      size:        stat.size,
      uploadedAt:  now(),
      description: `PLP ${meta.plpNr} Rev.${meta.rev} — Originaldokument`,
      fileId:      fileId + ext,
    };

    // Build guideline
    const guidelineId  = existing ? existing.id : `gl-niebull-plp-${meta.plpNr}`;
    const versionId    = existing
      ? `glv-niebull-plp-${meta.plpNr}-v1-${Date.now()}`
      : `glv-niebull-plp-${meta.plpNr}-v1`;
    const contentJson  = buildNomiContent(meta, pdfText, mediaFile);

    // Normalize parameters (none for initial import, empty)
    const normalizedPayload = { parameters: [] };

    const guideline = {
      id:                guidelineId,
      name:              `PLP ${meta.plpNr} – ${meta.produktname}`,
      type:              "LOCAL",
      siteId:            "site-niebull",
      templateVersionId: NOMI_TMPLV_ID,
      createdAt:         existing ? existing.createdAt : now(),
      updatedAt:         now(),
      identifier,
    };

    const version = {
      id:                  versionId,
      guidelineId:         guidelineId,
      versionNumber:       1,
      status:              "ACTIVE",
      contentJson,
      normalizedPayload,
      reasonForChange:     `Importiert aus PDF Rev.${meta.rev}`,
      authorId:            "u-nie-mte1",
      createdAt:           now(),
      updatedAt:           now(),
      versionStamp:        vs(),
    };

    const approval = {
      id:                 randomUUID(),
      guidelineVersionId: versionId,
      approverId:         "u-nie-apr1",
      decision:           "APPROVE",
      comment:            `PDF-Import genehmigt. PLP ${meta.plpNr} Rev.${meta.rev}.`,
      createdAt:          now(),
    };

    if (existing && FORCE) {
      // Replace existing guideline + its versions
      const idx = glStore.guidelines.findIndex(g => g.id === existing.id);
      glStore.guidelines[idx] = guideline;
      // Remove old versions for this guideline
      glStore.versions = glStore.versions.filter(v => v.guidelineId !== existing.id);
      glStore.versions.push(version);
      // Remove old approvals for this guideline's versions
      const versionIds = new Set(glStore.versions.filter(v => v.guidelineId === existing.id).map(v => v.id));
      glStore.approvals = glStore.approvals.filter(a => !versionIds.has(a.guidelineVersionId));
      glStore.approvals.push(approval);
      console.log(`  ✓ Updated (--force): ${guideline.name}`);
    } else {
      glStore.guidelines.push(guideline);
      glStore.versions.push(version);
      glStore.approvals.push(approval);
      console.log(`  ✓ Created: ${guideline.name} (id: ${guidelineId})`);
    }

    created++;
  }

  // 7. Write guidelines store once at the end
  if (created > 0) {
    write("guidelines", glStore);
  }

  // 8. Summary
  console.log("\n── Summary ───────────────────────────────────────────────────");
  console.log(`  Processed: ${pdfFiles.length} PDF(s)`);
  console.log(`  Created:   ${created}`);
  console.log(`  Skipped:   ${skipped} (already existed)`);
  if (errors > 0) console.log(`  Errors:    ${errors}`);
  console.log("\n✓ Import complete. Visit /guidelines?siteId=site-niebull to view.\n");
}

main().catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});
