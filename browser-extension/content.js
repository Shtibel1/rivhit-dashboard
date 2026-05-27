/**
 * content.js — MyGan מלאי
 * Runs on mygan.co.il/items/* product pages.
 * Extracts the מקט (catalog number), calls the dashboard API,
 * and injects a stock-level widget near the product title.
 */

(function () {
  "use strict";

  // ── 1. Extract מקט from the page ───────────────────────────────────────────
  // The catalog number appears in the page as: מק"ט XXXX
  // We search the full document text for that pattern.
  function extractCatalogNumber() {
    // Try structured meta / data attributes first
    const metaCatalog = document.querySelector('[itemprop="sku"], [data-sku], [data-catalog]');
    if (metaCatalog) {
      const v = (metaCatalog.getAttribute("content") || metaCatalog.textContent || "").trim();
      if (v) return v;
    }

    // Fallback: scan page text for מק"ט / מקט pattern
    const pattern = /מק[""״]?ט\s*[:：]?\s*([A-Za-z0-9\-_]+)/;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const m = node.nodeValue.match(pattern);
      if (m) return m[1].trim();
    }
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
      anchor = document.querySelector(sel);
      if (anchor) break;
    }

    if (anchor) {
      anchor.insertAdjacentElement("afterend", widget);
    } else {
      // Fallback: prepend to body
      document.body.prepend(widget);
    }
  }

  function renderInventory(widget, data) {
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

    const res = await fetch(url.toString(), {
      headers: { "x-extension-key": apiKey },
      credentials: "omit",
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return res.json();
  }

  // ── 4. Main ─────────────────────────────────────────────────────────────────
  async function main() {
    const catalogNumber = extractCatalogNumber();
    if (!catalogNumber) {
      // No product catalog number found — nothing to show
      return;
    }

    const widget = createWidget();
    injectWidget(widget);

    let dashboardUrl, apiKey;
    try {
      const result = await chrome.storage.sync.get(["dashboardUrl", "apiKey"]);
      dashboardUrl = result.dashboardUrl;
      apiKey = result.apiKey;
    } catch {
      renderError(widget, "שגיאה בקריאת הגדרות");
      return;
    }

    if (!dashboardUrl || !apiKey) {
      renderError(widget, "נא להגדיר את כתובת הדאשבורד ומפתח ה-API בתוסף");
      return;
    }

    try {
      const data = await fetchInventory(catalogNumber, dashboardUrl, apiKey);
      renderInventory(widget, data);
    } catch (err) {
      renderError(widget, `שגיאה: ${err.message}`);
    }
  }

  main();
})();
