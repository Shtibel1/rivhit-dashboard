-- 1. Create products table
create table if not exists public.products (
  item_id int8 primary key,
  sku text,
  name text not null,
  cost_price float8 default 0,
  sale_price float8 default 0,
  stock_quantity float8 default 0,
  category text,
  last_sync timestamptz default now()
);

-- Index for category filtering and SKU lookups
create index if not exists idx_products_category on public.products(category);
create index if not exists idx_products_sku on public.products(sku);

-- 2. Create sales_items table (line items from sales documents)
create table if not exists public.sales_items (
  id int8 generated always as identity primary key,
  document_number int8 not null,
  document_type int8 not null,
  document_date date not null,
  item_id int8 not null,
  name text,
  catalog_number text,
  quantity float8 not null default 0,
  price_nis float8 not null default 0,
  total_line float8 not null default 0,
  customer_id int8,
  created_at timestamptz default now()
);

-- Indexes for fast analytics queries
create index if not exists idx_sales_items_date on public.sales_items(document_date);
create index if not exists idx_sales_items_item_id on public.sales_items(item_id);

-- Create unique constraint to prevent double-syncing the same line item
alter table public.sales_items 
  add constraint unique_document_item unique (document_type, document_number, item_id);
