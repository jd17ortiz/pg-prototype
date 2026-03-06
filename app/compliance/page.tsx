"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/client-auth";
import { useRouter } from "next/navigation";
import Badge from "@/components/Badge";
import type { Site } from "@/lib/types";

interface EnrichedTask {
  id: string;
  parentGuidelineId: string;
  parentGuidelineName: string;
  parentVersionId: string;
  parentVersionNumber: number | string;
  childGuidelineId: string;
  childGuidelineName: string;
  siteId: string;
  status: "OPEN" | "DONE";
  createdAt: string;
  completedAt?: string;
}

export default function CompliancePage() {
  const { user } = useAuth();
  const router = useRouter();
  const [tasks, setTasks] = useState<EnrichedTask[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [filterSite, setFilterSite] = useState("");
  const [filterStatus, setFilterStatus] = useState("OPEN");

  useEffect(() => {
    if (!user) { router.push("/login"); return; }
    fetch("/api/sites").then(r => r.json()).then(d => setSites(d.sites ?? []));
    loadTasks();
  }, [user]);

  async function loadTasks() {
    const params = new URLSearchParams();
    if (filterSite) params.set("siteId", filterSite);
    if (filterStatus) params.set("status", filterStatus);
    const res = await fetch(`/api/compliance?${params}`);
    if (res.ok) {
      const d = await res.json();
      setTasks(d.tasks ?? []);
    }
  }

  useEffect(() => { if (user) loadTasks(); }, [filterSite, filterStatus]);

  function siteName(id: string) {
    return sites.find(s => s.id === id)?.name ?? id;
  }

  const openCount = tasks.filter(t => t.status === "OPEN").length;
  const doneCount = tasks.filter(t => t.status === "DONE").length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Compliance Tasks</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Tasks created when a Parent guideline gets a new Active version — child sites must update.
          </p>
        </div>
        <div className="flex gap-3 text-sm">
          <div className="px-3 py-1.5 bg-yellow-50 border border-yellow-200 rounded text-yellow-800 font-medium">
            {openCount} Open
          </div>
          <div className="px-3 py-1.5 bg-green-50 border border-green-200 rounded text-green-800 font-medium">
            {doneCount} Done
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-5">
        <select className="border rounded px-3 py-2 text-sm" value={filterSite} onChange={e => setFilterSite(e.target.value)}>
          <option value="">All Sites</option>
          {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="border rounded px-3 py-2 text-sm" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="OPEN">Open</option>
          <option value="DONE">Done</option>
        </select>
      </div>

      {/* Tasks */}
      <div className="space-y-3">
        {tasks.map(task => (
          <div key={task.id} className={`bg-white border rounded-xl p-5 shadow-sm ${task.status === "OPEN" ? "border-yellow-200" : "border-gray-200"}`}>
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded ${task.status === "OPEN" ? "bg-yellow-100 text-yellow-800" : "bg-green-100 text-green-800"}`}>
                    {task.status}
                  </span>
                  <span className="text-sm text-gray-500">{siteName(task.siteId)}</span>
                </div>
                <div className="font-semibold text-gray-900 mb-0.5">
                  Update required:{" "}
                  <Link href={`/guidelines/${task.childGuidelineId}`} className="text-indigo-700 hover:underline">
                    {task.childGuidelineName}
                  </Link>
                </div>
                <div className="text-sm text-gray-500">
                  Parent{" "}
                  <Link href={`/guidelines/${task.parentGuidelineId}`} className="text-gray-700 hover:underline">
                    {task.parentGuidelineName}
                  </Link>
                  {" "}released v{task.parentVersionNumber} on {new Date(task.createdAt).toLocaleDateString()}
                </div>
                {task.status === "DONE" && task.completedAt && (
                  <div className="text-xs text-green-600 mt-1">
                    Completed {new Date(task.completedAt).toLocaleDateString()}
                  </div>
                )}
              </div>
              <div className="flex gap-2 shrink-0 ml-4">
                <Link
                  href={`/guidelines/${task.parentGuidelineId}/diff`}
                  className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50"
                >
                  View Diff
                </Link>
                {task.status === "OPEN" && (
                  <Link
                    href={`/guidelines/${task.childGuidelineId}`}
                    className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700"
                  >
                    Update Child
                  </Link>
                )}
              </div>
            </div>
          </div>
        ))}
        {tasks.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            No compliance tasks found.
            {filterStatus === "OPEN" && " All sites are up to date."}
          </div>
        )}
      </div>

      <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800">
        <strong>How it works:</strong> When a PARENT guideline gets a new ACTIVE version, the system automatically creates
        an OPEN compliance task for each linked CHILD guideline. The task closes automatically when the child site
        publishes a new ACTIVE version.
      </div>
    </div>
  );
}
