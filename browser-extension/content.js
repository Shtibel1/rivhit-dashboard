/**
 * content.js — MyGan מלאי
 * Runs on mygan.co.il/items/* product pages.
 * Extracts the מקט (catalog number), calls the dashboard API,
 * and injects a stock-level widget near the product title.
 */

(function () {
  "use strict";

  const LOG = (...args) => console.log("[MyGan מלאי]", ...args);
  const WARN = (...args) => console.warn("[MyGan מלאי]", ...args);
  const ERR  = (...args) => console.error("[MyGan מלאי]", ...args);

  LOG("content script loaded, URL:", location.href);

  // ── 1. Extract מקט from the page ───────────────────────────────────────────
  // The catalog number appears in the page as: מק"ט XXXX
  // We search the full document text for that pattern.
  function extractCatalogNumber() {
    // 1. Konimbo / mygan.co.il — catalog number is in .code_item
    const codeItem = document.querySelector(".code_item");
    if (codeItem) {
      const v = codeItem.textContent.trim();
      if (v) {
        LOG("found catalog number via .code_item:", v);
        return v;
      }
    }

    // 2. Structured meta / data attributes
    const metaCatalog = document.querySelector('[itemprop="sku"], [data-sku], [data-catalog]');
    if (metaCatalog) {
      const v = (metaCatalog.getAttribute("content") || metaCatalog.textContent || "").trim();
      if (v) {
        LOG("found catalog number via meta/attribute:", v);
        return v;
      }
    }

    // 3. Fallback: scan page text for מק"ט / מקט pattern
    const pattern = /מק[""״]?ט\s*[:：]?\s*([A-Za-z0-9\-_]+)/;
    LOG("scanning page text for מקט pattern...");
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    let scanned = 0;
    while ((node = walker.nextNode())) {
      scanned++;
      const m = node.nodeValue.match(pattern);
      if (m) {
        LOG(`found מקט in text node after scanning ${scanned} nodes:`, m[1].trim(), "| raw text:", JSON.stringify(node.nodeValue.trim()));
        return m[1].trim();
      }
    }
    WARN(`מקט not found after scanning ${scanned} text nodes. Dumping page body snippet:`, document.body.innerText.slice(0, 500));
    return null;
  }

  // ── 2. Build and inject the widget ─────────────────────────────────────────
  function createWidget() {
    const el = document.createElement("div");
    el.id = "mygan-inventory-widget";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    el.innerHTML = `
      <span class="mygan-inventory-label">מלאי:</span>
      <span class="mygan-inventory-value mygan-loading">טוען…</span>
    `;
    return el;
  }

  function injectWidget(widget) {
    // Try to place widget near the product title / add-to-cart button
    const candidates = [
      "h1.item_name",
      "h1",
      ".item-title",
      ".product-title",
      ".add_to_cart",
      ".buy-button",
    ];
    let anchor = null;
    for (const sel of candidates) {
      const found = document.querySelector(sel);
      LOG(`selector "${sel}":`, found ? found.outerHTML.slice(0, 80) : "not found");
      if (found && !anchor) anchor = found;
    }

    if (anchor) {
      LOG("injecting widget after:", anchor.outerHTML.slice(0, 80));
      anchor.insertAdjacentElement("afterend", widget);
    } else {
      WARN("no suitable anchor found — prepending widget to body");
      document.body.prepend(widget);
    }
  }

  function renderInventory(widget, data) {
    LOG("render inventory data:", JSON.stringify(data));
    const valueEl = widget.querySelector(".mygan-inventory-value");
    valueEl.classList.remove("mygan-loading", "mygan-error");

    if (data.error) {
      valueEl.classList.add("mygan-error");
      valueEl.textContent = "שגיאה בטעינת מלאי";
      return;
    }

    const total = data.total_quantity ?? 0;
    const statusClass = total > 5 ? "mygan-in-stock" : total > 0 ? "mygan-low-stock" : "mygan-out-of-stock";
    const statusText = total > 5 ? "במלאי" : total > 0 ? "מלאי נמוך" : "אזל מהמלאי";

    let html = `<span class="mygan-badge ${statusClass}">${statusText}</span> <strong>${total}</strong> יחידות`;

    if (data.storages && data.storages.length > 1) {
      html += `<ul class="mygan-storages">`;
      for (const s of data.storages) {
        html += `<li>${escapeHtml(s.storage_name)}: <strong>${s.quantity}</strong></li>`;
      }
      html += `</ul>`;
    }

    valueEl.innerHTML = html;
  }

  function renderError(widget, message) {
    const valueEl = widget.querySelector(".mygan-inventory-value");
    valueEl.classList.remove("mygan-loading");
    valueEl.classList.add("mygan-error");
    valueEl.textContent = message;
  }

  function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // ── 3. Fetch inventory from dashboard API ───────────────────────────────────
  async function fetchInventory(catalogNumber, dashboardUrl, apiKey) {
    const url = new URL("/api/inventory", dashboardUrl);
    url.searchParams.set("catalog_number", catalogNumber);
    LOG("fetching:", url.toString());

    const res = await fetch(url.toString(), {
      headers: { "x-extension-key": apiKey },
      credentials: "omit",
    });

    LOG("response status:", res.status);
    if (!res.ok) {
      const body = await res.text().catch(() => "(empty)");
      ERR("API error response body:", body);
      throw new Error(`HTTP ${res.status}: ${body}`);
    }
    const json = await res.json();
    LOG("API response:", JSON.stringify(json));
    return json;
  }

  // ── 4. Main ─────────────────────────────────────────────────────────────────
  async function main() {
    LOG("main() started");
    const catalogNumber = extractCatalogNumber();
    if (!catalogNumber) {
      WARN("no catalog number found — widget will not be shown");
      return;
    }
    LOG("catalog number:", catalogNumber);

    const widget = createWidget();
    injectWidget(widget);

    let dashboardUrl, apiKey;
    try {
      const result = await chrome.storage.sync.get(["dashboardUrl", "apiKey"]);
      dashboardUrl = result.dashboardUrl;
      apiKey = result.apiKey;
      LOG("settings loaded — dashboardUrl:", dashboardUrl, "| apiKey set:", !!apiKey);
    } catch (e) {
      ERR("failed to read chrome.storage:", e);
      renderError(widget, "שגיאה בקריאת הגדרות");
      return;
    }

    if (!dashboardUrl || !apiKey) {
      WARN("dashboardUrl or apiKey missing in storage");
      renderError(widget, "נא להגדיר את כתובת הדאשבורד ומפתח ה-API בתוסף");
      return;
    }

    try {
      const data = await fetchInventory(catalogNumber, dashboardUrl, apiKey);
      renderInventory(widget, data);
    } catch (err) {
      ERR("fetchInventory failed:", err);
      renderError(widget, `שגיאה: ${err.message}`);
    }
  }

  main().catch((err) => ERR("unhandled error in main():", err));
})();
