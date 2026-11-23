/* Khata app: customer credit ledger.
   Data lives in Supabase (Postgres) so the owner and his son see the same records.
   Tables are created by setup.sql: customers and transactions.
   Balance of a customer = sum(total) - sum(paid) over non-deleted transactions.
   Positive = customer owes the shop. Negative = shop owes the customer. */

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.111.0/+esm";
import { supabaseUrl, supabaseKey, USER_NAMES } from "./config.js";
import { downloadBackup } from "./backup.js";
import { digits, cleanName, nameKey, findMatches } from "./names.js";

/* ---------- Helpers ---------- */
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => "Rs " + Math.abs(Number(n) || 0).toLocaleString("en-PK");
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const num = (v) => Math.max(0, Number(v) || 0);

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2800);
}

/* ---------- State ---------- */
let user = null;
let customers = [], txs = [];
let selectedId = null, filter = "all", query = "";
const userName = () => USER_NAMES[user?.email] || user?.email?.split("@")[0] || "Unknown";

/* ---------- Start ---------- */
const configured = !supabaseUrl.startsWith("PASTE");
const sb = configured ? createClient(supabaseUrl, supabaseKey) : null;
let uid = null, subscribed = false;

if (!configured) {
  $("#login").classList.remove("hidden");
  $("#loginError").textContent = "Supabase is not set up yet. Fill in js/config.js first.";
} else {
  sb.auth.onAuthStateChange((_event, session) => {
    user = session?.user || null;
    $("#login").classList.toggle("hidden", !!user);
    $("#app").classList.toggle("hidden", !user);
    if (!user) { uid = null; customers = []; txs = []; return; }
    if (user.id === uid) return;               // token refresh: nothing to do
    uid = user.id;
    $("#whoami").textContent = userName();
    setTimeout(startSession, 0);               // outside the callback, avoids a Supabase auth deadlock
  });
}

async function startSession() {
  await load();
  if (!subscribed) {
    subscribed = true;
    // Any change by any user reloads the data.
    sb.channel("khata").on("postgres_changes", { event: "*", schema: "public" }, load).subscribe();
  }
  await checkBackup();
}

async function load() {
  const [c, t] = await Promise.all([sb.from("customers").select("*"), sb.from("transactions").select("*")]);
  if (c.error || t.error) return toast((c.error || t.error).message);
  customers = c.data.map((r) => ({
    id: String(r.id), name: r.name, phone: r.phone, address: r.address,
    createdBy: r.created_by, editedBy: r.edited_by, createdAt: r.created_at
  }));
  txs = t.data.map((r) => ({
    id: String(r.id), cid: String(r.customer_id), kind: r.kind, items: r.items, note: r.note,
    total: Number(r.total), paid: Number(r.paid), date: r.date, ts: r.created_at,
    by: r.by_user, editedBy: r.edited_by, deleted: r.deleted
  }));
  render();
}

/* ---------- Calculations ---------- */
const liveTx = () => txs.filter((t) => !t.deleted);
function balances() {
  const b = {};
  liveTx().forEach((t) => { b[t.cid] = (b[t.cid] || 0) + (t.total || 0) - (t.paid || 0); });
  return b;
}
const state = (b) => (b > 0 ? "owe" : b < 0 ? "adv" : "clear");
const label = (b) => b > 0 ? `Pending ${money(b)}` : b < 0 ? `Shop owes ${money(b)}` : "Clear";
const tag = (b) => `<span class="tag ${state(b)}">${label(b)}</span>`;

/* ---------- Render ---------- */
function render() {
  if (!user) return;
  const bal = balances();
  renderStats(bal);
  renderList(bal);
  renderDetail(bal);
  $("#main").classList.toggle("has-sel", !!selectedId);
}

function renderStats(bal) {
  let owe = 0, adv = 0, oweN = 0, advN = 0, clearN = 0;
  customers.forEach((c) => {
    const b = bal[c.id] || 0;
    if (b > 0) { owe += b; oweN++; } else if (b < 0) { adv += -b; advN++; } else clearN++;
  });
  $("#stats").innerHTML = `
    <div class="stat big"><b>${money(owe)}</b><span>Total to receive from customers</span></div>
    <div class="stat"><b>${oweN}</b><span>Customers with pending amount</span></div>
    <div class="stat"><b>${clearN}</b><span>Customers with clear account</span></div>
    <div class="stat"><b>${advN} (${money(adv)})</b><span>Customers who paid extra. Shop owes them</span></div>
    <div class="stat"><b>${customers.length}</b><span>Total customers</span></div>`;
}

