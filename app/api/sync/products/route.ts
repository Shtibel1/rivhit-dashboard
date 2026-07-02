import { NextRequest, NextResponse } from "next/server";
import { getAllItems } from "@/lib/rivhit";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    // Support sending a test WhatsApp message
    if (body.send_test_whatsapp) {
      console.log("Sending test WhatsApp message...");
      const dateTimeStr = new Date().toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" });
      const contentSid = process.env.TWILIO_CONTENT_SID?.trim();
      
      let success = false;
      if (contentSid) {
        // Send using Twilio content template variables
        success = await sendWhatsAppMessage("", {
          "1": "מוצר בדיקה של מערכת התרעות מלאי (מייגן)",
          "2": "TEST-SKU-123",
          "3": "999",
          "4": dateTimeStr,
        });
      } else {
        const recipientEnv = process.env.ALERT_RECIPIENT_PHONES || "";
        const testMessage = `🧪 *הודעת בדיקה של מערכת התרעות מלאי (מייגן)*\n\nההודעה נשלחה בהצלחה! מערכת התרעות המלאי מבוססת Twilio פעילה ומחוברת.\n* נמענים: ${recipientEnv}\n* תאריך ושעה: ${dateTimeStr}`;
        success = await sendWhatsAppMessage(testMessage);
      }

      if (success) {
        return NextResponse.json({
          success: true,
          message: "Test WhatsApp message sent successfully.",
        });
      } else {
        return NextResponse.json(
          { error: "Failed to send test WhatsApp message. Check server logs." },
          { status: 500 }
        );
      }
    }

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

    // Fetch current products from Supabase to track stock level transitions
    const prevStockMap = new Map<number, number>();
    let hasMore = true;
    let page = 0;
    const pageSize = 1000;

    while (hasMore) {
      const { data, error: fetchErr } = await supabase
        .from("products")
        .select("item_id, stock_quantity")
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (fetchErr) {
        console.error("Error fetching existing products for stock transition checks:", fetchErr);
        break;
      }

      if (!data || data.length === 0) {
        hasMore = false;
      } else {
        for (const p of data) {
          prevStockMap.set(p.item_id, p.stock_quantity ?? 0);
        }
        if (data.length < pageSize) {
          hasMore = false;
        } else {
          page++;
        }
      }
    }

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

    // Detect transitions to 0 stock
    const outOfStockAlerts: Array<{ name: string; sku: string; item_id: number }> = [];
    for (const item of upsertData) {
      const prevStock = prevStockMap.get(item.item_id);
      const newStock = item.stock_quantity;

      // If product existed, was previously in stock (>0), and is now out of stock (<=0)
      if (prevStock !== undefined && prevStock > 0 && newStock <= 0) {
        outOfStockAlerts.push({
          name: item.name,
          sku: item.sku,
          item_id: item.item_id,
        });
      }
    }

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

    // Send WhatsApp alerts if any products transitioned to 0 stock
    if (outOfStockAlerts.length > 0) {
      console.log(`Detected ${outOfStockAlerts.length} products transitioning to 0 stock. Sending alerts...`);
      const dateTimeStr = new Date().toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" });
      const contentSid = process.env.TWILIO_CONTENT_SID?.trim();

      if (contentSid) {
        // Send a template message for each product (WhatsApp Content API requirements)
        for (const item of outOfStockAlerts) {
          await sendWhatsAppMessage("", {
            "1": item.name,
            "2": item.sku,
            "3": String(item.item_id),
            "4": dateTimeStr,
          });
        }
      } else {
        // Fallback to grouped free-form text message (for active sessions)
        let message = "";
        if (outOfStockAlerts.length === 1) {
          const item = outOfStockAlerts[0];
          message = `⚠️ *התרעת מלאי: מוצר אזל מהמלאי!*\n\n* שם מוצר: ${item.name}\n* מק"ט (SKU): ${item.sku}\n* מזהה מוצר: ${item.item_id}\n* תאריך ושעה: ${dateTimeStr}`;
        } else {
          message = `⚠️ *התרעת מלאי: מספר מוצרים אזלו מהמלאי!*\n\n* תאריך ושעה: ${dateTimeStr}\n\n*פירוט המוצרים:*\n`;
          outOfStockAlerts.forEach((item, index) => {
            message += `${index + 1}. *${item.name}* (מק"ט: ${item.sku}, מזהה: ${item.item_id})\n`;
          });
        }
        await sendWhatsAppMessage(message);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Successfully synchronized ${successCount} products from Rivhit to Supabase.`,
      count: successCount,
      alertsSent: outOfStockAlerts.length,
    });
  } catch (err) {
    console.error("Sync products exception:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

