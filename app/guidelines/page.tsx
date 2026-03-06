"use client";
import { useEffect, useState, useRef, Suspense, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/client-auth";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Badge from "@/components/Badge";
import type { Guideline, GuidelineVersion, Site } from "@/lib/types";

const STATUSES = ["ACTIVE", "DRAFT", "REVIEW", "ARCHIVED"] as const;
const TYPES    = ["PARENT", "LOCAL", "CHILD"] as const;
const SORTS    = [
  { value: "updatedDesc", label: "Last updated ↓" },
  { value: "updatedAsc",  label: "Last updated ↑" },
  { value: "nameAsc",     label: "Name A–Z" },
  { value: "nameDesc",    label: "Name Z–A" },
] as const;

interface Facets { status: Record<string, number>; type: Record<string, number> }

export default function GuidelinesPageWrapper() {
  return (
    <Suspense fallback={<div className="text-center py-20 text-gray-400">Loading…</div>}>
      <GuidelinesPage />
    </Suspense>
  );
}

function GuidelinesPage() {
  const { user } = useAuth();
  const router   = useRouter();
  const pathname = usePathname();
  const sp       = useSearchParams();

  const [guidelines, setGuidelines] = useState<Guideline[]>([]);
  const [versions,   setVersions]   = useState<GuidelineVersion[]>([]);
  const [sites,      setSites]      = useState<Site[]>([]);
  const [facets,     setFacets]     = useState<Facets>({ status: {}, type: {} });
  const [loading,    setLoading]    = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [qInput,     setQInput]     = useState(sp.get("q") ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Read filters from URL ──────────────────────────────────────────────────
  const q                = sp.get("q") ?? "";
  const siteId           = sp.get("siteId") ?? "";
  const statusList       = sp.get("status")?.split(",").filter(Boolean) ?? [];
  const typeList         = sp.get("type")?.split(",").filter(Boolean) ?? [];
  const hasDraft         = sp.get("hasDraft") === "1";
  const hasOpenCompliance = sp.get("hasOpenCompliance") === "1";
  const sort             = sp.get("sort") ?? "updatedDesc";

  // ── URL helpers ────────────────────────────────────────────────────────────
  const buildParams = useCallback((overrides: Record<string, string | null>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(overrides)) {
      if (v === null || v === "") p.delete(k);
      else p.set(k, v);
    }
    return p.toString();
  }, [sp]);

  function setParam(key: string, value: string | null) {
    router.replace(`${pathname}?${buildParams({ [key]: value })}`);
  }

  function toggleMulti(key: string, value: string, current: string[]) {
    const next = current.includes(value)
      ? current.filter(v => v !== value)
      : [...current, value];
    setParam(key, next.length ? next.join(",") : null);
  }

  function resetAll() {
    router.replace(pathname);
    setQInput("");
  }

  // ── Active filter count (for drawer badge) ─────────────────────────────────
  const activeFilterCount = [
    q, siteId, statusList.length, typeList.length, hasDraft, hasOpenCompliance,
    sort !== "updatedDesc" ? sort : "",
  ].filter(Boolean).length;

  // ── Load data ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (user === null) { router.push("/login"); return; }
    fetch("/api/sites").then(r => r.json()).then(d => setSites(d.sites ?? []));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (q)                params.set("q", q);
    if (siteId)           params.set("siteId", siteId);
    if (statusList.length) params.set("status", statusList.join(","));
    if (typeList.length)   params.set("type", typeList.join(","));
    if (hasDraft)          params.set("hasDraft", "1");
    if (hasOpenCompliance) params.set("hasOpenCompliance", "1");
    if (sort !== "updatedDesc") params.set("sort", sort);
    fetch(`/api/guidelines?${params}`)
      .then(r => r.json())
      .then(d => {
        setGuidelines(d.guidelines ?? []);
        setVersions(d.versions ?? []);
        setFacets(d.facets ?? { status: {}, type: {} });
      })
      .finally(() => setLoading(false));
  }, [user, sp.toString()]);

  // ── Sync qInput when URL q changes externally ──────────────────────────────
  useEffect(() => { setQInput(q); }, [q]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  function latestVersion(gid: string) {
    return versions.filter(v => v.guidelineId === gid).sort((a, b) => b.versionNumber - a.versionNumber)[0];
  }
  function activeVersion(gid: string) {
    return versions.find(v => v.guidelineId === gid && v.status === "ACTIVE");
  }
  function hasDraftVersion(gid: string) {
    return versions.some(v => v.guidelineId === gid && v.status === "DRAFT");
  }
  function siteName(id: string) {
    return sites.find(s => s.id === id)?.name ?? id;
  }

  const canEdit = user && ["RD_ENGINEER", "MT_ENGINEER"].includes(user.role);

  // ── Active chip helpers ────────────────────────────────────────────────────
  const chips: { label: string; onRemove: () => void }[] = [];
  if (q) chips.push({ label: `"${q}"`, onRemove: () => { setParam("q", null); setQInput(""); } });
  if (siteId) chips.push({ label: `Site: ${siteName(siteId)}`, onRemove: () => setParam("siteId", null) });
  for (const s of statusList) chips.push({ label: `Status: ${s}`, onRemove: () => toggleMulti("status", s, statusList) });
  for (const t of typeList)   chips.push({ label: `Type: ${t}`,   onRemove: () => toggleMulti("type", t, typeList) });
  if (hasDraft)          chips.push({ label: "Has Draft",            onRemove: () => setParam("hasDraft", null) });
  if (hasOpenCompliance) chips.push({ label: "Has Open Compliance",  onRemove: () => setParam("hasOpenCompliance", null) });
  if (sort !== "updatedDesc") chips.push({ label: `Sort: ${SORTS.find(s => s.value === sort)?.label}`, onRemove: () => setParam("sort", null) });

  return (
    <div className="-mx-4 -mt-4">
      {/* ── Sticky filter bar ─────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-white border-b shadow-sm px-4 py-3">
        {/* Row 1 */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-[160px] max-w-xs">
            <input
              type="search"
              placeholder="Search guidelines…"
              className="w-full border rounded-lg px-3 py-1.5 text-sm pl-8"
              value={qInput}
              onChange={e => {
                setQInput(e.target.value);
                if (debounceRef.current) clearTimeout(debounceRef.current);
                debounceRef.current = setTimeout(() => setParam("q", e.target.value || null), 300);
              }}
            />
            <svg className="absolute left-2.5 top-2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
          </div>

          {/* Site */}
          <select
            className="border rounded-lg px-3 py-1.5 text-sm"
            value={siteId}
            onChange={e => setParam("siteId", e.target.value || null)}
          >
            <option value="">All Sites</option>
            {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>

          {/* Sort */}
          <select
            className="border rounded-lg px-3 py-1.5 text-sm"
            value={sort}
            onChange={e => setParam("sort", e.target.value === "updatedDesc" ? null : e.target.value)}
          >
            {SORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>

          {/* Filters toggle */}
          <button
            onClick={() => setShowDrawer(d => !d)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg transition-colors ${showDrawer ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "hover:bg-gray-50"}`}
          >
            Filters
            {activeFilterCount > 0 && (
              <span className="bg-indigo-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center leading-none">
                {activeFilterCount}
              </span>
            )}
          </button>

          <div className="flex-1" />

          {canEdit && (
            <Link href="/guidelines/new" className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium whitespace-nowrap">
              + New Guideline
            </Link>
          )}
        </div>

        {/* Active chips */}
        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            {chips.map((c, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs rounded-full border border-indigo-200">
                {c.label}
                <button onClick={c.onRemove} className="text-indigo-400 hover:text-indigo-700 leading-none">×</button>
              </span>
            ))}
            <button onClick={resetAll} className="text-xs text-gray-400 hover:text-gray-600 underline ml-1">Reset all</button>
          </div>
        )}
      </div>

      <div className="px-4 pt-4">
        {/* ── More filters drawer ──────────────────────────────────────────── */}
        {showDrawer && (
          <div className="bg-white border rounded-xl p-4 mb-4 grid grid-cols-2 gap-6 sm:grid-cols-4">
            {/* Status */}
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Status</div>
              <div className="space-y-1.5">
                {STATUSES.map(s => (
                  <label key={s} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={statusList.includes(s)}
                      onChange={() => toggleMulti("status", s, statusList)}
                      className="rounded"
                    />
                    {s}
                    {facets.status[s] != null && (
                      <span className="text-gray-400 text-xs">({facets.status[s]})</span>
                    )}
                  </label>
                ))}
              </div>
            </div>

            {/* Type */}
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Type</div>
              <div className="space-y-1.5">
                {TYPES.map(t => (
                  <label key={t} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={typeList.includes(t)}
                      onChange={() => toggleMulti("type", t, typeList)}
                      className="rounded"
                    />
                    {t}
                    {facets.type[t] != null && (
                      <span className="text-gray-400 text-xs">({facets.type[t]})</span>
                    )}
                  </label>
                ))}
              </div>
            </div>

            {/* Toggles */}
            <div className="col-span-2 sm:col-span-2">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Toggles</div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasDraft}
                    onChange={() => setParam("hasDraft", hasDraft ? null : "1")}
                    className="rounded"
                  />
                  Has open draft
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasOpenCompliance}
                    onChange={() => setParam("hasOpenCompliance", hasOpenCompliance ? null : "1")}
                    className="rounded"
                  />
                  Has open compliance task
                </label>
              </div>
            </div>
          </div>
        )}

        {/* ── Results ──────────────────────────────────────────────────────── */}
        <div className="space-y-3 pb-8">
          {loading && <div className="text-center py-10 text-gray-400 text-sm">Loading…</div>}
          {!loading && guidelines.map(g => {
            const latest  = latestVersion(g.id);
            const active  = activeVersion(g.id);
            const hasDraftV = hasDraftVersion(g.id);
            return (
              <div key={g.id} className="bg-white border rounded-xl p-5 flex items-start justify-between shadow-sm hover:shadow">
                <div>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <Link href={`/guidelines/${g.id}`} className="font-semibold text-indigo-700 hover:underline text-lg">
                      {g.name}
                    </Link>
                    <Badge label={g.type} />
                    {latest && <Badge label={latest.status} />}
                    {hasDraftV && latest?.status !== "DRAFT" && (
                      <span className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded-full font-medium">Draft pending</span>
                    )}
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
          {!loading && guidelines.length === 0 && (
            <div className="text-center py-20 text-gray-400">
              No guidelines match your filters.
              {chips.length > 0 && (
                <button onClick={resetAll} className="block mx-auto mt-2 text-sm text-indigo-600 hover:underline">Clear filters</button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
