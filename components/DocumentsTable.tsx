"use client";

import { useState } from "react";
import { formatDisplayDate, type Document } from "@/lib/rivhit";

function formatILS(amount: number) {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: 0,
  }).format(amount);
}

export default function DocumentsTable({ docs, loading }: { docs: Document[]; loading: boolean }) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const safeDocs = Array.isArray(docs) ? docs : [];

  const filtered = safeDocs.filter((d) => {
    const matchType = typeFilter === "all" || d.document_type_name === typeFilter;
    const matchSearch =
      !search ||
      d.customer_name?.includes(search) ||
      String(d.document_number).includes(search);
    return matchType && matchSearch && !d.is_cancelled;
  });

  const docTypeNames = [...new Set(safeDocs.map((d) => d.document_type_name).filter(Boolean))].sort();

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="p-5 border-b border-slate-100 flex flex-wrap gap-3 items-center justify-between">
        <h2 className="text-base font-semibold text-slate-700">
          מסמכים
          {!loading && <span className="text-slate-400 font-normal text-sm mr-2">({filtered.length})</span>}
        </h2>
        <div className="flex gap-2 flex-wrap">
          <input
            type="text"
            placeholder="חיפוש לפי לקוח / מספר..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 w-52"
          />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          >
            <option value="all">כל הסוגים</option>
            {docTypeNames.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-xs">
              <th className="text-right py-3 px-4 font-medium">מספר</th>
              <th className="text-right py-3 px-4 font-medium">סוג</th>
              <th className="text-right py-3 px-4 font-medium">לקוח</th>
              <th className="text-right py-3 px-4 font-medium">תאריך</th>
              <th className="text-right py-3 px-4 font-medium">סכום</th>
              <th className="text-right py-3 px-4 font-medium">סטטוס</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-t border-slate-50">
                  {Array.from({ length: 6 }).map((__, j) => (
                    <td key={j} className="py-3 px-4">
                      <div className="h-4 bg-slate-100 animate-pulse rounded" />
                    </td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-10 text-slate-400">
                  לא נמצאו מסמכים
                </td>
              </tr>
            ) : (
              filtered.slice(0, 100).map((doc) => (
                <tr
                  key={`${doc.document_type}-${doc.document_number}`}
                  className="border-t border-slate-50 hover:bg-slate-50 transition-colors"
                >
                  <td className="py-3 px-4 font-mono text-slate-600">{doc.document_number}</td>
                  <td className="py-3 px-4">
                    <span className="bg-indigo-50 text-indigo-700 text-xs px-2 py-0.5 rounded-full">
                      {doc.document_type_name}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-700 font-medium">{doc.customer_name}</td>
                  <td className="py-3 px-4 text-slate-500">{formatDisplayDate(doc.document_date)}</td>
                  <td className="py-3 px-4 font-semibold text-slate-800">{formatILS(doc.amount)}</td>
                  <td className="py-3 px-4">
                    {doc.is_cancelled ? (
                      <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full">מבוטל</span>
                    ) : doc.is_closed ? (
                      <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full">סגור</span>
                    ) : (
                      <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">פתוח</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {!loading && filtered.length > 100 && (
        <p className="text-center text-xs text-slate-400 py-3">מוצגים 100 מתוך {filtered.length} מסמכים</p>
      )}
    </div>
  );
}
