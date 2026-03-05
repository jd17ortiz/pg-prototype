"use client";
import Link from "next/link";

const STEPS = [
  {
    step: 1,
    title: "Template Builder",
    role: "RD_ENGINEER (Anna Müller)",
    description: "Explore and build document templates.",
    actions: [
      { label: "Open Template Library", href: "/templates" },
    ],
    detail: `Navigate to Templates → open "EU Processleitplan". See the 3-sheet layout with mixed sections (fieldGrid, parameterTable, table, richText, media, flowDiagram, changeHistory). Switch to Preview mode to see the print-like layout with header repeated per sheet. Try adding a new sheet or section using the buttons.`,
  },
  {
    step: 2,
    title: "Create New Guideline",
    role: "RD_ENGINEER or MT_ENGINEER",
    description: "Use the wizard to create a new guideline from an active template.",
    actions: [
      { label: "Create New Guideline", href: "/guidelines/new" },
    ],
    detail: `Click "New Guideline". Select type (LOCAL, PARENT, or CHILD), site, and an active template version. A DRAFT version is created automatically. The editor opens with all sections rendered from the template schema.`,
  },
  {
    step: 3,
    title: "Edit Guideline & Autosave",
    role: "RD_ENGINEER or MT_ENGINEER",
    description: "Fill in the dynamic form, edit parameter tables, and watch autosave work.",
    actions: [
      { label: "Open Guidelines List", href: "/guidelines" },
    ],
    detail: `Open the Child guideline "Alpha Compound – Processleitplan (US)". Navigate between sheets using the sidebar. Edit field grid values, add rows to tables, update parameter values. Notice: locked parameters (pH min/max, Agitator Speed) show as read-only. The Parameter Registry side panel lets you search across all parameters. Autosave triggers 2 seconds after each change. Try navigating away — the browser will warn about unsaved changes.`,
  },
  {
    step: 4,
    title: "Submit for Review → Approve",
    role: "MT_ENGINEER submits, APPROVER approves",
    description: "Walk through the full governance workflow.",
    actions: [
      { label: "Open Approval Inbox", href: "/inbox" },
    ],
    detail: `(1) Log in as Klaus Weber (MT_ENGINEER). Open the Child guideline DRAFT. Click "Submit for Review". (2) Log out, log in as Dr. Hans Braun (APPROVER). Go to Approval Inbox — the submission appears. Open the guideline, click "Review / Approve". Select Approve or Reject with a comment. On Approve: the version becomes ACTIVE; any previous ACTIVE version is archived automatically. Separation of duties is enforced server-side.`,
  },
  {
    step: 5,
    title: "New Version from Active",
    role: "RD_ENGINEER",
    description: "Create a new draft from an active guideline version.",
    actions: [
      { label: "Open Active Parent Guideline", href: "/guidelines/gl-parent-eu-001" },
    ],
    detail: `Open the ACTIVE Parent guideline "Alpha Compound – Processleitplan". Click "New Version". A DRAFT copy is created with all content from the active version. Before submitting for review, a Reason for Change is required (enforced server-side for versions > 1). Edit, submit, and approve to make it the new active version.`,
  },
  {
    step: 6,
    title: "Parent → Child Clone & Print View",
    role: "RD_ENGINEER + Print",
    description: "Clone a parent guideline to a child site, then print.",
    actions: [
      { label: "Open Parent Guideline", href: "/guidelines/gl-parent-eu-001" },
      { label: "Print Active Guideline", href: "/guidelines/gl-parent-eu-001/print" },
    ],
    detail: `On the ACTIVE Parent guideline, click "Clone to Child". Enter a name and pick a target site — the active content copies to a new Child guideline as a DRAFT. Locked parameters (pH min/max) are preserved and read-only in the child. For Print View: click "Print" or open the /print route. The print layout renders the header on every sheet and shows all sections formatted for PDF. Use browser Print / Save as PDF.`,
  },
];

export default function DemoPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-indigo-900 mb-2">Demo Script — 6-Step Walkthrough</h1>
        <p className="text-gray-600">
          This prototype implements the full PASS 1 feature set. Follow these steps to explore all capabilities.
          Use the <Link href="/login" className="text-indigo-600 hover:underline">Login page</Link> to switch roles.
        </p>
      </div>

      {/* Quick links */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-8">
        <div className="font-semibold text-indigo-900 mb-3 text-sm">Quick Navigation</div>
        <div className="flex flex-wrap gap-2">
          {[
            { href: "/guidelines", label: "Guidelines" },
            { href: "/templates",  label: "Templates" },
            { href: "/inbox",      label: "Approval Inbox" },
            { href: "/guidelines/gl-parent-eu-001", label: "Parent Guideline" },
            { href: "/guidelines/gl-local-eu-001",  label: "Local SOP" },
            { href: "/guidelines/gl-child-us-001",  label: "Child (US)" },
            { href: "/templates/tmpl-eu-plp",       label: "EU Processleitplan Template" },
          ].map(l => (
            <Link key={l.href} href={l.href} className="px-3 py-1.5 bg-white border border-indigo-200 rounded text-sm text-indigo-700 hover:bg-indigo-100">
              {l.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Seed Users Reference */}
      <div className="bg-white border rounded-xl p-4 mb-8">
        <div className="font-semibold text-gray-700 mb-3 text-sm">Seeded Users (click to use)</div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {[
            { name: "Anna Müller",    role: "RD_ENGINEER", site: "EU" },
            { name: "Klaus Weber",    role: "MT_ENGINEER", site: "EU" },
            { name: "Dr. Hans Braun",role: "APPROVER",    site: "EU" },
            { name: "Petra Lang",     role: "OPERATOR",    site: "EU" },
            { name: "James Carter",   role: "RD_ENGINEER", site: "US" },
            { name: "Sarah Johnson",  role: "MT_ENGINEER", site: "US" },
            { name: "Dr. Mark Davis", role: "APPROVER",    site: "US" },
            { name: "Lisa Brown",     role: "OPERATOR",    site: "US" },
          ].map(u => (
            <div key={u.name} className="flex items-center gap-2 py-1 border-b border-gray-100">
              <span className="font-medium text-gray-800 w-28 shrink-0">{u.name}</span>
              <span className="text-gray-500">{u.role}</span>
              <span className="text-gray-400 ml-auto">{u.site}</span>
            </div>
          ))}
        </div>
        <Link href="/login" className="mt-3 inline-block text-xs text-indigo-600 hover:underline">→ Go to login page to switch user</Link>
      </div>

      {/* Steps */}
      <div className="space-y-6">
        {STEPS.map((s) => (
          <div key={s.step} className="bg-white border rounded-xl overflow-hidden shadow-sm">
            <div className="bg-gray-50 border-b px-5 py-3 flex items-center gap-4">
              <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shrink-0">
                {s.step}
              </div>
              <div>
                <div className="font-semibold text-gray-900">{s.title}</div>
                <div className="text-xs text-indigo-600">{s.role}</div>
              </div>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-gray-700 mb-3">{s.description}</p>
              <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600 mb-4 leading-relaxed">
                {s.detail}
              </div>
              <div className="flex gap-2 flex-wrap">
                {s.actions.map(a => (
                  <Link key={a.href} href={a.href} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium">
                    {a.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-10 p-5 bg-green-50 border border-green-200 rounded-xl text-sm text-green-800">
        <strong>Data persistence:</strong> All data is stored as JSON under <code>/data/</code> with atomic writes (temp+rename). Run <code>npm run seed</code> to reset to demo data at any time.
      </div>
    </div>
  );
}