function renderList(bal) {
  const q = nameKey(query), qd = digits(query);
  const rows = customers
    .filter((c) => !q || nameKey(c.name).includes(q) || (qd && digits(c.phone).includes(qd)))
    .filter((c) => filter === "all" || state(bal[c.id] || 0) === filter)
    .sort((a, b) => (bal[b.id] || 0) - (bal[a.id] || 0));
  $("#customerList").innerHTML = rows.length
    ? rows.map((c) => `
      <button class="cust ${c.id === selectedId ? "sel" : ""}" data-open="${c.id}">
        <span>${esc(c.name)}<small>${esc(c.phone || "No phone")}</small></span>
        ${tag(bal[c.id] || 0)}
      </button>`).join("")
    : `<p class="empty">No customer found. Use "Add customer" to create one.</p>`;
}

function renderDetail(bal) {
  const box = $("#detail");
  const c = customers.find((x) => x.id === selectedId);
  if (!c) { box.innerHTML = `<p class="empty">Select a customer to see the full account.</p>`; return; }

  const b = bal[c.id] || 0;
  const list = liveTx().filter((t) => t.cid === c.id)
    .sort((a, z) => (a.date + a.ts).localeCompare(z.date + z.ts));
  let run = 0;
  const withRun = list.map((t) => { run += (t.total || 0) - (t.paid || 0); return { ...t, run }; }).reverse();

  box.innerHTML = `
    <button class="btn small back" data-back>Back to list</button>
    <div class="dhead">
      <div>
        <h2>${esc(c.name)}</h2>
        <div class="muted">${esc(c.phone || "No phone")}${c.address ? " | " + esc(c.address) : ""}</div>
        <div class="muted">Added by ${esc(c.createdBy)}${c.editedBy ? ". Last edited by " + esc(c.editedBy) : ""}</div>
      </div>
      <div><button class="btn small" data-editcust>Edit details</button></div>
    </div>
    <div class="balance ${state(b)}">${b > 0 ? "Pending: " + money(b) : b < 0 ? "Customer paid extra. Shop owes: " + money(b) : "Account is clear"}</div>
    <div class="row-actions">
      <button class="btn primary" data-new="sale">New purchase</button>
      <button class="btn" data-new="payment">Receive payment</button>
    </div>
    ${withRun.length ? withRun.map((t) => `
      <div class="tx">
        <div class="tx-top"><span>${t.kind === "sale" ? "Purchase" : "Payment received"}</span><span>${esc(t.date)}</span></div>
        ${t.items ? `<p>${esc(t.items)}</p>` : ""}${t.note ? `<p class="muted">${esc(t.note)}</p>` : ""}
        <div class="nums">
          ${t.kind === "sale" ? `<span>Bill: <b>${money(t.total)}</b></span>` : ""}
          <span>Paid: <b>${money(t.paid)}</b></span>
          <span>Balance after: <b>${t.run >= 0 ? money(t.run) : money(t.run) + " (extra)"}</b></span>
        </div>
        <div class="meta">Entered by ${esc(t.by)}${t.editedBy ? ". Edited by " + esc(t.editedBy) : ""}</div>
        <div class="row-actions" style="margin:.5rem 0 0">
          <button class="btn small" data-edittx="${t.id}">Edit</button>
          <button class="btn small danger" data-deltx="${t.id}">Delete</button>
        </div>
      </div>`).join("") : `<p class="empty">No entries yet. Add the first purchase.</p>`}`;
}

/* ---------- Popup form ---------- */
const dlg = $("#dlg");
function openModal(title, body, onSave) {
  $("#mTitle").textContent = title;
  $("#mBody").innerHTML = body;
  $("#mForm").onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.submitter;
    if (btn) btn.disabled = true;              // stops double entries on double click
    try { await onSave(new FormData(e.target)); dlg.close(); }
    catch (err) { toast(err.message || "Could not save"); }
    finally { if (btn) btn.disabled = false; }
  };
  dlg.showModal();
}
$("#mCancel").onclick = () => dlg.close();

const dbError = (error) =>
  error.code === "23505" ? new Error("A customer with this name already exists.") : error;

