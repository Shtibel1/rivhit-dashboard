import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { data: customers, error } = await supabase
      .from("customers")
      .select("*")
      .order("customer_name", { ascending: true })
      .limit(500);

    if (error) {
      console.error("Error fetching customers from Supabase:", error);
      throw new Error(error.message);
    }

    return NextResponse.json(customers || []);
  } catch (err) {
    console.error("Customers API GET exception:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
