import { NextRequest, NextResponse } from "next/server";
import { getDocuments, getCustomers, getPaymentReport, parseRivhitDate } from "@/lib/rivhit";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import { startOfMonth, endOfMonth, subMonths, format } from "date-fns";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action; // "customers" | "month"
    const monthOffset = typeof body.monthOffset === "number" ? body.monthOffset : 0;
    const force = !!body.force;

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    if (action === "customers") {
      console.log("Syncing customers from Rivhit to Supabase...");
      const rivhitCustomers = await getCustomers({ rows_limit: 5000 });
      console.log(`Fetched ${rivhitCustomers.length} customers from Rivhit.`);

      if (rivhitCustomers.length === 0) {
        return NextResponse.json({ success: true, count: 0 });
      }

      const upsertData = rivhitCustomers.map((c) => ({
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        customer_email: c.customer_email || null,
        customer_phone: c.customer_phone || null,
        customer_city: c.customer_city || null,
        customer_address: c.customer_address || null,
      }));

      // Chunk upsert by 200 rows
      const chunkSize = 200;
      for (let i = 0; i < upsertData.length; i += chunkSize) {
        const chunk = upsertData.slice(i, i + chunkSize);
        const { error } = await supabase
          .from("customers")
          .upsert(chunk, { onConflict: "customer_id" });

        if (error) {
          console.error("Error upserting customers chunk:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
      }

      return NextResponse.json({
        success: true,
        count: upsertData.length,
      });

    } else if (action === "month") {
      const now = new Date();
      const targetMonthDate = subMonths(now, monthOffset);
      const startOfTargetMonth = startOfMonth(targetMonthDate);
      const endOfTargetMonth = endOfMonth(targetMonthDate);

      const from_date = format(startOfTargetMonth, "dd/MM/yyyy");
      const until_date = format(endOfTargetMonth, "dd/MM/yyyy");

      // Check if we already have documents for this month to avoid double syncing
      if (!force && monthOffset > 0) {
        const startOfTargetMonthIso = format(startOfTargetMonth, "yyyy-MM-01");
        const endOfTargetMonthIso = format(endOfTargetMonth, "yyyy-MM-dd");

        const { count, error: countError } = await supabase
          .from("documents")
          .select("document_number", { count: "exact", head: true })
          .gte("document_date", startOfTargetMonthIso)
          .lte("document_date", endOfTargetMonthIso);

        if (!countError && count !== null && count > 0) {
          console.log(`Month offset ${monthOffset} (${format(targetMonthDate, "yyyy-MM")}) is already synced (${count} documents). Skipping...`);
          return NextResponse.json({
            success: true,
            skipped: true,
            documentsCount: count,
            paymentsCount: 0,
            monthLabel: format(targetMonthDate, "MM/yyyy"),
          });
        }
      }

      console.log(`Syncing documents and payments for month offset ${monthOffset} (${from_date} to ${until_date})...`);

      // Fetch documents and payments from Rivhit in parallel
      const [docs, pays] = await Promise.all([
        getDocuments({ from_date, until_date, rows_limit: 5000 }),
        getPaymentReport({ from_date, until_date, rows_limit: 5000 }),
      ]);

      console.log(`Fetched ${docs.length} documents and ${pays.length} payments for ${format(targetMonthDate, "yyyy-MM")}.`);

      // 1. Sync Documents
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
        const chunkSize = 200;
        for (let i = 0; i < docUpserts.length; i += chunkSize) {
          const chunk = docUpserts.slice(i, i + chunkSize);
          const { error } = await supabase
            .from("documents")
            .upsert(chunk, { onConflict: "document_type,document_number" });

          if (error) {
            console.error("Error upserting documents:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
          }
        }
      }

      // 2. Sync Payments
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
        const chunkSize = 200;
        for (let i = 0; i < payUpserts.length; i += chunkSize) {
          const chunk = payUpserts.slice(i, i + chunkSize);
          const { error } = await supabase
            .from("payments")
            .upsert(chunk, { onConflict: "unique_key" });

          if (error) {
            console.error("Error upserting payments:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
          }
        }
      }

      return NextResponse.json({
        success: true,
        documentsCount: docs.length,
        paymentsCount: pays.length,
        monthLabel: format(targetMonthDate, "MM/yyyy"),
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    console.error("Sync dashboard exception:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
