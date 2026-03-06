"use client";
import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/client-auth";
import { useRouter } from "next/navigation";
import type { GuidelineVersion, DiffResult, DiffEntry } from "@/lib/types";

interface PageProps { params: Promise<{ id: string }> }

export default function DiffPage({ params }: PageProps) {
  const { id } = use(params);
  const { user } = useAuth();
  const router = useRouter();

  const [versions, setVersions] = useState<GuidelineVersion[]>([]);
  const [vAId, setVAId] = useState("");
  const [vBId, setVBId] = useState("");
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [vA, setVA] = useState<GuidelineVersion | null>(null);
  const [vB, setVB] = useState<GuidelineVersion | null>(null);
  const [loading, setLoading] = useState(false);
  const [guidelineName, setGuidelineName] = useState("");

  useEffect(() => {
    if (!user) { router.push("/login"); return; }
    loadData();
  }, [user, id]);

  async function loadData() {
    const res = await fetch(`/api/guidelines/${id}`);
    if (!res.ok) { router.push("/guidelines"); return; }
    const d = await res.json();
    setGuidelineName(d.guideline.name);
    const vList: GuidelineVersion[] = d.versions.sort(
      (a: GuidelineVersion, b: GuidelineVersion) => a.versionNumber - b.versionNumber
    );
    setVersions(vList);
    if (vList.length >= 2) {
      setVAId(vList[vList.length - 2].id);
      setVBId(vList[vList.length - 1].id);
    } else if (vList.length === 1) {
      setVAId(vList[0].id);
      setVBId(vList[0].id);
    }
  }

  async function runDiff() {
    if (!vAId || !vBId || vAId === vBId) return;
    setLoading(true);
    const res = await fetch(`/api/guidelines/${id}/diff?vA=${vAId}&vB=${vBId}`);
    if (res.ok) {
      const d = await res.json();
      setDiff(d.diff);
      setVA(d.vA);
      setVB(d.vB);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (vAId && vBId && vAId !== vBId) runDiff();
  }, [vAId, vBId]);

  const TYPE_STYLES: Record<string, string> = {
    added:   "bg-green-50 border-l-4 border-green-400",
    removed: "bg-red-50 border-l-4 border-red-400",
    changed: "bg-yellow-50 border-l-4 border-yellow-400",
  };
  const TYPE_BADGE: Record<string, string> = {
    added:   "bg-green-100 text-green-800",
    removed: "bg-red-100 text-red-800",
    changed: "bg-yellow-100 text-yellow-800",
  };

  // Group entries by sheet path
  function groupByPath(entries: DiffEntry[]) {
    const groups = new Map<string, DiffEntry[]>();
    for (const e of entries) {
      const top = e.path.split(" / ")[0] ?? "General";
      const arr = groups.get(top) ?? [];
      arr.push(e);
      groups.set(top, arr);
    }
    return groups;
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/guidelines/${id}`} className="text-indigo-600 hover:underline text-sm">← Back</Link>
        <h1 className="text-2xl font-bold text-gray-900">Version Diff — {guidelineName}</h1>
      </div>

      {/* Version selectors */}
      <div className="bg-white border rounded-xl p-4 mb-6 flex gap-4 items-end">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-600 mb-1">Base version (A)</label>
          <select className="w-full border rounded px-3 py-2 text-sm" value={vAId} onChange={e => setVAId(e.target.value)}>
            {versions.map(v => (
              <option key={v.id} value={v.id}>v{v.versionNumber} — {v.status}</option>
            ))}
          </select>
        </div>
        <div className="text-gray-400 pb-2">→</div>
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-600 mb-1">Compare version (B)</label>
          <select className="w-full border rounded px-3 py-2 text-sm" value={vBId} onChange={e => setVBId(e.target.value)}>
            {versions.map(v => (
              <option key={v.id} value={v.id}>v{v.versionNumber} — {v.status}</option>
            ))}
          </select>
        </div>
        <button onClick={runDiff} disabled={loading || vAId === vBId} className="px-4 py-2 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-40">
          {loading ? "Computing…" : "Compare"}
        </button>
      </div>

      {vAId === vBId && (
        <div className="text-center py-10 text-gray-400">Select two different versions to compare.</div>
      )}

      {diff && vA && vB && (
        <>
          {/* Summary */}
          <div className="bg-white border rounded-xl p-5 mb-6">
            <div className="font-semibold text-gray-700 mb-3">
              Comparing v{vA.versionNumber} ({vA.status}) → v{vB.versionNumber} ({vB.status})
            </div>
            {!diff.hasChanges ? (
              <p className="text-gray-500 text-sm">No differences detected between these versions.</p>
            ) : (
              <div className="flex gap-4">
                <div className="px-4 py-3 bg-green-50 rounded-lg text-center">
                  <div className="text-2xl font-bold text-green-700">{diff.summary.added}</div>
                  <div className="text-xs text-green-600">Added</div>
                </div>
                <div className="px-4 py-3 bg-red-50 rounded-lg text-center">
                  <div className="text-2xl font-bold text-red-700">{diff.summary.removed}</div>
                  <div className="text-xs text-red-600">Removed</div>
                </div>
                <div className="px-4 py-3 bg-yellow-50 rounded-lg text-center">
                  <div className="text-2xl font-bold text-yellow-700">{diff.summary.changed}</div>
                  <div className="text-xs text-yellow-600">Changed</div>
                </div>
              </div>
            )}
          </div>

          {/* Diff entries grouped by sheet */}
          {diff.hasChanges && (
            <div className="space-y-4">
              {Array.from(groupByPath(diff.entries)).map(([group, entries]) => (
                <div key={group} className="bg-white border rounded-xl overflow-hidden">
                  <div className="bg-gray-50 border-b px-4 py-2 font-semibold text-sm text-gray-700">{group}</div>
                  <div className="divide-y">
                    {entries.map((e, i) => (
                      <div key={i} className={`px-4 py-3 ${TYPE_STYLES[e.type]}`}>
                        <div className="flex items-start gap-3">
                          <span className={`text-xs px-2 py-0.5 rounded font-semibold shrink-0 mt-0.5 ${TYPE_BADGE[e.type]}`}>
                            {e.type.toUpperCase()}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-gray-800 font-medium">{e.label}</div>
                            <div className="text-xs text-gray-500 mt-0.5 truncate">{e.path}</div>
                            {e.oldValue !== undefined && e.newValue !== undefined && (
                              <div className="flex gap-2 mt-1 text-xs font-mono">
                                <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded">{e.oldValue || "(empty)"}</span>
                                <span className="text-gray-400">→</span>
                                <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded">{e.newValue || "(empty)"}</span>
                              </div>
                            )}
                            {e.oldValue !== undefined && e.newValue === undefined && (
                              <div className="mt-1 text-xs font-mono">
                                <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded">{e.oldValue}</span>
                              </div>
                            )}
                            {e.newValue !== undefined && e.oldValue === undefined && (
                              <div className="mt-1 text-xs font-mono">
                                <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded">{e.newValue}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
