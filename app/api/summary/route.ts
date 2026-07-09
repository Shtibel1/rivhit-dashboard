import { NextRequest, NextResponse } from "next/server";
import { getDocuments, getPaymentReport, getPnLReport, parseRivhitDate } from "@/lib/rivhit";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import { subDays, format } from "date-fns";

async function fetchAllDocuments(supabase: any, fromDate?: string, untilDate?: string) {
  let allDocs: any[] = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    let query = supabase.from("documents").select("*");
    if (fromDate) query = query.gte("document_date", fromDate);
    if (untilDate) query = query.lte("document_date", untilDate);
    
    const { data, error } = await query.range(page * pageSize, (page + 1) * pageSize - 1);
    if (error) throw new Error(error.message);
    
    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      allDocs = allDocs.concat(data);
      if (data.length < pageSize) {
        hasMore = false;
      } else {
        page++;
      }
    }
  }
  return allDocs;
}

async function fetchAllPayments(supabase: any, fromDate?: string, untilDate?: string) {
  let allPays: any[] = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    let query = supabase.from("payments").select("*");
    if (fromDate) query = query.gte("receipt_date", fromDate);
    if (untilDate) query = query.lte("receipt_date", untilDate);
    
    const { data, error } = await query.range(page * pageSize, (page + 1) * pageSize - 1);
    if (error) throw new Error(error.message);
    
    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      allPays = allPays.concat(data);
      if (data.length < pageSize) {
        hasMore = false;
      } else {
        page++;
      }
    }
  }
  return allPays;
}

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

        // Upsert documents in chunks to avoid payload size/timeout limits
        if (docs.length > 0) {
          const docUpsertsMap = new Map();
          for (const d of docs) {
            const docType = d.document_type;
            const docNum = d.document_number;
            const key = `${docType}_${docNum}`;
            
            docUpsertsMap.set(key, {
              document_number: docNum,
              document_type: docType,
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
            });
          }

          const docUpserts = Array.from(docUpsertsMap.values());
          const docChunkSize = 1000;
          for (let i = 0; i < docUpserts.length; i += docChunkSize) {
            const chunk = docUpserts.slice(i, i + docChunkSize);
            const { error } = await supabase
              .from("documents")
              .upsert(chunk, { onConflict: "document_type,document_number" });
            if (error) {
              throw new Error(`Documents upsert failed: ${error.message}`);
            }
          }
        }

        // Upsert payments in chunks to avoid payload size/timeout limits
        if (pays.length > 0) {
          const payUpsertsMap = new Map();
          for (const p of pays) {
            const isoDate = parseRivhitDate(p.receipt_date);
            const ref = p.reference || "";
            const key = `${p.receipt_type}_${p.receipt_number}_${p.payment_type}_${p.amount}_${isoDate}_${ref}`;

            payUpsertsMap.set(key, {
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
            });
          }

          const payUpserts = Array.from(payUpsertsMap.values());
          const payChunkSize = 1000;
          for (let i = 0; i < payUpserts.length; i += payChunkSize) {
            const chunk = payUpserts.slice(i, i + payChunkSize);
            const { error } = await supabase
              .from("payments")
              .upsert(chunk, { onConflict: "unique_key" });
            if (error) {
              throw new Error(`Payments upsert failed: ${error.message}`);
            }
          }
        }
      } catch (syncErr) {
        console.error("Incremental sync during summary fetch failed:", syncErr);
        // Continue querying database even if refresh fails (fallback to offline database cache)
      }
    }

    // 1. Fetch from Supabase (using pagination to bypass PostgREST max_rows = 1000 limit)
    const [docs, pays, custsCountRes] = await Promise.all([
      fetchAllDocuments(supabase, from_date, until_date),
      fetchAllPayments(supabase, from_date, until_date),
      supabase.from("customers").select("*", { count: "exact", head: true }),
    ]);
    const totalCustomers = custsCountRes.count || 0;

    const activeDocs = docs.filter((d) => !d.is_cancelled);

    // Revenue = all non-cancelled docs that have the word "חשבונית" in their type name
    // (includes credits which have negative amounts to naturally subtract them)
    const invoiceDocs = activeDocs.filter((d) =>
      d.document_type_name?.includes("חשבונית")
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

    const profitByMonth: Record<string, number> = {};

    if (from_date && until_date) {
      try {
        const start = new Date(from_date);
        const end = new Date(until_date);
        const monthsList: { year: number; month: number; label: string }[] = [];
        
        let curr = new Date(start.getFullYear(), start.getMonth(), 1);
        while (curr <= end) {
          const year = curr.getFullYear();
          const month = curr.getMonth() + 1;
          const monthStr = String(month).padStart(2, "0");
          monthsList.push({
            year,
            month,
            label: `${year}-${monthStr}`
          });
          curr.setMonth(curr.getMonth() + 1);
        }
        
        // Fetch PnL in parallel (limit to last 12 months for safety)
        const pnlPromises = monthsList.slice(-12).map(async (m) => {
          try {
            const report = await getPnLReport({
              from_month: m.month,
              to_month: m.month,
              year: m.year
            });
            let income = 0;
            let expenses = 0;
            report.forEach(item => {
              if (item.pnl_code === 70 || item.pnl_code === 71) {
                income += -item.balance;
              } else if (item.pnl_code === 80 || item.pnl_code === 81 || item.pnl_code === 90) {
                expenses += item.balance;
              }
            });
            return { label: m.label, profit: income - expenses };
          } catch (e) {
            console.error(`Failed to fetch PnL for ${m.label}:`, e);
            return { label: m.label, profit: 0 };
          }
        });
        
        const pnlResults = await Promise.all(pnlPromises);
        pnlResults.forEach(r => {
          profitByMonth[r.label] = r.profit;
        });
      } catch (err) {
        console.error("Failed to calculate monthly profits:", err);
      }
    }

    return NextResponse.json({
      totalRevenue,
      openDocuments: openDocs,
      totalCustomers,
      totalPayments,
      revenueByMonth,
      revenueByDay,
      profitByMonth,
    });
  } catch (err) {
    console.error("Summary API GET exception:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
