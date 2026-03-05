"use client";
import { useEffect, useState, useCallback, useRef, use } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/client-auth";
import { useRouter } from "next/navigation";
import Badge from "@/components/Badge";
import Modal from "@/components/Modal";
import { v4 as uuid } from "uuid";
import type {
  Guideline, GuidelineVersion, Approval, Template, TemplateVersion, TemplateSchema,
  ContentJson, SectionContentValue, ParameterRow, MediaFile, ChangeHistoryEntry,
  NormalizedParameter, AuditEvent, Site
} from "@/lib/types";

interface PageProps { params: Promise<{ id: string }> }

export default function GuidelinePage({ params }: PageProps) {
  const { id } = use(params);
  const { user } = useAuth();
  const router = useRouter();

  const [guideline, setGuideline] = useState<Guideline | null>(null);
  const [versions, setVersions] = useState<GuidelineVersion[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [templateVersion, setTemplateVersion] = useState<TemplateVersion | null>(null);
  const [template, setTemplate] = useState<Template | null>(null);
  const [sites, setSites] = useState<Site[]>([]);

  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [content, setContent] = useState<ContentJson | null>(null);
  const [currentStamp, setCurrentStamp] = useState<string>("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [selectedSheetIdx, setSelectedSheetIdx] = useState(0);

  const [showAudit, setShowAudit] = useState(false);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [showParamPanel, setShowParamPanel] = useState(false);
  const [paramSearch, setParamSearch] = useState("");
  const [submitModal, setSubmitModal] = useState(false);
  const [submitReason, setSubmitReason] = useState("");
  const [approveModal, setApproveModal] = useState(false);
  const [approveComment, setApproveComment] = useState("");
  const [approveDecision, setApproveDecision] = useState<"APPROVE" | "REJECT">("APPROVE");
  const [cloneModal, setCloneModal] = useState(false);
  const [cloneName, setCloneName] = useState("");
  const [cloneSiteId, setCloneSiteId] = useState("");
  const [actionBusy, setActionBusy] = useState(false);

  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user) { router.push("/login"); return; }
    fetch("/api/sites").then(r => r.json()).then(d => {
      setSites(d.sites ?? []);
      if (d.sites?.[0]) setCloneSiteId(d.sites[0].id);
    });
    loadGuideline();
  }, [user, id]);

  async function loadGuideline() {
    const res = await fetch(`/api/guidelines/${id}`);
    if (!res.ok) { router.push("/guidelines"); return; }
    const d = await res.json();
    setGuideline(d.guideline);
    setVersions(d.versions);
    setApprovals(d.approvals);

    // Load template
    const tRes = await fetch(`/api/templates/${d.guideline.templateVersionId.replace(/^tmplv-/, "").split("-").slice(0, -1).join("-") || "unknown"}`);
    // Actually we need to find by templateVersionId
    const allTRes = await fetch("/api/templates");
    const allT = await allTRes.json();
    const tv = (allT.versions as TemplateVersion[]).find(v => v.id === d.guideline.templateVersionId);
    if (tv) {
      setTemplateVersion(tv);
      const t = (allT.templates as Template[]).find(t => t.id === tv.templateId);
      if (t) setTemplate(t);
    }

    // Select draft or latest version for editing
    const draft = (d.versions as GuidelineVersion[]).find(v => v.status === "DRAFT");
    const latest = draft ?? [...d.versions].sort((a: GuidelineVersion, b: GuidelineVersion) => b.versionNumber - a.versionNumber)[0];
    if (latest) {
      setActiveVersionId(latest.id);
      setContent(structuredClone(latest.contentJson));
      setCurrentStamp(latest.versionStamp);
    }
  }

  const currentVersion = versions.find(v => v.id === activeVersionId) ?? null;
  const isDraft = currentVersion?.status === "DRAFT";
  const isReview = currentVersion?.status === "REVIEW";
  const isActive = currentVersion?.status === "ACTIVE";
  const canEdit = user && ["RD_ENGINEER", "MT_ENGINEER"].includes(user.role) && isDraft;
  const canApprove = user?.role === "APPROVER" && isReview;
  const schema: TemplateSchema | null = templateVersion?.schemaJson ?? null;

  function updateContent(updater: (c: ContentJson) => ContentJson) {
    setContent(prev => {
      if (!prev) return prev;
      return updater(prev);
    });
    setDirty(true);
    // Autosave debounce
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      setContent(prev => {
        if (prev) doSave(prev);
        return prev;
      });
    }, 2000);
  }

  const doSave = useCallback(async (c: ContentJson) => {
    if (!isDraft || !currentVersion) return;
    setSaving(true); setSaveError("");
    const res = await fetch(`/api/guidelines/${id}/versions`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentJson: c, versionStamp: currentStamp }),
    });
    if (res.ok) {
      const d = await res.json();
      setCurrentStamp(d.version.versionStamp);
      setVersions(prev => prev.map(v => v.id === d.version.id ? d.version : v));
      setDirty(false);
    } else if (res.status === 409) {
      setSaveError("Stale write – please reload.");
    } else {
      setSaveError("Save failed.");
    }
    setSaving(false);
  }, [id, currentVersion, isDraft, currentStamp]);

  // Warn on leave with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) { e.preventDefault(); }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  function updateSectionContent(sheetId: string, sectionId: string, value: SectionContentValue) {
    updateContent(c => ({
      ...c,
      sheets: {
        ...c.sheets,
        [sheetId]: {
          ...c.sheets[sheetId],
          sections: {
            ...c.sheets[sheetId]?.sections,
            [sectionId]: value,
          }
        }
      }
    }));
  }

  function updateHeaderValue(fid: string, val: string) {
    updateContent(c => ({ ...c, headerValues: { ...c.headerValues, [fid]: val } }));
  }

  async function submitForReview() {
    if (!currentVersion) return;
    if (currentVersion.versionNumber > 1 && !submitReason.trim()) return;
    setActionBusy(true);
    // Save first
    if (dirty && content) await doSave(content);
    const res = await fetch(`/api/guidelines/${id}/versions/${currentVersion.id}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reasonForChange: submitReason }),
    });
    if (res.ok) {
      setSubmitModal(false);
      setSubmitReason("");
      await loadGuideline();
    }
    setActionBusy(false);
  }

  async function handleApprove() {
    if (!currentVersion) return;
    setActionBusy(true);
    const res = await fetch(`/api/guidelines/${id}/versions/${currentVersion.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: approveDecision, comment: approveComment }),
    });
    if (res.ok) {
      setApproveModal(false);
      setApproveComment("");
      await loadGuideline();
    }
    setActionBusy(false);
  }

  async function createNewVersion() {
    if (!currentVersion) return;
    setActionBusy(true);
    const res = await fetch(`/api/guidelines/${id}/versions/${currentVersion.id}/new-version`, { method: "POST" });
    if (res.ok) {
      await loadGuideline();
    }
    setActionBusy(false);
  }

  async function cloneToChild() {
    if (!cloneName.trim() || !cloneSiteId) return;
    setActionBusy(true);
    const res = await fetch(`/api/guidelines/${id}/clone`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: cloneName, siteId: cloneSiteId }),
    });
    if (res.ok) {
      const d = await res.json();
      setCloneModal(false);
      router.push(`/guidelines/${d.guideline.id}`);
    }
    setActionBusy(false);
  }

  async function loadAudit() {
    const res = await fetch(`/api/audit?entityId=${id}`);
    if (res.ok) {
      const d = await res.json();
      setAuditEvents(d.events ?? []);
    }
  }

  const normalizedParams: NormalizedParameter[] = currentVersion?.normalizedPayload?.parameters ?? [];
  const filteredParams = normalizedParams.filter(p =>
    !paramSearch || p.name.toLowerCase().includes(paramSearch.toLowerCase())
  );

  if (!guideline || !content || !schema) {
    return <div className="text-center py-20 text-gray-400">Loading…</div>;
  }

  const currentSheet = schema.sheets[selectedSheetIdx];
  const parentGuideline = guideline.parentGuidelineId;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="bg-white border rounded-xl p-5 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl font-bold text-gray-900">{guideline.name}</h1>
              <Badge label={guideline.type} />
              {currentVersion && <Badge label={currentVersion.status} />}
            </div>
            <div className="text-sm text-gray-500 flex items-center gap-3 flex-wrap">
              <span>{sites.find(s => s.id === guideline.siteId)?.name ?? guideline.siteId}</span>
              {template && <span>Template: {template.name}</span>}
              {currentVersion && <span>v{currentVersion.versionNumber}</span>}
              {parentGuideline && (
                <Link href={`/guidelines/${parentGuideline}`} className="text-orange-600 hover:underline">
                  ↑ Parent guideline
                </Link>
              )}
            </div>
            {currentVersion?.reasonForChange && (
              <div className="text-xs text-gray-400 mt-1 italic">Reason: {currentVersion.reasonForChange}</div>
            )}
          </div>
          <div className="flex gap-2 items-center flex-wrap justify-end">
            {saveError && <span className="text-xs text-red-600">{saveError}</span>}
            {dirty && <span className="text-xs text-yellow-600">Unsaved</span>}
            {saving && <span className="text-xs text-gray-400">Saving…</span>}
            {canEdit && (
              <button onClick={() => content && doSave(content)} disabled={saving || !dirty} className="px-3 py-1.5 text-sm bg-gray-700 text-white rounded hover:bg-gray-800 disabled:opacity-40">
                Save
              </button>
            )}
            {canEdit && (
              <button onClick={() => setSubmitModal(true)} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">
                Submit for Review
              </button>
            )}
            {canApprove && (
              <button onClick={() => setApproveModal(true)} className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700">
                Review / Approve
              </button>
            )}
            {isActive && canEdit && !versions.some(v => v.status === "DRAFT") && (
              <button onClick={createNewVersion} disabled={actionBusy} className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50">
                New Version
              </button>
            )}
            {isActive && guideline.type === "PARENT" && user && ["RD_ENGINEER","MT_ENGINEER"].includes(user.role) && (
              <button onClick={() => setCloneModal(true)} className="px-3 py-1.5 text-sm bg-orange-500 text-white rounded hover:bg-orange-600">
                Clone to Child
              </button>
            )}
            {isActive && (
              <Link href={`/guidelines/${id}/print`} target="_blank" className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50">
                Print
              </Link>
            )}
            <button onClick={() => { setShowParamPanel(p => !p); }} className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50">
              Params
            </button>
            <button onClick={() => { setShowAudit(true); loadAudit(); }} className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50">
              Audit
            </button>
          </div>
        </div>

        {/* Version selector */}
        <div className="flex gap-2 mt-3 flex-wrap">
          {versions.sort((a, b) => a.versionNumber - b.versionNumber).map(v => (
            <button
              key={v.id}
              onClick={() => {
                setActiveVersionId(v.id);
                setContent(structuredClone(v.contentJson));
                setCurrentStamp(v.versionStamp);
                setDirty(false);
              }}
              className={`text-xs px-2.5 py-1 rounded border ${activeVersionId === v.id ? "bg-indigo-600 text-white border-indigo-600" : "bg-white border-gray-300 hover:border-indigo-300"}`}
            >
              v{v.versionNumber} <Badge label={v.status} />
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-4">
        {/* Sidebar: sheets */}
        <div className="w-44 shrink-0">
          <div className="bg-white border rounded-xl p-3 space-y-1">
            <div className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Sheets</div>
            {schema.sheets.map((sh, i) => (
              <button
                key={sh.id}
                onClick={() => setSelectedSheetIdx(i)}
                className={`w-full text-left px-2 py-1.5 rounded text-sm truncate ${i === selectedSheetIdx ? "bg-indigo-50 text-indigo-700 font-medium" : "hover:bg-gray-50 text-gray-700"}`}
              >
                {sh.name}
              </button>
            ))}
          </div>
        </div>

        {/* Main editor */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Header fields for this sheet */}
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
            <div className="text-xs font-semibold text-indigo-700 mb-3 uppercase tracking-wide">Document Header</div>
            <div className="grid grid-cols-3 gap-3">
              {schema.headerFields.map(f => (
                <div key={f.id}>
                  <label className="block text-xs text-indigo-600 font-medium mb-0.5">{f.label}{f.required && " *"}</label>
                  {canEdit ? (
                    f.type === "date" ? (
                      <input type="date" className="w-full border border-indigo-200 rounded px-2 py-1 text-sm bg-white"
                        value={content.headerValues[f.id] ?? ""} onChange={e => updateHeaderValue(f.id, e.target.value)} />
                    ) : (
                      <input type={f.type === "number" ? "number" : "text"} className="w-full border border-indigo-200 rounded px-2 py-1 text-sm bg-white"
                        value={content.headerValues[f.id] ?? ""} onChange={e => updateHeaderValue(f.id, e.target.value)} />
                    )
                  ) : (
                    <div className="text-sm text-gray-800 border-b border-gray-300 py-0.5">{content.headerValues[f.id] || "–"}</div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Current sheet sections */}
          {currentSheet && content.sheets[currentSheet.id] && currentSheet.sections.map(sec => {
            const sContent = content.sheets[currentSheet.id]?.sections[sec.id];
            return (
              <SectionEditor
                key={sec.id}
                section={sec}
                value={sContent}
                readOnly={!canEdit}
                onChange={(val) => updateSectionContent(currentSheet.id, sec.id, val)}
              />
            );
          })}
        </div>

        {/* Parameter panel */}
        {showParamPanel && (
          <div className="w-72 shrink-0">
            <div className="bg-white border rounded-xl p-3 h-full">
              <div className="font-semibold text-sm text-gray-700 mb-2 flex justify-between">
                Parameter Registry
                <button onClick={() => setShowParamPanel(false)} className="text-gray-400 hover:text-gray-700">×</button>
              </div>
              <input className="w-full border rounded px-2 py-1 text-sm mb-3" placeholder="Search…" value={paramSearch} onChange={e => setParamSearch(e.target.value)} />
              <div className="space-y-2 overflow-y-auto max-h-96">
                {filteredParams.length === 0 && <p className="text-xs text-gray-400">No parameters found.</p>}
                {filteredParams.map(p => (
                  <div key={p.id} className="text-xs border rounded p-2">
                    <div className="font-medium flex items-center gap-1">
                      {p.name}
                      {p.isLocked && <span className="text-xs bg-red-100 text-red-700 px-1 rounded">Locked</span>}
                      {p.isCritical && <span className="text-xs bg-orange-100 text-orange-700 px-1 rounded">Critical</span>}
                    </div>
                    <div className="text-gray-500 mt-0.5">{p.value} {p.unit} [{p.min}–{p.max}]</div>
                    <div className="text-gray-400">{p.sheetName} › {p.sectionTitle}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Submit Modal */}
      {submitModal && (
        <Modal title="Submit for Review" onClose={() => setSubmitModal(false)}>
          <div className="space-y-4">
            {currentVersion && currentVersion.versionNumber > 1 && (
              <div>
                <label className="block text-sm font-medium mb-1">Reason for Change *</label>
                <textarea className="w-full border rounded px-3 py-2 text-sm" rows={3} value={submitReason} onChange={e => setSubmitReason(e.target.value)} placeholder="Describe what changed and why…" />
              </div>
            )}
            {currentVersion && currentVersion.versionNumber === 1 && (
              <div>
                <label className="block text-sm font-medium mb-1">Notes (optional)</label>
                <textarea className="w-full border rounded px-3 py-2 text-sm" rows={3} value={submitReason} onChange={e => setSubmitReason(e.target.value)} placeholder="Initial version…" />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setSubmitModal(false)} className="px-4 py-2 text-sm border rounded hover:bg-gray-50">Cancel</button>
              <button onClick={submitForReview} disabled={actionBusy || (currentVersion?.versionNumber ?? 0) > 1 && !submitReason.trim()} className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
                {actionBusy ? "Submitting…" : "Submit"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Approve Modal */}
      {approveModal && (
        <Modal title="Review Guideline" onClose={() => setApproveModal(false)}>
          <div className="space-y-4">
            <div className="flex gap-3">
              <button
                onClick={() => setApproveDecision("APPROVE")}
                className={`flex-1 py-2 rounded border text-sm font-medium ${approveDecision === "APPROVE" ? "bg-green-600 text-white border-green-600" : "hover:bg-green-50"}`}
              >
                Approve
              </button>
              <button
                onClick={() => setApproveDecision("REJECT")}
                className={`flex-1 py-2 rounded border text-sm font-medium ${approveDecision === "REJECT" ? "bg-red-600 text-white border-red-600" : "hover:bg-red-50"}`}
              >
                Reject
              </button>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Comment</label>
              <textarea className="w-full border rounded px-3 py-2 text-sm" rows={3} value={approveComment} onChange={e => setApproveComment(e.target.value)} placeholder="Optional comment…" />
            </div>
            {currentVersion?.reasonForChange && (
              <div className="bg-gray-50 p-3 rounded text-sm">
                <div className="text-xs text-gray-500 mb-1">Reason for Change</div>
                {currentVersion.reasonForChange}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setApproveModal(false)} className="px-4 py-2 text-sm border rounded hover:bg-gray-50">Cancel</button>
              <button onClick={handleApprove} disabled={actionBusy} className={`px-4 py-2 text-sm text-white rounded disabled:opacity-50 ${approveDecision === "APPROVE" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}`}>
                {actionBusy ? "Processing…" : approveDecision === "APPROVE" ? "Approve" : "Reject"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Clone Modal */}
      {cloneModal && (
        <Modal title="Clone to Child Guideline" onClose={() => setCloneModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Child Guideline Name *</label>
              <input className="w-full border rounded px-3 py-2 text-sm" value={cloneName} onChange={e => setCloneName(e.target.value)} placeholder="e.g. Alpha Compound – US Site" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Target Site *</label>
              <select className="w-full border rounded px-3 py-2 text-sm" value={cloneSiteId} onChange={e => setCloneSiteId(e.target.value)}>
                {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <p className="text-xs text-gray-500">The active content will be copied as a Draft. Locked parameters will carry over from the parent.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setCloneModal(false)} className="px-4 py-2 text-sm border rounded hover:bg-gray-50">Cancel</button>
              <button onClick={cloneToChild} disabled={actionBusy || !cloneName.trim()} className="px-4 py-2 text-sm bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50">
                {actionBusy ? "Cloning…" : "Clone"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Audit Modal */}
      {showAudit && (
        <Modal title="Audit Timeline" onClose={() => setShowAudit(false)} wide>
          <div className="space-y-2">
            {auditEvents.length === 0 && <p className="text-gray-400 text-sm">No events found.</p>}
            {auditEvents.map(e => (
              <div key={e.id} className="flex gap-3 text-sm border-b pb-2">
                <div className="text-gray-400 text-xs w-40 shrink-0">{new Date(e.createdAt).toLocaleString()}</div>
                <div>
                  <span className="font-medium">{e.action}</span>
                  {e.userName && <span className="text-gray-500 ml-2">by {e.userName}</span>}
                  {e.data && Object.keys(e.data).length > 0 && (
                    <div className="text-xs text-gray-400 mt-0.5">{JSON.stringify(e.data)}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Section Editor ────────────────────────────────────────────────────────────
interface SectionProps {
  section: { id: string; type: string; title: string; config: { fields?: Array<{id: string; label: string; type: string; required: boolean}>; columns?: Array<{id: string; label: string; type: string; options?: string[]}> } };
  value: SectionContentValue | undefined;
  readOnly: boolean;
  onChange: (val: SectionContentValue) => void;
}

function SectionEditor({ section, value, readOnly, onChange }: SectionProps) {
  if (!value) return null;

  return (
    <div className="bg-white border rounded-xl overflow-hidden shadow-sm">
      <div className="bg-gray-50 border-b px-4 py-2 font-semibold text-sm text-gray-700">{section.title}</div>
      <div className="p-4">
        {value.type === "richText" && (
          <RichTextEditor value={value.html} readOnly={readOnly} onChange={(html) => onChange({ type: "richText", html })} />
        )}
        {value.type === "fieldGrid" && (
          <FieldGridEditor
            fields={(section.config.fields as Array<{id: string; label: string; type: string; required: boolean}>) ?? []}
            values={value.values}
            readOnly={readOnly}
            onChange={(values) => onChange({ type: "fieldGrid", values })}
          />
        )}
        {value.type === "table" && (
          <TableEditor
            columns={(section.config.columns as Array<{id: string; label: string; type: string}>) ?? []}
            rows={value.rows}
            readOnly={readOnly}
            onChange={(rows) => onChange({ type: "table", rows })}
          />
        )}
        {value.type === "parameterTable" && (
          <ParameterTableEditor
            rows={value.rows}
            readOnly={readOnly}
            onChange={(rows) => onChange({ type: "parameterTable", rows })}
          />
        )}
        {value.type === "media" && (
          <MediaEditor
            files={value.files}
            readOnly={readOnly}
            onChange={(files) => onChange({ type: "media", files })}
          />
        )}
        {value.type === "flowDiagram" && (
          <FlowDiagramEditor
            description={value.description}
            readOnly={readOnly}
            onChange={(description) => onChange({ type: "flowDiagram", description })}
          />
        )}
        {value.type === "changeHistory" && (
          <ChangeHistoryEditor
            entries={value.entries}
            readOnly={readOnly}
            onChange={(entries) => onChange({ type: "changeHistory", entries })}
          />
        )}
      </div>
    </div>
  );
}

function RichTextEditor({ value, readOnly, onChange }: { value: string; readOnly: boolean; onChange: (v: string) => void }) {
  if (readOnly) {
    return <div className="prose prose-sm max-w-none text-gray-800" dangerouslySetInnerHTML={{ __html: value || "<p class='text-gray-400'>No content.</p>" }} />;
  }
  return (
    <div>
      <textarea
        className="w-full border rounded px-3 py-2 text-sm min-h-[100px] font-mono"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Enter HTML or plain text…"
      />
      <p className="text-xs text-gray-400 mt-1">Basic HTML supported. Preview shows rendered output.</p>
    </div>
  );
}

function FieldGridEditor({ fields, values, readOnly, onChange }: {
  fields: Array<{id: string; label: string; type: string; required: boolean}>;
  values: Record<string, string>;
  readOnly: boolean;
  onChange: (v: Record<string, string>) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {fields.map(f => (
        <div key={f.id}>
          <label className="block text-xs font-medium text-gray-600 mb-0.5">{f.label}{f.required && " *"}</label>
          {readOnly ? (
            <div className="text-sm text-gray-800 border-b border-gray-200 py-0.5">{values[f.id] || "–"}</div>
          ) : (
            <input
              type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
              className="w-full border rounded px-2 py-1 text-sm"
              value={values[f.id] ?? ""}
              onChange={e => onChange({ ...values, [f.id]: e.target.value })}
            />
          )}
        </div>
      ))}
      {fields.length === 0 && <p className="text-xs text-gray-400 col-span-2">No fields configured.</p>}
    </div>
  );
}

function TableEditor({ columns, rows, readOnly, onChange }: {
  columns: Array<{id: string; label: string; type: string; options?: string[]}>;
  rows: Record<string, string>[];
  readOnly: boolean;
  onChange: (rows: Record<string, string>[]) => void;
}) {
  function addRow() {
    onChange([...rows, Object.fromEntries(columns.map(c => [c.id, ""]))]);
  }
  function removeRow(i: number) {
    onChange(rows.filter((_, ri) => ri !== i));
  }
  function updateCell(ri: number, cid: string, val: string) {
    onChange(rows.map((row, i) => i === ri ? { ...row, [cid]: val } : row));
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-50">
              {columns.map(c => <th key={c.id} className="border px-2 py-1.5 text-left font-medium text-gray-600">{c.label}</th>)}
              {!readOnly && <th className="border px-2 py-1.5 w-8" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>
                {columns.map(c => (
                  <td key={c.id} className="border px-1 py-0.5">
                    {readOnly ? (
                      <span className="px-1">{row[c.id] ?? ""}</span>
                    ) : c.options ? (
                      <select className="w-full px-1 py-0.5 text-xs" value={row[c.id] ?? ""} onChange={e => updateCell(ri, c.id, e.target.value)}>
                        <option value="">–</option>
                        {c.options.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input type={c.type === "number" ? "number" : "text"} className="w-full px-1 py-0.5 min-w-[60px]" value={row[c.id] ?? ""} onChange={e => updateCell(ri, c.id, e.target.value)} />
                    )}
                  </td>
                ))}
                {!readOnly && (
                  <td className="border px-1 text-center">
                    <button onClick={() => removeRow(ri)} className="text-red-400 hover:text-red-600">×</button>
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={columns.length + 1} className="border px-3 py-3 text-center text-gray-400">No rows yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <button onClick={addRow} className="mt-2 text-xs text-indigo-600 hover:underline">+ Add row</button>
      )}
    </div>
  );
}

function ParameterTableEditor({ rows, readOnly, onChange }: {
  rows: ParameterRow[];
  readOnly: boolean;
  onChange: (rows: ParameterRow[]) => void;
}) {
  function addRow() {
    onChange([...rows, { id: uuid(), name: "", value: "", unit: "", min: "", max: "", isLocked: false, isCritical: false }]);
  }
  function removeRow(id: string) {
    onChange(rows.filter(r => r.id !== id));
  }
  function update(id: string, patch: Partial<ParameterRow>) {
    onChange(rows.map(r => r.id === id ? { ...r, ...patch } : r));
  }

  const cols = ["Name", "Value", "Unit", "Min", "Max", "Locked", "Critical"];

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-50">
              {cols.map(c => <th key={c} className="border px-2 py-1.5 text-left font-medium text-gray-600">{c}</th>)}
              {!readOnly && <th className="border px-2 py-1.5 w-8" />}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className={r.isLocked ? "bg-red-50" : r.isCritical ? "bg-orange-50" : ""}>
                <td className="border px-1 py-0.5">
                  {readOnly ? <span className="px-1 font-medium">{r.name}</span> : <input className="w-full px-1 min-w-[80px]" value={r.name} onChange={e => update(r.id, { name: e.target.value })} />}
                </td>
                <td className="border px-1 py-0.5">
                  {readOnly || r.isLocked ? <span className="px-1">{r.value}</span> : <input className="w-20 px-1" value={r.value} onChange={e => update(r.id, { value: e.target.value })} />}
                </td>
                <td className="border px-1 py-0.5">
                  {readOnly ? <span className="px-1">{r.unit}</span> : <input className="w-14 px-1" value={r.unit} onChange={e => update(r.id, { unit: e.target.value })} />}
                </td>
                <td className="border px-1 py-0.5">
                  {readOnly ? <span className="px-1">{r.min}</span> : <input className="w-14 px-1" value={r.min} onChange={e => update(r.id, { min: e.target.value })} />}
                </td>
                <td className="border px-1 py-0.5">
                  {readOnly ? <span className="px-1">{r.max}</span> : <input className="w-14 px-1" value={r.max} onChange={e => update(r.id, { max: e.target.value })} />}
                </td>
                <td className="border px-1 py-0.5 text-center">
                  {readOnly ? (r.isLocked ? "✓" : "") : <input type="checkbox" checked={r.isLocked} onChange={e => update(r.id, { isLocked: e.target.checked })} />}
                </td>
                <td className="border px-1 py-0.5 text-center">
                  {readOnly ? (r.isCritical ? "✓" : "") : <input type="checkbox" checked={r.isCritical} onChange={e => update(r.id, { isCritical: e.target.checked })} />}
                </td>
                {!readOnly && (
                  <td className="border px-1 text-center">
                    {r.isLocked ? <span className="text-red-400 text-xs">Locked</span> : <button onClick={() => removeRow(r.id)} className="text-red-400 hover:text-red-600">×</button>}
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={cols.length + 1} className="border px-3 py-3 text-center text-gray-400">No parameters yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <button onClick={addRow} className="mt-2 text-xs text-indigo-600 hover:underline">+ Add parameter</button>
      )}
    </div>
  );
}

function MediaEditor({ files, readOnly, onChange }: {
  files: MediaFile[];
  readOnly: boolean;
  onChange: (files: MediaFile[]) => void;
}) {
  const [fileName, setFileName] = useState("");
  const [fileDesc, setFileDesc] = useState("");

  function addFile() {
    if (!fileName.trim()) return;
    onChange([...files, {
      id: uuid(), fileName, fileType: fileName.split(".").pop() ?? "file",
      size: 0, uploadedAt: new Date().toISOString(), description: fileDesc
    }]);
    setFileName(""); setFileDesc("");
  }

  return (
    <div>
      <div className="space-y-2 mb-3">
        {files.map(f => (
          <div key={f.id} className="flex items-center gap-2 text-sm border rounded px-3 py-2">
            <span className="text-gray-500">📄</span>
            <div className="flex-1">
              <div className="font-medium">{f.fileName}</div>
              {f.description && <div className="text-xs text-gray-500">{f.description}</div>}
            </div>
            {!readOnly && (
              <button onClick={() => onChange(files.filter(x => x.id !== f.id))} className="text-red-400 hover:text-red-600">×</button>
            )}
          </div>
        ))}
        {files.length === 0 && <p className="text-xs text-gray-400">No files attached.</p>}
      </div>
      {!readOnly && (
        <div className="border-t pt-3 flex gap-2">
          <input className="border rounded px-2 py-1 text-sm flex-1" placeholder="filename.pdf" value={fileName} onChange={e => setFileName(e.target.value)} />
          <input className="border rounded px-2 py-1 text-sm flex-1" placeholder="Description (optional)" value={fileDesc} onChange={e => setFileDesc(e.target.value)} />
          <button onClick={addFile} className="px-3 py-1 text-sm bg-indigo-50 text-indigo-700 rounded border border-indigo-200 hover:bg-indigo-100">Add</button>
        </div>
      )}
      <p className="text-xs text-gray-400 mt-1">Note: file upload is metadata-only in this prototype.</p>
    </div>
  );
}

function FlowDiagramEditor({ description, readOnly, onChange }: {
  description: string; readOnly: boolean; onChange: (v: string) => void;
}) {
  return (
    <div>
      <div className="bg-gray-50 border border-dashed rounded p-4 mb-3 min-h-[80px] flex items-center justify-center text-gray-400 text-sm">
        Flow Diagram (placeholder – no rendering)
      </div>
      <div>
        <label className="text-xs text-gray-500 mb-1 block">Description / Notes</label>
        {readOnly ? (
          <div className="text-sm text-gray-700">{description || "–"}</div>
        ) : (
          <textarea className="w-full border rounded px-3 py-2 text-sm" rows={3} value={description} onChange={e => onChange(e.target.value)} placeholder="Describe the flow…" />
        )}
      </div>
    </div>
  );
}

function ChangeHistoryEditor({ entries, readOnly, onChange }: {
  entries: ChangeHistoryEntry[];
  readOnly: boolean;
  onChange: (entries: ChangeHistoryEntry[]) => void;
}) {
  const [form, setForm] = useState({ date: "", author: "", description: "", version: "" });

  function add() {
    if (!form.description.trim()) return;
    onChange([...entries, { id: uuid(), ...form }]);
    setForm({ date: "", author: "", description: "", version: "" });
  }

  return (
    <div>
      <table className="w-full text-xs border-collapse mb-3">
        <thead>
          <tr className="bg-gray-50">
            {["Version","Date","Author","Description"].map(h => (
              <th key={h} className="border px-2 py-1.5 text-left font-medium text-gray-600">{h}</th>
            ))}
            {!readOnly && <th className="border px-2 py-1.5 w-8" />}
          </tr>
        </thead>
        <tbody>
          {entries.map(e => (
            <tr key={e.id}>
              <td className="border px-2 py-1">{e.version}</td>
              <td className="border px-2 py-1">{e.date}</td>
              <td className="border px-2 py-1">{e.author}</td>
              <td className="border px-2 py-1">{e.description}</td>
              {!readOnly && (
                <td className="border px-1 text-center">
                  <button onClick={() => onChange(entries.filter(x => x.id !== e.id))} className="text-red-400 hover:text-red-600">×</button>
                </td>
              )}
            </tr>
          ))}
          {entries.length === 0 && (
            <tr><td colSpan={5} className="border px-3 py-3 text-center text-gray-400">No history entries.</td></tr>
          )}
        </tbody>
      </table>
      {!readOnly && (
        <div className="border-t pt-3 grid grid-cols-4 gap-2">
          <input className="border rounded px-2 py-1 text-xs" placeholder="Version" value={form.version} onChange={e => setForm({ ...form, version: e.target.value })} />
          <input type="date" className="border rounded px-2 py-1 text-xs" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
          <input className="border rounded px-2 py-1 text-xs" placeholder="Author" value={form.author} onChange={e => setForm({ ...form, author: e.target.value })} />
          <input className="border rounded px-2 py-1 text-xs col-span-3" placeholder="Description of change" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          <button onClick={add} className="px-2 py-1 text-xs bg-indigo-50 text-indigo-700 rounded border border-indigo-200 hover:bg-indigo-100">Add</button>
        </div>
      )}
    </div>
  );
}
