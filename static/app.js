let appData = { income: 0, entries: [], goals: [] };
let currentFilter = "All";

async function fetchData() {
  try {
    const res = await fetch("/api/data");
    appData = await res.json();
    if (!appData.goals) appData.goals = [];
    renderAll();
  } catch(e) { console.error("Server error:", e); }
}

function renderAll() {
  renderDashboard();
  renderEntries();
  renderGoals();
}

function sum(type) { return appData.entries.filter(e => e.type === type).reduce((s,e) => s + e.amount, 0); }
function fmt(n)    { return "Rs. " + Number(n).toLocaleString(); }
function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

// ── DASHBOARD ──
function renderDashboard() {
  const { income, entries, goals } = appData;
  const emi = sum("EMI"), sip = sum("SIP"), exp = sum("Expense");
  const out  = emi + sip + exp;
  const free = income - out;
  const ratio = income > 0 ? Math.min(100, Math.round((out / income) * 100)) : 0;
  const color = ratio > 80 ? "#ef4444" : ratio > 60 ? "#f59e0b" : "#10b981";

  setText("s-income",    fmt(income));
  setText("s-outflow",   fmt(out));
  setText("s-sip",       fmt(sip));
  setText("s-goals",     goals.filter(g => g.savedAmount < g.targetAmount).length.toString());
  setText("s-ratio-sub", ratio + "% of income");
  setText("bd-emi",      fmt(emi));
  setText("bd-sip",      fmt(sip));
  setText("bd-exp",      fmt(exp));
  setText("commit-pct",  ratio + "%");

  const freeEl = document.getElementById("s-free");
  freeEl.textContent = fmt(Math.abs(free));
  freeEl.className   = "stat-value " + (free >= 0 ? "c-green" : "c-red");
  setText("s-free-sub", free >= 0 ? "Available to save/spend" : "Deficit!");

  const bar = document.getElementById("commit-bar");
  bar.style.width           = ratio + "%";
  bar.style.backgroundColor = color;
  document.getElementById("commit-pct").style.color = color;

  renderDashEMI();
  renderUpcoming();
}

function renderDashEMI() {
  const emis = appData.entries.filter(e => e.type === "EMI");
  const el   = document.getElementById("dash-emi");
  if (!emis.length) { el.innerHTML = '<p class="c-muted">No EMIs added.</p>'; return; }
  el.innerHTML = emis.map(e => {
    const pct = e.tenure > 0 ? Math.round(((e.tenure - e.remaining) / e.tenure) * 100) : 0;
    return `<div style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px">
        <span style="font-size:13px;font-weight:600">${e.name}</span>
        <span style="font-family:'Courier New',monospace;font-size:13px;color:#ef4444">${fmt(e.amount)}/mo</span>
      </div>
      <div style="background:#1f2d45;border-radius:99px;height:6px;margin-bottom:4px">
        <div style="width:${pct}%;height:100%;border-radius:99px;background:#ef4444"></div>
      </div>
      <div style="color:#64748b;font-size:11px">${pct}% paid · ${e.remaining || 0} months left${e.bank ? " · " + e.bank : ""}</div>
    </div>`;
  }).join("");
}

function renderUpcoming() {
  const today = new Date().getDate();
  const list  = appData.entries
    .filter(e => e.dueDate >= today)
    .sort((a, b) => a.dueDate - b.dueDate)
    .slice(0, 6);
  const el = document.getElementById("upcoming-list");
  if (!list.length) { el.innerHTML = '<p class="c-muted">No upcoming dues this month.</p>'; return; }
  el.innerHTML = list.map(e => {
    const days = e.dueDate - today;
    const clr  = days <= 3 ? "#ef4444" : "#e2e8f0";
    return `<div class="due-item">
      <div>
        <div class="due-name">${e.name}</div>
        <div class="due-meta">Day ${e.dueDate} &nbsp;·&nbsp; ${days === 0 ? "Today!" : days + " days"}</div>
      </div>
      <div class="due-right">
        <span class="badge badge-${e.type}">${e.type}</span>
        <span class="due-amt" style="color:${clr}">${fmt(e.amount)}</span>
      </div>
    </div>`;
  }).join("");
}

// ── ENTRIES ──
function renderEntries() {
  const filtered = currentFilter === "All"
    ? appData.entries
    : appData.entries.filter(e => e.type === currentFilter);

  setText("entry-count", filtered.length + (filtered.length === 1 ? " entry" : " entries"));

  const tbody = document.getElementById("entries-tbody");
  const empty = document.getElementById("entries-empty");

  if (!filtered.length) { tbody.innerHTML = ""; empty.style.display = "block"; return; }
  empty.style.display = "none";

  tbody.innerHTML = filtered.map((e, i) => {
    let det = "";
    if (e.type === "EMI")     det = `${e.remaining||0}/${e.tenure||0} months left · ${e.bank||""}`;
    if (e.type === "SIP")     det = `${e.elapsed||0}/${e.duration||0} months · ${e.fund||""}`;
    if (e.type === "Expense") det = e.category || "";
    return `<tr class="${i % 2 !== 0 ? "alt-row" : ""}">
      <td class="td-name">${e.name}</td>
      <td><span class="badge badge-${e.type}">${e.type}</span></td>
      <td class="td-amount">${fmt(e.amount)}</td>
      <td class="td-meta">Day ${e.dueDate}</td>
      <td class="td-meta">${det}</td>
      <td><button class="btn-remove" onclick="deleteEntry(${e.id})">Remove</button></td>
    </tr>`;
  }).join("");
}

