"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState, useCallback } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";

interface ProductSale {
  item_id: number;
  sku: string;
  name: string;
  cost_price: number;
  sale_price: number;
  stock_quantity: number;
  category: string;
  unitsSold: number;
  revenue: number;
  avgMonthlySales: number;
  suggestedOrder: number;
  orderUrgency: string;
}

interface CategoryStat {
  name: string;
  count: number;
  unitsSold: number;
  revenue: number;
}

interface Summary {
  totalRevenue: number;
  totalUnitsSold: number;
  lowStockCount: number;
  outOfStockCount: number;
}

type DateRange = "1m" | "3m" | "6m" | "12m";

const CATEGORIES = [
  "במבוק ומוצרי עץ",
  "רשתות צל וברזנטים",
  "דשא סינטטי וחיפויים",
  "ריהוט גן",
  "השקייה וצנרת",
  "כלי עבודה וגינון",
  "אחר",
];

const COLORS = ["#4F46E5", "#06B6D4", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#64748B"];

export default function ImportPlanningPage() {
  const [range, setRange] = useState<DateRange>("6m");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [summary, setSummary] = useState<Summary | null>(null);
  const [topProducts, setTopProducts] = useState<ProductSale[]>([]);
  const [categoryStats, setCategoryStats] = useState<CategoryStat[]>([]);

  // Sync state
  const [isSyncOpen, setIsSyncOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{
    products: { loading: boolean; progress: string; error: string | null };
    sales: { loading: boolean; progress: string; error: string | null };
    classify: { loading: boolean; progress: string; error: string | null };
  }>({
    products: { loading: false, progress: "", error: null },
    sales: { loading: false, progress: "", error: null },
    classify: { loading: false, progress: "", error: null },
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sales-by-product?range=${range}&category=${selectedCategory}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setSummary(data.summary);
      setTopProducts(data.topProducts);
      setCategoryStats(data.categoryStats);
    } catch (e) {
      console.error(e);
      setError("שגיאה בטעינת נתונים. ייתכן שיש להריץ סנכרון ראשוני.");
    } finally {
      setLoading(false);
    }
  }, [range, selectedCategory]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Sync Products from Rivhit
  const handleSyncProducts = async () => {
    setSyncStatus((prev) => ({
      ...prev,
      products: { loading: true, progress: "טוען פריטים מריווחית...", error: null },
    }));

    try {
      const res = await fetch("/api/sync/products", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      
      setSyncStatus((prev) => ({
        ...prev,
        products: { loading: false, progress: `הושלם! סונכרנו ${data.count} מוצרים.`, error: null },
      }));
      loadData();
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setSyncStatus((prev) => ({
        ...prev,
        products: { loading: false, progress: "", error: errMsg },
      }));
    }
  };

  // Sync Sales in batches
  const handleSyncSales = async () => {
    setSyncStatus((prev) => ({
      ...prev,
      sales: { loading: true, progress: "מתחיל סנכרון מכירות...", error: null },
    }));

    try {
      let hasMore = true;
      let syncedTotal = 0;
      let lastRemainingCount: number | null = null;

      while (hasMore) {
        const res = await fetch("/api/sync/sales", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Sales sync failed");

        syncedTotal += data.syncedCount || 0;
        hasMore = data.hasMore;

        const remaining = data.remainingCount;
        console.log(`Sales batch sync progress: syncedCount=${data.syncedCount}, remainingCount=${remaining}, hasMore=${hasMore}`);

        if (lastRemainingCount !== null && remaining === lastRemainingCount && remaining > 0) {
          const errorMsg = `הסנכרון נתקע בלולאה: מספר המסמכים הנותרים (${remaining}) לא קטן מהאיטרציה הקודמת. אנא בדוק את לוג השרת.`;
          console.error(errorMsg);
          throw new Error(errorMsg);
        }
        lastRemainingCount = remaining;

        setSyncStatus((prev) => ({
          ...prev,
          sales: {
            loading: true,
            progress: `סונכרנו ${syncedTotal} מסמכים. נותרו עוד ${remaining}...`,
            error: null,
          },
        }));

        if (!hasMore) break;
      }

      setSyncStatus((prev) => ({
        ...prev,
        sales: { loading: false, progress: "סנכרון מכירות הושלם בהצלחה!", error: null },
      }));
      loadData();
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setSyncStatus((prev) => ({
        ...prev,
        sales: { loading: false, progress: "", error: errMsg },
      }));
    }
  };

  // Classify Products using Gemini / Keywords
  const handleSyncClassify = async () => {
    setSyncStatus((prev) => ({
      ...prev,
      classify: { loading: true, progress: "ממפה מוצרים לקטגוריות...", error: null },
    }));

    try {
      let hasMore = true;
      let classifiedTotal = 0;
      let lastRemainingCount: number | null = null;

      while (hasMore) {
        const res = await fetch("/api/sync/classify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Classification failed");

        classifiedTotal += data.classifiedCount || 0;
        hasMore = data.hasMore;

        const remaining = data.remainingCount;
        console.log(`Classification batch progress: classifiedCount=${data.classifiedCount}, remainingCount=${remaining}, hasMore=${hasMore}`);

        if (lastRemainingCount !== null && remaining === lastRemainingCount && remaining > 0) {
          const errorMsg = `מיפוי הקטגוריות נתקע בלולאה: מספר המוצרים הנותרים למיפוי (${remaining}) לא קטן מהאיטרציה הקודמת.`;
          console.error(errorMsg);
          throw new Error(errorMsg);
        }
        lastRemainingCount = remaining;

        setSyncStatus((prev) => ({
          ...prev,
          classify: {
            loading: true,
            progress: `מופה קטגוריות ל-${classifiedTotal} מוצרים. נותרו עוד ${remaining}... (${data.method})`,
            error: null,
          },
        }));

        if (!hasMore) break;
      }

      setSyncStatus((prev) => ({
        ...prev,
        classify: { loading: false, progress: "מיפוי הקטגוריות הושלם בהצלחה!", error: null },
      }));
      loadData();
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setSyncStatus((prev) => ({
        ...prev,
        classify: { loading: false, progress: "", error: errMsg },
      }));
    }
  };

  // Prepare data for bar chart
  const barChartData = topProducts.slice(0, 10).map((p) => ({
    name: p.name.length > 15 ? p.name.substring(0, 15) + "..." : p.name,
    "יחידות שנמכרו": p.unitsSold,
    "הכנסות (₪)": p.revenue,
  }));

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-12">
      {/* Top Banner */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow-md shadow-indigo-100">
              מ
            </div>
            <div>
              <h1 className="font-extrabold text-slate-900 text-lg sm:text-xl tracking-tight">
                תכנון יבוא ומכירות - מייגן גן ונוי
              </h1>
              <p className="text-xs text-slate-500 font-medium">ניהול מלאי חכם ומעקב דגמים מובילים</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsSyncOpen(true)}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs sm:text-sm px-4 py-2 rounded-xl shadow-lg shadow-indigo-100 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              🔄 סנכרון וניהול נתונים
            </button>
            <button
              onClick={loadData}
              className="flex items-center justify-center w-9 h-9 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
              title="רענן נתונים"
            >
              ↻
            </button>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="max-w-7xl mx-auto px-4 mt-6 flex flex-col gap-6">
        
        {/* Filters Card */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-500 ml-2">טווח זמן דוחות:</span>
            {(["1m", "3m", "6m", "12m"] as DateRange[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  range === r
                    ? "bg-slate-900 text-white shadow-md shadow-slate-900/10"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {r === "1m" ? "חודש אחרון" : r === "3m" ? "3 חודשים" : r === "6m" ? "6 חודשים" : "שנה אחרונה"}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="category-select" className="text-xs font-bold text-slate-500">סינון קטגוריה:</label>
            <select
              id="category-select"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl px-3 py-2 outline-none focus:border-indigo-500 focus:bg-white transition-colors"
            >
              <option value="all">כל הקטגוריות</option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl px-5 py-4 text-sm flex flex-col gap-2 shadow-sm">
            <div className="font-bold flex items-center gap-1.5">⚠️ {error}</div>
            <p className="text-xs text-amber-600">
              הנתונים נשמרים ב-Supabase ומסונכרנים מול ה-API של ריווחית. אנא לחץ על כפתור <strong>סנכרון וניהול נתונים</strong> למעלה כדי לייבא מוצרים ומסמכים.
            </p>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-400">מחזור מכירות לתקופה</p>
              <h3 className="text-xl sm:text-2xl font-black text-slate-900 mt-1">
                {loading ? "..." : `₪${(summary?.totalRevenue ?? 0).toLocaleString()}`}
              </h3>
            </div>
            <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-xl font-bold">
              ₪
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-400">סה&quot;כ יחידות שנמכרו</p>
              <h3 className="text-xl sm:text-2xl font-black text-slate-900 mt-1">
                {loading ? "..." : (summary?.totalUnitsSold ?? 0).toLocaleString()}
              </h3>
            </div>
            <div className="w-12 h-12 rounded-xl bg-cyan-55 hover:bg-cyan-50 text-cyan-600 flex items-center justify-center text-xl">
              📦
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-400">פריטים להזמנה (מתחת למלאי בטוח)</p>
              <h3 className="text-xl sm:text-2xl font-black text-amber-600 mt-1">
                {loading ? "..." : summary?.lowStockCount}
              </h3>
            </div>
            <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center text-xl">
              ⚠️
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-400">פריטים בחוסר (ללא מלאי)</p>
              <h3 className="text-xl sm:text-2xl font-black text-rose-600 mt-1">
                {loading ? "..." : summary?.outOfStockCount}
              </h3>
            </div>
            <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center text-xl">
              🚫
            </div>
          </div>
        </div>

        {/* Charts Section */}
        {!loading && topProducts.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Top 10 Products Chart */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 lg:col-span-2 flex flex-col gap-4">
              <h3 className="text-sm font-black text-slate-800">10 הדגמים הנמכרים ביותר (כמות מכירות)</h3>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barChartData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748B" }} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "#64748B" }} tickLine={false} />
                    <Tooltip cursor={{ fill: "#f8fafc" }} />
                    <Bar dataKey="יחידות שנמכרו" fill="#4F46E5" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Category Revenue Distribution Chart */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col gap-4">
              <h3 className="text-sm font-black text-slate-800">פילוח הכנסות לפי קטגוריות (₪)</h3>
              <div className="h-72 w-full flex flex-col items-center justify-center">
                {categoryStats.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryStats}
                        cx="50%"
                        cy="45%"
                        innerRadius={60}
                        outerRadius={85}
                        paddingAngle={3}
                        dataKey="revenue"
                      >
                        {categoryStats.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => `₪${Number(value).toLocaleString()}`} />
                      <Legend
                        verticalAlign="bottom"
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{ fontSize: 11, direction: "rtl" }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-xs text-slate-400">אין נתוני קטגוריות</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Top 30 Models Table */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-sm font-black text-slate-800">30 הדגמים המובילים במכירות</h3>
              <p className="text-xs text-slate-400 font-medium">מבוסס על היקף היחידות שנמכרו בתקופה שנבחרה</p>
            </div>
          </div>

          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
              <span className="w-8 h-8 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin"></span>
              <p className="text-xs font-bold mt-2">טוען נתונים מ-Supabase...</p>
            </div>
          ) : topProducts.length === 0 ? (
            <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center gap-4">
              <div className="text-4xl">📭</div>
              <div>
                <p className="font-bold text-slate-700">לא נמצאו מוצרים או נתוני מכירות</p>
                <p className="text-xs text-slate-400 mt-1">ייתכן שלא ביצעת סנכרון נתונים מריווחית עדיין.</p>
              </div>
              <button
                onClick={() => setIsSyncOpen(true)}
                className="bg-indigo-50 text-indigo-600 hover:bg-indigo-100 text-xs font-bold px-4 py-2 rounded-xl transition-colors"
              >
                פתח מסך סנכרון ראשוני
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-black text-xs">
                    <th className="px-5 py-3.5">מק&quot;ט / SKU</th>
                    <th className="px-5 py-3.5">שם דגם / מוצר</th>
                    <th className="px-5 py-3.5">קטגוריה (AI)</th>
                    <th className="px-5 py-3.5 text-center">יחידות שנמכרו</th>
                    <th className="px-5 py-3.5 text-center">סה&quot;כ הכנסה (₪)</th>
                    <th className="px-5 py-3.5 text-center">מלאי נוכחי</th>
                    <th className="px-5 py-3.5 text-center">מכירה חודשית ממוצעת</th>
                    <th className="px-5 py-3.5 text-center">הזמנה מומלצת</th>
                    <th className="px-5 py-3.5 text-center">דחיפות</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {topProducts.map((p) => {
                    let urgencyColor = "bg-slate-100 text-slate-600";
                    if (p.orderUrgency === "מיידי") {
                      urgencyColor = "bg-rose-50 text-rose-600 border border-rose-100";
                    } else if (p.orderUrgency === "בקרוב") {
                      urgencyColor = "bg-amber-50 text-amber-600 border border-amber-100";
                    } else if (p.orderUrgency === "אין צורך") {
                      urgencyColor = "bg-emerald-50 text-emerald-600 border border-emerald-100";
                    }

                    const stockWarning = p.stock_quantity <= 0;

                    return (
                      <tr key={p.item_id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-3.5 font-bold text-slate-500">{p.sku}</td>
                        <td className="px-5 py-3.5 font-bold text-slate-800 max-w-xs truncate" title={p.name}>
                          {p.name}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-bold text-[10px]">
                            {p.category}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-center font-bold text-indigo-600">
                          {p.unitsSold.toLocaleString()}
                        </td>
                        <td className="px-5 py-3.5 text-center font-black">
                          ₪{Math.round(p.revenue).toLocaleString()}
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <span className={`font-bold ${stockWarning ? "text-rose-600" : "text-slate-700"}`}>
                            {p.stock_quantity.toLocaleString()}
                          </span>
                          {stockWarning && <span className="text-[10px] text-rose-500 block">חסר במלאי!</span>}
                        </td>
                        <td className="px-5 py-3.5 text-center text-slate-500">{p.avgMonthlySales}</td>
                        <td className="px-5 py-3.5 text-center">
                          {p.suggestedOrder > 0 ? (
                            <span className="font-extrabold text-amber-600 text-sm bg-amber-50/50 px-2.5 py-1 rounded-lg">
                              {p.suggestedOrder.toLocaleString()}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-black ${urgencyColor}`}>
                            {p.orderUrgency}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Sync Management Modal */}
      {isSyncOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-100 shadow-2xl w-full max-w-xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-black text-slate-800 text-base">מרכז סנכרון וניהול נתונים</h3>
                <p className="text-xs text-slate-400">ייבוא נתונים מריווחית ומיפוי מוצרים בעזרת AI</p>
              </div>
              <button
                onClick={() => setIsSyncOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-lg w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center transition-colors font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-6 flex flex-col gap-6">
              {/* Step 1: Sync Products */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs font-black">1</span>
                    <span className="text-xs sm:text-sm font-black text-slate-800">סנכרון מוצרים ומלאי נוכחי</span>
                  </div>
                  <button
                    onClick={handleSyncProducts}
                    disabled={syncStatus.products.loading}
                    className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-3 py-1.5 rounded-xl disabled:opacity-50 transition-colors"
                  >
                    {syncStatus.products.loading ? "בסנכרון..." : "סנכרן מוצרים"}
                  </button>
                </div>
                {syncStatus.products.progress && (
                  <p className="text-xs text-emerald-600 font-bold bg-emerald-50 px-3 py-2 rounded-xl">
                    {syncStatus.products.progress}
                  </p>
                )}
                {syncStatus.products.error && (
                  <p className="text-xs text-rose-600 font-bold bg-rose-50 px-3 py-2 rounded-xl">
                    שגיאה: {syncStatus.products.error}
                  </p>
                )}
              </div>

              <hr className="border-slate-100" />

              {/* Step 2: Sync Sales History */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs font-black">2</span>
                    <span className="text-xs sm:text-sm font-black text-slate-800">סנכרון היסטוריית מכירות (6 חודשים)</span>
                  </div>
                  <button
                    onClick={handleSyncSales}
                    disabled={syncStatus.sales.loading}
                    className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-3 py-1.5 rounded-xl disabled:opacity-50 transition-colors"
                  >
                    {syncStatus.sales.loading ? "בסנכרון..." : "סנכרן מכירות"}
                  </button>
                </div>
                {syncStatus.sales.progress && (
                  <p className="text-xs text-emerald-600 font-bold bg-emerald-50 px-3 py-2 rounded-xl">
                    {syncStatus.sales.progress}
                  </p>
                )}
                {syncStatus.sales.error && (
                  <p className="text-xs text-rose-600 font-bold bg-rose-50 px-3 py-2 rounded-xl">
                    שגיאה: {syncStatus.sales.error}
                  </p>
                )}
              </div>

              <hr className="border-slate-100" />

              {/* Step 3: Categorize Products */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs font-black">3</span>
                    <span className="text-xs sm:text-sm font-black text-slate-800">סיווג מוצרים לקטגוריות בעזרת AI</span>
                  </div>
                  <button
                    onClick={handleSyncClassify}
                    disabled={syncStatus.classify.loading}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3 py-1.5 rounded-xl disabled:opacity-50 transition-colors"
                  >
                    {syncStatus.classify.loading ? "במיפוי..." : "מפה קטגוריות"}
                  </button>
                </div>
                {syncStatus.classify.progress && (
                  <p className="text-xs text-emerald-600 font-bold bg-emerald-50 px-3 py-2 rounded-xl">
                    {syncStatus.classify.progress}
                  </p>
                )}
                {syncStatus.classify.error && (
                  <p className="text-xs text-rose-600 font-bold bg-rose-50 px-3 py-2 rounded-xl">
                    שגיאה: {syncStatus.classify.error}
                  </p>
                )}
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setIsSyncOpen(false)}
                className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs sm:text-sm px-4 py-2 rounded-xl transition-colors"
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
