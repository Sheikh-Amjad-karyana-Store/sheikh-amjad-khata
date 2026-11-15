/* Backup export: builds the data for the Excel (or CSV) backup.
   buildBackupData() is plain logic with no browser code, so it is easy to test.
   downloadBackup() loads the ExcelJS library when needed and saves the file. */

const EXCELJS_URL = "https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js";

const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString("en-GB", { hour12: false }) : "");
const stamp = () => {
  const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16).replace("T", "_").replace(":", "-");
};

export const SUMMARY_COLUMNS = [
  { key: "id", header: "Customer ID", width: 12 },
  { key: "name", header: "Customer Name", width: 26 },
  { key: "phone", header: "Phone", width: 16 },
  { key: "address", header: "Address", width: 28 },
  { key: "billed", header: "Total Billed", width: 14, money: true },
  { key: "paid", header: "Total Paid", width: 14, money: true },
  { key: "pending", header: "Pending (customer owes)", width: 22, money: true },
  { key: "advance", header: "Advance (shop owes)", width: 20, money: true },
  { key: "status", header: "Status", width: 12 },
  { key: "lastEntry", header: "Last Entry Date", width: 16 },
  { key: "lastPayDate", header: "Last Payment Date", width: 18 },
  { key: "lastPayAmount", header: "Last Payment Amount", width: 20, money: true },
  { key: "count", header: "Entries", width: 9 },
  { key: "addedBy", header: "Customer Added By", width: 18 }
];

export const ENTRY_COLUMNS = [
  { key: "cid", header: "Customer ID", width: 12 },
  { key: "name", header: "Customer Name", width: 26 },
  { key: "phone", header: "Phone", width: 16 },
  { key: "date", header: "Date", width: 12 },
  { key: "type", header: "Type", width: 10 },
  { key: "items", header: "Items", width: 40 },
  { key: "note", header: "Note", width: 24 },
  { key: "bill", header: "Bill", width: 12, money: true },
  { key: "paid", header: "Paid", width: 12, money: true },
  { key: "balance", header: "Balance After (customer owes)", width: 26, money: true },
  { key: "by", header: "Entered By", width: 16 },
  { key: "editedBy", header: "Edited By", width: 16 },
  { key: "enteredAt", header: "Entered At", width: 20 },
  { key: "status", header: "Status", width: 10 }
];

export function buildBackupData(customers, txs) {
  const sortTx = (a, z) => (a.date + a.ts).localeCompare(z.date + z.ts);
  const byCustomer = {};
  txs.forEach((t) => (byCustomer[t.cid] = byCustomer[t.cid] || []).push(t));

  const summary = [], entries = [];
  const sorted = [...customers].sort((a, b) => a.name.localeCompare(b.name));

  for (const c of sorted) {
    let run = 0, billed = 0, paid = 0, count = 0;
    let lastEntry = "", lastPayDate = "", lastPayAmount = "";

    for (const t of (byCustomer[c.id] || []).sort(sortTx)) {
      const deleted = !!t.deleted;
      if (!deleted) {
        run += (t.total || 0) - (t.paid || 0);
        billed += t.total || 0;
        paid += t.paid || 0;
        count++;
        lastEntry = t.date;
        if ((t.paid || 0) > 0) { lastPayDate = t.date; lastPayAmount = t.paid; }
      }
      entries.push({
        cid: c.id, name: c.name, phone: c.phone || "", date: t.date,
        type: t.kind === "sale" ? "Purchase" : "Payment",
        items: t.items || "", note: t.note || "",
        bill: t.kind === "sale" ? t.total : "", paid: t.paid || 0,
        balance: deleted ? "" : run,
        by: t.by || "", editedBy: t.editedBy || "", enteredAt: fmtTime(t.ts),
        status: deleted ? "Deleted" : "Active"
      });
    }

    summary.push({
      id: c.id, name: c.name, phone: c.phone || "", address: c.address || "",
      billed, paid, pending: Math.max(run, 0), advance: Math.max(-run, 0),
      status: run > 0 ? "Pending" : run < 0 ? "Advance" : "Clear",
      lastEntry, lastPayDate, lastPayAmount, count, addedBy: c.createdBy || ""
    });
  }

  const totals = {
    customers: summary.length,
    pending: summary.reduce((s, r) => s + r.pending, 0),
    advance: summary.reduce((s, r) => s + r.advance, 0),
    pendingCount: summary.filter((r) => r.status === "Pending").length,
    activeEntries: entries.filter((e) => e.status === "Active").length,
    deletedEntries: entries.filter((e) => e.status === "Deleted").length
  };
  return { summary, entries, totals };
}

/* ---------- CSV fallback (used only if the Excel library cannot load) ---------- */
export function toCsv(rows, columns) {
  const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [columns.map((c) => cell(c.header)).join(",")];
  rows.forEach((r) => lines.push(columns.map((c) => cell(r[c.key])).join(",")));
  return "\ufeff" + lines.join("\r\n");
}

function saveBlob(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

function loadExcelJs() {
  return new Promise((resolve, reject) => {
    if (window.ExcelJS) return resolve();
    const s = document.createElement("script");
    s.src = EXCELJS_URL;
    s.onload = resolve;
    s.onerror = () => reject(new Error("Excel library could not load"));
    document.head.appendChild(s);
  });
}

function addSheet(wb, name, columns, rows) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  ws.addRows(rows);
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F6F54" } };
  head.alignment = { vertical: "middle", wrapText: true };
  ws.eachRow((row, n) => {
    if (n === 1) return;
    columns.forEach((c, i) => { if (c.money) row.getCell(i + 1).numFmt = "#,##0"; });
  });
  // Filter buttons on every column, so any customer can be filtered out easily.
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return ws;
}

/* Returns "xlsx" or "csv" depending on what was downloaded. */
export async function downloadBackup({ customers, txs, by }) {
  const { summary, entries, totals } = buildBackupData(customers, txs);
  const name = `khata-backup-${stamp()}`;

  try {
    await loadExcelJs();
    const wb = new window.ExcelJS.Workbook();
    wb.creator = by;
    wb.created = new Date();

    addSheet(wb, "Customers", SUMMARY_COLUMNS, summary);
    addSheet(wb, "All Entries", ENTRY_COLUMNS, entries);

    const info = wb.addWorksheet("Info");
    info.columns = [{ width: 34 }, { width: 40 }];
    [
      ["Sheikh Amjad Karyana Store", "Khata backup"],
      ["Backup taken at", fmtTime(new Date().toISOString())],
      ["Taken by", by],
      ["Customers", totals.customers],
      ["Customers with pending amount", totals.pendingCount],
      ["Total pending (customers owe shop)", totals.pending],
      ["Total advance (shop owes customers)", totals.advance],
      ["Active entries", totals.activeEntries],
      ["Deleted entries (kept for record)", totals.deletedEntries],
      ["", ""],
      ["Tip", "Use the filter arrows on row 1 of the Customers or All Entries sheet to find one customer."]
    ].forEach((r) => info.addRow(r));
    info.getRow(1).font = { bold: true };

    const buf = await wb.xlsx.writeBuffer();
    saveBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), name + ".xlsx");
    return "xlsx";
  } catch (err) {
    console.error("Excel export failed, using CSV instead:", err);
    saveBlob(new Blob([toCsv(summary, SUMMARY_COLUMNS)], { type: "text/csv" }), name + "-customers.csv");
    saveBlob(new Blob([toCsv(entries, ENTRY_COLUMNS)], { type: "text/csv" }), name + "-entries.csv");
    return "csv";
  }
}
