"use client";

import { useEffect, useState, useCallback } from "react";
import { format, subMonths, startOfMonth } from "date-fns";
import StatsCards from "@/components/StatsCards";
import RevenueChart from "@/components/RevenueChart";
import DocumentsTable from "@/components/DocumentsTable";
import CustomersTable from "@/components/CustomersTable";
import type { Document, Customer } from "@/lib/rivhit";

type Tab = "documents" | "customers";
type DateRange = "1m" | "3m" | "6m" | "12m" | "ytd";

interface Summary {
  totalRevenue: number;
  openDocuments: number;
  totalCustomers: number;
  totalPayments: number;
  revenueByMonth: Record<string, number>;
  revenueByDay: Record<string, number>;
}

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

const RANGE_LABELS: Record<DateRange, string> = {
  "1m": "חודש אחרון",
  "3m": "3 חודשים",
  "6m": "6 חודשים",
  "12m": "שנה אחרונה",
  ytd: "מתחילת שנה",
};

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<Tab>("documents");
  const [dateRange, setDateRange] = useState<DateRange>("6m");

  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [documents, setDocuments] = useState<Document[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [custsLoading, setCustsLoading] = useState(false);
  const [custsLoaded, setCustsLoaded] = useState(false);

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError(null);
    const { from_date, until_date } = getDateRange(dateRange);
    try {
      const res = await fetch(`/api/summary?from_date=${from_date}&until_date=${until_date}`);
      if (!res.ok) throw new Error(await res.text());
      setSummary(await res.json());
    } catch (e) {
      setSummaryError(String(e));
    } finally {
      setSummaryLoading(false);
    }
  }, [dateRange]);

  const loadDocuments = useCallback(async () => {
    setDocsLoading(true);
    const { from_date, until_date } = getDateRange(dateRange);
    try {
      const res = await fetch(`/api/documents?from_date=${from_date}&until_date=${until_date}`);
      if (res.ok) setDocuments(await res.json());
    } finally {
      setDocsLoading(false);
    }
  }, [dateRange]);

  const loadCustomers = useCallback(async () => {
    if (custsLoaded) return;
    setCustsLoading(true);
    try {
      const res = await fetch("/api/customers");
      if (res.ok) {
        setCustomers(await res.json());
        setCustsLoaded(true);
      }
    } finally {
      setCustsLoading(false);
    }
  }, [custsLoaded]);

  useEffect(() => {
    loadSummary();
    loadDocuments();
  }, [loadSummary, loadDocuments]);

  useEffect(() => {
    if (activeTab === "customers") loadCustomers();
  }, [activeTab, loadCustomers]);

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow">
              ר
            </div>
            <div>
              <h1 className="font-bold text-slate-800 text-base leading-tight">לוח בקרה עסקי</h1>
              <p className="text-xs text-slate-400 leading-tight">ריווחית</p>
            </div>
          </div>

          <div className="flex bg-slate-100 rounded-xl p-1 gap-0.5">
            {(Object.keys(RANGE_LABELS) as DateRange[]).map((r) => (
              <button
                key={r}
                onClick={() => setDateRange(r)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  dateRange === r
                    ? "bg-white text-indigo-600 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {RANGE_LABELS[r]}
              </button>
            ))}
          </div>

          <button
            onClick={() => { loadSummary(); loadDocuments(); }}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600 transition-colors px-3 py-1.5 rounded-lg hover:bg-indigo-50"
          >
            <span className={`text-base ${summaryLoading || docsLoading ? "animate-spin inline-block" : ""}`}>↻</span>
            רענן
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 flex flex-col gap-6">
        {summaryError && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl px-5 py-4 text-sm">
            <strong>שגיאה בטעינת נתונים:</strong> {summaryError}
            <br />
            <span className="text-xs text-red-500 mt-1 block">
              ודא שה-API token מוגדר נכון בקובץ <code className="bg-red-100 px-1 rounded">.env.local</code>
            </span>
          </div>
        )}

        <StatsCards stats={summary} loading={summaryLoading} />

        <RevenueChart
          revenueByMonth={summary?.revenueByMonth}
          revenueByDay={summary?.revenueByDay}
          dateRange={dateRange}
          loading={summaryLoading}
        />

        <div className="flex gap-1 bg-slate-200 rounded-xl p-1 w-fit">
          <button
            onClick={() => setActiveTab("documents")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === "documents"
                ? "bg-white text-indigo-600 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            📄 מסמכים
          </button>
          <button
            onClick={() => setActiveTab("customers")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === "customers"
                ? "bg-white text-indigo-600 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            👥 לקוחות
          </button>
        </div>

        {activeTab === "documents" && <DocumentsTable docs={documents} loading={docsLoading} />}
        {activeTab === "customers" && <CustomersTable customers={customers} loading={custsLoading} />}
      </main>
    </div>
  );
}