function customerForm(c) {
  openModal(c ? "Edit customer" : "Add customer", `
    <label>Name <input name="name" required value="${esc(c?.name)}" autocomplete="off"></label>
    <div id="dupHint" class="dup-hint"></div>
    <label>Phone <input name="phone" type="tel" value="${esc(c?.phone)}"></label>
    <label>Address <input name="address" value="${esc(c?.address)}"></label>`,
  async (f) => {
    const data = { name: cleanName(f.get("name")), phone: f.get("phone").trim(), address: cleanName(f.get("address")) };
    if (!data.name) throw new Error("Name is required");

    // Duplicate check: same name is blocked, similar name or same phone asks first.
    const m = findMatches(customers, data.name, data.phone, c?.id);
    if (m.exact.length) {
      const old = m.exact[0];
      if (!c && confirm(`"${old.name}" is already in the list.\n\nPress OK to open that account instead.`)) {
        selectedId = old.id; render(); return;
      }
      throw new Error("Not saved. If this is another person, add the area or a father's name to tell them apart.");
    }
    const maybe = [...new Set([...m.similar, ...m.samePhone])];
    if (maybe.length && !confirm(
      "A similar customer is already in the list:\n" +
      maybe.slice(0, 4).map((x) => `- ${x.name}${x.phone ? " (" + x.phone + ")" : ""}`).join("\n") +
      `\n\nIs this a different person? Press OK to ${c ? "save" : "add"} anyway.`)) {
      throw new Error("Not saved");
    }

    if (c) {
      const { error } = await sb.from("customers")
        .update({ ...data, edited_by: userName(), edited_at: new Date().toISOString() }).eq("id", c.id);
      if (error) throw dbError(error);
    } else {
      const { data: row, error } = await sb.from("customers")
        .insert({ ...data, created_by: userName() }).select().single();
      if (error) throw dbError(error);
      selectedId = String(row.id);
    }
    toast("Saved");
    await load();
  });

  // Live hint while typing: shows customers that already look the same.
  const nameInput = document.querySelector("#mForm [name=name]");
  const phoneInput = document.querySelector("#mForm [name=phone]");
  const hint = $("#dupHint");
  const update = () => {
    const m = findMatches(customers, nameInput.value, phoneInput.value, c?.id);
    const list = [...new Set([...m.exact, ...m.similar, ...m.samePhone])].slice(0, 4);
    hint.innerHTML = list.length
      ? "<strong>Already in the list:</strong><br>" +
        list.map((x) => esc(x.name) + (x.phone ? " (" + esc(x.phone) + ")" : "")).join("<br>")
      : "";
  };
  nameInput.oninput = phoneInput.oninput = update;
  update();
}

function txForm(kind, t) {
  const sale = kind === "sale";
  openModal(`${t ? "Edit" : "New"} ${sale ? "purchase" : "payment"}`, `
    <label>Date <input name="date" type="date" required value="${esc(t?.date || today())}"></label>
    ${sale ? `
      <label>Items taken <textarea name="items" rows="3" required placeholder="e.g. 5 kg sugar, 2 oil, 1 tea">${esc(t?.items)}</textarea></label>
      <label>Total bill <input name="total" type="number" min="0" step="any" required value="${t?.total ?? ""}"></label>
      <label>Paid now (leave 0 if nothing) <input name="paid" type="number" min="0" step="any" value="${t?.paid ?? 0}"></label>`
    : `
      <label>Amount received <input name="paid" type="number" min="0.01" step="any" required value="${t?.paid ?? ""}"></label>
      <label>Note (optional) <input name="note" value="${esc(t?.note)}"></label>`}`,
  async (f) => {
    const data = {
      date: f.get("date"),
      total: sale ? num(f.get("total")) : 0,
      paid: num(f.get("paid")),
      items: sale ? f.get("items").trim() : "",
      note: sale ? "" : (f.get("note") || "").trim()
    };
    if (sale && data.total <= 0) throw new Error("Total bill must be more than 0");
    if (!sale && data.paid <= 0) throw new Error("Amount must be more than 0");
    const q = t
      ? sb.from("transactions").update({ ...data, edited_by: userName(), edited_at: new Date().toISOString() }).eq("id", t.id)
      : sb.from("transactions").insert({ ...data, customer_id: Number(selectedId), kind, by_user: userName() });
    const { error } = await q;
    if (error) throw error;
    toast("Saved");
    await load();
  });
}

