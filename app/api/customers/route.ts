import { NextResponse } from "next/server";
import { getCustomers } from "@/lib/rivhit";

export async function GET() {
  try {
    const customers = await getCustomers({ rows_limit: 500 });
    return NextResponse.json(customers);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
