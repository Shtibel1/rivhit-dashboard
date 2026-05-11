import { NextRequest, NextResponse } from "next/server";
import { getPaymentReport } from "@/lib/rivhit";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const from_date = searchParams.get("from_date") ?? undefined;
    const until_date = searchParams.get("until_date") ?? undefined;

    const payments = await getPaymentReport({ from_date, until_date });
    return NextResponse.json(payments);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
