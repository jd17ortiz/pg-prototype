"use client";
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/client-auth";
import { useRouter } from "next/navigation";
import type { User } from "@/lib/types";

export default function LoginPage() {
  const { login, user } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user) { router.push("/"); return; }
    fetch("/api/auth/me")
      .then(() => {})
      .catch(() => {});
    // Load user list from a temporary endpoint
    fetchUsers();
  }, [user, router]);

  async function fetchUsers() {
    // We'll call the seed users directly via a special endpoint
    const res = await fetch("/api/users");
    if (res.ok) {
      const data = await res.json();
      setUsers(data.users);
    }
  }

  async function handleLogin(userId: string) {
    setLoading(true);
    setError("");
    try {
      await login(userId);
      router.push("/");
    } catch {
      setError("Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const ROLE_COLORS: Record<string, string> = {
    RD_ENGINEER: "border-blue-300 bg-blue-50 hover:bg-blue-100",
    MT_ENGINEER: "border-purple-300 bg-purple-50 hover:bg-purple-100",
    APPROVER:    "border-green-300 bg-green-50 hover:bg-green-100",
    OPERATOR:    "border-gray-300 bg-gray-50 hover:bg-gray-100",
  };

  const ROLE_LABELS: Record<string, string> = {
    RD_ENGINEER: "R&D Engineer",
    MT_ENGINEER: "Manufacturing Engineer",
    APPROVER:    "Approver",
    OPERATOR:    "Operator",
  };

  const grouped = users.reduce<Record<string, User[]>>((acc, u) => {
    const site = u.siteId === "site-eu" ? "EU Plant – Frankfurt" : "US Plant – Houston";
    (acc[site] ??= []).push(u);
    return acc;
  }, {});

  return (
    <div className="max-w-3xl mx-auto py-12">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold text-indigo-900 mb-2">Digital Process Guideline System</h1>
        <p className="text-gray-500">Select a user to log in (mock authentication)</p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded">{error}</div>
      )}

      {Object.entries(grouped).map(([site, siteUsers]) => (
        <div key={site} className="mb-8">
          <h2 className="text-lg font-semibold text-gray-700 mb-3 border-b pb-2">{site}</h2>
          <div className="grid grid-cols-2 gap-3">
            {siteUsers.map((u) => (
              <button
                key={u.id}
                onClick={() => handleLogin(u.id)}
                disabled={loading}
                className={`text-left p-4 border-2 rounded-lg transition-colors cursor-pointer disabled:opacity-50 ${ROLE_COLORS[u.role]}`}
              >
                <div className="font-semibold text-gray-900">{u.name}</div>
                <div className="text-sm text-gray-600 mt-0.5">{ROLE_LABELS[u.role]}</div>
                <div className="text-xs text-gray-400 mt-1 font-mono">{u.email}</div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