function filterEntries(type, btn, cls) {
  currentFilter = type;
  document.querySelectorAll(".filter-btn").forEach(b => b.className = "filter-btn");
  btn.classList.add("fa-" + cls);
  renderEntries();
}

// ── GOALS ──
function renderGoals() {
  const goals  = appData.goals || [];
  const grid   = document.getElementById("goals-grid");
  const sumBox = document.getElementById("goals-summary");

  if (!goals.length) {
    sumBox.style.display = "none";
    grid.innerHTML = `<div class="add-goal-card" onclick="openGoalModal()"><span>＋</span>Add Your First Goal</div>`;
    return;
  }

  sumBox.style.display = "block";
  const totalTarget   = goals.reduce((s, g) => s + g.targetAmount, 0);
  const totalSaved    = goals.reduce((s, g) => s + g.savedAmount,  0);
  const monthlyNeeded = goals.reduce((s, g) => s + (g.monthlyTarget || 0), 0);
  setText("g-total-target",  fmt(totalTarget));
  setText("g-total-saved",   fmt(totalSaved));
  setText("g-total-needed",  fmt(Math.max(0, totalTarget - totalSaved)));
  setText("g-monthly-needed",fmt(monthlyNeeded));

  grid.innerHTML = goals.map(g => {
    const pct      = Math.min(100, Math.round((g.savedAmount / g.targetAmount) * 100));
    const done     = g.savedAmount >= g.targetAmount;
    const remaining= g.targetAmount - g.savedAmount;
    const months   = g.monthlyTarget > 0 ? Math.ceil(remaining / g.monthlyTarget) : null;
    const deadline = g.deadline
      ? new Date(g.deadline).toLocaleDateString("en-IN", { month: "short", year: "numeric" })
      : "No deadline";
    return `<div class="goal-card">
      ${done ? '<div class="goal-done-tag">✅ Complete!</div>' : ""}
      <div class="goal-icon">${g.icon || "🎯"}</div>
      <div class="goal-name">${g.name}</div>
      <div class="goal-deadline">🗓 ${deadline}${g.monthlyTarget > 0 ? " &nbsp;·&nbsp; Rs." + Number(g.monthlyTarget).toLocaleString() + "/mo" : ""}</div>
      <div class="goal-amounts">
        <span class="goal-saved">${fmt(g.savedAmount)}</span>
        <span class="goal-target">of ${fmt(g.targetAmount)}</span>
      </div>
      <div class="goal-prog-track"><div class="goal-prog-fill" style="width:${pct}%"></div></div>
      <div class="goal-pct-row">
        <span class="goal-pct">${pct}% saved</span>
        <span class="goal-months">${done ? "Goal reached!" : months ? months + " months to go" : "Set monthly target"}</span>
      </div>
      <div class="goal-actions">
        ${!done
          ? `<button class="btn-deposit" onclick="openDepositModal(${g.id},'${g.name}')">+ Add Money</button>`
          : `<button class="btn-deposit" style="opacity:0.5;cursor:default">Completed!</button>`}
        <button class="btn-del-goal" onclick="deleteGoal(${g.id})">✕</button>
      </div>
    </div>`;
  }).join("") + `<div class="add-goal-card" onclick="openGoalModal()"><span>＋</span>New Goal</div>`;
}

// ── TABS ──
function switchTab(name) {
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
  document.getElementById("tab-" + name).classList.add("active");
  document.querySelector(".nav-btn[data-tab='" + name + "']").classList.add("active");
}

// ── MODALS ──
function openAddModal() {
  ["f-name","f-amount","f-due","f-tenure","f-remaining","f-bank","f-duration","f-elapsed","f-fund"]
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
  document.getElementById("f-category").value = "";
  document.getElementById("f-type").value = "EMI";
  document.querySelectorAll(".type-btn").forEach(b => b.className = "type-btn");
  document.querySelectorAll(".type-btn")[0].classList.add("t-emi");
  document.querySelectorAll(".emi-f").forEach(el => el.style.display = "flex");
  document.querySelectorAll(".sip-f").forEach(el => el.style.display = "none");
  document.querySelectorAll(".exp-f").forEach(el => el.style.display = "none");
  document.getElementById("addModal").classList.add("open");
}

function openIncomeModal() {
  document.getElementById("f-income").value = appData.income > 0 ? appData.income : "";
  document.getElementById("incomeModal").classList.add("open");
}

function openGoalModal() {
  ["g-name","g-target","g-saved","g-monthly","g-date"].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = "";
  });
  document.getElementById("g-icon").value = "✈️";
  document.querySelectorAll(".emoji-opt").forEach(e => e.classList.remove("selected"));
  document.querySelectorAll(".emoji-opt")[0].classList.add("selected");
  document.getElementById("goalModal").classList.add("open");
}

