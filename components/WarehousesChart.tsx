"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { MonthlyWarehouseData } from "@/app/api/warehouses/route";

const HEBREW_MONTHS: Record<string, string> = {
  "01": "ינו׳", "02": "פבר׳", "03": "מרץ",  "04": "אפר׳",
  "05": "מאי",  "06": "יוני", "07": "יולי", "08": "אוג׳",
  "09": "ספט׳", "10": "אוק׳", "11": "נוב׳", "12": "דצמ׳",
};

function formatMonthLabel(key: string) {
  const [year, month] = key.split("-");
  return `${HEBREW_MONTHS[month] ?? month} ${year?.slice(2)}`;
}

interface Props {
  data: MonthlyWarehouseData[];
  loading: boolean;
  monthlyTarget?: number; // optional bonus target line (count)
}

export default function WarehousesChart({ data, loading, monthlyTarget }: Props) {
  const chartData = data.map((d) => ({
    name: formatMonthLabel(d.month),
    "מחסני מתכת": d.metalCount,
    "מחסני עץ": d.woodCount,
  }));

  return (
    <div className="bg-white rounded-2xl shadow-sm p-6">
      <h2 className="text-base font-semibold text-slate-700 mb-4">כמות מכירות לפי חודש</h2>
      {loading ? (
        <div className="h-60 bg-slate-50 animate-pulse rounded-xl" />
      ) : chartData.length === 0 ? (
        <div className="h-60 flex flex-col items-center justify-center gap-2 text-slate-400">
          <span>אין נתונים לתצוגה</span>
          <span className="text-xs text-slate-300">
            הנתונים מסוננים לפי מילות המפתח &quot;מתכת&quot; ו&quot;עץ&quot; בשדות אסמכתא והערות
          </span>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 12, fill: "#64748b" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
              width={32}
            />
            <Tooltip
              formatter={(value, name) => [`${value ?? 0} מכירות`, name]}
              contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 13 }}
              cursor={{ fill: "#f8fafc" }}
            />
            <Legend wrapperStyle={{ fontSize: 13, paddingTop: 8 }} />
            {monthlyTarget != null && monthlyTarget > 0 && (
              <ReferenceLine
                y={monthlyTarget}
                stroke="#f59e0b"
                strokeDasharray="5 5"
                strokeWidth={2}
                label={{ value: `יעד: ${monthlyTarget}`, fill: "#b45309", fontSize: 12, position: "insideTopRight" }}
              />
            )}
            <Bar dataKey="מחסני מתכת" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={40} />
            <Bar dataKey="מחסני עץ" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={40} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

