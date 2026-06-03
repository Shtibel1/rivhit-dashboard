-- 1. Create documents table
create table if not exists public.documents (
  document_number int8 not null,
  document_type int4 not null,
  document_type_name text not null,
  sort_code int4,
  document_date date not null,
  customer_id int8,
  customer_name text,
  amount float8 not null default 0,
  total_vat float8 not null default 0,
  is_cancelled boolean not null default false,
  is_closed boolean not null default false,
  reference text,
  comments text,
  document_link text,
  created_at timestamptz default now(),
  primary key (document_type, document_number)
);

-- Indexes for fast queries
create index if not exists idx_documents_date on public.documents(document_date);
create index if not exists idx_documents_customer_id on public.documents(customer_id);

-- 2. Create payments table (from payment reports)
create table if not exists public.payments (
  id int8 generated always as identity primary key,
  receipt_date date not null,
  payment_type int4 not null,
  amount float8 not null default 0,
  customer_last_name text,
  customer_first_name text,
  customer_id int8,
  receipt_number int8 not null,
  receipt_type int4 not null,
  reference text,
  unique_key text not null unique,
  created_at timestamptz default now()
);

-- Indexes for fast queries
create index if not exists idx_payments_date on public.payments(receipt_date);
create index if not exists idx_payments_customer_id on public.payments(customer_id);

-- 3. Create customers table
create table if not exists public.customers (
  customer_id int8 primary key,
  customer_name text not null,
  customer_email text,
  customer_phone text,
  customer_city text,
  customer_address text,
  created_at timestamptz default now()
);
