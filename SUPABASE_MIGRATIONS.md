# Guide: Running Supabase Database Migrations Programmatically via AI Agent

This document explains how an AI agent (or a programmatic developer script) can reliably run database migrations to Supabase, bypassing common CLI authentication hurdles and network-related timeout issues.

---

## 1. The Challenge with Standard CLI Migrations
Normally, database migrations in Supabase are performed using the CLI:
```bash
supabase db push
# or
supabase migration up
```
However, using the CLI in agentic/automated workflows has several pain points:
1. **Interactive Authentication**: The CLI requires interactive logins (`supabase login`), which are difficult for sandboxed AI agents or CI/CD pipelines to navigate.
2. **IPv6 Connection Issues**: Supabase's direct database hostname (e.g., `db.qrixnswlfamkyzpaitvx.supabase.co`) resolves to IPv6-only addresses. On local networks that do not fully support IPv6 (common in home/office environments and Windows OS), commands like `supabase db push` or direct PG connections will result in `ETIMEDOUT` errors.

---

## 2. The Solution: Programmatic Migrations via the IPv4 Pooler
To ensure a 100% reliable connection, the AI agent uses a **programmatic Node.js database client** (`pg`) over Supabase's **IPv4 Transaction Connection Pooler**.

### High-Level Flow
```mermaid
graph TD
    A[Read SQL Migration File] --> B[Force IPv4 DNS Resolution]
    B --> C[Connect to Supabase IPv4 Pooler]
    C --> D[Execute Migration SQL Statements]
    D --> E[Verify Schema and Tables]
```

---

## 3. Implementation Details

Here is the exact implementation pattern used to execute migrations successfully:

### Configuration: Database Hostnames
* **Direct Database URL (IPv6 - Fails on IPv4 networks)**:
  `postgresql://postgres:[password]@db.qrixnswlfamkyzpaitvx.supabase.co:5432/postgres`
* **Connection Pooler URL (IPv4 - Succeeds everywhere)**:
  `postgresql://postgres.qrixnswlfamkyzpaitvx:[password]@aws-1-ap-south-1.pooler.supabase.com:6543/postgres`
  * *Note*: The connection pooler uses port `6543`.
  * *Note*: The username must follow the pattern `postgres.[PROJECT_REF]` (e.g., `postgres.qrixnswlfamkyzpaitvx`).

### Migration Runner Script (`apply-migration.js`)
Save this script inside a workspace folder (e.g., `scratch/apply-migration.js`) and run it using Node:

```javascript
const fs = require('fs');
const path = require('path');
const dns = require('dns');

// 1. CRITICAL: Force Node to prioritize IPv4 over IPv6 dns lookups
// This prevents connection timeouts on IPv4-only networks.
if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

// 2. Load PG library (installed via npm install pg)
const { Client } = require('pg');

// 3. Define paths and connection configuration
const migrationFilePath = path.join(__dirname, '../supabase/migrations/20260529101114_new-migration.sql');

// Use the IPv4 pooler connection string
const connectionString = 'postgresql://postgres.qrixnswlfamkyzpaitvx:[YOUR_PASSWORD]@aws-1-ap-south-1.pooler.supabase.com:6543/postgres';

async function run() {
  console.log("Reading migration SQL file...");
  let sql;
  try {
    sql = fs.readFileSync(migrationFilePath, 'utf8');
  } catch (e) {
    console.error("Failed to read migration file:", e.message);
    process.exit(1);
  }

  console.log("Connecting to Supabase database...");
  const client = new Client({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false } // Required for Supabase SSL connections
  });

  try {
    await client.connect();
    console.log("Connected successfully!");

    console.log("Executing SQL migrations...");
    await client.query(sql);
    console.log("Migration executed successfully!");

    // 4. Verification Check
    console.log("Verifying schema modifications...");
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('products', 'sales_items')
    `);
    console.log("Active tables in 'public' schema:", tablesRes.rows.map(r => r.table_name));

  } catch (e) {
    console.error("Database migration error:", e);
  } finally {
    await client.end();
    console.log("Database connection closed.");
  }
}

run();
```

---

## 4. Best Practices for Programmatic Migrations
1. **Always use Transaction Poolers**: Do not query direct DB endpoints to avoid port blockers and IPv6 limits.
2. **Set DNS Resolution Order**: Node.js v17+ defaults to IPv6 lookup first (`dns.setDefaultResultOrder`). Overriding it to `ipv4first` is required for networks without IPv6 default gateways.
3. **Use SSL Options**: Supabase rejects unencrypted connections. Configure `{ ssl: { rejectUnauthorized: false } }` in the Postgres client parameters.
4. **Avoid Duplicate Rows/Key Violations**: Ensure your migrations use clauses like `CREATE TABLE IF NOT EXISTS` and check constraints before creating duplicate keys.
