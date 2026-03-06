"use client";
import { useEffect, useState, Suspense } from "react";
import { useAuth } from "@/lib/client-auth";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/Toast";
import type { Guideline, GuidelineVersion, Template, TemplateVersion, TemplateSchema } from "@/lib/types";

interface ParsedRow {
  [key: string]: string;
}

const PARAM_FIELDS = ["name", "value", "unit", "min", "max", "isLocked", "isCritical"] as const;
type ParamField = typeof PARAM_FIELDS[number];

export default function ImportPageWrapper() {
  return (
    <Suspense fallback={<div className="text-center py-20 text-gray-400">Loading…</div>}>
      <ImportPage />
    </Suspense>
  );
}

function ImportPage() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const presetGuidelineId = searchParams.get("guidelineId") ?? "";

  const [guidelines, setGuidelines] = useState<Guideline[]>([]);
  const [versions, setVersions] = useState<GuidelineVersion[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateVersions, setTemplateVersions] = useState<TemplateVersion[]>([]);

  const [selectedGuidelineId, setSelectedGuidelineId] = useState(presetGuidelineId);
  const [selectedSheetId, setSelectedSheetId] = useState("");
  const [selectedSectionId, setSelectedSectionId] = useState("");

  const [csvText, setCsvText] = useState("");
  const [delimiter, setDelimiter] = useState<"," | "\t">("," );
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [mapping, setMapping] = useState<Record<string, ParamField | "">>({});
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!user) { router.push("/login"); return; }
    if (!["RD_ENGINEER", "MT_ENGINEER"].includes(user.role)) { router.push("/"); return; }
    loadData();
  }, [user]);

  async function loadData() {
    const [gRes, tRes] = await Promise.all([
      fetch("/api/guidelines"),
      fetch("/api/templates"),
    ]);
    const gData = await gRes.json();
    const tData = await tRes.json();
    const gList: Guideline[] = gData.guidelines ?? [];
    const vList: GuidelineVersion[] = gData.versions ?? [];
    setGuidelines(gList.filter(g => vList.some(v => v.guidelineId === g.id && v.status === "DRAFT")));
    setVersions(vList);
    setTemplates(tData.templates ?? []);
    setTemplateVersions(tData.versions ?? []);
  }

  const selectedGuideline = guidelines.find(g => g.id === selectedGuidelineId);
  const draftVersion = versions.find(v => v.guidelineId === selectedGuidelineId && v.status === "DRAFT");
  const tv = templateVersions.find(v => selectedGuideline && v.id === selectedGuideline.templateVersionId);
  const schema: TemplateSchema | null = tv?.schemaJson ?? null;

  const parameterSections = schema?.sheets.flatMap(sh =>
    sh.sections
      .filter(s => s.type === "parameterTable")
      .map(s => ({ sheetId: sh.id, sheetName: sh.name, sectionId: s.id, sectionTitle: s.title }))
  ) ?? [];

  function parseCsv(text: string, sep: string): { headers: string[]; rows: ParsedRow[] } {
    const lines = text.trim().split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return { headers: [], rows: [] };
    const h = lines[0].split(sep).map(s => s.trim().replace(/^"|"$/g, ""));
    const r = lines.slice(1).map(line => {
      const cells = line.split(sep).map(s => s.trim().replace(/^"|"$/g, ""));
      return Object.fromEntries(h.map((col, i) => [col, cells[i] ?? ""]));
    });
    return { headers: h, rows: r };
  }

  function handleParse() {
    const sep = delimiter === "\t" ? "\t" : ",";
    const { headers: h, rows: r } = parseCsv(csvText, sep);
    setHeaders(h);
    setRows(r);
    // Auto-map headers to param fields by name similarity
    const autoMap: Record<string, ParamField | ""> = {};
    for (const col of h) {
      const lower = col.toLowerCase();
      if (lower.includes("name")) autoMap[col] = "name";
      else if (lower.includes("value") || lower.includes("val")) autoMap[col] = "value";
      else if (lower.includes("unit")) autoMap[col] = "unit";
      else if (lower.includes("min")) autoMap[col] = "min";
      else if (lower.includes("max")) autoMap[col] = "max";
      else if (lower.includes("lock")) autoMap[col] = "isLocked";
      else if (lower.includes("crit")) autoMap[col] = "isCritical";
      else autoMap[col] = "";
    }
    setMapping(autoMap);
  }

  function buildParamRows() {
    return rows.map(row => {
      const param: Record<string, string | boolean> = {
        name: "", value: "", unit: "", min: "", max: "", isLocked: false, isCritical: false
      };
      for (const [col, field] of Object.entries(mapping)) {
        if (!field) continue;
        const val = row[col] ?? "";
        if (field === "isLocked" || field === "isCritical") {
          param[field] = ["true","1","yes","x"].includes(val.toLowerCase());
        } else {
          param[field] = val;
        }
      }
      return param;
    }).filter(r => r.name);
  }

  async function handleImport() {
    if (!draftVersion || !selectedSheetId || !selectedSectionId) {
      toast("Select a guideline, sheet, and section.", "warning"); return;
    }
    const paramRows = buildParamRows();
    if (paramRows.length === 0) {
      toast("No valid rows to import (need at least a 'name' mapping).", "warning"); return;
    }
    setImporting(true);
    const res = await fetch(`/api/guidelines/${selectedGuidelineId}/import-params`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sheetId: selectedSheetId,
        sectionId: selectedSectionId,
        rows: paramRows,
        versionStamp: draftVersion.versionStamp,
      }),
    });
    if (res.ok) {
      const d = await res.json();
      toast(`Imported ${d.imported} parameter(s) successfully.`, "success");
      router.push(`/guidelines/${selectedGuidelineId}`);
    } else {
      const d = await res.json();
      toast(d.error ?? "Import failed.", "error");
    }
    setImporting(false);
  }

  const previewRows = buildParamRows();

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">CSV/TSV Parameter Import</h1>

      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Target selection */}
        <div className="bg-white border rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-gray-700">1. Select Target</h2>
          <div>
            <label className="block text-sm font-medium mb-1">Guideline (Draft only)</label>
            <select className="w-full border rounded px-3 py-2 text-sm" value={selectedGuidelineId} onChange={e => { setSelectedGuidelineId(e.target.value); setSelectedSheetId(""); setSelectedSectionId(""); }}>
              <option value="">Select guideline…</option>
              {guidelines.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          {parameterSections.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-1">Parameter Table Section</label>
              <select className="w-full border rounded px-3 py-2 text-sm" value={`${selectedSheetId}::${selectedSectionId}`}
                onChange={e => {
                  const [sh, sec] = e.target.value.split("::");
                  setSelectedSheetId(sh ?? "");
                  setSelectedSectionId(sec ?? "");
                }}>
                <option value="::">Select section…</option>
                {parameterSections.map(s => (
                  <option key={`${s.sheetId}::${s.sectionId}`} value={`${s.sheetId}::${s.sectionId}`}>
                    {s.sheetName} / {s.sectionTitle}
                  </option>
                ))}
              </select>
            </div>
          )}
          {selectedGuidelineId && parameterSections.length === 0 && (
            <p className="text-xs text-gray-400">This guideline has no parameterTable sections.</p>
          )}
        </div>

        {/* CSV input */}
        <div className="bg-white border rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-gray-700">2. Paste CSV / TSV</h2>
          <div className="flex gap-2">
            <label className="text-sm flex items-center gap-1.5 cursor-pointer">
              <input type="radio" name="delim" checked={delimiter === ","} onChange={() => setDelimiter(",")} /> CSV (comma)
            </label>
            <label className="text-sm flex items-center gap-1.5 cursor-pointer">
              <input type="radio" name="delim" checked={delimiter === "\t"} onChange={() => setDelimiter("\t")} /> TSV (tab)
            </label>
          </div>
          <textarea
            className="w-full border rounded px-3 py-2 text-xs font-mono min-h-[120px]"
            value={csvText}
            onChange={e => setCsvText(e.target.value)}
            placeholder={"name,value,unit,min,max,isLocked,isCritical\npH,7.0,pH,6.5,7.5,false,true"}
          />
          <button onClick={handleParse} disabled={!csvText.trim()} className="px-4 py-2 text-sm bg-gray-700 text-white rounded hover:bg-gray-800 disabled:opacity-40">
            Parse
          </button>
        </div>
      </div>

      {/* Column mapping */}
      {headers.length > 0 && (
        <div className="bg-white border rounded-xl p-5 mb-6">
          <h2 className="font-semibold text-gray-700 mb-4">3. Map Columns</h2>
          <div className="grid grid-cols-3 gap-3">
            {headers.map(h => (
              <div key={h} className="flex items-center gap-2">
                <span className="text-sm text-gray-700 font-mono w-28 truncate">{h}</span>
                <span className="text-gray-400">→</span>
                <select
                  className="flex-1 border rounded px-2 py-1 text-sm"
                  value={mapping[h] ?? ""}
                  onChange={e => setMapping(prev => ({ ...prev, [h]: e.target.value as ParamField | "" }))}
                >
                  <option value="">(ignore)</option>
                  {PARAM_FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Preview */}
      {previewRows.length > 0 && (
        <div className="bg-white border rounded-xl p-5 mb-6">
          <h2 className="font-semibold text-gray-700 mb-3">4. Preview ({previewRows.length} rows)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  {["name","value","unit","min","max","isLocked","isCritical"].map(h => (
                    <th key={h} className="border px-2 py-1.5 text-left font-medium text-gray-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.slice(0, 10).map((row, i) => (
                  <tr key={i}>
                    {["name","value","unit","min","max","isLocked","isCritical"].map(f => (
                      <td key={f} className="border px-2 py-1">{String(row[f] ?? "")}</td>
                    ))}
                  </tr>
                ))}
                {previewRows.length > 10 && (
                  <tr><td colSpan={7} className="border px-2 py-1 text-gray-400 italic">…and {previewRows.length - 10} more rows</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Import button */}
      {previewRows.length > 0 && (
        <div className="flex justify-end gap-3">
          <button onClick={() => router.back()} className="px-4 py-2 text-sm border rounded hover:bg-gray-50">Cancel</button>
          <button
            onClick={handleImport}
            disabled={importing || !selectedSheetId || !selectedSectionId}
            className="px-6 py-2 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
          >
            {importing ? "Importing…" : `Import ${previewRows.length} row(s)`}
          </button>
        </div>
      )}
    </div>
  );
}
