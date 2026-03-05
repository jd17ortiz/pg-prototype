"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/client-auth";
import { useRouter } from "next/navigation";
import Badge from "@/components/Badge";
import Modal from "@/components/Modal";
import type { Template, TemplateVersion } from "@/lib/types";

export default function TemplatesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [versions, setVersions] = useState<TemplateVersion[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user === null) { router.push("/login"); return; }
    fetch("/api/templates").then(r => r.json()).then(d => {
      setTemplates(d.templates ?? []);
      setVersions(d.versions ?? []);
    });
  }, [user, router]);

  async function createTemplate() {
    if (!form.name.trim()) return;
    setSaving(true);
    const res = await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      const data = await res.json();
      router.push(`/templates/${data.template.id}`);
    }
    setSaving(false);
  }

  function activeVersion(templateId: string) {
    return versions.find(v => v.templateId === templateId && v.status === "ACTIVE");
  }
  function latestVersion(templateId: string) {
    return versions.filter(v => v.templateId === templateId).sort((a, b) => b.versionNumber - a.versionNumber)[0];
  }

  const canEdit = user && ["RD_ENGINEER", "MT_ENGINEER"].includes(user.role);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Template Library</h1>
        {canEdit && (
          <button onClick={() => setShowNew(true)} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium">
            + New Template
          </button>
        )}
      </div>

      <div className="space-y-3">
        {templates.map(t => {
          const active = activeVersion(t.id);
          const latest = latestVersion(t.id);
          return (
            <div key={t.id} className="bg-white border rounded-xl p-5 flex items-start justify-between shadow-sm hover:shadow">
              <div>
                <Link href={`/templates/${t.id}`} className="font-semibold text-indigo-700 hover:underline text-lg">
                  {t.name}
                </Link>
                <p className="text-gray-500 text-sm mt-0.5">{t.description}</p>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {active && <span className="text-xs text-gray-500">Active: v{active.versionNumber}</span>}
                  {latest && latest.status === "DRAFT" && (
                    <Badge label="DRAFT" />
                  )}
                  {active && <Badge label="ACTIVE" />}
                </div>
              </div>
              <div className="flex gap-2 shrink-0 ml-4">
                <Link href={`/templates/${t.id}`} className="px-3 py-1.5 text-sm bg-indigo-50 text-indigo-700 rounded hover:bg-indigo-100 border border-indigo-200">
                  {canEdit ? "Edit" : "View"}
                </Link>
              </div>
            </div>
          );
        })}
        {templates.length === 0 && (
          <div className="text-center py-20 text-gray-400">No templates yet.</div>
        )}
      </div>

      {showNew && (
        <Modal title="New Template" onClose={() => setShowNew(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Template Name</label>
              <input
                className="w-full border rounded px-3 py-2 text-sm"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. EU Processleitplan"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea
                className="w-full border rounded px-3 py-2 text-sm"
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                rows={3}
                placeholder="Short description…"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowNew(false)} className="px-4 py-2 text-sm border rounded hover:bg-gray-50">Cancel</button>
              <button onClick={createTemplate} disabled={saving || !form.name.trim()} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50">
                {saving ? "Creating…" : "Create & Edit"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
