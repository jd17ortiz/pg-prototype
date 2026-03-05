"use client";
import { useAuth } from "@/lib/client-auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  if (loading) return <div className="text-center py-20 text-gray-400">Loading…</div>;
  if (!user) return null;

  const cards = [
    { href: "/guidelines",   label: "Guidelines",      desc: "Browse and manage process guidelines", color: "bg-indigo-50 border-indigo-200" },
    { href: "/templates",    label: "Templates",       desc: "Build and version document templates",  color: "bg-purple-50 border-purple-200" },
    ...(user.role === "APPROVER" ? [{ href: "/inbox", label: "Approval Inbox", desc: "Review and approve pending guidelines", color: "bg-green-50 border-green-200" }] : []),
    { href: "/demo",         label: "Demo Script",     desc: "6-step walkthrough of all features",    color: "bg-orange-50 border-orange-200" },
  ];

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-indigo-900 mb-1">Digital Process Guideline System</h1>
        <p className="text-gray-500">
          Welcome, <strong>{user.name}</strong> &mdash; {user.role.replace("_", " ")} &bull; {user.siteId === "site-eu" ? "EU Plant" : "US Plant"}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className={`p-6 border-2 rounded-xl hover:shadow transition-shadow ${c.color}`}
          >
            <div className="font-bold text-lg text-gray-900 mb-1">{c.label}</div>
            <div className="text-sm text-gray-600">{c.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
