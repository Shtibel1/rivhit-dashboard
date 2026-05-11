const BASE_URL = "https://api.rivhit.co.il/online/RivhitOnlineAPI.svc";

export const PAYMENT_TYPES: Record<number, string> = {
  1: "מזומן",
  2: "צ'ק",
  3: "העברה בנקאית",
  4: "אשראי",
  10: "אחר",
};

// DD/MM/YYYY → YYYY-MM-DD for sorting/comparison
export function parseRivhitDate(s: string): string {
  if (!s) return "";
  const [d, m, y] = s.split("/");
  if (!d || !m || !y) return s;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

// DD/MM/YYYY → locale display
export function formatDisplayDate(s: string): string {
  if (!s) return "—";
  const iso = parseRivhitDate(s);
  const date = new Date(iso);
  if (isNaN(date.getTime())) return s;
  return date.toLocaleDateString("he-IL");
}

async function rivhitPost<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${BASE_URL}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_token: process.env.RIVHIT_API_TOKEN, ...body }),
  });

  if (!res.ok) throw new Error(`Rivhit API error ${res.status}: ${endpoint}`);

  const data = await res.json();
  if (data.error_code && data.error_code !== 0) {
    throw new Error(data.client_message || `Error ${data.error_code}`);
  }

  return data;
}

// ---- Documents ----

export interface Document {
  document_number: number;
  document_type: number;
  document_type_name: string;
  sort_code: number;
  document_date: string; // DD/MM/YYYY
  customer_id: number;
  customer_name: string;
  amount: number;
  total_vat: number;
  is_cancelled: boolean;
  is_closed: boolean;
  reference?: string;
  comments?: string;
  document_link?: string;
}

interface DocumentListRaw {
  error_code: number;
  data: { document_list: Document[] };
}

export async function getDocuments(params: {
  from_date?: string;
  until_date?: string;
  document_type?: number;
  customer_id?: number;
  rows_limit?: number;
} = {}): Promise<Document[]> {
  const res = await rivhitPost<DocumentListRaw>("Document.List", params);
  return res.data?.document_list ?? [];
}

// ---- Customers ----

interface CustomerRaw {
  customer_id: number;
  last_name: string;
  first_name: string;
  email: string;
  phone: string;
  phone2?: string;
  city: string;
  street: string;
  zipcode?: string;
  vat_number?: number;
  id_number?: number;
  comments?: string;
}

export interface Customer {
  customer_id: number;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  customer_city: string;
  customer_address: string;
}

interface CustomerListRaw {
  error_code: number;
  data: { customer_list: CustomerRaw[] };
}

export async function getCustomers(params: {
  rows_limit?: number;
  from_row?: number;
} = {}): Promise<Customer[]> {
  const res = await rivhitPost<CustomerListRaw>("Customer.List", params);
  const list = res.data?.customer_list ?? [];
  return list.map((c) => ({
    customer_id: c.customer_id,
    customer_name: [c.last_name, c.first_name].filter(Boolean).join(" ").trim() || `לקוח #${c.customer_id}`,
    customer_email: c.email ?? "",
    customer_phone: c.phone ?? "",
    customer_city: c.city ?? "",
    customer_address: c.street ?? "",
  }));
}

// ---- Payments ----

export interface PaymentReportItem {
  receipt_date: string; // DD/MM/YYYY
  payment_type: number;
  amount: number;
  customer_last_name: string;
  customer_first_name: string;
  customer_id: number;
  receipt_number: number;
  receipt_type: number;
  reference?: string | null;
}

interface PaymentReportRaw {
  error_code: number;
  data: { payments: PaymentReportItem[] };
}

export async function getPaymentReport(params: {
  from_date?: string;
  until_date?: string;
} = {}): Promise<PaymentReportItem[]> {
  const res = await rivhitPost<PaymentReportRaw>("Payment.Report", params);
  return res.data?.payments ?? [];
}

// ---- PnL ----

export interface PnLReport {
  income: number;
  expenses: number;
  profit: number;
  vat_income?: number;
  vat_expenses?: number;
}

interface PnLResponse {
  error_code: number;
  data: PnLReport;
}

export async function getPnLReport(params: {
  from_date?: string;
  until_date?: string;
} = {}): Promise<PnLReport | null> {
  const res = await rivhitPost<PnLResponse>("Accounting.PnLReport", params);
  return res.data ?? null;
}
