import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import { subMonths, format } from "date-fns";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const range = searchParams.get("range") || "6m"; // 1m, 3m, 6m, 12m
    const category = searchParams.get("category") || "all";

    // 1. Calculate date filter
    const now = new Date();
    let fromDate: Date;
    let monthsCount = 6;

    if (range === "1m") {
      fromDate = subMonths(now, 1);
      monthsCount = 1;
    } else if (range === "3m") {
      fromDate = subMonths(now, 3);
      monthsCount = 3;
    } else if (range === "12m") {
      fromDate = subMonths(now, 12);
      monthsCount = 12;
    } else {
      // Default to 6 months
      fromDate = subMonths(now, 6);
      monthsCount = 6;
    }

    const fromDateStr = format(fromDate, "yyyy-MM-dd");

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    // 2. Fetch sales items and products separately to perform an in-memory left join.
    // This bypasses PostgREST's relationship requirement when foreign keys are absent.
    const [salesRes, productsRes] = await Promise.all([
      supabase
        .from("sales_items")
        .select("item_id, name, catalog_number, quantity, total_line, document_date")
        .gte("document_date", fromDateStr),
      supabase
        .from("products")
        .select("item_id, sku, name, cost_price, sale_price, stock_quantity, category")
    ]);

    if (salesRes.error) {
      console.error("Error fetching sales history:", salesRes.error);
      return NextResponse.json({ error: salesRes.error.message }, { status: 500 });
    }
    if (productsRes.error) {
      console.error("Error fetching products:", productsRes.error);
      return NextResponse.json({ error: productsRes.error.message }, { status: 500 });
    }

    interface ProductRow {
      item_id: number;
      sku: string | null;
      name: string;
      cost_price: number | null;
      sale_price: number | null;
      stock_quantity: number | null;
      category: string | null;
    }

    const sales = salesRes.data;
    const products = (productsRes.data as unknown as ProductRow[]) || [];
    const productsMap = new Map<number, ProductRow>(
      products.map((p) => [p.item_id, p])
    );

    interface SalesRow {
      item_id: number;
      name: string | null;
      catalog_number: string | null;
      quantity: number;
      total_line: number;
      document_date: string;
    }

    // 3. Aggregate sales by product in memory
    const productSalesMap: Record<number, {
      item_id: number;
      sku: string;
      name: string;
      cost_price: number;
      sale_price: number;
      stock_quantity: number;
      category: string;
      unitsSold: number;
      revenue: number;
    }> = {};

    (sales as unknown as SalesRow[])?.forEach((row) => {
      if (row.item_id === -999) return; // Skip placeholder/empty documents

      // Soft-join fallback logic if the product is not in the active products table
      const prod = productsMap.get(row.item_id) || {
        item_id: row.item_id,
        sku: row.catalog_number || "",
        name: row.name || `מוצר ארכיון #${row.item_id}`,
        cost_price: 0,
        sale_price: 0,
        stock_quantity: 0,
        category: "אחר",
      };

      const cat = prod.category || "אחר";

      // Filter by category in memory
      if (category && category !== "all" && cat !== category) {
        return;
      }

      const itemId = prod.item_id;
      if (!productSalesMap[itemId]) {
        productSalesMap[itemId] = {
          item_id: itemId,
          sku: prod.sku || "",
          name: prod.name || row.name || `מוצר ארכיון #${itemId}`,
          cost_price: prod.cost_price || 0,
          sale_price: prod.sale_price || 0,
          stock_quantity: prod.stock_quantity || 0,
          category: cat,
          unitsSold: 0,
          revenue: 0,
        };
      }

      productSalesMap[itemId].unitsSold += row.quantity || 0;
      productSalesMap[itemId].revenue += row.total_line || 0;
    });

    // Convert map to array and calculate suggestions
    const aggregatedProducts = Object.values(productSalesMap).map((p) => {
      const avgMonthlySales = p.unitsSold / monthsCount;
      
      // Suggested order: aim for a 2-month stock buffer (stock covering 2 months of avg sales)
      const targetStock = avgMonthlySales * 2;
      let suggestedOrder = 0;
      let orderUrgency = "אין צורך"; // No need

      if (targetStock > p.stock_quantity) {
        suggestedOrder = Math.ceil(targetStock - p.stock_quantity);
      }

      if (suggestedOrder > 0) {
        // Urgent order if current stock is 0 or less, or if we have less than 0.5 months of stock left
        if (p.stock_quantity <= 0 || p.stock_quantity < (avgMonthlySales * 0.5)) {
          orderUrgency = "מיידי"; // Immediate
        } else {
          orderUrgency = "בקרוב"; // Soon
        }
      }

      return {
        ...p,
        avgMonthlySales: parseFloat(avgMonthlySales.toFixed(1)),
        suggestedOrder,
        orderUrgency,
      };
    });

    // 4. Sort and paginate top products
    // Sort by units sold descending
    const sortedProducts = aggregatedProducts.sort((a, b) => b.unitsSold - a.unitsSold);
    const top30 = sortedProducts.slice(0, 30);

    // 5. Gather category stats for summary charts
    const categoryStats: Record<string, { count: number; unitsSold: number; revenue: number }> = {};
    sortedProducts.forEach((p) => {
      const cat = p.category;
      if (!categoryStats[cat]) {
        categoryStats[cat] = { count: 0, unitsSold: 0, revenue: 0 };
      }
      categoryStats[cat].count += 1;
      categoryStats[cat].unitsSold += p.unitsSold;
      categoryStats[cat].revenue += p.revenue;
    });

    const categoryStatsArray = Object.entries(categoryStats).map(([name, stats]) => ({
      name,
      ...stats,
      revenue: parseFloat(stats.revenue.toFixed(0)),
    }));

    // Overall summary metrics
    const totalRevenue = sortedProducts.reduce((sum, p) => sum + p.revenue, 0);
    const totalUnitsSold = sortedProducts.reduce((sum, p) => sum + p.unitsSold, 0);
    const lowStockCount = sortedProducts.filter(p => p.suggestedOrder > 0).length;
    const outOfStockCount = sortedProducts.filter(p => p.stock_quantity <= 0).length;

    return NextResponse.json({
      summary: {
        totalRevenue: parseFloat(totalRevenue.toFixed(0)),
        totalUnitsSold: parseFloat(totalUnitsSold.toFixed(0)),
        lowStockCount,
        outOfStockCount,
      },
      topProducts: top30,
      categoryStats: categoryStatsArray,
    });
  } catch (err) {
    console.error("Sales-by-product analytics API exception:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
