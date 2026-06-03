import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const from_date = searchParams.get("from_date") || undefined;
    const until_date = searchParams.get("until_date") || undefined;
    const document_type = searchParams.get("document_type")
      ? Number(searchParams.get("document_type"))
      : undefined;

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    let query = supabase
      .from("documents")
      .select("*")
      .order("document_date", { ascending: false })
      .order("document_number", { ascending: false })
      .limit(200);

    if (from_date) {
      query = query.gte("document_date", from_date);
    }
    if (until_date) {
      query = query.lte("document_date", until_date);
    }
    if (document_type !== undefined) {
      query = query.eq("document_type", document_type);
    }

    const { data: docs, error } = await query;

    if (error) {
      console.error("Error fetching documents from Supabase:", error);
      throw new Error(error.message);
    }

    return NextResponse.json(docs || []);
  } catch (err) {
    console.error("Documents API GET exception:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
