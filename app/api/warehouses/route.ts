import { NextRequest, NextResponse } from "next/server";
import { getDocuments, getDocumentDetails, parseRivhitDate } from "@/lib/rivhit";

export interface MonthlyWarehouseData {
  month: string; // YYYY-MM
  metalCount: number;
  woodCount: number;
}

export interface WarehouseDocument {
  document_number: number;
  document_date: string; // DD/MM/YYYY
  customer_name: string;
  amount: number;
  warehouseType: "metal" | "wood";
  itemDetails: string; // matching item description
  document_link?: string;
}

export interface WarehousesResponse {
  monthly: MonthlyWarehouseData[];
  totals: { metalCount: number; woodCount: number };
  documents: WarehouseDocument[];
}

function classifyItem(description: string): "metal" | "wood" | null {
  const text = description.toLowerCase();
  if (text.includes("מתכת")) return "metal";
  if (text.includes("עץ")) return "wood";
  return null;
}

/** Run async tasks in sequential batches of `size` (each batch is fully parallel). */
async function batchSettled<T>(
  tasks: (() => Promise<T>)[],
  size = 15,
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = [];
  for (let i = 0; i < tasks.length; i += size) {
    const batch = tasks.slice(i, i + size).map((t) => t());
    results.push(...(await Promise.allSettled(batch)));
  }
  return results;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const from_date = searchParams.get("from_date") ?? undefined;
    const until_date = searchParams.get("until_date") ?? undefined;

    // Step 1: Get document list (headers only, no line items)
    const docs = await getDocuments({ from_date, until_date, rows_limit: 200 });

    // Step 2: Fetch full details for every document in parallel batches of 15.
    //         Document.Details contains items[].description — the product name.
    const detailsResults = await batchSettled(
      docs.map((doc) => () => getDocumentDetails(doc.document_number, doc.document_type)),
    );

    const byMonth: Record<string, { metalCount: number; woodCount: number }> = {};
    // Key: "docNumber-type" to avoid duplicate rows in the orders table
    const docTypeKeys = new Set<string>();
    const documents: WarehouseDocument[] = [];

    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i];
      const result = detailsResults[i];
      if (result.status !== "fulfilled" || !result.value) continue;

      const details = result.value;
      if (details.is_cancelled) continue;

      const iso = parseRivhitDate(doc.document_date);
      if (!iso) continue;
      const month = iso.slice(0, 7);

      // Check every line item in the document
      for (const item of details.items ?? []) {
        const warehouseType = classifyItem(item.description ?? "");
        if (!warehouseType) continue;

        // Count this item row in the monthly stats
        if (!byMonth[month]) byMonth[month] = { metalCount: 0, woodCount: 0 };
        if (warehouseType === "metal") byMonth[month].metalCount += 1;
        else byMonth[month].woodCount += 1;

        // Add one row per document+type to the orders table
        const key = `${doc.document_number}-${warehouseType}`;
        if (!docTypeKeys.has(key)) {
          docTypeKeys.add(key);
          documents.push({
            document_number: doc.document_number,
            document_date: doc.document_date,
            customer_name: doc.customer_name,
            amount: doc.amount,
            warehouseType,
            itemDetails: item.description,
            document_link: doc.document_link ?? undefined,
          });
        }
      }
    }

    const monthly: MonthlyWarehouseData[] = Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({ month, ...data }));

    const totals = monthly.reduce(
      (acc, m) => ({
        metalCount: acc.metalCount + m.metalCount,
        woodCount: acc.woodCount + m.woodCount,
      }),
      { metalCount: 0, woodCount: 0 },
    );

    documents.sort((a, b) =>
      parseRivhitDate(b.document_date).localeCompare(parseRivhitDate(a.document_date)),
    );

    return NextResponse.json({ monthly, totals, documents } satisfies WarehousesResponse);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
