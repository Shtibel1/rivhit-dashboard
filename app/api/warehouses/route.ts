import { NextRequest, NextResponse } from "next/server";
import { getDocuments, getDocumentDetails, parseRivhitDate } from "@/lib/rivhit";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import { startOfMonth, format, subDays } from "date-fns";

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

interface DateRange {
  from: string; // yyyy-MM-dd
  until: string; // yyyy-MM-dd
}

interface SplitRanges {
  historical?: DateRange;
  current?: DateRange;
}

interface Accumulators {
  byMonth: Record<string, { metalCount: number; woodCount: number }>;
  docTypeKeys: Set<string>;
  documents: WarehouseDocument[];
}

function classifyItem(description: string): "metal" | "wood" | null {
  const text = description.toLowerCase();
  if (text.includes("מתכת")) return "metal";
  if (text.includes("עץ")) return "wood";
  return null;
}

/** Format a date string from YYYY-MM-DD to DD/MM/YYYY */
function formatIsoToRivhitDate(isoDate: string): string {
  if (!isoDate) return "";
  const parts = isoDate.split("-");
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

/** Split the requested date range into historical (database) and current month (live API) ranges. */
function splitDateRange(from_date: string, until_date: string): SplitRanges {
  const today = new Date();
  const firstDayOfCurrentMonthStr = format(startOfMonth(today), "yyyy-MM-dd");

  const ranges: SplitRanges = {};

  if (from_date < firstDayOfCurrentMonthStr) {
    const histFrom = from_date;
    const histUntil = until_date < firstDayOfCurrentMonthStr
      ? until_date
      : format(subDays(startOfMonth(today), 1), "yyyy-MM-dd");
    ranges.historical = { from: histFrom, until: histUntil };
  }

  if (until_date >= firstDayOfCurrentMonthStr) {
    const currentFrom = from_date >= firstDayOfCurrentMonthStr 
      ? from_date 
      : firstDayOfCurrentMonthStr;
    ranges.current = { from: currentFrom, until: until_date };
  }

  return ranges;
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

interface SalesItemRow {
  document_number: number;
  document_type: number;
  document_date: string;
  name: string | null;
  customer_id: number;
}

interface DbDocumentRow {
  document_number: number;
  document_type: number;
  customer_name: string | null;
  amount: number;
  document_link: string | null;
  is_cancelled: boolean;
}

/** Fetches historical warehouse records from the database and updates accumulators. */
async function fetchHistoricalWarehouseData(
  supabase: any,
  fromDate: string,
  untilDate: string,
  accumulators: Accumulators
): Promise<void> {
  const { data: salesItems, error: itemsError } = await supabase
    .from("sales_items")
    .select("document_number, document_type, document_date, name, customer_id")
    .gte("document_date", fromDate)
    .lte("document_date", untilDate);

  if (itemsError) {
    throw new Error(`Database error fetching sales items: ${itemsError.message}`);
  }

  const items = (salesItems as SalesItemRow[] | null) || [];
  if (items.length === 0) return;

  const classifiedItems = items
    .map(item => ({
      ...item,
      warehouseType: classifyItem(item.name || "")
    }))
    .filter(item => !!item.warehouseType);

  if (classifiedItems.length === 0) return;

  const docNumbers = Array.from(new Set(classifiedItems.map(item => item.document_number)));

  const { data: dbDocs, error: docsError } = await supabase
    .from("documents")
    .select("document_number, document_type, customer_name, amount, document_link, is_cancelled")
    .in("document_number", docNumbers);

  if (docsError) {
    throw new Error(`Database error fetching documents: ${docsError.message}`);
  }

  const docs = (dbDocs as DbDocumentRow[] | null) || [];
  const docMap = new Map<string, DbDocumentRow>();
  for (const doc of docs) {
    if (doc.is_cancelled) continue;
    docMap.set(`${doc.document_type}_${doc.document_number}`, doc);
  }

  for (const item of classifiedItems) {
    const warehouseType = item.warehouseType;
    if (!warehouseType) continue;

    const docKey = `${item.document_type}_${item.document_number}`;
    const doc = docMap.get(docKey);
    if (!doc) continue;

    const month = item.document_date.slice(0, 7); // "YYYY-MM"

    if (!accumulators.byMonth[month]) {
      accumulators.byMonth[month] = { metalCount: 0, woodCount: 0 };
    }
    if (warehouseType === "metal") {
      accumulators.byMonth[month].metalCount += 1;
    } else {
      accumulators.byMonth[month].woodCount += 1;
    }

    const orderKey = `${item.document_number}-${warehouseType}`;
    if (!accumulators.docTypeKeys.has(orderKey)) {
      accumulators.docTypeKeys.add(orderKey);
      accumulators.documents.push({
        document_number: item.document_number,
        document_date: formatIsoToRivhitDate(item.document_date),
        customer_name: doc.customer_name || `לקוח #${item.customer_id}`,
        amount: doc.amount,
        warehouseType,
        itemDetails: item.name || "",
        document_link: doc.document_link ?? undefined,
      });
    }
  }
}

/** Fetches current month's warehouse records live from the Rivhit API and updates accumulators. */
async function fetchCurrentWarehouseData(
  fromDate: string,
  untilDate: string,
  accumulators: Accumulators
): Promise<void> {
  const rivhitFrom = formatIsoToRivhitDate(fromDate);
  const rivhitUntil = formatIsoToRivhitDate(untilDate);

  const docs = await getDocuments({ from_date: rivhitFrom, until_date: rivhitUntil, rows_limit: 200 });

  const detailsResults = await batchSettled(
    docs.map((doc) => () => getDocumentDetails(doc.document_number, doc.document_type)),
  );

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    const result = detailsResults[i];
    if (result.status !== "fulfilled" || !result.value) continue;

    const details = result.value;
    if (details.is_cancelled) continue;

    const iso = parseRivhitDate(doc.document_date);
    if (!iso) continue;
    const month = iso.slice(0, 7);

    for (const item of details.items ?? []) {
      const warehouseType = classifyItem(item.description ?? "");
      if (!warehouseType) continue;

      if (!accumulators.byMonth[month]) {
        accumulators.byMonth[month] = { metalCount: 0, woodCount: 0 };
      }
      if (warehouseType === "metal") {
        accumulators.byMonth[month].metalCount += 1;
      } else {
        accumulators.byMonth[month].woodCount += 1;
      }

      const orderKey = `${doc.document_number}-${warehouseType}`;
      if (!accumulators.docTypeKeys.has(orderKey)) {
        accumulators.docTypeKeys.add(orderKey);
        accumulators.documents.push({
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
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const from_date = searchParams.get("from_date");
    const until_date = searchParams.get("until_date");

    if (!from_date || !until_date) {
      return NextResponse.json({ error: "Missing from_date or until_date parameters" }, { status: 400 });
    }

    const byMonth: Record<string, { metalCount: number; woodCount: number }> = {};
    const docTypeKeys = new Set<string>();
    const documents: WarehouseDocument[] = [];
    const accumulators: Accumulators = { byMonth, docTypeKeys, documents };

    const ranges = splitDateRange(from_date, until_date);

    if (ranges.historical) {
      const cookieStore = await cookies();
      const supabase = createClient(cookieStore);
      await fetchHistoricalWarehouseData(supabase, ranges.historical.from, ranges.historical.until, accumulators);
    }

    if (ranges.current) {
      await fetchCurrentWarehouseData(ranges.current.from, ranges.current.until, accumulators);
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
    console.error("Warehouses GET route error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
