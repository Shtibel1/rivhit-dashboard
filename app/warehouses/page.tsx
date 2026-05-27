"use client";

import { useEffect, useState, useCallback } from "react";
import { format, subMonths, startOfMonth } from "date-fns";
import WarehousesChart from "@/components/WarehousesChart";
import type { MonthlyWarehouseData, WarehouseDocument, WarehousesResponse } from "@/app/api/warehouses/route";

type DateRange = "1m" | "3m" | "6m" | "12m" | "ytd";

const RANGE_LABELS: Record<DateRange, string> = {
  "1m": "חודש",
  "3m": "3 חודשים",
  "6m": "6 חודשים",
  "12m": "שנה אחרונה",
  ytd: "מתחילת שנה",
};

function getDateRange(range: DateRange): { from_date: string; until_date: string } {
  const now = new Date();
  const until_date = format(now, "yyyy-MM-dd");
  let from: Date;
  if (range === "ytd") {
    from = new Date(now.getFullYear(), 0, 1);
  } else {
    const months = { "1m": 1, "3m": 3, "6m": 6, "12m": 12 }[range];
    from = startOfMonth(subMonths(now, months - 1));
  }
  return { from_date: format(from, "yyyy-MM-dd"), until_date };
}

const HEBREW_MONTHS: Record<string, string> = {
  "01": "ינו׳", "02": "פבר׳", "03": "מרץ",  "04": "אפר׳",
  "05": "מאי",  "06": "יוני", "07": "יולי", "08": "אוג׳",
  "09": "ספט׳", "10": "אוק׳", "11": "נוב׳", "12": "דצמ׳",
};

function formatMonthLabel(key: string) {
  const [year, month] = key.split("-");
  return `${HEBREW_MONTHS[month] ?? month} ${year}`;
}

function formatILS(v: number) {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(v);
}

function StatCard({
  label,
  count,
  colorClass,
  loading,
}: {
  label: string;
  count: number;
  colorClass: string;
  loading: boolean;
}) {
  return (
    <div className={`bg-white rounded-2xl shadow-sm p-5 border-r-4 ${colorClass}`}>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">{label}</p>
      {loading ? (
        <div className="h-8 bg-slate-100 animate-pulse rounded-lg w-20" />
      ) : (
        <p className="text-3xl font-bold text-slate-800">
          {count} <span className="text-base font-normal text-slate-400">מכירות</span>
        </p>
      )}
    </div>
  );
}

export default function WarehousesPage() {
  const [dateRange, setDateRange] = useState<DateRange>("3m");
  const [data, setData] = useState<WarehousesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<"all" | "metal" | "wood">("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { from_date, until_date } = getDateRange(dateRange);
    try {
      const res = await fetch(`/api/warehouses?from_date=${from_date}&until_date=${until_date}`);
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    load();
  }, [load]);

  const monthly: MonthlyWarehouseData[] = data?.monthly ?? [];
  const totals = data?.totals ?? { metalCount: 0, woodCount: 0 };
  const allDocuments: WarehouseDocument[] = data?.documents ?? [];
  const filteredDocs = allDocuments.filter((d) =>
    filterType === "all" ? true : d.warehouseType === filterType,
  );

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">מחסנים ובונוסים</h1>
          <p className="text-sm text-slate-500 mt-0.5">כמות מכירות מחסני מתכת ועץ לפי חודש</p>
        </div>
        <div className="flex gap-1 bg-white rounded-xl shadow-sm p-1 border border-slate-200">
          {(Object.keys(RANGE_LABELS) as DateRange[]).map((r) => (
            <button
              key={r}
              onClick={() => setDateRange(r)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                dateRange === r
                  ? "bg-indigo-600 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {RANGE_LABELS[r]}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          שגיאה בטעינת הנתונים: {error}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="מחסני מתכת" count={totals.metalCount} colorClass="border-indigo-500" loading={loading} />
        <StatCard label="מחסני עץ" count={totals.woodCount} colorClass="border-amber-500" loading={loading} />
        <StatCard label="סה״כ מחסנים" count={totals.metalCount + totals.woodCount} colorClass="border-slate-400" loading={loading} />
      </div>

      {/* Chart */}
      <WarehousesChart data={monthly} loading={loading} />

      {/* Monthly table */}
      {!loading && monthly.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-base font-semibold text-slate-700">פירוט חודשי</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">חודש</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-indigo-500 uppercase tracking-wide">מחסני מתכת</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-amber-500 uppercase tracking-wide">מחסני עץ</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">סה״כ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...monthly].reverse().map((row) => (
                  <tr key={row.month} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-3 font-medium text-slate-700">{formatMonthLabel(row.month)}</td>
                    <td className="px-6 py-3 text-indigo-700 font-semibold">
                      {row.metalCount > 0 ? `${row.metalCount} מכירות` : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-6 py-3 text-amber-700 font-semibold">
                      {row.woodCount > 0 ? `${row.woodCount} מכירות` : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-6 py-3 font-bold text-slate-800">{row.metalCount + row.woodCount} מכירות</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                <tr>
                  <td className="px-6 py-3 font-bold text-slate-700">סה״כ</td>
                  <td className="px-6 py-3 font-bold text-indigo-700">{totals.metalCount}</td>
                  <td className="px-6 py-3 font-bold text-amber-700">{totals.woodCount}</td>
                  <td className="px-6 py-3 font-bold text-slate-800">{totals.metalCount + totals.woodCount}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Orders table */}
      {!loading && allDocuments.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-700">
              הזמנות מחסנים
              <span className="mr-2 text-sm font-normal text-slate-400">({filteredDocs.length})</span>
            </h2>
            <div className="flex gap-1 bg-slate-100 rounded-lg p-1 text-sm">
              {(["all", "metal", "wood"] as const).map((t) => {
                const labels = { all: "הכל", metal: "מתכת", wood: "עץ" };
                return (
                  <button
                    key={t}
                    onClick={() => setFilterType(t)}
                    className={`px-3 py-1 rounded-md font-medium transition-colors ${
                      filterType === t ? "bg-white shadow-sm text-slate-800" : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {labels[t]}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">תאריך</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">מס׳ מסמך</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">לקוח</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">סוג מחסן</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">סכום</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">שם מוצר</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDocs.map((doc) => (
                  <tr key={`${doc.document_number}-${doc.warehouseType}`} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{doc.document_date}</td>
                    <td className="px-4 py-3">
                      {doc.document_link ? (
                        <a
                          href={doc.document_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 hover:underline font-medium"
                        >
                          #{doc.document_number}
                        </a>
                      ) : (
                        <span className="text-slate-700 font-medium">#{doc.document_number}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-800 font-medium max-w-[180px] truncate">{doc.customer_name}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                          doc.warehouseType === "metal"
                            ? "bg-indigo-50 text-indigo-700"
                            : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {doc.warehouseType === "metal" ? "מתכת" : "עץ"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{formatILS(doc.amount)}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs max-w-[200px] truncate">
                      {doc.itemDetails || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}

