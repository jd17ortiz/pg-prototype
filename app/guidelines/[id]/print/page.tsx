"use client";
import { useEffect, useState, use } from "react";
import type { Guideline, GuidelineVersion, Template, TemplateVersion } from "@/lib/types";

interface PageProps { params: Promise<{ id: string }> }

export default function PrintPage({ params }: PageProps) {
  const { id } = use(params);
  const [guideline, setGuideline] = useState<Guideline | null>(null);
  const [version, setVersion] = useState<GuidelineVersion | null>(null);
  const [template, setTemplate] = useState<Template | null>(null);
  const [templateVersion, setTemplateVersion] = useState<TemplateVersion | null>(null);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/guidelines/${id}`);
      if (!res.ok) return;
      const d = await res.json();
      setGuideline(d.guideline);
      const active = (d.versions as GuidelineVersion[]).find(v => v.status === "ACTIVE");
      if (!active) return;
      setVersion(active);

      const tRes = await fetch("/api/templates");
      const tData = await tRes.json();
      const tv = tData.versions.find((v: TemplateVersion) => v.id === d.guideline.templateVersionId);
      if (tv) {
        setTemplateVersion(tv);
        const t = tData.templates.find((t: Template) => t.id === tv.templateId);
        if (t) setTemplate(t);
      }
    }
    load();
  }, [id]);

  if (!guideline || !version || !templateVersion) {
    return <div className="p-8 text-gray-500">Loading print view…</div>;
  }

  const schema = templateVersion.schemaJson;
  const content = version.contentJson;

  return (
    <div className="print-page">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; }
          .page-break { page-break-before: always; }
        }
        body { font-family: Arial, sans-serif; font-size: 11px; }
        .header-block { background: #eef2ff; border: 1px solid #c7d2fe; padding: 12px; margin-bottom: 16px; }
        .sheet-title { font-size: 14px; font-weight: bold; color: #312e81; margin-bottom: 8px; }
        .doc-header-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
        .header-field label { font-size: 9px; color: #6366f1; font-weight: 600; text-transform: uppercase; }
        .header-field .val { border-bottom: 1px solid #999; min-height: 18px; padding: 1px 0; font-size: 11px; }
        .section { border: 1px solid #e5e7eb; border-radius: 6px; margin-bottom: 12px; overflow: hidden; }
        .section-title { background: #f9fafb; padding: 6px 12px; font-weight: 600; font-size: 11px; border-bottom: 1px solid #e5e7eb; }
        .section-body { padding: 10px 12px; }
        table { width: 100%; border-collapse: collapse; font-size: 10px; }
        th { background: #f3f4f6; border: 1px solid #d1d5db; padding: 4px 6px; text-align: left; font-weight: 600; }
        td { border: 1px solid #d1d5db; padding: 4px 6px; }
        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .field-row label { font-size: 9px; color: #6b7280; font-weight: 600; }
        .field-row .val { border-bottom: 1px solid #d1d5db; min-height: 18px; font-size: 11px; }
        .locked-row { background: #fef2f2; }
        .critical-row { background: #fff7ed; }
      `}</style>

      <div className="no-print" style={{ padding: "16px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <strong>{guideline.name}</strong> &nbsp;
          <span style={{ color: "#6b7280", fontSize: "12px" }}>v{version.versionNumber} &bull; ACTIVE</span>
        </div>
        <button onClick={() => window.print()} style={{ padding: "6px 16px", background: "#4f46e5", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "13px" }}>
          Print / Save PDF
        </button>
      </div>

      {schema.sheets.map((sheet, si) => (
        <div key={sheet.id} className={si > 0 ? "page-break" : ""} style={{ padding: "20px 24px" }}>
          {/* Header – repeated per sheet */}
          <div className="header-block">
            <div className="sheet-title">{template?.name} — {sheet.name}</div>
            <div className="doc-header-grid">
              {schema.headerFields.map(f => (
                <div key={f.id} className="header-field">
                  <label>{f.label}{f.required && " *"}</label>
                  <div className="val">{content.headerValues[f.id] || ""}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Sections */}
          {sheet.sections.map(sec => {
            const sContent = content.sheets[sheet.id]?.sections[sec.id];
            if (!sContent) return null;

            return (
              <div key={sec.id} className="section">
                <div className="section-title">{sec.title}</div>
                <div className="section-body">
                  {sContent.type === "richText" && (
                    <div dangerouslySetInnerHTML={{ __html: sContent.html || "<em>No content.</em>" }} />
                  )}
                  {sContent.type === "fieldGrid" && (
                    <div className="grid-2">
                      {(sec.config.fields as Array<{id: string; label: string; required: boolean}> ?? []).map(f => (
                        <div key={f.id} className="field-row">
                          <label>{f.label}{f.required && " *"}</label>
                          <div className="val">{sContent.values[f.id] || ""}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {sContent.type === "table" && (
                    <table>
                      <thead>
                        <tr>{(sec.config.columns as Array<{id: string; label: string}> ?? []).map(c => <th key={c.id}>{c.label}</th>)}</tr>
                      </thead>
                      <tbody>
                        {sContent.rows.map((row, ri) => (
                          <tr key={ri}>
                            {(sec.config.columns as Array<{id: string}> ?? []).map(c => <td key={c.id}>{row[c.id] ?? ""}</td>)}
                          </tr>
                        ))}
                        {sContent.rows.length === 0 && <tr><td colSpan={99} style={{ color: "#9ca3af" }}>No data.</td></tr>}
                      </tbody>
                    </table>
                  )}
                  {sContent.type === "parameterTable" && (
                    <table>
                      <thead>
                        <tr>{["Name","Value","Unit","Min","Max","Locked","Critical"].map(h => <th key={h}>{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {sContent.rows.map(r => (
                          <tr key={r.id} className={r.isLocked ? "locked-row" : r.isCritical ? "critical-row" : ""}>
                            <td><strong>{r.name}</strong></td>
                            <td>{r.value}</td>
                            <td>{r.unit}</td>
                            <td>{r.min}</td>
                            <td>{r.max}</td>
                            <td>{r.isLocked ? "Yes" : ""}</td>
                            <td>{r.isCritical ? "Yes" : ""}</td>
                          </tr>
                        ))}
                        {sContent.rows.length === 0 && <tr><td colSpan={7} style={{ color: "#9ca3af" }}>No parameters.</td></tr>}
                      </tbody>
                    </table>
                  )}
                  {sContent.type === "media" && (
                    <div>
                      {sContent.files.length === 0 ? <em style={{ color: "#9ca3af" }}>No files.</em> : (
                        <ul>{sContent.files.map(f => <li key={f.id}>{f.fileName} {f.description && `– ${f.description}`}</li>)}</ul>
                      )}
                    </div>
                  )}
                  {sContent.type === "flowDiagram" && (
                    <div>
                      <div style={{ border: "1px dashed #d1d5db", borderRadius: "4px", padding: "20px", textAlign: "center", color: "#9ca3af", marginBottom: "8px" }}>
                        [Flow Diagram Placeholder]
                      </div>
                      {sContent.description && <div>{sContent.description}</div>}
                    </div>
                  )}
                  {sContent.type === "changeHistory" && (
                    <table>
                      <thead><tr>{["Version","Date","Author","Description"].map(h => <th key={h}>{h}</th>)}</tr></thead>
                      <tbody>
                        {sContent.entries.map(e => (
                          <tr key={e.id}>
                            <td>{e.version}</td><td>{e.date}</td><td>{e.author}</td><td>{e.description}</td>
                          </tr>
                        ))}
                        {sContent.entries.length === 0 && <tr><td colSpan={4} style={{ color: "#9ca3af" }}>No history.</td></tr>}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            );
          })}

          <div style={{ textAlign: "right", fontSize: "9px", color: "#9ca3af", marginTop: "8px" }}>
            Printed: {new Date().toLocaleString()} &bull; {guideline.name} v{version.versionNumber} &bull; ACTIVE
          </div>
        </div>
      ))}
    </div>
  );
}
