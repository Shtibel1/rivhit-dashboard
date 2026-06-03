import { NextResponse } from "next/server";
import { getAllItems } from "@/lib/rivhit";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";

export async function POST() {
  try {
    console.log("Fetching items from Rivhit API...");
    const rivhitItems = await getAllItems(5000);
    
    // Filter out items that don't have a name or are "מלל חופשי" (free text) or "מבוטל" (cancelled)
    // to keep the database clean
    const filteredItems = rivhitItems.filter(
      (item) =>
        item.item_id !== 0 &&
        item.item_name &&
        item.item_name !== "מלל חופשי" &&
        !item.item_name.includes("מבוטל")
    );

    console.log(`Fetched ${rivhitItems.length} items, importing ${filteredItems.length} active items...`);

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    // Prepare data for upsert
    const upsertData = filteredItems.map((item) => ({
      item_id: item.item_id,
      sku: item.item_part_num || "",
      name: item.item_name,
      cost_price: item.cost_nis || 0,
      sale_price: item.sale_nis || 0,
      stock_quantity: item.quantity || 0,
      last_sync: new Date().toISOString(),
    }));

    // Chunk upserts to avoid payload size limits in Postgres (500 items at a time)
    const chunkSize = 200;
    let successCount = 0;

    for (let i = 0; i < upsertData.length; i += chunkSize) {
      const chunk = upsertData.slice(i, i + chunkSize);
      
      // Perform upsert (onConflict: item_id)
      const { error } = await supabase
        .from("products")
        .upsert(chunk, { onConflict: "item_id" });

      if (error) {
        console.error(`Error upserting chunk ${i / chunkSize}:`, error);
        return NextResponse.json(
          { error: `Database error: ${error.message}`, details: error },
          { status: 500 }
        );
      }
      successCount += chunk.length;
    }

    return NextResponse.json({
      success: true,
      message: `Successfully synchronized ${successCount} products from Rivhit to Supabase.`,
      count: successCount,
    });
  } catch (err) {
    console.error("Sync products exception:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
