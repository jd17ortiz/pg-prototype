"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/client-auth";
import { useRouter } from "next/navigation";
import Badge from "@/components/Badge";
import type { Guideline, GuidelineVersion, Site } from "@/lib/types";

export default function InboxPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<Array<{ guideline: Guideline; version: GuidelineVersion }>>([]);
  const [sites, setSites] = useState<Site[]>([]);

  useEffect(() => {
    if (!user) { router.push("/login"); return; }
    if (user.role !== "APPROVER") { router.push("/"); return; }
    load();
    fetch("/api/sites").then(r => r.json()).then(d => setSites(d.sites ?? []));
  }, [user]);

  async function load() {
    const res = await fetch("/api/guidelines");
    if (!res.ok) return;
    const d = await res.json();
    const guidelines: Guideline[] = d.guidelines ?? [];
    const versions: GuidelineVersion[] = d.versions ?? [];

    const reviewItems = versions
      .filter(v => v.status === "REVIEW")
      .map(v => ({
        guideline: guidelines.find(g => g.id === v.guidelineId)!,
        version: v,
      }))
      .filter(x => x.guideline);

    setItems(reviewItems);
  }

  function siteName(id: string) {
    return sites.find(s => s.id === id)?.name ?? id;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Approval Inbox</h1>
        <span className="text-sm text-gray-500">{items.length} item(s) pending review</span>
      </div>

      {items.length === 0 && (
        <div className="text-center py-20 text-gray-400">No items pending review.</div>
      )}

      <div className="space-y-3">
        {items.map(({ guideline, version }) => (
          <div key={version.id} className="bg-white border rounded-xl p-5 flex items-start justify-between shadow-sm hover:shadow">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Link href={`/guidelines/${guideline.id}`} className="font-semibold text-indigo-700 hover:underline text-lg">
                  {guideline.name}
                </Link>
                <Badge label={guideline.type} />
                <Badge label="REVIEW" />
              </div>
              <div className="text-sm text-gray-500">
                {siteName(guideline.siteId)} &bull; Version {version.versionNumber}
                &bull; Submitted {new Date(version.updatedAt).toLocaleDateString()}
              </div>
              {version.reasonForChange && (
                <div className="text-sm text-gray-600 mt-1 italic">
                  Reason: {version.reasonForChange}
                </div>
              )}
            </div>
            <Link
              href={`/guidelines/${guideline.id}`}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium shrink-0 ml-4"
            >
              Review
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
