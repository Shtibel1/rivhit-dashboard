import type { Metadata } from "next";
import { Rubik } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";

const rubik = Rubik({
  subsets: ["hebrew", "latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  display: "swap",
  variable: "--font-rubik",
});

export const metadata: Metadata = {
  title: "לוח בקרה - ריווחית",
  description: "דשבורד עסקי מבוסס ריווחית",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={`h-full ${rubik.variable}`}>
      <body className="min-h-full bg-slate-100 font-sans">
        <Nav />
        {children}
      </body>
    </html>
  );
}

