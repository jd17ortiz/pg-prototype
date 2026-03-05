const STATUS_COLORS: Record<string, string> = {
  DRAFT:    "bg-yellow-100 text-yellow-800 border-yellow-300",
  REVIEW:   "bg-blue-100 text-blue-800 border-blue-300",
  ACTIVE:   "bg-green-100 text-green-800 border-green-300",
  ARCHIVED: "bg-gray-100 text-gray-500 border-gray-300",
  PARENT:   "bg-indigo-100 text-indigo-800 border-indigo-300",
  LOCAL:    "bg-teal-100 text-teal-800 border-teal-300",
  CHILD:    "bg-orange-100 text-orange-800 border-orange-300",
};

export default function Badge({ label }: { label: string }) {
  const cls = STATUS_COLORS[label] ?? "bg-gray-100 text-gray-700 border-gray-300";
  return (
    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded border ${cls}`}>
      {label}
    </span>
  );
}
