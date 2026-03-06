"use client";
import Link from "next/link";
import { useAuth } from "@/lib/client-auth";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

const ROLE_COLORS: Record<string, string> = {
  RD_ENGINEER: "bg-blue-100 text-blue-800",
  MT_ENGINEER: "bg-purple-100 text-purple-800",
  APPROVER:    "bg-green-100 text-green-800",
  OPERATOR:    "bg-gray-100 text-gray-800",
};

export default function Nav() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const link = (href: string, label: string) => {
    const active = pathname.startsWith(href);
    return (
      <Link
        href={href}
        className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
          active ? "bg-indigo-700 text-white" : "text-indigo-100 hover:bg-indigo-600"
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <nav className="bg-indigo-800 text-white shadow-md print:hidden">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
        <div className="flex items-center gap-1">
          <Link href="/" className="font-bold text-lg mr-4 text-white">PGS</Link>
          {mounted && user && (
            <>
              {link("/guidelines", "Guidelines")}
              {link("/templates", "Templates")}
              {user.role === "APPROVER" && link("/inbox", "Inbox")}
              {link("/compliance", "Compliance")}
              {link("/demo", "Demo")}
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          {mounted && user ? (
            <>
              <span className="text-sm text-indigo-200">{user.name}</span>
              <span className={`text-xs px-2 py-0.5 rounded font-mono ${ROLE_COLORS[user.role]}`}>
                {user.role}
              </span>
              <button
                onClick={logout}
                className="text-sm text-indigo-300 hover:text-white ml-2"
              >
                Sign out
              </button>
            </>
          ) : (
            <Link href="/login" className="text-sm text-indigo-200 hover:text-white">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
