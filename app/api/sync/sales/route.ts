import { NextRequest, NextResponse } from "next/server";
import { getDocuments, getDocumentDetails, parseRivhitDate } from "@/lib/rivhit";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import { subMonths, format } from "date-fns";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    
    // Default to syncing the last 6 months if no dates are provided
    const now = new Date();
    const defaultFromDate = format(subMonths(now, 6), "dd/MM/yyyy");
    const defaultUntilDate = format(now, "dd/MM/yyyy");

    const from_date = body.from_date || defaultFromDate;
    const until_date = body.until_date || defaultUntilDate;
    const batchSize = 40; // Safe batch size to prevent API and server timeouts

    console.log(`Syncing sales documents from ${from_date} to ${until_date}...`);

    // 1. Fetch documents from Rivhit
    // Type 1 = Invoice, Type 2 = Invoice Receipt, Type 11 = Credit Note
    const [invoices, receipts, credits] = await Promise.all([
      getDocuments({ from_date, until_date, document_type: 1, rows_limit: 5000 }),
      getDocuments({ from_date, until_date, document_type: 2, rows_limit: 5000 }),
      getDocuments({ from_date, until_date, document_type: 11, rows_limit: 5000 }),
    ]);

    const allSalesDocs = [...invoices, ...receipts, ...credits].filter(
      (doc) => !doc.is_cancelled
    );

    console.log(`Found ${allSalesDocs.length} active sales documents in Rivhit.`);

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    // 2. Query already synced documents from Supabase to avoid duplicating requests.
    // We filter by date range and use pagination to bypass Supabase's default 1,000-row limit.
    const fromDateIso = parseRivhitDate(from_date);
    const untilDateIso = parseRivhitDate(until_date);

    let existingDocs: { document_number: number; document_type: number }[] = [];
    let page = 0;
    const pageSize = 1000;
    let hasMoreDocs = true;

    while (hasMoreDocs) {
      const { data, error: dbError } = await supabase
        .from("sales_items")
        .select("document_number, document_type")
        .gte("document_date", fromDateIso)
        .lte("document_date", untilDateIso)
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (dbError) {
        console.error("Error fetching existing sales items:", dbError);
        return NextResponse.json({ error: dbError.message }, { status: 500 });
      }

      if (!data || data.length === 0) {
        hasMoreDocs = false;
      } else {
        existingDocs = existingDocs.concat(data);
        if (data.length < pageSize) {
          hasMoreDocs = false;
        } else {
          page++;
        }
      }
    }

    // Create a Set of existing document identifiers: "type_number"
    const existingSet = new Set(
      existingDocs.map((d) => `${d.document_type}_${d.document_number}`)
    );

    // Filter documents to find which ones need to be fetched
    const docsToSync = allSalesDocs.filter(
      (doc) => !existingSet.has(`${doc.document_type}_${doc.document_number}`)
    );

    console.log(`${docsToSync.length} documents need details sync.`);

    if (docsToSync.length === 0) {
      return NextResponse.json({
        success: true,
        message: "All sales data is up to date.",
        syncedCount: 0,
        remainingCount: 0,
        hasMore: false,
      });
    }

    interface SalesItemInsert {
      document_number: number;
      document_type: number;
      document_date: string;
      item_id: number;
      name: string;
      catalog_number: string;
      quantity: number;
      price_nis: number;
      total_line: number;
      customer_id: number;
    }

    interface FailedDoc {
      number: number;
      type: number;
    }

    // 3. Process the current batch
    const currentBatch = docsToSync.slice(0, batchSize);
    const lineItemsToInsert: SalesItemInsert[] = [];
    const failedDocs: FailedDoc[] = [];

    // Fetch details for each document in the batch
    await Promise.all(
      currentBatch.map(async (doc) => {
        try {
          const details = await getDocumentDetails(doc.document_number, doc.document_type);
          
          const items = details?.items || [];
          if (items.length === 0) {
            // Document has no items. Insert a placeholder row to mark it as processed and avoid looping.
            lineItemsToInsert.push({
              document_number: doc.document_number,
              document_type: doc.document_type,
              document_date: parseRivhitDate(doc.document_date),
              item_id: -999,
              name: "מסמך ריק",
              catalog_number: "EMPTY",
              quantity: 0,
              price_nis: 0,
              total_line: 0,
              customer_id: doc.customer_id,
            });
            return;
          }

          // Group duplicate items inside the same document to avoid duplicate keys in Postgres upsert
          const docItemsMap: Record<number, SalesItemInsert> = {};

          items.forEach((item) => {
            if (!item.item_id) return;
            const itemId = item.item_id;
            const isCredit = doc.document_type === 11;
            const multiplier = isCredit ? -1 : 1;

            if (!docItemsMap[itemId]) {
              docItemsMap[itemId] = {
                document_number: doc.document_number,
                document_type: doc.document_type,
                document_date: parseRivhitDate(doc.document_date),
                item_id: itemId,
                name: item.description || "",
                catalog_number: item.catalog_number || "",
                quantity: 0,
                price_nis: item.price_nis || 0,
                total_line: 0,
                customer_id: doc.customer_id,
              };
            }

            docItemsMap[itemId].quantity += (item.quantity || 0) * multiplier;
            docItemsMap[itemId].total_line += (item.total_line || 0) * multiplier;
          });

          const itemsToInsertForDoc = Object.values(docItemsMap);
          if (itemsToInsertForDoc.length === 0) {
            // Document had items, but none had valid item_ids (e.g. comments only).
            // Insert placeholder to avoid infinite loops.
            lineItemsToInsert.push({
              document_number: doc.document_number,
              document_type: doc.document_type,
              document_date: parseRivhitDate(doc.document_date),
              item_id: -999,
              name: "מסמך ללא מזהי מוצרים (שורות מלל חופשי)",
              catalog_number: "EMPTY_IDS",
              quantity: 0,
              price_nis: 0,
              total_line: 0,
              customer_id: doc.customer_id,
            });
          } else {
            itemsToInsertForDoc.forEach((lineItem) => {
              lineItemsToInsert.push(lineItem);
            });
          }
        } catch (err) {
          console.error(`Failed to get details for doc ${doc.document_type}-${doc.document_number}:`, err);
          failedDocs.push({ number: doc.document_number, type: doc.document_type });
          
          // Also insert a placeholder row for failed documents to prevent looping indefinitely
          lineItemsToInsert.push({
            document_number: doc.document_number,
            document_type: doc.document_type,
            document_date: parseRivhitDate(doc.document_date),
            item_id: -999,
            name: `שגיאת טעינה: ${err instanceof Error ? err.message : String(err)}`,
            catalog_number: "ERROR",
            quantity: 0,
            price_nis: 0,
            total_line: 0,
            customer_id: doc.customer_id,
          });
        }
      })
    );

    console.log(`Prepared ${lineItemsToInsert.length} line items to insert.`);

    // 4. Insert line items into Supabase
    if (lineItemsToInsert.length > 0) {
      // Use upsert to handle any overlapping items gracefully
      const { error: insertError } = await supabase
        .from("sales_items")
        .upsert(lineItemsToInsert, {
          onConflict: "document_type,document_number,item_id",
        });

      if (insertError) {
        console.error("Database insertion error:", insertError);
        return NextResponse.json(
          { error: `Database insert error: ${insertError.message}`, details: insertError },
          { status: 500 }
        );
      }
    }

    const remainingCount = docsToSync.length - currentBatch.length;

    return NextResponse.json({
      success: true,
      syncedCount: currentBatch.length,
      remainingCount,
      hasMore: remainingCount > 0,
      failedDocsCount: failedDocs.length,
    });
  } catch (err) {
    console.error("Sync sales exception:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
