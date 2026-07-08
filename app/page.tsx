"use client";
/* eslint-disable react-hooks/set-state-in-effect */

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

  // Sync state
  const [isSyncOpen, setIsSyncOpen] = useState(false);
  const [fastSync, setFastSync] = useState(true);
  const [syncStatus, setSyncStatus] = useState<{
    loading: boolean;
    progress: string;
    error: string | null;
  }>({
    loading: false,
    progress: "",
    error: null,
  });

  const loadSummary = useCallback(async (isRefresh = false) => {
    setSummaryLoading(true);
    setSummaryError(null);
    const { from_date, until_date } = getDateRange(dateRange);
    try {
      const res = await fetch(`/api/summary?from_date=${from_date}&until_date=${until_date}${isRefresh ? "&refresh=true" : ""}`);
      if (!res.ok) throw new Error(await res.text());
      setSummary(await res.json());
    } catch (e) {
      setSummaryError(String(e));
    } finally {
      setSummaryLoading(false);
    }
  }, [dateRange]);

  const loadDocuments = useCallback(async (isRefresh = false) => {
    setDocsLoading(true);
    const { from_date, until_date } = getDateRange(dateRange);
    try {
      const res = await fetch(`/api/documents?from_date=${from_date}&until_date=${until_date}${isRefresh ? "&refresh=true" : ""}`);
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

  const handleSyncDashboard = async () => {
    setSyncStatus({ loading: true, progress: "מתחיל סנכרון נתונים...", error: null });
    try {
      // 1. Sync Customers
      setSyncStatus({ loading: true, progress: "שלב 1/2: מסנכרן לקוחות מריווחית...", error: null });
      const resCust = await fetch("/api/sync/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "customers" }),
      });
      if (!resCust.ok) throw new Error("סנכרון לקוחות נכשל");
      const custData = await resCust.json();
      
      // 2. Sync past 12 months, month by month
      setSyncStatus({ loading: true, progress: `שלב 2/2: סונכרנו ${custData.count} לקוחות. מתחיל סנכרון מסמכים לפי חודשים...`, error: null });
      
      for (let i = 11; i >= 0; i--) {
        const resMonth = await fetch("/api/sync/dashboard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "month", monthOffset: i, force: !fastSync }),
        });
        if (!resMonth.ok) throw new Error(`סנכרון מסמכים עבור חודש offset ${i} נכשל`);
        const monthData = await resMonth.json();
        
        if (monthData.skipped) {
          setSyncStatus({
            loading: true,
            progress: `שלב 2/2: חודש ${monthData.monthLabel} כבר מסונכרן (הסנכרון דולג לשמירה על מהירות ומניעת כפילויות).`,
            error: null,
          });
        } else {
          setSyncStatus({
            loading: true,
            progress: `שלב 2/2: סונכרן חודש ${monthData.monthLabel}. סונכרנו ${monthData.documentsCount} מסמכים ו-${monthData.paymentsCount} תשלומים...`,
            error: null,
          });
        }
      }

      setSyncStatus({ loading: false, progress: "הסנכרון הושלם בהצלחה!", error: null });
      setCustsLoaded(false); // Force reload customers
      loadSummary();
      loadDocuments();
    } catch (err) {
      console.error(err);
      setSyncStatus({
        loading: false,
        progress: "",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 pb-12">
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

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsSyncOpen(true)}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs sm:text-sm px-3.5 py-1.5 rounded-xl shadow transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              🔄 סנכרון נתונים
            </button>
            <button
              onClick={() => { loadSummary(true); loadDocuments(true); }}
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600 transition-colors px-3 py-1.5 rounded-lg hover:bg-indigo-50"
            >
              <span className={`text-base ${summaryLoading || docsLoading ? "animate-spin inline-block" : ""}`}>↻</span>
              רענן
            </button>
          </div>
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

        {summary && summary.totalCustomers === 0 && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl px-5 py-4 text-sm flex flex-col gap-2 shadow-sm">
            <div className="font-bold flex items-center gap-1.5">⚠️ בסיס הנתונים ריק</div>
            <p className="text-xs text-amber-600">
              נראה שאין עדיין נתונים בבסיס הנתונים של Supabase. אנא לחץ על כפתור <strong>סנכרון נתונים</strong> למעלה כדי לייבא לקוחות, מסמכים ותשלומים מריווחית.
            </p>
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

      {/* Sync Management Modal */}
      {isSyncOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-100 shadow-2xl w-full max-w-xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-black text-slate-800 text-base">סנכרון נתוני לוח הבקרה</h3>
                <p className="text-xs text-slate-400">ייבוא לקוחות, מסמכים ותשלומים מריווחית ל-Supabase</p>
              </div>
              <button
                onClick={() => setIsSyncOpen(false)}
                disabled={syncStatus.loading}
                className="text-slate-400 hover:text-slate-700 text-lg w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center transition-colors font-bold disabled:opacity-50"
              >
                ✕
              </button>
            </div>

            <div className="p-6 flex flex-col gap-6">
              <div className="flex flex-col gap-4 text-center">
                <p className="text-sm text-slate-600 leading-relaxed">
                  הסנכרון מייבא את כל הלקוחות הנוכחיים וכן את כל המסמכים והתשלומים עבור 12 החודשים האחרונים. סנכרון זה יאפשר ללוח הבקרה להיטען באופן מיידי.
                </p>

                <div className="flex items-center gap-2 justify-center bg-slate-50 p-3 rounded-2xl border border-slate-100 my-1">
                  <input
                    type="checkbox"
                    id="fast-sync-check"
                    checked={fastSync}
                    onChange={(e) => setFastSync(e.target.checked)}
                    disabled={syncStatus.loading}
                    className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
                  />
                  <label htmlFor="fast-sync-check" className="text-xs font-bold text-slate-700 cursor-pointer select-none">
                    סנכרון מהיר (דלג על חודשי עבר שכבר סונכרנו)
                  </label>
                </div>

                <button
                  onClick={handleSyncDashboard}
                  disabled={syncStatus.loading}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm px-6 py-3 rounded-xl disabled:opacity-50 transition-all hover:scale-[1.01] active:scale-[0.99] w-full"
                >
                  {syncStatus.loading ? "סנכרון בתהליך..." : "התחל סנכרון נתונים"}
                </button>
              </div>

              {syncStatus.progress && (
                <div className="flex flex-col gap-2 bg-emerald-50 text-emerald-800 px-4 py-3 rounded-2xl border border-emerald-100">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="text-xs font-bold">התקדמות:</span>
                  </div>
                  <p className="text-xs font-medium leading-relaxed">{syncStatus.progress}</p>
                </div>
              )}

              {syncStatus.error && (
                <div className="flex flex-col gap-2 bg-rose-50 text-rose-800 px-4 py-3 rounded-2xl border border-rose-100">
                  <div className="font-bold text-xs flex items-center gap-1.5">⚠️ שגיאה בסנכרון:</div>
                  <p className="text-xs font-medium leading-relaxed">{syncStatus.error}</p>
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setIsSyncOpen(false)}
                disabled={syncStatus.loading}
                className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs sm:text-sm px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
              >
                סגור
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
