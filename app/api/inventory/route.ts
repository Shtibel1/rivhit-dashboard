import { NextRequest, NextResponse } from "next/server";
import { getItemInventory } from "@/lib/rivhit";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Extension-Key",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET(req: NextRequest) {
  // Auth: validate extension API key
  const expectedKey = process.env.EXTENSION_API_KEY;
  if (!expectedKey) {
    return NextResponse.json(
      { error: "Server misconfiguration: EXTENSION_API_KEY not set" },
      { status: 500, headers: corsHeaders() },
    );
  }
  const providedKey = req.headers.get("x-extension-key");
  if (providedKey !== expectedKey) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: corsHeaders() },
    );
  }

  const catalogNumber = req.nextUrl.searchParams.get("catalog_number");
  if (!catalogNumber || !catalogNumber.trim()) {
    return NextResponse.json(
      { error: "Missing required query parameter: catalog_number" },
      { status: 400, headers: corsHeaders() },
    );
  }

  try {
    const inventory = await getItemInventory(catalogNumber.trim());
    // Return full object including _raw for inspection
    return NextResponse.json(inventory, { headers: corsHeaders() });
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500, headers: corsHeaders() },
    );
  }
}
