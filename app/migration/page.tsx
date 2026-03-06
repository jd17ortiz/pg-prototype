"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/client-auth";
import { useRouter } from "next/navigation";
import type { ImportPreview, ImportWarning, SourceRef } from "@/lib/migration/types";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Site { id: string; name: string }
interface TemplateVersion { id: string; versionNumber: number; status: string; templateName: string }
interface Profile { id: string; name: string; description: string }

type Step = "upload" | "preview" | "done";

interface DoneResult {
  guidelineId: string;
  versionId: string;
  versionNumber: number;
  guidelineName: string;
  isNew: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function SourceBadge({ ref: sref }: { ref: SourceRef }) {
  if (!sref) return null;
  const parts = [sref.sheet, sref.cell ?? sref.range, sref.label].filter(Boolean).join(" · ");
  return (
    <span className="text-xs font-mono bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded ml-2 shrink-0">
      {parts}
    </span>
  );
}

function WarnIcon({ severity }: { severity: ImportWarning["severity"] }) {
  if (severity === "error")   return <span className="text-red-600 font-bold shrink-0">✕</span>;
  if (severity === "warning") return <span className="text-yellow-600 shrink-0">⚠</span>;
  return <span className="text-blue-400 shrink-0">ℹ</span>;
}

function severityCls(s: ImportWarning["severity"]) {
  if (s === "error")   return "bg-red-50 border-red-200 text-red-700";
  if (s === "warning") return "bg-yellow-50 border-yellow-200 text-yellow-700";
  return "bg-blue-50 border-blue-200 text-blue-700";
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function MigrationPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [step, setStep]         = useState<Step>("upload");
  const [sites, setSites]       = useState<Site[]>([]);
  const [templates, setTemplates] = useState<TemplateVersion[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [siteId, setSiteId]     = useState("site-niebull");
  const [templateVersionId, setTemplateVersionId] = useState("");
  const [profileId, setProfileId] = useState("");
  const [file, setFile]         = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [runId, setRunId]       = useState("");
  const [preview, setPreview]   = useState<ImportPreview | null>(null);
  const [customName, setCustomName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [done, setDone]         = useState<DoneResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user === null) { router.push("/login"); return; }
    fetch("/api/sites").then(r => r.json()).then(d => setSites(d.sites ?? []));
    fetch("/api/templates").then(r => r.json()).then(d => {
      // Flatten template versions
      const tvs: TemplateVersion[] = [];
      for (const t of d.templates ?? []) {
        for (const v of d.versions ?? []) {
          if (v.templateId === t.id && v.status === "ACTIVE") {
            tvs.push({ id: v.id, versionNumber: v.versionNumber, status: v.status, templateName: t.name });
          }
        }
      }
      setTemplates(tvs);
      if (tvs.length > 0) setTemplateVersionId(tvs[0].id);
    });
    fetch("/api/migration/upload").then(r => r.json()).then(d => {
      setProfiles(d.profiles ?? []);
      if (d.profiles?.length > 0) setProfileId(d.profiles[0].id);
    });
  }, [user]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setUploadError("");
    const fd = new FormData();
    fd.append("file", file);
    if (profileId) fd.append("profileId", profileId);
    try {
      const res = await fetch("/api/migration/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { setUploadError(data.error ?? "Upload failed"); return; }
      setRunId(data.runId);
      setPreview(data.preview);
      if (data.preview.productName) {
        setCustomName(`PLP ${data.preview.identifier} – ${data.preview.productName}`);
      }
      setStep("preview");
    } catch (err) {
      setUploadError(String(err));
    } finally {
      setUploading(false);
    }
  }

  async function handleCreateDraft() {
    if (!preview || !runId) return;
    setCreating(true);
    setCreateError("");
    try {
      const res = await fetch("/api/migration/create-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, siteId, templateVersionId, customName }),
      });
      const data = await res.json();
      if (!res.ok) { setCreateError(data.error ?? "Failed to create draft"); return; }
      setDone(data);
      setStep("done");
    } catch (err) {
      setCreateError(String(err));
    } finally {
      setCreating(false);
    }
  }

