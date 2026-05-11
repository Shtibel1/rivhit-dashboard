"use client";

import { useState } from "react";
import type { Customer } from "@/lib/rivhit";

export default function CustomersTable({ customers, loading }: { customers: Customer[]; loading: boolean }) {
  const [search, setSearch] = useState("");

  const filtered = customers.filter(
    (c) =>
      !search ||
      c.customer_name?.includes(search) ||
      c.customer_email?.includes(search) ||
      c.customer_phone?.includes(search)
  );

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="p-5 border-b border-slate-100 flex flex-wrap gap-3 items-center justify-between">
        <h2 className="text-base font-semibold text-slate-700">לקוחות</h2>
        <input
          type="text"
          placeholder="חיפוש לקוח..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 w-52"
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-xs">
              <th className="text-right py-3 px-4 font-medium">שם לקוח</th>
              <th className="text-right py-3 px-4 font-medium">אימייל</th>
              <th className="text-right py-3 px-4 font-medium">טלפון</th>
              <th className="text-right py-3 px-4 font-medium">עיר</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-t border-slate-50">
                  {Array.from({ length: 4 }).map((__, j) => (
                    <td key={j} className="py-3 px-4">
                      <div className="h-4 bg-slate-100 animate-pulse rounded" />
                    </td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center py-10 text-slate-400">
                  לא נמצאו לקוחות
                </td>
              </tr>
            ) : (
              filtered.slice(0, 50).map((c) => (
                <tr key={c.customer_id} className="border-t border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-semibold text-xs shrink-0">
                        {c.customer_name?.charAt(0) ?? "?"}
                      </div>
                      <span className="font-medium text-slate-700">{c.customer_name}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-slate-500">{c.customer_email || "—"}</td>
                  <td className="py-3 px-4 text-slate-500 font-mono text-xs">{c.customer_phone || "—"}</td>
                  <td className="py-3 px-4 text-slate-500">{c.customer_city || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {!loading && filtered.length > 50 && (
        <p className="text-center text-xs text-slate-400 py-3">מוצגים 50 מתוך {filtered.length} לקוחות</p>
      )}
    </div>
  );
}
