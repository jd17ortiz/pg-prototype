"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/client-auth";
import { useRouter } from "next/navigation";
import type { Site, Template, TemplateVersion } from "@/lib/types";

export default function NewGuidelinePage() {
  const { user } = useAuth();
  const router = useRouter();
  const [sites, setSites] = useState<Site[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateVersions, setTemplateVersions] = useState<TemplateVersion[]>([]);
  const [form, setForm] = useState({
    name: "",
    type: "LOCAL" as "PARENT" | "LOCAL" | "CHILD",
    siteId: "",
    templateVersionId: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) { router.push("/login"); return; }
    if (!["RD_ENGINEER", "MT_ENGINEER"].includes(user.role)) { router.push("/guidelines"); return; }
    fetch("/api/sites").then(r => r.json()).then(d => {
      setSites(d.sites ?? []);
      if (d.sites?.[0]) setForm(f => ({ ...f, siteId: d.sites[0].id }));
    });
    fetch("/api/templates").then(r => r.json()).then(d => {
      setTemplates(d.templates ?? []);
      setTemplateVersions(d.versions ?? []);
      const firstActive = (d.versions ?? []).find((v: TemplateVersion) => v.status === "ACTIVE");
      if (firstActive) setForm(f => ({ ...f, templateVersionId: firstActive.id }));
    });
  }, [user]);

  const activeVersions = templateVersions.filter(v => v.status === "ACTIVE");

  function templateName(tvId: string) {
    const tv = templateVersions.find(v => v.id === tvId);
    if (!tv) return tvId;
    const t = templates.find(t => t.id === tv.templateId);
    return t ? `${t.name} v${tv.versionNumber}` : tvId;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.siteId || !form.templateVersionId) {
      setError("Please fill all required fields."); return;
    }
    setSaving(true); setError("");
    const res = await fetch("/api/guidelines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      const d = await res.json();
      router.push(`/guidelines/${d.guideline.id}`);
    } else {
      const d = await res.json();
      setError(d.error ?? "Failed to create guideline.");
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Create New Guideline</h1>
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}
      <form onSubmit={handleSubmit} className="bg-white border rounded-xl p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium mb-1">Name *</label>
          <input className="w-full border rounded px-3 py-2 text-sm" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Reactor Cleaning SOP" required />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Type *</label>
          <select className="w-full border rounded px-3 py-2 text-sm" value={form.type} onChange={e => setForm({ ...form, type: e.target.value as typeof form.type })}>
            <option value="LOCAL">LOCAL – Site-specific</option>
            <option value="PARENT">PARENT – Global template</option>
            <option value="CHILD">CHILD – Derived from parent</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Site *</label>
          <select className="w-full border rounded px-3 py-2 text-sm" value={form.siteId} onChange={e => setForm({ ...form, siteId: e.target.value })}>
            {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Template Version *</label>
          <select className="w-full border rounded px-3 py-2 text-sm" value={form.templateVersionId} onChange={e => setForm({ ...form, templateVersionId: e.target.value })}>
            <option value="">Select a template…</option>
            {activeVersions.map(v => <option key={v.id} value={v.id}>{templateName(v.id)}</option>)}
          </select>
          <p className="text-xs text-gray-500 mt-1">Only ACTIVE template versions are shown.</p>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={() => router.back()} className="px-4 py-2 text-sm border rounded hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50">
            {saving ? "Creating…" : "Create Guideline"}
          </button>
        </div>
      </form>
    </div>
  );
}
