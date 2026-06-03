import { NextRequest, NextResponse } from "next/server";
import { getDocuments, getPaymentReport, parseRivhitDate } from "@/lib/rivhit";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import { subDays, format } from "date-fns";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const from_date = searchParams.get("from_date") || undefined;
    const until_date = searchParams.get("until_date") || undefined;
    const refresh = searchParams.get("refresh") === "true";

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    if (refresh && from_date && until_date) {
      console.log("Summary API: Refreshing last 30 days of data from Rivhit API...");
      // Perform incremental sync of the last 30 days to ensure freshness
      const today = new Date();
      const thirtyDaysAgo = subDays(today, 30);
      const syncFromStr = format(thirtyDaysAgo, "dd/MM/yyyy");
      const syncUntilStr = format(today, "dd/MM/yyyy");

      try {
        const [docs, pays] = await Promise.all([
          getDocuments({ from_date: syncFromStr, until_date: syncUntilStr, rows_limit: 1000 }),
          getPaymentReport({ from_date: syncFromStr, until_date: syncUntilStr, rows_limit: 1000 }),
        ]);

        console.log(`Syncing ${docs.length} documents and ${pays.length} payments to Supabase...`);

        // Upsert documents
        if (docs.length > 0) {
          const docUpserts = docs.map((d) => ({
            document_number: d.document_number,
            document_type: d.document_type,
            document_type_name: d.document_type_name || "מסמך",
            sort_code: d.sort_code || 0,
            document_date: parseRivhitDate(d.document_date),
            customer_id: d.customer_id,
            customer_name: d.customer_name || null,
            amount: d.amount || 0,
            total_vat: d.total_vat || 0,
            is_cancelled: d.is_cancelled || false,
            is_closed: d.is_closed || false,
            reference: d.reference || null,
            comments: d.comments || null,
            document_link: d.document_link || null,
          }));

          await supabase.from("documents").upsert(docUpserts, { onConflict: "document_type,document_number" });
        }

        // Upsert payments
        if (pays.length > 0) {
          const payUpserts = pays.map((p) => {
            const isoDate = parseRivhitDate(p.receipt_date);
            const ref = p.reference || "";
            const key = `${p.receipt_type}_${p.receipt_number}_${p.payment_type}_${p.amount}_${isoDate}_${ref}`;
            return {
              receipt_date: isoDate,
              payment_type: p.payment_type,
              amount: p.amount || 0,
              customer_last_name: p.customer_last_name || null,
              customer_first_name: p.customer_first_name || null,
              customer_id: p.customer_id,
              receipt_number: p.receipt_number,
              receipt_type: p.receipt_type,
              reference: p.reference || null,
              unique_key: key,
            };
          });

          await supabase.from("payments").upsert(payUpserts, { onConflict: "unique_key" });
        }
      } catch (syncErr) {
        console.error("Incremental sync during summary fetch failed:", syncErr);
        // Continue querying database even if refresh fails (fallback to offline database cache)
      }
    }

    // 1. Fetch from Supabase
    let queryDocs = supabase.from("documents").select("*");
    let queryPays = supabase.from("payments").select("*");

    if (from_date) {
      queryDocs = queryDocs.gte("document_date", from_date);
      queryPays = queryPays.gte("receipt_date", from_date);
    }
    if (until_date) {
      queryDocs = queryDocs.lte("document_date", until_date);
      queryPays = queryPays.lte("receipt_date", until_date);
    }

    const [docsRes, paysRes, custsCountRes] = await Promise.all([
      queryDocs,
      queryPays,
      supabase.from("customers").select("*", { count: "exact", head: true }),
    ]);

    if (docsRes.error) throw new Error(docsRes.error.message);
    if (paysRes.error) throw new Error(paysRes.error.message);

    const docs = docsRes.data || [];
    const pays = paysRes.data || [];
    const totalCustomers = custsCountRes.count || 0;

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
      // document_date from Supabase is already YYYY-MM-DD
      const iso = d.document_date;
      const month = iso.slice(0, 7);
      if (month) revenueByMonth[month] = (revenueByMonth[month] ?? 0) + (d.amount ?? 0);
      if (iso) revenueByDay[iso] = (revenueByDay[iso] ?? 0) + (d.amount ?? 0);
    });

    return NextResponse.json({
      totalRevenue,
      openDocuments: openDocs,
      totalCustomers,
      totalPayments,
      revenueByMonth,
      revenueByDay,
    });
  } catch (err) {
    console.error("Summary API GET exception:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