  const hasErrors = (preview?.warnings ?? []).some(w => w.severity === "error");
  const errorCount   = (preview?.warnings ?? []).filter(w => w.severity === "error").length;
  const warningCount = (preview?.warnings ?? []).filter(w => w.severity === "warning").length;

  // ── Step: Upload ─────────────────────────────────────────────────────────────
  if (step === "upload") return (
    <div className="max-w-xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Migration Studio</h1>
        <p className="text-gray-500 text-sm mt-1">Upload an Excel (.xlsx / .xlsm) to create a Draft guideline via mapping profiles.</p>
      </div>

      <form onSubmit={handleUpload} className="bg-white border rounded-xl p-6 shadow-sm space-y-5">
        {/* File */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Excel file <span className="text-red-500">*</span></label>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xlsm"
            className="block w-full text-sm text-gray-600 border rounded-lg px-3 py-2 cursor-pointer file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
            onChange={e => setFile(e.target.files?.[0] ?? null)}
          />
          <p className="text-xs text-gray-400 mt-1">Macros are ignored; only cell values are read.</p>
        </div>

        {/* Site */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Target Site</label>
          <select className="w-full border rounded-lg px-3 py-2 text-sm" value={siteId} onChange={e => setSiteId(e.target.value)}>
            {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        {/* Template */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Template Version</label>
          <select className="w-full border rounded-lg px-3 py-2 text-sm" value={templateVersionId} onChange={e => setTemplateVersionId(e.target.value)}>
            {templates.map(tv => (
              <option key={tv.id} value={tv.id}>{tv.templateName} v{tv.versionNumber}</option>
            ))}
          </select>
        </div>

        {/* Profile */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Mapping Profile <span className="text-gray-400 font-normal">(auto-detected, can override)</span></label>
          <select className="w-full border rounded-lg px-3 py-2 text-sm" value={profileId} onChange={e => setProfileId(e.target.value)}>
            <option value="">Auto-detect</option>
            {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {profiles.find(p => p.id === profileId) && (
            <p className="text-xs text-gray-400 mt-1">{profiles.find(p => p.id === profileId)?.description}</p>
          )}
        </div>

        {uploadError && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{uploadError}</div>
        )}

        <button
          type="submit"
          disabled={!file || uploading}
          className="w-full py-2 px-4 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploading ? "Parsing…" : "Parse & Preview →"}
        </button>
      </form>

      <div className="mt-4 text-xs text-gray-400 text-center">
        Demo: place <code className="bg-gray-100 px-1 rounded">F001_PLP_Fermentation.xlsm</code> from the Niebull folder and upload it.
      </div>
    </div>
  );

  // ── Step: Preview ─────────────────────────────────────────────────────────────
  if (step === "preview" && preview) return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-5 flex items-center gap-4">
        <button onClick={() => setStep("upload")} className="text-sm text-gray-500 hover:text-gray-700">← Back</button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Import Preview</h1>
          <p className="text-sm text-gray-500">Profile: <strong>{preview.profileName}</strong> · Sheets: {preview.sheetNames.length}</p>
        </div>
      </div>

      {/* Validation summary */}
      <div className={`rounded-xl px-5 py-4 mb-5 border ${hasErrors ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"}`}>
        <div className="flex items-center gap-3 text-sm">
          {hasErrors
            ? <span className="text-red-700 font-medium">✕ {errorCount} error(s) — fix before creating draft</span>
            : <span className="text-green-700 font-medium">✓ Ready to create draft</span>
          }
          {warningCount > 0 && <span className="text-yellow-700">⚠ {warningCount} warning(s)</span>}
        </div>
        <div className="mt-2 flex gap-4 text-sm text-gray-600 flex-wrap">
          <span>Identifier: <strong className={preview.identifier ? "text-green-700" : "text-red-600"}>{preview.identifier ?? "missing"}</strong></span>
          <span>Product: <strong className={preview.productName ? "text-green-700" : "text-red-600"}>{preview.productName ?? "missing"}</strong></span>
          <span>Revision: <strong>{preview.revision ?? "—"}</strong></span>
        </div>
      </div>

      {/* Guideline name */}
      <div className="bg-white border rounded-xl p-4 mb-4 shadow-sm">
        <label className="block text-sm font-medium text-gray-700 mb-1">Guideline name</label>
        <input
          type="text"
          value={customName}
          onChange={e => setCustomName(e.target.value)}
          className="w-full border rounded-lg px-3 py-1.5 text-sm"
        />
      </div>

      {/* Extracted header fields */}
      <div className="bg-white border rounded-xl shadow-sm mb-4 overflow-hidden">
        <div className="bg-gray-50 border-b px-4 py-3 text-sm font-semibold text-gray-700">
          Header Fields ({preview.fields.length})
        </div>
        <div className="divide-y">
          {preview.fields.map(f => (
            <div key={f.fieldId} className="px-4 py-2 flex items-center justify-between text-sm">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-gray-500 w-28 shrink-0">{f.label}</span>
                <span className={`font-medium truncate ${f.value ? "text-gray-900" : "text-gray-300 italic"}`}>
                  {f.value || "(empty)"}
                </span>
              </div>
              <SourceBadge ref={f.sourceRef} />
            </div>
          ))}
          {preview.fields.length === 0 && (
            <div className="px-4 py-4 text-sm text-gray-400">No header fields extracted</div>
          )}
        </div>
      </div>

      {/* Extracted tables */}
      {preview.tables.length > 0 && (
        <div className="bg-white border rounded-xl shadow-sm mb-4 overflow-hidden">
          <div className="bg-gray-50 border-b px-4 py-3 text-sm font-semibold text-gray-700">
            Ingredient Tables ({preview.tables.length})
          </div>
          {preview.tables.map(t => (
            <div key={t.id} className="border-b last:border-b-0">
              <div className="px-4 py-2 flex items-center justify-between text-sm">
                <div>
                  <span className="font-medium text-gray-800">{t.title}</span>
                  <span className="ml-2 text-gray-400">— {t.rows.length} row(s) · {t.sheetName}</span>
                </div>
                <SourceBadge ref={t.headerRef} />
              </div>
              {t.rows.length > 0 && (
                <div className="overflow-x-auto px-4 pb-3">
                  <table className="text-xs border rounded w-full">
                    <thead className="bg-gray-50">
                      <tr>{t.columns.map(c => <th key={c.id} className="px-2 py-1 text-left font-medium text-gray-600 border-b">{c.label}</th>)}</tr>
                    </thead>
                    <tbody>
                      {t.rows.slice(0, 8).map(r => (
                        <tr key={r.rowIndex} className="border-b">
                          {t.columns.map(c => <td key={c.id} className="px-2 py-1 text-gray-700">{r.values[c.id] ?? ""}</td>)}
                        </tr>
                      ))}
                      {t.rows.length > 8 && (
                        <tr><td colSpan={t.columns.length} className="px-2 py-1 text-gray-400 italic">…and {t.rows.length - 8} more rows</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Extracted parameters */}
      {preview.parameterTables.length > 0 && (
        <div className="bg-white border rounded-xl shadow-sm mb-4 overflow-hidden">
          <div className="bg-gray-50 border-b px-4 py-3 text-sm font-semibold text-gray-700">
            Process Parameters ({preview.parameterTables.reduce((a, pt) => a + pt.parameters.length, 0)})
          </div>
          {preview.parameterTables.map(pt => (
            <div key={pt.id} className="border-b last:border-b-0">
              <div className="px-4 py-2 text-sm">
                <span className="font-medium text-gray-700">{pt.sheetName}</span>
                <span className="text-gray-400 ml-2">— {pt.parameters.length} parameter(s)</span>
              </div>
              <div className="overflow-x-auto px-4 pb-3">
                <table className="text-xs border rounded w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-2 py-1 text-left border-b">Parameter</th>
                      <th className="px-2 py-1 text-left border-b">Value</th>
                      <th className="px-2 py-1 text-left border-b">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pt.parameters.map(p => (
                      <tr key={p.id} className="border-b">
                        <td className="px-2 py-1 text-gray-800">{p.name}</td>
                        <td className="px-2 py-1 text-gray-700">{p.value}</td>
                        <td className="px-2 py-1 font-mono text-gray-400 text-xs">{p.sourceRef.cell ?? p.sourceRef.range}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Change history */}
      {preview.changeHistory.length > 0 && (
        <div className="bg-white border rounded-xl shadow-sm mb-4 overflow-hidden">
          <div className="bg-gray-50 border-b px-4 py-3 text-sm font-semibold text-gray-700">
            Change History ({preview.changeHistory.length})
          </div>
          <div className="divide-y">
            {preview.changeHistory.map(e => (
              <div key={e.num} className="px-4 py-2 text-sm flex items-start gap-3">
                <span className="text-gray-400 text-xs font-mono shrink-0 mt-0.5">{e.date || "—"}</span>
                <span className="text-gray-600 flex-1">{e.description}</span>
                <span className="text-gray-400 text-xs shrink-0">{e.author}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Warnings */}
      {preview.warnings.length > 0 && (
        <div className="bg-white border rounded-xl shadow-sm mb-4 overflow-hidden">
          <div className="bg-gray-50 border-b px-4 py-3 text-sm font-semibold text-gray-700">
            Validation Messages ({preview.warnings.length})
          </div>
          <div className="divide-y">
            {preview.warnings.map((w, i) => (
              <div key={i} className={`px-4 py-2 flex items-start gap-2 text-sm border-l-4 ${
                w.severity === "error" ? "border-red-400" : w.severity === "warning" ? "border-yellow-400" : "border-blue-300"
              }`}>
                <WarnIcon severity={w.severity} />
                <span className="flex-1">{w.message}</span>
                {w.sourceRef && <SourceBadge ref={w.sourceRef} />}
              </div>
            ))}
          </div>
        </div>
      )}

      {createError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 mb-4">{createError}</div>
      )}

      {/* Action */}
      <div className="flex gap-3 pb-8">
        <button onClick={() => setStep("upload")} className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">
          ← Back
        </button>
        <button
          onClick={handleCreateDraft}
          disabled={hasErrors || creating || !templateVersionId}
          className="flex-1 py-2 px-4 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {creating ? "Creating…" : "Create Draft Guideline →"}
        </button>
      </div>
    </div>
  );

  // ── Step: Done ────────────────────────────────────────────────────────────────
  if (step === "done" && done) return (
    <div className="max-w-xl mx-auto text-center py-16">
      <div className="text-5xl mb-4">✓</div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Draft Created</h1>
      <p className="text-gray-600 mb-2">{done.guidelineName}</p>
      <p className="text-sm text-gray-400 mb-6">
        {done.isNew ? "New guideline created" : "New version added to existing guideline"} — v{done.versionNumber} DRAFT
      </p>
      <div className="flex gap-3 justify-center">
        <Link
          href={`/guidelines/${done.guidelineId}`}
          className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
        >
          Open Draft →
        </Link>
        <button
          onClick={() => { setStep("upload"); setFile(null); setPreview(null); setDone(null); if (fileRef.current) fileRef.current.value = ""; }}
          className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50"
        >
          Import Another
        </button>
      </div>
    </div>
  );

  return null;
}
