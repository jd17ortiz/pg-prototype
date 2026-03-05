"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/client-auth";
import { useRouter } from "next/navigation";
import Badge from "@/components/Badge";
import type { Guideline, GuidelineVersion, Site } from "@/lib/types";

export default function GuidelinesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [guidelines, setGuidelines] = useState<Guideline[]>([]);
  const [versions, setVersions] = useState<GuidelineVersion[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [filterSite, setFilterSite] = useState("");
  const [filterType, setFilterType] = useState("");

  useEffect(() => {
    if (user === null) { router.push("/login"); return; }
    fetch("/api/sites").then(r => r.json()).then(d => setSites(d.sites ?? []));
    loadGuidelines();
  }, [user]);

  async function loadGuidelines() {
    const params = new URLSearchParams();
    if (filterSite) params.set("siteId", filterSite);
    if (filterType) params.set("type", filterType);
    const res = await fetch(`/api/guidelines?${params}`);
    if (res.ok) {
      const d = await res.json();
      setGuidelines(d.guidelines ?? []);
      setVersions(d.versions ?? []);
    }
  }

  useEffect(() => { if (user) loadGuidelines(); }, [filterSite, filterType]);

  function latestVersion(gid: string) {
    return versions.filter(v => v.guidelineId === gid).sort((a, b) => b.versionNumber - a.versionNumber)[0];
  }

  function activeVersion(gid: string) {
    return versions.find(v => v.guidelineId === gid && v.status === "ACTIVE");
  }

  function siteName(id: string) {
    return sites.find(s => s.id === id)?.name ?? id;
  }

  const canEdit = user && ["RD_ENGINEER", "MT_ENGINEER"].includes(user.role);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Guidelines</h1>
        {canEdit && (
          <Link href="/guidelines/new" className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium">
            + New Guideline
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-5">
        <select className="border rounded px-3 py-2 text-sm" value={filterSite} onChange={e => setFilterSite(e.target.value)}>
          <option value="">All Sites</option>
          {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="border rounded px-3 py-2 text-sm" value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">All Types</option>
          <option value="PARENT">PARENT</option>
          <option value="LOCAL">LOCAL</option>
          <option value="CHILD">CHILD</option>
        </select>
      </div>

      <div className="space-y-3">
        {guidelines.map(g => {
          const latest = latestVersion(g.id);
          const active = activeVersion(g.id);
          return (
            <div key={g.id} className="bg-white border rounded-xl p-5 flex items-start justify-between shadow-sm hover:shadow">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Link href={`/guidelines/${g.id}`} className="font-semibold text-indigo-700 hover:underline text-lg">
                    {g.name}
                  </Link>
                  <Badge label={g.type} />
                  {latest && <Badge label={latest.status} />}
                </div>
                <div className="text-sm text-gray-500">
                  {siteName(g.siteId)} &bull; v{latest?.versionNumber ?? "–"}
                  {g.parentGuidelineId && (
                    <span className="ml-2 text-orange-600">
                      ↳ child of <Link href={`/guidelines/${g.parentGuidelineId}`} className="underline">parent</Link>
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-2 shrink-0 ml-4">
                {active && (
                  <Link href={`/guidelines/${g.id}/print`} target="_blank" className="px-3 py-1.5 text-sm bg-gray-50 text-gray-700 rounded hover:bg-gray-100 border">
                    Print
                  </Link>
                )}
                <Link href={`/guidelines/${g.id}`} className="px-3 py-1.5 text-sm bg-indigo-50 text-indigo-700 rounded hover:bg-indigo-100 border border-indigo-200">
                  Open
                </Link>
              </div>
            </div>
          );
        })}
        {guidelines.length === 0 && (
          <div className="text-center py-20 text-gray-400">No guidelines found.</div>
        )}
      </div>
    </div>
  );
}
