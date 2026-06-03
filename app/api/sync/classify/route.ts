import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";

const CATEGORIES = [
  "במבוק ומוצרי עץ",
  "רשתות צל וברזנטים",
  "דשא סינטטי וחיפויים",
  "ריהוט גן",
  "השקייה וצנרת",
  "כלי עבודה וגינון",
  "אחר",
];

// High-accuracy keyword fallback classifier for Hebrew product names
function classifyProductByKeywords(name: string): string {
  const lowercaseName = name.toLowerCase();

  // 1. Bamboo & Wood
  if (
    lowercaseName.includes("במבוק") ||
    lowercaseName.includes("עץ") ||
    lowercaseName.includes("גדר קנה") ||
    lowercaseName.includes("ערבה") ||
    lowercaseName.includes("מקלות") ||
    lowercaseName.includes("לוח עץ")
  ) {
    return "במבוק ומוצרי עץ";
  }

  // 2. Shade Nets & Tarps
  if (
    lowercaseName.includes("צל") ||
    lowercaseName.includes("רשת") ||
    lowercaseName.includes("יוטה") ||
    lowercaseName.includes("ברזנט") ||
    lowercaseName.includes("כיסוי") ||
    lowercaseName.includes("שמשון") ||
    lowercaseName.includes("יוטות") ||
    lowercaseName.includes("בד יוטה")
  ) {
    return "רשתות צל וברזנטים";
  }

  // 3. Synthetic Grass & Coverings
  if (
    lowercaseName.includes("דשא") ||
    lowercaseName.includes("סינטטי") ||
    lowercaseName.includes("סינתטי") ||
    lowercaseName.includes("חיפוי") ||
    lowercaseName.includes("טוף") ||
    lowercaseName.includes("חלוק") ||
    lowercaseName.includes("אבני חיפוי") ||
    lowercaseName.includes("פיזור") ||
    lowercaseName.includes("יריעת הגנה")
  ) {
    return "דשא סינטטי וחיפויים";
  }

  // 4. Garden Furniture
  if (
    lowercaseName.includes("כיסא") ||
    lowercaseName.includes("שולחן") ||
    lowercaseName.includes("ערסל") ||
    lowercaseName.includes("שמשייה") ||
    lowercaseName.includes("מטרייה") ||
    lowercaseName.includes("נדנדה") ||
    lowercaseName.includes("ספסל") ||
    lowercaseName.includes("ריהוט") ||
    lowercaseName.includes("כורסא")
  ) {
    return "ריהוט גן";
  }

  // 5. Irrigation & Pipes
  if (
    lowercaseName.includes("טפטפ") ||
    lowercaseName.includes("השק") ||
    lowercaseName.includes("צינור") ||
    lowercaseName.includes("צנרת") ||
    lowercaseName.includes("מחבר") ||
    lowercaseName.includes("ברז") ||
    lowercaseName.includes("ממטר") ||
    lowercaseName.includes("מתז") ||
    lowercaseName.includes("פילטר") ||
    lowercaseName.includes("בקר") ||
    lowercaseName.includes("מחשב השק")
  ) {
    return "השקייה וצנרת";
  }

  // 6. Tools & Gardening
  if (
    lowercaseName.includes("מזמרה") ||
    lowercaseName.includes("טוריה") ||
    lowercaseName.includes("מעדר") ||
    lowercaseName.includes("חרמש") ||
    lowercaseName.includes("מכסח") ||
    lowercaseName.includes("מפוח") ||
    lowercaseName.includes("כלי") ||
    lowercaseName.includes("עבודה") ||
    lowercaseName.includes("כפפות") ||
    lowercaseName.includes("מספריים") ||
    lowercaseName.includes("מגרפה") ||
    lowercaseName.includes("שתיל") ||
    lowercaseName.includes("אדמה") ||
    lowercaseName.includes("דשן") ||
    lowercaseName.includes("קומפוסט")
  ) {
    return "כלי עבודה וגינון";
  }

  return "אחר";
}

async function classifyWithGemini(apiKey: string, products: { item_id: number; name: string }[]): Promise<Record<number, string>> {
  const prompt = `
You are an expert product categorization AI for a garden and landscaping supply store named "Mygan".
Your task is to classify a list of products (written in Hebrew) into one of the following exact categories:
${CATEGORIES.map((c) => `- "${c}"`).join("\n")}

Here is the list of products in JSON format:
${JSON.stringify(products.map(p => ({ item_id: p.item_id, name: p.name })), null, 2)}

Respond ONLY with a valid JSON array of objects. Do not include any markdown formatting, backticks, or extra text.
Each object must have "item_id" (number) and "category" (string) fields. The "category" value MUST be exactly one of the categories listed above.

Example Response:
[
  { "item_id": 567145, "category": "במבוק ומוצרי עץ" }
]
`;

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1,
      }
    })
  });

  if (!res.ok) {
    throw new Error(`Gemini API error: ${res.statusText}`);
  }

  const result = await res.json();
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty response from Gemini");

  const parsed = JSON.parse(text.trim());
  const mapping: Record<number, string> = {};
  if (Array.isArray(parsed)) {
    parsed.forEach((item: { item_id: number; category: string }) => {
      if (item.item_id && item.category && CATEGORIES.includes(item.category)) {
        mapping[Number(item.item_id)] = item.category;
      }
    });
  }
  return mapping;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const reclassifyAll = !!body.reclassifyAll;
    const batchSize = 100; // Classify up to 100 products per request

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    // 1. Fetch products needing classification
    let query = supabase.from("products").select("item_id, name, category");
    if (!reclassifyAll) {
      query = query.is("category", null);
    }

    const { data: products, error: fetchError } = await query;
    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!products || products.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No products require classification.",
        classifiedCount: 0,
        remainingCount: 0,
        hasMore: false,
      });
    }

    const currentBatch = products.slice(0, batchSize);
    const apiKey = process.env.GEMINI_API_KEY;
    const isGeminiAvailable = !!apiKey && apiKey !== "your-gemini-api-key";

    console.log(`Classifying batch of ${currentBatch.length} products (AI Available: ${isGeminiAvailable})...`);

    let classifications: Record<number, string> = {};

    if (isGeminiAvailable) {
      try {
        classifications = await classifyWithGemini(apiKey, currentBatch);
      } catch (err) {
        console.warn("Gemini classification failed, falling back to keywords:", err);
        // Fallback to keywords
        currentBatch.forEach((p) => {
          classifications[p.item_id] = classifyProductByKeywords(p.name);
        });
      }
    } else {
      // Direct keyword classification fallback
      currentBatch.forEach((p) => {
        classifications[p.item_id] = classifyProductByKeywords(p.name);
      });
    }

    // 2. Update categories in Supabase
    const updates = currentBatch.map((p) => ({
      item_id: p.item_id,
      name: p.name, // Keep existing fields
      category: classifications[p.item_id] || "אחר",
    }));

    const { error: updateError } = await supabase
      .from("products")
      .upsert(updates, { onConflict: "item_id" });

    if (updateError) {
      console.error("Error updating categories:", updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const remainingCount = products.length - currentBatch.length;

    return NextResponse.json({
      success: true,
      classifiedCount: currentBatch.length,
      remainingCount,
      hasMore: remainingCount > 0,
      method: isGeminiAvailable ? "Gemini AI" : "Local Keywords (Fallback)",
    });
  } catch (err) {
    console.error("Classification exception:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
