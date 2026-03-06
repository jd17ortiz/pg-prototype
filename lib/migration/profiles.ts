import type { MappingProfile } from "./types";

/**
 * "Fermentation PLP (xlsm)" — Niebull NOMI Process Guideline Excel
 *
 * Structure discovered by inspection of F001_PLP_Fermentation.xlsm:
 *   Row 3: PLP-NR.(C)  REV.(I)  PRODUKTNAME(N)
 *   Row 4: values one row below their labels
 *   Row 6: Herstellform label(C), options scattered across same row
 *   Row 8: Spezies label(C), value in col N same row
 *   Row 11: DGCC-Nr. label(C), value in col N same row
 *   Row 13: Allergenstatus label(C), options scattered across same row
 *   Row 16: Kosherstatus label(C), value in col N same row
 *
 *   Ingredient tables (Impferzüchtung/Fermentation/Schutzkolloid):
 *     Header row: Nr.(C) | Menge … (F) | Einheit(K)
 *     Data rows: read until Nr. column empty
 *
 *   Konzentrierung KV params: labelCol=C(2), valueCol=O(14)
 *   Change history: AEnderungen sheet, "Datum:" in col D
 */
export const NOMI_PLP_PROFILE: MappingProfile = {
  id: "nomi-plp-xlsm",
  name: "Fermentation PLP (xlsm)",
  description: "Niebull NOMI Process Guideline — German/English bilingual xlsm",

  // Auto-detection: if workbook has ≥2 of these sheet names → match
  supportedSheetNames: [
    "Allgemeines", "General",
    "Impferzüchtung", "Inoculation",
    "Fermentation",
    "Konzentrierung", "Concentration",
    "Gefriertrocknung", "Freeze_drying",
    "AEnderungen", "Changes",
  ],

  // ─── Header fields ──────────────────────────────────────────────────────────
  headerRules: [
    {
      fieldId: "nh-plpnr",
      label: "PLP-NR",
      labels: ["plp-nr.", "plp-nr", "pg-no.", "pg-no"],
      readStrategy: { type: "below" },   // value one row below the label, same col
    },
    {
      fieldId: "nh-rev",
      label: "REV",
      labels: ["rev.", "rev"],
      readStrategy: { type: "below" },
    },
    {
      fieldId: "nh-produktname",
      label: "PRODUKTNAME",
      labels: ["produktname", "product name"],
      readStrategy: { type: "below" },
    },
    {
      fieldId: "nh-spezies",
      label: "Spezies",
      labels: ["spezies", "species"],
      readStrategy: { type: "fixed-col", col: 13 },  // col N = 13
    },
    {
      fieldId: "nh-dgcc",
      label: "DGCC-Nr",
      labels: ["dgcc-nr.", "dgcc-nr", "dgcc-no.", "dgcc-no"],
      readStrategy: { type: "fixed-col", col: 13 },
    },
    {
      fieldId: "nh-allergen",
      label: "Allergenstatus",
      labels: ["allergenstatus", "allergen status"],
      readStrategy: { type: "scan-row" },
    },
    {
      fieldId: "nh-kosher",
      label: "Kosherstatus",
      labels: ["kosherstatus", "kosher status"],
      readStrategy: { type: "fixed-col", col: 13 },
    },
    {
      fieldId: "nh-herstellform",
      label: "Herstellform",
      labels: ["herstellform", "format"],
      readStrategy: { type: "scan-row" },
    },
  ],

  // ─── Ingredient tables ──────────────────────────────────────────────────────
  tableRules: [
    {
      id: "impf-ingredients",
      title: "Impferzüchtung – Medienrezeptur",
      sheetNames: ["Impferzüchtung", "Inoculation"],
      rowAnchorLabels: ["nr.", "no.", "menge", "quantity", "einheit", "unit"],
      columns: [
        { id: "nr",      label: "Nr.",      anchorLabels: ["nr.", "no."] },
        { id: "menge",   label: "Menge",    anchorLabels: ["menge", "quantity"] },
        { id: "einheit", label: "Einheit",  anchorLabels: ["einheit", "unit"] },
      ],
      maxEmpty: 3,
      stopLabels: ["bemerkungen", "remarks", "trockenmasse", "achtung"],
    },
    {
      id: "ferm-ingredients",
      title: "Fermentation – Medienrezeptur",
      sheetNames: ["Fermentation", "FermentationE"],
      rowAnchorLabels: ["nr.", "no.", "menge", "quantity", "einheit", "unit"],
      columns: [
        { id: "nr",      label: "Nr.",      anchorLabels: ["nr.", "no."] },
        { id: "menge",   label: "Menge",    anchorLabels: ["menge", "quantity"] },
        { id: "einheit", label: "Einheit",  anchorLabels: ["einheit", "unit"] },
      ],
      maxEmpty: 3,
      stopLabels: ["bemerkungen", "remarks", "trockenmasse", "achtung"],
    },
    {
      id: "schk-ingredients",
      title: "Schutzkolloid – Rezeptur",
      sheetNames: ["Schutzkolloid", "Cryoprotectant"],
      rowAnchorLabels: ["nr.", "no.", "menge", "quantity"],
      columns: [
        { id: "nr",      label: "Nr.",      anchorLabels: ["nr.", "no."] },
        { id: "menge",   label: "Menge",    anchorLabels: ["menge", "quantity"] },
        { id: "einheit", label: "Einheit",  anchorLabels: ["einheit", "unit"] },
      ],
      maxEmpty: 3,
      stopLabels: ["bemerkungen", "remarks", "trockenmasse", "achtung"],
    },
  ],

  // ─── Key-value parameter tables ─────────────────────────────────────────────
  kvTableRules: [
    {
      id: "konz-params",
      sheetNames: ["Konzentrierung", "Concentration"],
      labelCol: 2,   // col C
      valueCol: 14,  // col O
      startAfterLabel: "konzentrierungsfaktor",
      skipLabels: ["bemerkungen", "remarks", "*"],
      stopLabels: ["bemerkungen", "remarks"],
    },
  ],

  // ─── Change history ─────────────────────────────────────────────────────────
  changeHistoryRule: {
    sheetNames: ["AEnderungen", "Changes"],
    dateLabelCol: 3,   // col D
    dateLabel: "datum:",
    dateValueCol: 6,   // col G
    authorCol: 19,     // col T
    descOffset: 1,     // description is on the next row
    descCol: 3,        // col D
  },

  identifierField: "nh-plpnr",
  productNameField: "nh-produktname",
  revisionField: "nh-rev",
};

// ─── Profile registry ─────────────────────────────────────────────────────────
export const PROFILES: MappingProfile[] = [NOMI_PLP_PROFILE];

/** Auto-detect profile by checking how many supportedSheetNames are present */
export function detectProfile(sheetNames: string[]): MappingProfile | null {
  const lower = sheetNames.map(s => s.toLowerCase());
  let best: { profile: MappingProfile; score: number } | null = null;

  for (const profile of PROFILES) {
    const matches = profile.supportedSheetNames.filter(s =>
      lower.includes(s.toLowerCase())
    ).length;
    if (matches >= 2 && (!best || matches > best.score)) {
      best = { profile, score: matches };
    }
  }

  return best?.profile ?? null;
}
