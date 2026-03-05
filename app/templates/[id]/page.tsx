"use client";
import { useEffect, useState, useCallback, use } from "react";
import { useAuth } from "@/lib/client-auth";
import { useRouter } from "next/navigation";
import Badge from "@/components/Badge";
import Modal from "@/components/Modal";
import type {
  Template, TemplateVersion, TemplateSchema,
  Sheet, Section, SectionType, HeaderField, GridField, TableColumn, FieldType
} from "@/lib/types";
import { v4 as uuid } from "uuid";

const SECTION_TYPES: { value: SectionType; label: string }[] = [
  { value: "richText",       label: "Rich Text" },
  { value: "fieldGrid",      label: "Field Grid" },
  { value: "table",          label: "Table" },
  { value: "parameterTable", label: "Parameter Table" },
  { value: "media",          label: "Media (placeholder)" },
  { value: "flowDiagram",    label: "Flow Diagram (placeholder)" },
  { value: "changeHistory",  label: "Change History" },
];

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: "text",   label: "Text" },
  { value: "number", label: "Number" },
  { value: "date",   label: "Date" },
  { value: "select", label: "Select" },
];

interface PageProps { params: Promise<{ id: string }> }

export default function TemplatePage({ params }: PageProps) {
  const { id } = use(params);
  const { user } = useAuth();
  const router = useRouter();

  const [template, setTemplate] = useState<Template | null>(null);
  const [versions, setVersions] = useState<TemplateVersion[]>([]);
  const [editingVersion, setEditingVersion] = useState<TemplateVersion | null>(null);
  const [schema, setSchema] = useState<TemplateSchema>({ headerFields: [], sheets: [] });
  const [selectedSheetId, setSelectedSheetId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [preview, setPreview] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [showSectionModal, setShowSectionModal] = useState(false);
  const [newSectionType, setNewSectionType] = useState<SectionType>("richText");
  const [newSectionTitle, setNewSectionTitle] = useState("");

  const canEdit = user && ["RD_ENGINEER", "MT_ENGINEER"].includes(user.role);

  useEffect(() => {
    if (!user) { router.push("/login"); return; }
    loadTemplate();
  }, [user, id]);

  async function loadTemplate() {
    const res = await fetch(`/api/templates/${id}`);
    if (!res.ok) { router.push("/templates"); return; }
    const data = await res.json();
    setTemplate(data.template);
    const vList: TemplateVersion[] = data.versions;
    setVersions(vList);
    const draft = vList.find(v => v.status === "DRAFT") ?? vList[0];
    if (draft) {
      setEditingVersion(draft);
      setSchema(draft.schemaJson);
      if (draft.schemaJson.sheets.length > 0) {
        setSelectedSheetId(draft.schemaJson.sheets[0].id);
      }
    }
  }

  const saveSchema = useCallback(async (s: TemplateSchema, ev: TemplateVersion) => {
    if (!canEdit || ev.status !== "DRAFT") return;
    setSaving(true); setSaveError("");
    const res = await fetch(`/api/templates/${id}/versions`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schemaJson: s, versionStamp: ev.versionStamp }),
    });
    if (res.ok) {
      const data = await res.json();
      setEditingVersion(data.version);
      setVersions(prev => prev.map(v => v.id === data.version.id ? data.version : v));
      setDirty(false);
    } else if (res.status === 409) {
      setSaveError("Stale write – please reload.");
    } else {
      setSaveError("Save failed.");
    }
    setSaving(false);
  }, [id, canEdit]);

  function updateSchema(updater: (s: TemplateSchema) => TemplateSchema) {
    setSchema(prev => {
      const next = updater(prev);
      return next;
    });
    setDirty(true);
  }

  // ─── Header fields ─────────────────────────────────────────────────────────
  function addHeaderField() {
    updateSchema(s => ({
      ...s,
      headerFields: [...s.headerFields, {
        id: uuid(), label: "New Field", type: "text", required: false, defaultValue: ""
      }]
    }));
  }

  function updateHeaderField(fid: string, patch: Partial<HeaderField>) {
    updateSchema(s => ({
      ...s,
      headerFields: s.headerFields.map(f => f.id === fid ? { ...f, ...patch } : f)
    }));
  }

  function removeHeaderField(fid: string) {
    updateSchema(s => ({ ...s, headerFields: s.headerFields.filter(f => f.id !== fid) }));
  }

  function moveHeaderField(fid: string, dir: -1 | 1) {
    updateSchema(s => {
      const arr = [...s.headerFields];
      const i = arr.findIndex(f => f.id === fid);
      const j = i + dir;
      if (j < 0 || j >= arr.length) return s;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return { ...s, headerFields: arr };
    });
  }

  // ─── Sheets ────────────────────────────────────────────────────────────────
  function addSheet() {
    const sheet: Sheet = { id: uuid(), name: "New Sheet", sections: [] };
    updateSchema(s => ({ ...s, sheets: [...s.sheets, sheet] }));
    setSelectedSheetId(sheet.id);
  }

  function renameSheet(sid: string, name: string) {
    updateSchema(s => ({ ...s, sheets: s.sheets.map(sh => sh.id === sid ? { ...sh, name } : sh) }));
  }

  function removeSheet(sid: string) {
    updateSchema(s => {
      const next = s.sheets.filter(sh => sh.id !== sid);
      return { ...s, sheets: next };
    });
    setSelectedSheetId(schema.sheets.find(sh => sh.id !== sid)?.id ?? null);
  }

  function moveSheet(sid: string, dir: -1 | 1) {
    updateSchema(s => {
      const arr = [...s.sheets];
      const i = arr.findIndex(sh => sh.id === sid);
      const j = i + dir;
      if (j < 0 || j >= arr.length) return s;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return { ...s, sheets: arr };
    });
  }

  // ─── Sections ──────────────────────────────────────────────────────────────
  function addSection() {
    if (!selectedSheetId) return;
    const sec: Section = {
      id: uuid(),
      type: newSectionType,
      title: newSectionTitle || SECTION_TYPES.find(t => t.value === newSectionType)!.label,
      config: {},
    };
    updateSchema(s => ({
      ...s,
      sheets: s.sheets.map(sh =>
        sh.id === selectedSheetId ? { ...sh, sections: [...sh.sections, sec] } : sh
      )
    }));
    setShowSectionModal(false);
    setNewSectionTitle(""); setNewSectionType("richText");
  }

  function removeSection(sheetId: string, secId: string) {
    updateSchema(s => ({
      ...s,
      sheets: s.sheets.map(sh =>
        sh.id === sheetId ? { ...sh, sections: sh.sections.filter(sec => sec.id !== secId) } : sh
      )
    }));
  }

  function moveSection(sheetId: string, secId: string, dir: -1 | 1) {
    updateSchema(s => ({
      ...s,
      sheets: s.sheets.map(sh => {
        if (sh.id !== sheetId) return sh;
        const arr = [...sh.sections];
        const i = arr.findIndex(sec => sec.id === secId);
        const j = i + dir;
        if (j < 0 || j >= arr.length) return sh;
        [arr[i], arr[j]] = [arr[j], arr[i]];
        return { ...sh, sections: arr };
      })
    }));
  }

  function updateSection(sheetId: string, secId: string, patch: Partial<Section>) {
    updateSchema(s => ({
      ...s,
      sheets: s.sheets.map(sh =>
        sh.id === sheetId
          ? { ...sh, sections: sh.sections.map(sec => sec.id === secId ? { ...sec, ...patch } : sec) }
          : sh
      )
    }));
  }

  // Grid field helpers
  function addGridField(sheetId: string, secId: string) {
    const f: GridField = { id: uuid(), label: "New Field", type: "text", required: false, defaultValue: "" };
    updateSchema(s => ({
      ...s,
      sheets: s.sheets.map(sh => sh.id === sheetId ? {
        ...sh, sections: sh.sections.map(sec => sec.id === secId ? {
          ...sec, config: { ...sec.config, fields: [...(sec.config.fields ?? []), f] }
        } : sec)
      } : sh)
    }));
  }

  function updateGridField(sheetId: string, secId: string, fid: string, patch: Partial<GridField>) {
    updateSchema(s => ({
      ...s,
      sheets: s.sheets.map(sh => sh.id === sheetId ? {
        ...sh, sections: sh.sections.map(sec => sec.id === secId ? {
          ...sec, config: {
            ...sec.config,
            fields: (sec.config.fields ?? []).map(f => f.id === fid ? { ...f, ...patch } : f)
          }
        } : sec)
      } : sh)
    }));
  }

  function removeGridField(sheetId: string, secId: string, fid: string) {
    updateSchema(s => ({
      ...s,
      sheets: s.sheets.map(sh => sh.id === sheetId ? {
        ...sh, sections: sh.sections.map(sec => sec.id === secId ? {
          ...sec, config: { ...sec.config, fields: (sec.config.fields ?? []).filter(f => f.id !== fid) }
        } : sec)
      } : sh)
    }));
  }

  // Table column helpers
  function addTableColumn(sheetId: string, secId: string) {
    const col: TableColumn = { id: uuid(), label: "Column", type: "text" };
    updateSchema(s => ({
      ...s,
      sheets: s.sheets.map(sh => sh.id === sheetId ? {
        ...sh, sections: sh.sections.map(sec => sec.id === secId ? {
          ...sec, config: { ...sec.config, columns: [...(sec.config.columns ?? []), col] }
        } : sec)
      } : sh)
    }));
  }

  function updateTableColumn(sheetId: string, secId: string, cid: string, patch: Partial<TableColumn>) {
    updateSchema(s => ({
      ...s,
      sheets: s.sheets.map(sh => sh.id === sheetId ? {
        ...sh, sections: sh.sections.map(sec => sec.id === secId ? {
          ...sec, config: {
            ...sec.config,
            columns: (sec.config.columns ?? []).map(c => c.id === cid ? { ...c, ...patch } : c)
          }
        } : sec)
      } : sh)
    }));
  }

  function removeTableColumn(sheetId: string, secId: string, cid: string) {
    updateSchema(s => ({
      ...s,
      sheets: s.sheets.map(sh => sh.id === sheetId ? {
        ...sh, sections: sh.sections.map(sec => sec.id === secId ? {
          ...sec, config: { ...sec.config, columns: (sec.config.columns ?? []).filter(c => c.id !== cid) }
        } : sec)
      } : sh)
    }));
  }

  async function publish() {
    if (!editingVersion) return;
    setPublishing(true);
    // First save
    await saveSchema(schema, editingVersion);
    const res = await fetch(`/api/templates/${id}/versions/${editingVersion.id}/publish`, { method: "POST" });
    if (res.ok) {
      await loadTemplate();
    }
    setPublishing(false);
  }

  const selectedSheet = schema.sheets.find(s => s.id === selectedSheetId);
  const isDraft = editingVersion?.status === "DRAFT";

  if (!template) return <div className="text-center py-20 text-gray-400">Loading…</div>;

  if (preview) {
    return <TemplatePreview schema={schema} template={template} onBack={() => setPreview(false)} />;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-4 gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{template.name}</h1>
          <div className="flex gap-2 mt-1 items-center">
            {versions.map(v => (
              <button
                key={v.id}
                onClick={() => { setEditingVersion(v); setSchema(v.schemaJson); }}
                className={`text-xs px-2 py-0.5 rounded border ${editingVersion?.id === v.id ? "bg-indigo-600 text-white border-indigo-600" : "bg-white border-gray-300"}`}
              >
                v{v.versionNumber} <Badge label={v.status} />
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2 items-center">
          {saveError && <span className="text-xs text-red-600">{saveError}</span>}
          {dirty && <span className="text-xs text-yellow-600">Unsaved changes</span>}
          <button onClick={() => setPreview(true)} className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50">Preview</button>
          {canEdit && isDraft && (
            <>
              <button onClick={() => saveSchema(schema, editingVersion!)} disabled={saving || !dirty} className="px-3 py-1.5 text-sm bg-gray-700 text-white rounded hover:bg-gray-800 disabled:opacity-40">
                {saving ? "Saving…" : "Save"}
              </button>
              <button onClick={publish} disabled={publishing} className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-40">
                {publishing ? "Publishing…" : "Publish"}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Sidebar: sheets */}
        <div className="w-52 shrink-0">
          <div className="bg-white border rounded-xl p-3 space-y-1">
            <div className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Sheets</div>
            {schema.sheets.map((sh, i) => (
              <div key={sh.id} className={`flex items-center rounded px-2 py-1.5 gap-1 cursor-pointer text-sm ${selectedSheetId === sh.id ? "bg-indigo-50 text-indigo-700" : "hover:bg-gray-50"}`}>
                <button className="flex-1 text-left truncate" onClick={() => setSelectedSheetId(sh.id)}>
                  {sh.name}
                </button>
                {canEdit && isDraft && (
                  <div className="flex gap-0.5">
                    <button onClick={() => moveSheet(sh.id, -1)} disabled={i === 0} className="text-gray-400 hover:text-gray-700 disabled:opacity-30 px-0.5">↑</button>
                    <button onClick={() => moveSheet(sh.id, 1)} disabled={i === schema.sheets.length - 1} className="text-gray-400 hover:text-gray-700 disabled:opacity-30 px-0.5">↓</button>
                    <button onClick={() => removeSheet(sh.id)} className="text-red-400 hover:text-red-600 px-0.5">×</button>
                  </div>
                )}
              </div>
            ))}
            {canEdit && isDraft && (
              <button onClick={addSheet} className="w-full text-sm text-indigo-600 hover:text-indigo-800 border border-dashed border-indigo-300 rounded px-2 py-1 mt-2">
                + Add Sheet
              </button>
            )}
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 space-y-4 overflow-y-auto">
          {/* Header Fields */}
          <div className="bg-white border rounded-xl p-4">
            <div className="font-semibold text-gray-700 mb-3 flex items-center justify-between">
              Header Fields (repeated per sheet)
              {canEdit && isDraft && (
                <button onClick={addHeaderField} className="text-xs text-indigo-600 hover:underline">+ Add</button>
              )}
            </div>
            {schema.headerFields.length === 0 && (
              <p className="text-gray-400 text-sm">No header fields yet.</p>
            )}
            <div className="space-y-2">
              {schema.headerFields.map((f, i) => (
                <div key={f.id} className="flex items-center gap-2">
                  {canEdit && isDraft ? (
                    <>
                      <button onClick={() => moveHeaderField(f.id, -1)} disabled={i === 0} className="text-gray-400 hover:text-gray-600 disabled:opacity-30">↑</button>
                      <button onClick={() => moveHeaderField(f.id, 1)} disabled={i === schema.headerFields.length - 1} className="text-gray-400 hover:text-gray-600 disabled:opacity-30">↓</button>
                      <input className="border rounded px-2 py-1 text-sm flex-1" value={f.label} onChange={e => updateHeaderField(f.id, { label: e.target.value })} />
                      <select className="border rounded px-2 py-1 text-sm" value={f.type} onChange={e => updateHeaderField(f.id, { type: e.target.value as FieldType })}>
                        {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                      <label className="text-xs text-gray-500 flex items-center gap-1">
                        <input type="checkbox" checked={f.required} onChange={e => updateHeaderField(f.id, { required: e.target.checked })} /> Req
                      </label>
                      <button onClick={() => removeHeaderField(f.id)} className="text-red-400 hover:text-red-600 text-sm">×</button>
                    </>
                  ) : (
                    <span className="text-sm text-gray-700">{f.label} <span className="text-gray-400">({f.type})</span>{f.required && " *"}</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Sections for selected sheet */}
          {selectedSheet ? (
            <div className="bg-white border rounded-xl p-4">
              <div className="font-semibold text-gray-700 mb-1 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {canEdit && isDraft ? (
                    <input
                      className="border-b border-gray-300 px-1 py-0.5 text-sm font-semibold bg-transparent focus:outline-none"
                      value={selectedSheet.name}
                      onChange={e => renameSheet(selectedSheet.id, e.target.value)}
                    />
                  ) : (
                    <span>{selectedSheet.name}</span>
                  )}
                </div>
                {canEdit && isDraft && (
                  <button onClick={() => setShowSectionModal(true)} className="text-xs text-indigo-600 hover:underline">+ Add Section</button>
                )}
              </div>

              {selectedSheet.sections.length === 0 && (
                <p className="text-gray-400 text-sm mt-3">No sections yet. Add one above.</p>
              )}

              <div className="space-y-4 mt-3">
                {selectedSheet.sections.map((sec, si) => (
                  <SectionEditor
                    key={sec.id}
                    section={sec}
                    index={si}
                    total={selectedSheet.sections.length}
                    sheetId={selectedSheet.id}
                    canEdit={!!(canEdit && isDraft)}
                    onMove={(dir) => moveSection(selectedSheet.id, sec.id, dir)}
                    onRemove={() => removeSection(selectedSheet.id, sec.id)}
                    onUpdate={(patch) => updateSection(selectedSheet.id, sec.id, patch)}
                    onAddGridField={() => addGridField(selectedSheet.id, sec.id)}
                    onUpdateGridField={(fid, patch) => updateGridField(selectedSheet.id, sec.id, fid, patch)}
                    onRemoveGridField={(fid) => removeGridField(selectedSheet.id, sec.id, fid)}
                    onAddColumn={() => addTableColumn(selectedSheet.id, sec.id)}
                    onUpdateColumn={(cid, patch) => updateTableColumn(selectedSheet.id, sec.id, cid, patch)}
                    onRemoveColumn={(cid) => removeTableColumn(selectedSheet.id, sec.id, cid)}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-10 text-gray-400 bg-white border rounded-xl">
              Select or add a sheet to get started.
            </div>
          )}
        </div>
      </div>

      {/* Add Section Modal */}
      {showSectionModal && (
        <Modal title="Add Section" onClose={() => setShowSectionModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Section Type</label>
              <select className="w-full border rounded px-3 py-2 text-sm" value={newSectionType} onChange={e => setNewSectionType(e.target.value as SectionType)}>
                {SECTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Title (optional)</label>
              <input className="w-full border rounded px-3 py-2 text-sm" value={newSectionTitle} onChange={e => setNewSectionTitle(e.target.value)} placeholder="Leave blank for default" />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowSectionModal(false)} className="px-4 py-2 text-sm border rounded hover:bg-gray-50">Cancel</button>
              <button onClick={addSection} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700">Add</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Section Editor ────────────────────────────────────────────────────────────
interface SectionEditorProps {
  section: Section;
  index: number;
  total: number;
  sheetId: string;
  canEdit: boolean;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onUpdate: (patch: Partial<Section>) => void;
  onAddGridField: () => void;
  onUpdateGridField: (fid: string, patch: Partial<GridField>) => void;
  onRemoveGridField: (fid: string) => void;
  onAddColumn: () => void;
  onUpdateColumn: (cid: string, patch: Partial<TableColumn>) => void;
  onRemoveColumn: (cid: string) => void;
}

function SectionEditor({ section, index, total, canEdit, onMove, onRemove, onUpdate, onAddGridField, onUpdateGridField, onRemoveGridField, onAddColumn, onUpdateColumn, onRemoveColumn }: SectionEditorProps) {
  const typeLabel = SECTION_TYPES.find(t => t.value === section.type)?.label ?? section.type;

  return (
    <div className="border rounded-lg p-3 bg-gray-50">
      <div className="flex items-center gap-2 mb-2">
        {canEdit && (
          <>
            <button onClick={() => onMove(-1)} disabled={index === 0} className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-sm">↑</button>
            <button onClick={() => onMove(1)} disabled={index === total - 1} className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-sm">↓</button>
          </>
        )}
        {canEdit ? (
          <input
            className="border-b border-gray-300 px-1 text-sm font-semibold bg-transparent flex-1 focus:outline-none"
            value={section.title}
            onChange={e => onUpdate({ title: e.target.value })}
          />
        ) : (
          <span className="font-semibold text-sm flex-1">{section.title}</span>
        )}
        <span className="text-xs bg-white border px-2 py-0.5 rounded text-gray-500">{typeLabel}</span>
        {canEdit && <button onClick={onRemove} className="text-red-400 hover:text-red-600 text-sm">×</button>}
      </div>

      {section.type === "fieldGrid" && (
        <div className="space-y-1.5">
          {(section.config.fields ?? []).map(f => (
            <div key={f.id} className="flex gap-2 items-center text-xs">
              {canEdit ? (
                <>
                  <input className="border rounded px-2 py-1 flex-1" value={f.label} onChange={e => onUpdateGridField(f.id, { label: e.target.value })} placeholder="Label" />
                  <select className="border rounded px-2 py-1" value={f.type} onChange={e => onUpdateGridField(f.id, { type: e.target.value as FieldType })}>
                    {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <label className="flex items-center gap-1 text-gray-500">
                    <input type="checkbox" checked={f.required} onChange={e => onUpdateGridField(f.id, { required: e.target.checked })} /> Req
                  </label>
                  <button onClick={() => onRemoveGridField(f.id)} className="text-red-400 hover:text-red-600">×</button>
                </>
              ) : (
                <span>{f.label} ({f.type}){f.required && " *"}</span>
              )}
            </div>
          ))}
          {canEdit && (
            <button onClick={onAddGridField} className="text-xs text-indigo-600 hover:underline mt-1">+ Add field</button>
          )}
          {(section.config.fields ?? []).length === 0 && !canEdit && (
            <span className="text-xs text-gray-400">No fields configured.</span>
          )}
        </div>
      )}

      {section.type === "table" && (
        <div className="space-y-1.5">
          <div className="flex gap-1 flex-wrap">
            {(section.config.columns ?? []).map(c => (
              <div key={c.id} className="flex items-center gap-1 text-xs border rounded px-2 py-1 bg-white">
                {canEdit ? (
                  <>
                    <input className="w-20 border-b border-gray-200" value={c.label} onChange={e => onUpdateColumn(c.id, { label: e.target.value })} />
                    <select className="border rounded px-1" value={c.type} onChange={e => onUpdateColumn(c.id, { type: e.target.value as FieldType })}>
                      {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    <button onClick={() => onRemoveColumn(c.id)} className="text-red-400">×</button>
                  </>
                ) : (
                  <span>{c.label}</span>
                )}
              </div>
            ))}
          </div>
          {canEdit && (
            <button onClick={onAddColumn} className="text-xs text-indigo-600 hover:underline">+ Add column</button>
          )}
          {(section.config.columns ?? []).length === 0 && !canEdit && (
            <span className="text-xs text-gray-400">No columns configured.</span>
          )}
        </div>
      )}

      {section.type === "parameterTable" && (
        <p className="text-xs text-gray-500 italic">Fixed columns: Name / Value / Unit / Min / Max / Locked / Critical</p>
      )}
      {section.type === "richText" && (
        <p className="text-xs text-gray-500 italic">Rich text editor in guideline editor.</p>
      )}
      {section.type === "media" && (
        <p className="text-xs text-gray-500 italic">Media upload placeholder.</p>
      )}
      {section.type === "flowDiagram" && (
        <p className="text-xs text-gray-500 italic">Flow diagram placeholder.</p>
      )}
      {section.type === "changeHistory" && (
        <p className="text-xs text-gray-500 italic">Auto-populated change history.</p>
      )}
    </div>
  );
}

// ─── Preview ───────────────────────────────────────────────────────────────────
function TemplatePreview({ schema, template, onBack }: { schema: TemplateSchema; template: Template; onBack: () => void }) {
  return (
    <div>
      <button onClick={onBack} className="mb-4 text-sm text-indigo-600 hover:underline print:hidden">← Back to Builder</button>
      {schema.sheets.map(sheet => (
        <div key={sheet.id} className="mb-8 bg-white border rounded-xl overflow-hidden shadow-sm">
          {/* Header */}
          <div className="bg-indigo-50 border-b p-4">
            <div className="text-lg font-bold text-indigo-900 mb-2">{template.name} — {sheet.name}</div>
            <div className="grid grid-cols-3 gap-3">
              {schema.headerFields.map(f => (
                <div key={f.id}>
                  <div className="text-xs text-gray-500 font-medium">{f.label}{f.required && " *"}</div>
                  <div className="border-b border-gray-300 h-6 mt-0.5" />
                </div>
              ))}
            </div>
          </div>
          {/* Sections */}
          <div className="p-4 space-y-4">
            {sheet.sections.map(sec => (
              <div key={sec.id} className="border rounded-lg p-3">
                <div className="font-semibold text-gray-700 text-sm mb-2">{sec.title}</div>
                {sec.type === "fieldGrid" && (
                  <div className="grid grid-cols-2 gap-3">
                    {(sec.config.fields ?? []).map(f => (
                      <div key={f.id}>
                        <div className="text-xs text-gray-500">{f.label}{f.required && " *"}</div>
                        <div className="border-b border-gray-300 h-6 mt-0.5" />
                      </div>
                    ))}
                  </div>
                )}
                {sec.type === "table" && (
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-gray-50">
                        {(sec.config.columns ?? []).map(c => (
                          <th key={c.id} className="border px-2 py-1 text-left font-medium">{c.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[1, 2, 3].map(i => (
                        <tr key={i}>
                          {(sec.config.columns ?? []).map(c => <td key={c.id} className="border px-2 py-1 h-7" />)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {sec.type === "parameterTable" && (
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-gray-50">
                        {["Name","Value","Unit","Min","Max","Locked","Critical"].map(h => (
                          <th key={h} className="border px-2 py-1 text-left font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[1, 2].map(i => (
                        <tr key={i}>
                          {[1,2,3,4,5,6,7].map(j => <td key={j} className="border px-2 py-1 h-7" />)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {sec.type === "richText" && (
                  <div className="h-20 border border-dashed rounded border-gray-300 flex items-center justify-center text-gray-400 text-xs">Rich text area</div>
                )}
                {sec.type === "media" && (
                  <div className="h-12 border border-dashed rounded border-gray-300 flex items-center justify-center text-gray-400 text-xs">Media upload area</div>
                )}
                {sec.type === "flowDiagram" && (
                  <div className="h-20 border border-dashed rounded border-gray-300 flex items-center justify-center text-gray-400 text-xs">Flow diagram area</div>
                )}
                {sec.type === "changeHistory" && (
                  <table className="w-full text-xs border-collapse">
                    <thead><tr className="bg-gray-50">{["Version","Date","Author","Description"].map(h => <th key={h} className="border px-2 py-1 text-left font-medium">{h}</th>)}</tr></thead>
                    <tbody><tr>{[1,2,3,4].map(j => <td key={j} className="border px-2 py-1 h-7" />)}</tr></tbody>
                  </table>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
