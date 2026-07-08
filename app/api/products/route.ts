import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    // Parse filters
    const search = searchParams.get("search")?.trim() || "";
    const category = searchParams.get("category") || "all";
    const status = searchParams.get("status") || "all"; // all, out_of_stock, low_stock, in_stock
    const sort = searchParams.get("sort") || "stock_quantity"; // stock_quantity, name, sku, sale_price, cost_price
    const order = searchParams.get("order") || "asc"; // asc, desc
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    // 1. Fetch Global Stock Metrics (Counts) in parallel
    const [totalCountRes, outOfStockRes, lowStockRes, inStockRes] = await Promise.all([
      supabase.from("products").select("item_id", { count: "exact", head: true }),
      supabase.from("products").select("item_id", { count: "exact", head: true }).lte("stock_quantity", 0),
      supabase.from("products").select("item_id", { count: "exact", head: true }).gt("stock_quantity", 0).lte("stock_quantity", 3),
      supabase.from("products").select("item_id", { count: "exact", head: true }).gt("stock_quantity", 3),
    ]);

    const globalMetrics = {
      total: totalCountRes.count || 0,
      outOfStock: outOfStockRes.count || 0,
      lowStock: lowStockRes.count || 0,
      inStock: inStockRes.count || 0,
    };

    // 2. Build the main products query with filters
    let query = supabase.from("products").select("*", { count: "exact" });

    // Apply search filter (matches SKU or Name)
    if (search) {
      query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%`);
    }

    // Apply category filter
    if (category && category !== "all") {
      query = query.eq("category", category);
    }

    // Apply status filter
    if (status === "out_of_stock") {
      query = query.lte("stock_quantity", 0);
    } else if (status === "low_stock") {
      query = query.gt("stock_quantity", 0).lte("stock_quantity", 3);
    } else if (status === "in_stock") {
      query = query.gt("stock_quantity", 3);
    }

    // Apply sorting
    const allowedSortCols = ["stock_quantity", "name", "sku", "sale_price", "cost_price", "last_sync"];
    const sortCol = allowedSortCols.includes(sort) ? sort : "stock_quantity";
    const sortAsc = order === "asc";
    query = query.order(sortCol, { ascending: sortAsc });

    // Apply pagination
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    // Execute query
    const { data: products, count: totalFiltered, error } = await query;

    if (error) {
      console.error("Database query error in /api/products:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 3. Check Twilio configuration status
    const twilioConfigured = !!(
      process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_PHONE_NUMBER &&
      process.env.ALERT_RECIPIENT_PHONES &&
      process.env.TWILIO_CONTENT_SID
    );

    return NextResponse.json({
      products: products || [],
      metadata: {
        totalFiltered: totalFiltered || 0,
        page,
        limit,
        totalPages: Math.ceil((totalFiltered || 0) / limit),
        globalMetrics,
        twilioConfigured,
        alertRecipientPhones: process.env.ALERT_RECIPIENT_PHONES || "",
      },
    });
  } catch (err) {
    console.error("Products API exception:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
