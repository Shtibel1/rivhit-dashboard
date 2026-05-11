import { NextRequest, NextResponse } from "next/server";
import { getDocuments } from "@/lib/rivhit";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const from_date = searchParams.get("from_date") ?? undefined;
    const until_date = searchParams.get("until_date") ?? undefined;
    const document_type = searchParams.get("document_type")
      ? Number(searchParams.get("document_type"))
      : undefined;

    const docs = await getDocuments({ from_date, until_date, document_type, rows_limit: 200 });
    return NextResponse.json(docs);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
