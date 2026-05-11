import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "לוח בקרה - ריווחית",
  description: "דשבורד עסקי מבוסס ריווחית",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className="h-full">
      <body className="min-h-full bg-slate-100">{children}</body>
    </html>
  );
}
