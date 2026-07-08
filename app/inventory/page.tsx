"use client";

import { useEffect, useState, useCallback } from "react";

interface Product {
  item_id: number;
  sku: string;
  name: string;
  cost_price: number;
  sale_price: number;
  stock_quantity: number;
  category: string | null;
  last_sync: string;
}

interface GlobalMetrics {
  total: number;
  outOfStock: number;
  lowStock: number;
  inStock: number;
}

interface Meta {
  totalFiltered: number;
  page: number;
  limit: number;
  totalPages: number;
  globalMetrics: GlobalMetrics;
  twilioConfigured: boolean;
  alertRecipientPhones: string;
}

const CATEGORIES = [
  "במבוק ומוצרי עץ",
  "רשתות צל וברזנטים",
  "דשא סינטטי וחיפויים",
  "ריהוט גן",
  "השקייה וצנרת",
  "כלי עבודה וגינון",
  "אחר",
];

export default function InventoryPage() {
  // Filters & State
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all"); // all, out_of_stock, low_stock, in_stock
  const [sortBy, setSortBy] = useState("stock_quantity"); // stock_quantity, name, sku, sale_price, cost_price
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const limit = 50;

  // Data State
  const [products, setProducts] = useState<Product[]>([]);
  const [metadata, setMetadata] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sync State
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncProgress, setSyncProgress] = useState("");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncSuccess, setSyncSuccess] = useState<string | null>(null);

  // WhatsApp Test State
  const [waLoading, setWaLoading] = useState(false);
  const [waMessage, setWaMessage] = useState<string | null>(null);
  const [waError, setWaError] = useState<string | null>(null);

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // Reset page on search
    }, 400);

    return () => clearTimeout(handler);
  }, [search]);

  // Load products list from API
  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const queryParams = new URLSearchParams({
        search: debouncedSearch,
        category: selectedCategory,
        status: selectedStatus,
        sort: sortBy,
        order: sortOrder,
        page: String(page),
        limit: String(limit),
      });

      const res = await fetch(`/api/products?${queryParams.toString()}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setProducts(data.products || []);
      setMetadata(data.metadata || null);
    } catch (e) {
      console.error(e);
      setError("שגיאה בטעינת נתוני המלאי. אנא ודא שהסנכרון תקין.");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, selectedCategory, selectedStatus, sortBy, sortOrder, page]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  // Handle Manual Products Sync
  const handleProductsSync = async () => {
    setSyncLoading(true);
    setSyncProgress("מתחיל סנכרון מוצרים מריווחית...");
    setSyncError(null);
    setSyncSuccess(null);

    try {
      const res = await fetch("/api/sync/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || "סנכרון המוצרים נכשל");
      }

      const data = await res.json();
      setSyncSuccess(`סונכרנו בהצלחה ${data.count} מוצרים! נשלחו ${data.alertsSent} התרעות מלאי.`);
      loadProducts(); // Reload products to display updated data
    } catch (err) {
      console.error(err);
      setSyncError(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncLoading(false);
      setSyncProgress("");
    }
  };

  // Handle Send Test WhatsApp Alert
  const handleSendTestWhatsApp = async () => {
    setWaLoading(true);
    setWaMessage(null);
    setWaError(null);

    try {
      const res = await fetch("/api/sync/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ send_test_whatsapp: true }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || "שליחת הודעת בדיקה נכשלה");
      }

      const data = await res.json();
      setWaMessage(data.message || "הודעת הבדיקה נשלחה בהצלחה לנמענים המוגדרים!");
    } catch (err) {
      console.error(err);
      setWaError(err instanceof Error ? err.message : String(err));
    } finally {
      setWaLoading(false);
    }
  };

  // Helper to format currency
  const formatILS = (v: number) => {
    return new Intl.NumberFormat("he-IL", {
      style: "currency",
      currency: "ILS",
      maximumFractionDigits: 0,
    }).format(v);
  };

  // Helper to format date
  const formatDate = (dateStr: string) => {
    if (!dateStr) return "—";
    try {
      const date = new Date(dateStr);
      return date.toLocaleString("he-IL", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  const metrics = metadata?.globalMetrics || { total: 0, outOfStock: 0, lowStock: 0, inStock: 0 };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 pb-12">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow">
              מ
            </div>
            <div>
              <h1 className="font-bold text-slate-800 text-base leading-tight">דשבורד ניהול מלאי</h1>
              <p className="text-xs text-slate-400 leading-tight">מלאי מוצרים בזמן אמת</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadProducts}
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600 transition-colors px-3 py-1.5 rounded-lg hover:bg-indigo-50"
            >
              <span className={`text-base ${loading ? "animate-spin inline-block" : ""}`}>↻</span>
              רענן
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 flex flex-col gap-6">
        {/* Metric Cards Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total */}
          <div className="bg-white rounded-2xl shadow-sm p-5 border-r-4 border-indigo-600">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">סה"כ מוצרים במערכת</p>
            {loading && !metadata ? (
              <div className="h-8 bg-slate-100 animate-pulse rounded-lg w-20" />
            ) : (
              <p className="text-3xl font-black text-slate-800">{metrics.total}</p>
            )}
          </div>

          {/* Card 2: Out of Stock */}
          <div className="bg-white rounded-2xl shadow-sm p-5 border-r-4 border-rose-500">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">אזל מהמלאי (0 יח')</p>
            {loading && !metadata ? (
              <div className="h-8 bg-slate-100 animate-pulse rounded-lg w-20" />
            ) : (
              <p className="text-3xl font-black text-rose-600">{metrics.outOfStock}</p>
            )}
          </div>

          {/* Card 3: Low Stock */}
          <div className="bg-white rounded-2xl shadow-sm p-5 border-r-4 border-amber-500">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">מלאי נמוך (1-3 יח')</p>
            {loading && !metadata ? (
              <div className="h-8 bg-slate-100 animate-pulse rounded-lg w-20" />
            ) : (
              <p className="text-3xl font-black text-amber-600">{metrics.lowStock}</p>
            )}
          </div>

          {/* Card 4: In Stock */}
          <div className="bg-white rounded-2xl shadow-sm p-5 border-r-4 border-emerald-500">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">במלאי תקין (&gt;3 יח')</p>
            {loading && !metadata ? (
              <div className="h-8 bg-slate-100 animate-pulse rounded-lg w-20" />
            ) : (
              <p className="text-3xl font-black text-emerald-600">{metrics.inStock}</p>
            )}
          </div>
        </div>

        {/* Database Empty Alert */}
        {!loading && metrics.total === 0 && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl px-5 py-4 text-sm flex flex-col gap-2 shadow-sm">
            <div className="font-bold flex items-center gap-1.5">⚠️ מסד הנתונים ריק ממוצרים</div>
            <p className="text-xs text-amber-600">
              לא נמצאו מוצרים מסונכרנים בבסיס הנתונים. אנא לחץ על כפתור <strong>סנכרן מלאי מריווחית</strong> בפנל הצדי כדי לייבא את המוצרים.
            </p>
          </div>
        )}

        {/* Content Section: Toolbar + Grid (Table + Sidebar) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Main Table Area (col-span-9) */}
          <div className="lg:col-span-9 flex flex-col gap-4">
            
            {/* Toolbar Card */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200/80 flex flex-col gap-4">
              <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                
                {/* Search Input */}
                <div className="relative w-full md:max-w-xs">
                  <span className="absolute inset-y-0 right-3 flex items-center text-slate-400 pointer-events-none">🔍</span>
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="חיפוש לפי שם מוצר או מק״ט..."
                    className="w-full pl-3 pr-9 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                  {search && (
                    <button
                      onClick={() => setSearch("")}
                      className="absolute inset-y-0 left-3 flex items-center text-slate-400 hover:text-slate-600 font-bold"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Category Dropdown */}
                <div className="w-full md:max-w-xs flex items-center gap-2">
                  <label className="text-xs font-semibold text-slate-500 shrink-0">קטגוריה:</label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => {
                      setSelectedCategory(e.target.value);
                      setPage(1);
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="all">כל הקטגוריות</option>
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Sort Controls */}
                <div className="w-full md:max-w-xs flex items-center gap-2">
                  <label className="text-xs font-semibold text-slate-500 shrink-0">מיין לפי:</label>
                  <select
                    value={sortBy}
                    onChange={(e) => {
                      setSortBy(e.target.value);
                      setPage(1);
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="stock_quantity">כמות מלאי</option>
                    <option value="name">שם מוצר</option>
                    <option value="sku">מק"ט</option>
                    <option value="sale_price">מחיר מכירה</option>
                    <option value="cost_price">מחיר עלות</option>
                    <option value="last_sync">סנכרון אחרון</option>
                  </select>
                  <button
                    onClick={() => setSortOrder(prev => prev === "asc" ? "desc" : "asc")}
                    className="p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs hover:bg-slate-100 transition-colors"
                    title={sortOrder === "asc" ? "סדר עולה" : "סדר יורד"}
                  >
                    {sortOrder === "asc" ? "▲" : "▼"}
                  </button>
                </div>

              </div>

              {/* Status Tabs */}
              <div className="flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
                <button
                  onClick={() => { setSelectedStatus("all"); setPage(1); }}
                  className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    selectedStatus === "all"
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  הכל ({metrics.total})
                </button>
                <button
                  onClick={() => { setSelectedStatus("out_of_stock"); setPage(1); }}
                  className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    selectedStatus === "out_of_stock"
                      ? "bg-rose-600 text-white shadow-sm"
                      : "bg-rose-50 text-rose-600 hover:bg-rose-100"
                  }`}
                >
                  אזל מהמלאי ({metrics.outOfStock})
                </button>
                <button
                  onClick={() => { setSelectedStatus("low_stock"); setPage(1); }}
                  className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    selectedStatus === "low_stock"
                      ? "bg-amber-600 text-white shadow-sm"
                      : "bg-amber-50 text-amber-600 hover:bg-amber-100"
                  }`}
                >
                  מלאי נמוך ({metrics.lowStock})
                </button>
                <button
                  onClick={() => { setSelectedStatus("in_stock"); setPage(1); }}
                  className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    selectedStatus === "in_stock"
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                  }`}
                >
                  במלאי תקין ({metrics.inStock})
                </button>
              </div>
            </div>

            {/* Products Table Card */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold text-xs uppercase tracking-wider">
                      <th className="px-6 py-4">מק"ט (SKU)</th>
                      <th className="px-6 py-4">שם המוצר</th>
                      <th className="px-6 py-4">קטגוריה</th>
                      <th className="px-6 py-4">מלאי נוכחי</th>
                      <th className="px-6 py-4">עלות קניה</th>
                      <th className="px-6 py-4">מחיר מכירה</th>
                      <th className="px-6 py-4">סנכרון אחרון</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      // Skeleton Loading
                      Array.from({ length: 5 }).map((_, i) => (
                        <tr key={i} className="animate-pulse">
                          <td className="px-6 py-4"><div className="h-4 bg-slate-100 rounded w-16" /></td>
                          <td className="px-6 py-4"><div className="h-4 bg-slate-100 rounded w-48" /></td>
                          <td className="px-6 py-4"><div className="h-4 bg-slate-100 rounded w-24" /></td>
                          <td className="px-6 py-4"><div className="h-4 bg-slate-100 rounded w-12" /></td>
                          <td className="px-6 py-4"><div className="h-4 bg-slate-100 rounded w-16" /></td>
                          <td className="px-6 py-4"><div className="h-4 bg-slate-100 rounded w-16" /></td>
                          <td className="px-6 py-4"><div className="h-4 bg-slate-100 rounded w-28" /></td>
                        </tr>
                      ))
                    ) : products.length === 0 ? (
                      // Empty State
                      <tr>
                        <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                          לא נמצאו מוצרים העונים לסינון הנוכחי.
                        </td>
                      </tr>
                    ) : (
                      // Products Rows
                      products.map((p) => {
                        const stock = p.stock_quantity;
                        let rowClass = "hover:bg-slate-50 transition-colors";
                        let stockBadgeClass = "";
                        let stockText = `${stock} יחידות`;

                        if (stock <= 0) {
                          rowClass = "bg-rose-50/20 hover:bg-rose-50/40 transition-colors";
                          stockBadgeClass = "bg-rose-100 text-rose-700 font-bold border border-rose-200";
                          stockText = "אזל מהמלאי";
                        } else if (stock <= 3) {
                          rowClass = "bg-amber-50/20 hover:bg-amber-50/40 transition-colors";
                          stockBadgeClass = "bg-amber-100 text-amber-700 font-bold border border-amber-200";
                        } else {
                          stockBadgeClass = "bg-emerald-50 text-emerald-700 border border-emerald-100";
                        }

                        return (
                          <tr key={p.item_id} className={rowClass}>
                            <td className="px-6 py-4 font-mono text-xs text-slate-500 font-bold">{p.sku || "—"}</td>
                            <td className="px-6 py-4 text-slate-800 font-semibold">{p.name}</td>
                            <td className="px-6 py-4 text-xs text-slate-500">{p.category || "ללא קטגוריה"}</td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${stockBadgeClass}`}>
                                {stockText}
                              </span>
                            </td>
                            <td className="px-6 py-4 font-medium text-slate-600">{formatILS(p.cost_price)}</td>
                            <td className="px-6 py-4 font-bold text-slate-700">{formatILS(p.sale_price)}</td>
                            <td className="px-6 py-4 text-xs text-slate-400">{formatDate(p.last_sync)}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Footer */}
              {metadata && metadata.totalPages > 1 && (
                <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex items-center justify-between">
                  <button
                    onClick={() => setPage((p) => Math.max(p - 1, 1))}
                    disabled={page === 1 || loading}
                    className="px-3 py-1.5 bg-white border border-slate-300 text-slate-600 rounded-lg text-xs font-semibold hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    ← קודם
                  </button>
                  <span className="text-xs text-slate-500 font-bold">
                    עמוד {page} מתוך {metadata.totalPages} (מוצגים {products.length} מתוך {metadata.totalFiltered})
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(p + 1, metadata.totalPages))}
                    disabled={page === metadata.totalPages || loading}
                    className="px-3 py-1.5 bg-white border border-slate-300 text-slate-600 rounded-lg text-xs font-semibold hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    הבא ←
                  </button>
                </div>
              )}
            </div>

          </div>

          {/* Sidebar Area (col-span-3) */}
          <div className="lg:col-span-3 flex flex-col gap-6 w-full">
            
            {/* Sync Management Panel */}
            <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm flex flex-col gap-4">
              <div>
                <h3 className="font-black text-slate-800 text-sm">סנכרון נתוני מוצרים</h3>
                <p className="text-xs text-slate-400 mt-1">ייבוא מוצרים ורמות מלאי עדכניות מריווחית</p>
              </div>

              <button
                onClick={handleProductsSync}
                disabled={syncLoading}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-3 rounded-xl disabled:opacity-50 transition-all hover:scale-[1.01] active:scale-[0.99] w-full flex items-center justify-center gap-2"
              >
                {syncLoading ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    סונכרן...
                  </>
                ) : (
                  "🔄 סנכרן מלאי מריווחית"
                )}
              </button>

              {syncProgress && (
                <div className="bg-indigo-50 text-indigo-800 px-3 py-2.5 rounded-xl border border-indigo-100 flex flex-col gap-1">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
                    <span className="text-[10px] font-bold">מצב סנכרון:</span>
                  </div>
                  <p className="text-[11px] leading-tight font-medium">{syncProgress}</p>
                </div>
              )}

              {syncSuccess && (
                <div className="bg-emerald-50 text-emerald-800 px-3 py-2.5 rounded-xl border border-emerald-100">
                  <p className="text-[11px] leading-tight font-bold">✓ {syncSuccess}</p>
                </div>
              )}

              {syncError && (
                <div className="bg-rose-50 text-rose-800 px-3 py-2.5 rounded-xl border border-rose-100">
                  <p className="text-[11px] leading-tight font-bold">⚠️ שגיאה: {syncError}</p>
                </div>
              )}
            </div>

            {/* WhatsApp Stock Alerts Panel */}
            <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm flex flex-col gap-4">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-black text-slate-800 text-sm">התרעות מלאי ב-WhatsApp</h3>
                  <p className="text-xs text-slate-400 mt-1">מערכת התרעות במקרה של אזילת מלאי (0 יח')</p>
                </div>
                {metadata?.twilioConfigured ? (
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-full border border-emerald-200">
                    פעיל
                  </span>
                ) : (
                  <span className="px-2 py-0.5 bg-rose-100 text-rose-700 text-[10px] font-bold rounded-full border border-rose-200" title="חסרים משתני סביבה ב-env">
                    כבוי
                  </span>
                )}
              </div>

              <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 flex flex-col gap-2">
                <div className="flex justify-between text-[11px] leading-normal text-slate-500">
                  <span>תבנית Meta:</span>
                  <span className="font-mono font-bold text-slate-700">stock_warning_alert_v2</span>
                </div>
                <div className="flex flex-col text-[11px] leading-normal text-slate-500 border-t border-slate-200/60 pt-1.5">
                  <span>נמענים (WhatsApp):</span>
                  <span className="font-mono text-slate-700 font-bold text-[10px] break-all max-h-12 overflow-y-auto mt-0.5">
                    {metadata?.alertRecipientPhones || "לא מוגדר"}
                  </span>
                </div>
              </div>

              <button
                onClick={handleSendTestWhatsApp}
                disabled={waLoading}
                className="bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs px-4 py-3 rounded-xl disabled:opacity-50 transition-all hover:scale-[1.01] active:scale-[0.99] w-full flex items-center justify-center gap-2"
              >
                {waLoading ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    שולח...
                  </>
                ) : (
                  "🧪 שלח הודעת בדיקה"
                )}
              </button>

              {waMessage && (
                <div className="bg-emerald-50 text-emerald-800 px-3 py-2.5 rounded-xl border border-emerald-100">
                  <p className="text-[11px] leading-tight font-bold">✓ {waMessage}</p>
                </div>
              )}

              {waError && (
                <div className="bg-rose-50 text-rose-800 px-3 py-2.5 rounded-xl border border-rose-100">
                  <p className="text-[11px] leading-tight font-bold">⚠️ שגיאה בשליחה: {waError}</p>
                </div>
              )}
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
