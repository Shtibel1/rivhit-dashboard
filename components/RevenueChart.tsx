"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const HEBREW_MONTHS: Record<string, string> = {
  "01": "ינו׳", "02": "פבר׳", "03": "מרץ",  "04": "אפר׳",
  "05": "מאי",  "06": "יוני", "07": "יולי", "08": "אוג׳",
  "09": "ספט׳", "10": "אוק׳", "11": "נוב׳", "12": "דצמ׳",
};

function formatMonthLabel(key: string) {
  const [year, month] = key.split("-");
  return `${HEBREW_MONTHS[month] ?? month} ${year?.slice(2)}`;
}

function formatDayLabel(key: string) {
  // key is YYYY-MM-DD
  const [, month, day] = key.split("-");
  return `${parseInt(day)}/${parseInt(month)}`;
}

function formatILS(v: number) {
  if (v >= 1_000_000) return `₪${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `₪${(v / 1_000).toFixed(0)}K`;
  return `₪${v}`;
}

interface Props {
  revenueByMonth: Record<string, number> | undefined;
  revenueByDay: Record<string, number> | undefined;
  dateRange: string;
  loading: boolean;
}

export default function RevenueChart({ revenueByMonth, revenueByDay, dateRange, loading }: Props) {
  const isDaily = dateRange === "1m";

  const data = isDaily
    ? Object.entries(revenueByDay ?? {})
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => ({ name: formatDayLabel(key), revenue: value }))
    : Object.entries(revenueByMonth ?? {})
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => ({ name: formatMonthLabel(key), revenue: value }));

  const title = isDaily ? "הכנסות לפי יום" : "הכנסות לפי חודש";

  return (
    <div className="bg-white rounded-2xl shadow-sm p-6">
      <h2 className="text-base font-semibold text-slate-700 mb-4">{title}</h2>
      {loading ? (
        <div className="h-52 bg-slate-50 animate-pulse rounded-xl" />
      ) : data.length === 0 ? (
        <div className="h-52 flex items-center justify-center text-slate-400">אין נתונים</div>
      ) : (
        <ResponsiveContainer width="100%" height={210}>
          <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: isDaily ? 10 : 12, fill: "#64748b" }}
              axisLine={false}
              tickLine={false}
              interval={isDaily ? "preserveStartEnd" : 0}
            />
            <YAxis
              tickFormatter={formatILS}
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
              width={56}
            />
            <Tooltip
              formatter={(v) =>
                typeof v === "number"
                  ? new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(v)
                  : String(v)
              }
              labelStyle={{ direction: "rtl" }}
              contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 4px 24px rgba(0,0,0,.08)" }}
            />
            <Bar dataKey="revenue" fill="#6366f1" radius={[6, 6, 0, 0]} name="הכנסות" />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