function openDepositModal(id, name) {
  document.getElementById("dep-amount").value = "";
  document.getElementById("dep-goal-id").value = id;
  document.getElementById("deposit-title").textContent = "Add Money → " + name;
  document.getElementById("depositModal").classList.add("open");
}

function closeModal(id) { document.getElementById(id).classList.remove("open"); }

function selectType(type, btn) {
  document.querySelectorAll(".type-btn").forEach(b => b.className = "type-btn");
  btn.classList.add(type === "EMI" ? "t-emi" : type === "SIP" ? "t-sip" : "t-expense");
  document.getElementById("f-type").value = type;
  document.querySelectorAll(".emi-f").forEach(el => el.style.display = type === "EMI"     ? "flex" : "none");
  document.querySelectorAll(".sip-f").forEach(el => el.style.display = type === "SIP"     ? "flex" : "none");
  document.querySelectorAll(".exp-f").forEach(el => el.style.display = type === "Expense" ? "flex" : "none");
}

function selectEmoji(el, emoji) {
  document.querySelectorAll(".emoji-opt").forEach(e => e.classList.remove("selected"));
  el.classList.add("selected");
  document.getElementById("g-icon").value = emoji;
}

// ── API ──
async function submitEntry() {
  const type   = document.getElementById("f-type").value;
  const name   = document.getElementById("f-name").value.trim();
  const amount = parseFloat(document.getElementById("f-amount").value);
  const due    = parseInt(document.getElementById("f-due").value);

  if (!name)                              { alert("Please enter a name.");                return; }
  if (isNaN(amount) || amount <= 0)       { alert("Please enter a valid amount.");        return; }
  if (isNaN(due) || due < 1 || due > 31) { alert("Due date must be between 1 and 31."); return; }

  const entry = { type, name, amount, dueDate: due };
  if (type === "EMI") {
    entry.tenure    = parseInt(document.getElementById("f-tenure").value)    || 0;
    entry.remaining = parseInt(document.getElementById("f-remaining").value) || 0;
    entry.bank      = document.getElementById("f-bank").value.trim();
  }
  if (type === "SIP") {
    entry.duration = parseInt(document.getElementById("f-duration").value) || 0;
    entry.elapsed  = parseInt(document.getElementById("f-elapsed").value)  || 0;
    entry.fund     = document.getElementById("f-fund").value.trim();
  }
  if (type === "Expense") {
    entry.category = document.getElementById("f-category").value;
  }

  try {
    const res = await fetch("/api/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry)
    });
    const r = await res.json();
    if (r.success) { closeModal("addModal"); await fetchData(); }
    else alert("Failed to save. Try again.");
  } catch(e) { alert("Cannot reach server. Is 'python app.py' running?"); }
}

async function deleteEntry(id) {
  if (!confirm("Remove this entry?")) return;
  await fetch("/api/entries/" + id, { method: "DELETE" });
  await fetchData();
}

async function submitGoal() {
  const name    = document.getElementById("g-name").value.trim();
  const target  = parseFloat(document.getElementById("g-target").value);
  const saved   = parseFloat(document.getElementById("g-saved").value)   || 0;
  const monthly = parseFloat(document.getElementById("g-monthly").value) || 0;
  const date    = document.getElementById("g-date").value;
  const icon    = document.getElementById("g-icon").value;

  if (!name)                            { alert("Please enter a goal name.");            return; }
  if (isNaN(target) || target <= 0)    { alert("Please enter a valid target amount.");  return; }

  const goal = { name, targetAmount: target, savedAmount: saved, monthlyTarget: monthly, deadline: date, icon };
  try {
    const res = await fetch("/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(goal)
    });
    const r = await res.json();
    if (r.success) { closeModal("goalModal"); await fetchData(); switchTab("goals"); }
    else alert("Failed to save goal.");
  } catch(e) { alert("Cannot reach server."); }
}

async function deleteGoal(id) {
  if (!confirm("Delete this goal?")) return;
  await fetch("/api/goals/" + id, { method: "DELETE" });
  await fetchData();
}

async function submitDeposit() {
  const id     = parseInt(document.getElementById("dep-goal-id").value);
  const amount = parseFloat(document.getElementById("dep-amount").value);
  if (isNaN(amount) || amount <= 0) { alert("Please enter a valid amount."); return; }
  try {
    const res = await fetch("/api/goals/" + id + "/deposit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount })
    });
    const r = await res.json();
    if (r.success) { closeModal("depositModal"); await fetchData(); }
    else alert("Failed to deposit.");
  } catch(e) { alert("Cannot reach server."); }
}

async function saveIncome() {
  const income = parseFloat(document.getElementById("f-income").value);
  if (isNaN(income) || income <= 0) { alert("Please enter a valid income."); return; }
  await fetch("/api/income", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ income })
  });
  closeModal("incomeModal");
  await fetchData();
}

fetchData();
