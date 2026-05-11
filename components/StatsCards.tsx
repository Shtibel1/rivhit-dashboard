"use client";

interface Stats {
  totalRevenue: number;
  openDocuments: number;
  totalCustomers: number;
  totalPayments: number;
}

function formatILS(amount: number) {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

const cards = [
  {
    key: "totalRevenue" as const,
    label: "סה״כ הכנסות",
    icon: "💰",
    color: "bg-emerald-500",
    format: (v: number) => formatILS(v),
  },
  {
    key: "totalPayments" as const,
    label: "סה״כ תקבולים",
    icon: "🏦",
    color: "bg-blue-500",
    format: (v: number) => formatILS(v),
  },
  {
    key: "openDocuments" as const,
    label: "מסמכים פתוחים",
    icon: "📄",
    color: "bg-amber-500",
    format: (v: number) => v.toLocaleString("he-IL"),
  },
  {
    key: "totalCustomers" as const,
    label: "לקוחות",
    icon: "👥",
    color: "bg-violet-500",
    format: (v: number) => v.toLocaleString("he-IL"),
  },
];

export default function StatsCards({ stats, loading }: { stats: Stats | null; loading: boolean }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div key={card.key} className="bg-white rounded-2xl shadow-sm p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500">{card.label}</span>
            <span className={`${card.color} text-white rounded-xl w-10 h-10 flex items-center justify-center text-lg shadow-sm`}>
              {card.icon}
            </span>
          </div>
          {loading ? (
            <div className="h-8 w-32 bg-slate-100 animate-pulse rounded-lg" />
          ) : (
            <p className="text-2xl font-bold text-slate-800">
              {stats ? card.format(stats[card.key]) : "—"}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
