import { NextRequest, NextResponse } from "next/server";
import { getDocuments, getCustomers, getPaymentReport, parseRivhitDate } from "@/lib/rivhit";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const from_date = searchParams.get("from_date") ?? undefined;
    const until_date = searchParams.get("until_date") ?? undefined;

    const [documents, customers, payments] = await Promise.allSettled([
      getDocuments({ from_date, until_date, rows_limit: 500 }),
      getCustomers({ rows_limit: 500 }),
      getPaymentReport({ from_date, until_date }),
    ]);

    const docs = documents.status === "fulfilled" ? documents.value : [];
    const custs = customers.status === "fulfilled" ? customers.value : [];
    const pays = payments.status === "fulfilled" ? payments.value : [];

    const activeDocs = docs.filter((d) => !d.is_cancelled);

    // Revenue = all non-cancelled docs that have the word "חשבונית" in their type name
    const invoiceDocs = activeDocs.filter((d) =>
      d.document_type_name?.includes("חשבונית") && !d.document_type_name?.includes("זיכוי")
    );
    const totalRevenue = invoiceDocs.reduce((sum, d) => sum + (d.amount ?? 0), 0);

    const openDocs = activeDocs.filter((d) => !d.is_closed).length;
    const totalPayments = pays.reduce((sum, p) => sum + (p.amount ?? 0), 0);

    // Revenue grouped by YYYY-MM and YYYY-MM-DD
    const revenueByMonth: Record<string, number> = {};
    const revenueByDay: Record<string, number> = {};
    invoiceDocs.forEach((d) => {
      const iso = parseRivhitDate(d.document_date);
      const month = iso.slice(0, 7);
      if (month) revenueByMonth[month] = (revenueByMonth[month] ?? 0) + (d.amount ?? 0);
      if (iso) revenueByDay[iso] = (revenueByDay[iso] ?? 0) + (d.amount ?? 0);
    });

    return NextResponse.json({
      totalRevenue,
      openDocuments: openDocs,
      totalCustomers: custs.length,
      totalPayments,
      revenueByMonth,
      revenueByDay,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