/* ---------- Events ---------- */
$("#loginForm").onsubmit = async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  $("#loginError").textContent = "";
  const { error } = await sb.auth.signInWithPassword({ email: f.get("email").trim(), password: f.get("password") });
  if (error) $("#loginError").textContent = error.status === 400 ? "Wrong email or password." : error.message;
};
$("#logoutBtn").onclick = () => { selectedId = null; sb.auth.signOut(); };
$("#search").oninput = (e) => { query = e.target.value; render(); };
$("#addCustomerBtn").onclick = () => customerForm();
$("#filters").onclick = (e) => {
  const b = e.target.closest("[data-f]"); if (!b) return;
  filter = b.dataset.f;
  document.querySelectorAll(".chip").forEach((x) => x.classList.toggle("active", x === b));
  render();
};
$("#customerList").onclick = (e) => {
  const b = e.target.closest("[data-open]"); if (!b) return;
  selectedId = b.dataset.open; render();
  window.scrollTo({ top: 0 });
};
$("#detail").onclick = async (e) => {
  const el = e.target.closest("button"); if (!el) return;
  const d = el.dataset;
  if ("back" in d) { selectedId = null; render(); }
  else if ("editcust" in d) customerForm(customers.find((c) => c.id === selectedId));
  else if (d.new) txForm(d.new);
  else if (d.edittx) { const t = txs.find((x) => x.id === d.edittx); txForm(t.kind, t); }
  else if (d.deltx && confirm("Delete this entry? It will be removed from the balance.")) {
    const { error } = await sb.from("transactions")
      .update({ deleted: true, deleted_by: userName(), deleted_at: new Date().toISOString() }).eq("id", d.deltx);
    if (error) return toast(error.message);
    toast("Entry deleted");
    load();
  }
};

/* ---------- Backup (Excel) and the 2 day reminder ---------- */
const BACKUP_EVERY_DAYS = 2;
const bdlg = $("#backupDlg");
let lastBackup = null;                         // { created_at, by_user } from the backup_log table

const daysSince = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
const ago = (d) => (d <= 0 ? "today" : d === 1 ? "1 day ago" : `${d} days ago`);

function showBackupInfo() {
  $("#backupInfo").textContent = lastBackup
    ? `Last backup: ${ago(daysSince(lastBackup.created_at))} by ${lastBackup.by_user}`
    : "No backup yet";
}

async function checkBackup() {
  const { data, error } = await sb.from("backup_log").select("created_at, by_user")
    .order("created_at", { ascending: false }).limit(1);
  if (error) {                                 // table missing: do not lock anyone out
    $("#backupInfo").textContent = "Backup reminder is off";
    return toast("Run update_backup.sql in Supabase to turn on the backup reminder.");
  }
  lastBackup = data[0] || null;
  showBackupInfo();

  // No backup yet: count from the oldest customer, so a brand new shop is not blocked on day one.
  const since = lastBackup ? daysSince(lastBackup.created_at)
    : customers.length ? daysSince(customers.map((c) => c.createdAt).sort()[0]) : 0;
  if (since < BACKUP_EVERY_DAYS) return;

  $("#backupMsg").textContent = lastBackup
    ? `The last backup was ${since} days ago (by ${lastBackup.by_user}). Download the Excel backup to continue.`
    : `No backup has been taken yet and the data is ${since} days old. Download the Excel backup to continue.`;
  if (!bdlg.open) bdlg.showModal();
}

async function runBackup() {
  await load();                                // make sure the file has the latest data
  const format = await downloadBackup({ customers, txs, by: userName() });
  const { error } = await sb.from("backup_log").insert({
    by_user: userName(), customers: customers.length, entries: txs.filter((t) => !t.deleted).length
  });
  if (error) toast("Backup downloaded, but it could not be recorded: " + error.message);
  else { lastBackup = { created_at: new Date().toISOString(), by_user: userName() }; showBackupInfo(); }
  return format;
}

bdlg.addEventListener("cancel", (e) => e.preventDefault());   // Escape key cannot skip the backup
$("#gateBackupBtn").onclick = async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  try {
    const format = await runBackup();
    bdlg.close();
    toast(format === "xlsx" ? "Backup downloaded" : "Excel could not load. CSV files were downloaded instead.");
  } catch (err) { toast(err.message || "Backup failed. Try again."); }
  finally { btn.disabled = false; }
};
$("#gateLogoutBtn").onclick = () => { bdlg.close(); selectedId = null; sb.auth.signOut(); };
$("#backupBtn").onclick = async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  try { await runBackup(); toast("Backup downloaded"); }
  catch (err) { toast(err.message || "Backup failed"); }
  finally { btn.disabled = false; }
};
