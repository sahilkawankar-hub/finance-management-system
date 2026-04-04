let appData = { income: 0, entries: [], goals: [] };
let currentFilter = "All";
let pieInst = null, barInst = null, expInst = null, sipInst = null;
let emiBreakInst = null, cashflowInst = null, expPieInst = null, sipProjInst = null;
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ── INIT ──
async function fetchData() {
  try {
    const res = await fetch("/api/data");
    if (res.status === 401) { window.location.href = "/login"; return; }
    appData = await res.json();
    if (!appData.goals) appData.goals = [];
    setupUser();
    renderAll();
  } catch(e) { console.error("Server error:", e); }
}

function setupUser() {
  const name = appData.name || "User";
  const initial = name.charAt(0).toUpperCase();
  document.getElementById("userAvatar").textContent = initial;
  document.getElementById("userName").textContent   = name.split(" ")[0];
  document.getElementById("ddName").textContent     = name;
}

function renderAll() {
  renderDashboard();
  renderEntries();
  renderGoals();
  renderReports();
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
  bar.style.width = ratio + "%"; bar.style.background = color;
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
      <div style="color:#64748b;font-size:11px">${pct}% paid · ${e.remaining||0} months left${e.bank?" · "+e.bank:""}</div>
    </div>`;
  }).join("");
}

function renderUpcoming() {
  const today = new Date().getDate();
  const list  = appData.entries.filter(e => e.dueDate >= today).sort((a,b) => a.dueDate - b.dueDate).slice(0, 6);
  const el = document.getElementById("upcoming-list");
  if (!list.length) { el.innerHTML = '<p class="c-muted">No upcoming dues this month.</p>'; return; }
  el.innerHTML = list.map(e => {
    const days = e.dueDate - today;
    const clr  = days <= 3 ? "#ef4444" : "#e2e8f0";
    return `<div class="due-item">
      <div><div class="due-name">${e.name}</div><div class="due-meta">Day ${e.dueDate} &nbsp;·&nbsp; ${days===0?"Today!":days+" days"}</div></div>
      <div class="due-right"><span class="badge badge-${e.type}">${e.type}</span><span class="due-amt" style="color:${clr}">${fmt(e.amount)}</span></div>
    </div>`;
  }).join("");
}

// ── ENTRIES ──
function renderEntries() {
  const filtered = currentFilter === "All" ? appData.entries : appData.entries.filter(e => e.type === currentFilter);
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
    return `<tr class="${i%2!==0?"alt-row":""}">
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
  const goals = appData.goals || [];
  const grid  = document.getElementById("goals-grid");
  const sumBox = document.getElementById("goals-summary");
  if (!goals.length) {
    sumBox.style.display = "none";
    grid.innerHTML = `<div class="add-goal-card" onclick="openGoalModal()"><span>＋</span>Add Your First Goal</div>`;
    return;
  }
  sumBox.style.display = "block";
  const totalTarget   = goals.reduce((s,g) => s+g.targetAmount, 0);
  const totalSaved    = goals.reduce((s,g) => s+g.savedAmount, 0);
  const monthlyNeeded = goals.reduce((s,g) => s+(g.monthlyTarget||0), 0);
  setText("g-total-target",  fmt(totalTarget));
  setText("g-total-saved",   fmt(totalSaved));
  setText("g-total-needed",  fmt(Math.max(0, totalTarget - totalSaved)));
  setText("g-monthly-needed",fmt(monthlyNeeded));

  grid.innerHTML = goals.map(g => {
    const pct      = Math.min(100, Math.round((g.savedAmount/g.targetAmount)*100));
    const done     = g.savedAmount >= g.targetAmount;
    const remaining= g.targetAmount - g.savedAmount;
    const months   = g.monthlyTarget > 0 ? Math.ceil(remaining/g.monthlyTarget) : null;
    const deadline = g.deadline ? new Date(g.deadline).toLocaleDateString("en-IN",{month:"short",year:"numeric"}) : "No deadline";
    return `<div class="goal-card">
      ${done ? '<div class="goal-done-tag">✅ Complete!</div>' : ""}
      <div class="goal-icon">${g.icon||"🎯"}</div>
      <div class="goal-name">${g.name}</div>
      <div class="goal-deadline">🗓 ${deadline}${g.monthlyTarget>0?" &nbsp;·&nbsp; Rs."+Number(g.monthlyTarget).toLocaleString()+"/mo":""}</div>
      <div class="goal-amounts"><span class="goal-saved">${fmt(g.savedAmount)}</span><span class="goal-target">of ${fmt(g.targetAmount)}</span></div>
      <div class="goal-prog-track"><div class="goal-prog-fill" style="width:${pct}%"></div></div>
      <div class="goal-pct-row"><span class="goal-pct">${pct}% saved</span><span class="goal-months">${done?"Goal reached!":months?months+" months to go":"Set monthly target"}</span></div>
      <div class="goal-actions">
        ${!done?`<button class="btn-deposit" onclick="openDepositModal(${g.id},'${g.name}')">+ Add Money</button>`:`<button class="btn-deposit" style="opacity:0.5;cursor:default">Completed!</button>`}
        <button class="btn-del-goal" onclick="deleteGoal(${g.id})">✕</button>
      </div>
    </div>`;
  }).join("") + `<div class="add-goal-card" onclick="openGoalModal()"><span>＋</span>New Goal</div>`;
}

// ── REPORTS ──
function renderReports() {
  const { income, entries } = appData;
  const emi = sum("EMI"), sip = sum("SIP"), exp = sum("Expense");
  const out  = emi + sip + exp;
  const free = income - out;
  const ratio = income > 0 ? Math.min(100, Math.round((out/income)*100)) : 0;

  setText("r-income",    fmt(income));
  setText("r-outflow",   fmt(out));
  setText("r-emi-total", fmt(emi));
  setText("r-sip-total", fmt(sip));
  setText("r-ratio",     ratio + "%");
  const rfEl = document.getElementById("r-free");
  rfEl.textContent = fmt(Math.abs(free));
  rfEl.className   = "report-stat-val " + (free >= 0 ? "c-green" : "c-red");
  document.getElementById("r-ratio").className = "report-stat-val " + (ratio>80?"c-red":ratio>60?"c-amber":"c-green");

  drawPie(emi, sip, exp);
  drawBar(emi, sip, exp);
  drawExpenseChart();
  drawSIPChart();
  drawEMIBreakdown();
  drawCashFlow(income, out, free);
  drawExpensePie();
  drawSIPProjection();
  renderEMIReport();
  renderSIPReport();
}

// PIE CHART
function drawPie(emi, sip, exp) {
  const wrap = document.getElementById("pie-wrap");
  if (emi===0 && sip===0 && exp===0) {
    if (pieInst) { pieInst.destroy(); pieInst = null; }
    wrap.innerHTML = '<div class="no-data">No entries yet.<br><b>Add entries</b> to see chart.</div>';
    return;
  }
  if (!wrap.querySelector("canvas")) wrap.innerHTML = '<canvas id="pie-canvas"></canvas>';
  if (pieInst) pieInst.destroy();
  const ctx = document.getElementById("pie-canvas").getContext("2d");
  const data=[], labels=[], colors=[], bcolors=[];
  if (emi>0){data.push(emi);labels.push("EMI");    colors.push("#ef4444");bcolors.push("rgba(239,68,68,0.2)");}
  if (sip>0){data.push(sip);labels.push("SIP");    colors.push("#10b981");bcolors.push("rgba(16,185,129,0.2)");}
  if (exp>0){data.push(exp);labels.push("Expense");colors.push("#3b82f6");bcolors.push("rgba(59,130,246,0.2)");}
  pieInst = new Chart(ctx, {
    type: "doughnut",
    data: { labels, datasets:[{ data, backgroundColor:colors, borderColor:"#151e2e", borderWidth:4, hoverOffset:10 }] },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{ position:"bottom", labels:{ color:"#94a3b8", padding:16, font:{size:12} } },
        tooltip:{ backgroundColor:"#111827", borderColor:"#1f2d45", borderWidth:1, titleColor:"#e2e8f0", bodyColor:"#f59e0b", callbacks:{ label: c => "  "+fmt(c.parsed)+" ("+Math.round(c.parsed/data.reduce((a,b)=>a+b,0)*100)+"%)" } }
      },
      cutout:"65%"
    }
  });
}

// BAR CHART
function drawBar(emi, sip, exp) {
  if (barInst) barInst.destroy();
  const ctx = document.getElementById("bar-chart").getContext("2d");
  barInst = new Chart(ctx, {
    type:"bar",
    data:{
      labels: MONTHS.slice(0,6),
      datasets:[
        { label:"EMI",     data:Array(6).fill(emi), backgroundColor:"rgba(239,68,68,0.75)",  borderRadius:4, borderSkipped:false },
        { label:"SIP",     data:Array(6).fill(sip), backgroundColor:"rgba(16,185,129,0.75)", borderRadius:4, borderSkipped:false },
        { label:"Expense", data:Array(6).fill(exp), backgroundColor:"rgba(59,130,246,0.75)", borderRadius:4, borderSkipped:false }
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{ labels:{ color:"#94a3b8", padding:14, font:{size:11} } },
        tooltip:{ backgroundColor:"#111827", borderColor:"#1f2d45", borderWidth:1, titleColor:"#e2e8f0", bodyColor:"#f59e0b", callbacks:{ label: c => "  "+fmt(c.parsed.y) } }
      },
      scales:{
        x:{ ticks:{ color:"#64748b" }, grid:{ color:"rgba(31,45,69,0.6)" }, border:{ display:false } },
        y:{ ticks:{ color:"#64748b", callback: v => v>=1000?"Rs."+(v/1000).toFixed(0)+"k":"Rs."+v }, grid:{ color:"rgba(31,45,69,0.6)" }, border:{ display:false } }
      }
    }
  });
}

// EXPENSE HORIZONTAL BAR
function drawExpenseChart() {
  if (expInst) { expInst.destroy(); expInst = null; }
  const expenses = appData.entries.filter(e => e.type === "Expense");
  const cats = {};
  expenses.forEach(e => { cats[e.category||"Other"] = (cats[e.category||"Other"]||0) + e.amount; });
  const labels = Object.keys(cats);
  const values = Object.values(cats);
  if (!labels.length) return;
  const ctx = document.getElementById("expense-chart").getContext("2d");
  const palette = ["#3b82f6","#8b5cf6","#f59e0b","#10b981","#ef4444","#06b6d4","#ec4899"];
  expInst = new Chart(ctx, {
    type:"bar",
    data:{
      labels,
      datasets:[{ data:values, backgroundColor:labels.map((_,i)=>palette[i%palette.length]+"cc"), borderRadius:6, borderSkipped:false }]
    },
    options:{
      indexAxis:"y", responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{ display:false },
        tooltip:{ backgroundColor:"#111827", borderColor:"#1f2d45", borderWidth:1, titleColor:"#e2e8f0", bodyColor:"#f59e0b", callbacks:{ label: c => "  "+fmt(c.parsed.x) } }
      },
      scales:{
        x:{ ticks:{ color:"#64748b", callback: v => "Rs."+(v>=1000?(v/1000).toFixed(0)+"k":v) }, grid:{ color:"rgba(31,45,69,0.6)" }, border:{ display:false } },
        y:{ ticks:{ color:"#94a3b8" }, grid:{ display:false }, border:{ display:false } }
      }
    }
  });
}

// SIP BAR CHART
function drawSIPChart() {
  if (sipInst) { sipInst.destroy(); sipInst = null; }
  const sips = appData.entries.filter(e => e.type === "SIP");
  if (!sips.length) return;
  const labels = sips.map(s => s.name);
  const invested = sips.map(s => s.amount * (s.elapsed||0));
  const remaining = sips.map(s => s.amount * Math.max(0,(s.duration||0)-(s.elapsed||0)));
  const ctx = document.getElementById("sip-chart").getContext("2d");
  sipInst = new Chart(ctx, {
    type:"bar",
    data:{
      labels,
      datasets:[
        { label:"Invested", data:invested, backgroundColor:"rgba(16,185,129,0.8)", borderRadius:4, borderSkipped:false },
        { label:"Remaining", data:remaining, backgroundColor:"rgba(31,45,69,0.8)", borderRadius:4, borderSkipped:false }
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{ labels:{ color:"#94a3b8", padding:14, font:{size:11} } },
        tooltip:{ backgroundColor:"#111827", borderColor:"#1f2d45", borderWidth:1, titleColor:"#e2e8f0", bodyColor:"#f59e0b", callbacks:{ label: c => "  "+fmt(c.parsed.y) } }
      },
      scales:{
        x:{ stacked:true, ticks:{ color:"#64748b" }, grid:{ display:false }, border:{ display:false } },
        y:{ stacked:true, ticks:{ color:"#64748b", callback: v => "Rs."+(v>=1000?(v/1000).toFixed(0)+"k":v) }, grid:{ color:"rgba(31,45,69,0.6)" }, border:{ display:false } }
      }
    }
  });
}

// EMI PROGRESS TEXT
function renderEMIReport() {
  const emis = appData.entries.filter(e => e.type === "EMI");
  document.getElementById("emi-report").innerHTML = !emis.length
    ? '<p class="c-muted">No EMIs added.</p>'
    : emis.map(e => {
        const pct = e.tenure>0?Math.round(((e.tenure-e.remaining)/e.tenure)*100):0;
        return `<div class="rp-item">
          <div class="rp-head"><span class="rp-name">${e.name}</span><span class="rp-val c-red">${fmt(e.amount)}/mo</span></div>
          <div class="rp-track"><div class="rp-fill" style="width:${pct}%;background:#ef4444"></div></div>
          <div class="rp-sub">${pct}% paid off · ${e.remaining||0} months left${e.bank?" · "+e.bank:""}</div>
        </div>`;
      }).join("");
}

// SIP PROGRESS TEXT
function renderSIPReport() {
  const sips = appData.entries.filter(e => e.type === "SIP");
  document.getElementById("sip-report").innerHTML = !sips.length
    ? '<p class="c-muted">No SIPs added.</p>'
    : sips.map(e => {
        const pct = e.duration>0?Math.round((e.elapsed/e.duration)*100):0;
        const invested = e.amount*(e.elapsed||0);
        return `<div class="rp-item">
          <div class="rp-head"><span class="rp-name">${e.name}</span><span class="rp-val c-green">${fmt(invested)} invested</span></div>
          <div class="rp-track"><div class="rp-fill" style="width:${pct}%;background:#10b981"></div></div>
          <div class="rp-sub">${pct}% of goal · ${(e.duration||0)-(e.elapsed||0)} months left${e.fund?" · "+e.fund:""}</div>
        </div>`;
      }).join("");
}

// ── TABS ──
function switchTab(name) {
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
  document.getElementById("tab-" + name).classList.add("active");
  document.querySelector(".nav-btn[data-tab='"+name+"']").classList.add("active");
  if (name === "reports") renderReports();
}

// ── USER DROPDOWN ──
function toggleDD(e) {
  e.stopPropagation();
  document.getElementById("userDropdown").classList.toggle("open");
}
document.addEventListener("click", () => document.getElementById("userDropdown")?.classList.remove("open"));

async function doLogout() {
  await fetch("/api/logout", { method: "POST" });
  window.location.href = "/login";
}

// ── MODALS ──
function openAddModal() {
  ["f-name","f-amount","f-due","f-tenure","f-remaining","f-bank","f-duration","f-elapsed","f-fund"]
    .forEach(id => { const el=document.getElementById(id); if(el) el.value=""; });
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
    const el=document.getElementById(id); if(el) el.value="";
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
  btn.classList.add(type==="EMI"?"t-emi":type==="SIP"?"t-sip":"t-expense");
  document.getElementById("f-type").value = type;
  document.querySelectorAll(".emi-f").forEach(el => el.style.display = type==="EMI"?"flex":"none");
  document.querySelectorAll(".sip-f").forEach(el => el.style.display = type==="SIP"?"flex":"none");
  document.querySelectorAll(".exp-f").forEach(el => el.style.display = type==="Expense"?"flex":"none");
}

function selectEmoji(el, emoji) {
  document.querySelectorAll(".emoji-opt").forEach(e => e.classList.remove("selected"));
  el.classList.add("selected");
  document.getElementById("g-icon").value = emoji;
}

// ── API CALLS ──
async function submitEntry() {
  const type   = document.getElementById("f-type").value;
  const name   = document.getElementById("f-name").value.trim();
  const amount = parseFloat(document.getElementById("f-amount").value);
  const due    = parseInt(document.getElementById("f-due").value);
  if (!name)                              { alert("Please enter a name.");                return; }
  if (isNaN(amount) || amount <= 0)       { alert("Please enter a valid amount.");        return; }
  if (isNaN(due) || due < 1 || due > 31) { alert("Due date must be between 1 and 31."); return; }
  const entry = { type, name, amount, dueDate: due };
  if (type === "EMI") { entry.tenure=parseInt(document.getElementById("f-tenure").value)||0; entry.remaining=parseInt(document.getElementById("f-remaining").value)||0; entry.bank=document.getElementById("f-bank").value.trim(); }
  if (type === "SIP") { entry.duration=parseInt(document.getElementById("f-duration").value)||0; entry.elapsed=parseInt(document.getElementById("f-elapsed").value)||0; entry.fund=document.getElementById("f-fund").value.trim(); }
  if (type === "Expense") { entry.category = document.getElementById("f-category").value; }
  try {
    const res = await fetch("/api/entries", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(entry) });
    const r = await res.json();
    if (r.success) { closeModal("addModal"); await fetchData(); }
    else alert("Failed to save. Try again.");
  } catch(e) { alert("Cannot reach server."); }
}

async function deleteEntry(id) {
  if (!confirm("Remove this entry?")) return;
  await fetch("/api/entries/"+id, { method:"DELETE" });
  await fetchData();
}

async function submitGoal() {
  const name    = document.getElementById("g-name").value.trim();
  const target  = parseFloat(document.getElementById("g-target").value);
  const saved   = parseFloat(document.getElementById("g-saved").value)   || 0;
  const monthly = parseFloat(document.getElementById("g-monthly").value) || 0;
  const date    = document.getElementById("g-date").value;
  const icon    = document.getElementById("g-icon").value;
  if (!name)                         { alert("Please enter a goal name.");           return; }
  if (isNaN(target) || target <= 0) { alert("Please enter a valid target amount."); return; }
  const goal = { name, targetAmount:target, savedAmount:saved, monthlyTarget:monthly, deadline:date, icon };
  try {
    const res = await fetch("/api/goals", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(goal) });
    const r = await res.json();
    if (r.success) { closeModal("goalModal"); await fetchData(); switchTab("goals"); }
    else alert("Failed to save goal.");
  } catch(e) { alert("Cannot reach server."); }
}

async function deleteGoal(id) {
  if (!confirm("Delete this goal?")) return;
  await fetch("/api/goals/"+id, { method:"DELETE" });
  await fetchData();
}

async function submitDeposit() {
  const id     = parseInt(document.getElementById("dep-goal-id").value);
  const amount = parseFloat(document.getElementById("dep-amount").value);
  if (isNaN(amount) || amount <= 0) { alert("Please enter a valid amount."); return; }
  try {
    const res = await fetch("/api/goals/"+id+"/deposit", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({amount}) });
    const r = await res.json();
    if (r.success) { closeModal("depositModal"); await fetchData(); }
    else alert("Failed to deposit.");
  } catch(e) { alert("Cannot reach server."); }
}

async function saveIncome() {
  const income = parseFloat(document.getElementById("f-income").value);
  if (isNaN(income) || income <= 0) { alert("Please enter a valid income."); return; }
  await fetch("/api/income", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({income}) });
  closeModal("incomeModal");
  await fetchData();
}

// EMI BREAKDOWN BAR CHART
function drawEMIBreakdown() {
  if (emiBreakInst) { emiBreakInst.destroy(); emiBreakInst = null; }
  const wrap = document.getElementById("emi-breakdown-wrap");
  const emis = appData.entries.filter(e => e.type === "EMI");
  if (!emis.length) {
    if (wrap) wrap.innerHTML = '<div class="no-data">No EMIs added.<br><b>Add EMI entries</b> to see chart.</div>';
    return;
  }
  if (wrap && !wrap.querySelector("canvas")) wrap.innerHTML = '<canvas id="emi-breakdown-chart"></canvas>';
  const ctx = document.getElementById("emi-breakdown-chart").getContext("2d");
  const palette = ["#ef4444","#f59e0b","#8b5cf6","#ec4899","#06b6d4","#3b82f6","#10b981"];
  emiBreakInst = new Chart(ctx, {
    type: "bar",
    data: {
      labels: emis.map(e => e.name),
      datasets: [{
        label: "Monthly EMI (Rs.)",
        data: emis.map(e => e.amount),
        backgroundColor: emis.map((_, i) => palette[i % palette.length] + "cc"),
        borderColor:     emis.map((_, i) => palette[i % palette.length]),
        borderWidth: 1, borderRadius: 6, borderSkipped: false
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#111827", borderColor: "#1f2d45", borderWidth: 1,
          titleColor: "#e2e8f0", bodyColor: "#f59e0b",
          callbacks: {
            label: c => "  " + fmt(c.parsed.y) + "/mo",
            afterLabel: c => {
              const e = emis[c.dataIndex];
              return (e.bank ? "  " + e.bank + " · " : "  ") + (e.remaining||0) + " months left";
            }
          }
        }
      },
      scales: {
        x: { ticks: { color: "#94a3b8", maxRotation: 30 }, grid: { display: false }, border: { display: false } },
        y: { ticks: { color: "#64748b", callback: v => "Rs." + (v >= 1000 ? (v/1000).toFixed(0)+"k" : v) }, grid: { color: "rgba(31,45,69,0.6)" }, border: { display: false } }
      }
    }
  });
}

// MONTHLY CASH FLOW BAR CHART
function drawCashFlow(income, outflow, free) {
  if (cashflowInst) { cashflowInst.destroy(); cashflowInst = null; }
  const ctx = document.getElementById("cashflow-chart").getContext("2d");
  const freeColor = free >= 0 ? "rgba(16,185,129,0.8)" : "rgba(239,68,68,0.8)";
  cashflowInst = new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["This Month"],
      datasets: [
        { label: "Income",    data: [income],         backgroundColor: "rgba(16,185,129,0.8)", borderRadius: 6, borderSkipped: false },
        { label: "Outflow",   data: [outflow],        backgroundColor: "rgba(239,68,68,0.8)",  borderRadius: 6, borderSkipped: false },
        { label: "Free Cash", data: [Math.abs(free)], backgroundColor: freeColor,              borderRadius: 6, borderSkipped: false }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: "#94a3b8", padding: 14, font: { size: 11 } } },
        tooltip: {
          backgroundColor: "#111827", borderColor: "#1f2d45", borderWidth: 1,
          titleColor: "#e2e8f0", bodyColor: "#f59e0b",
          callbacks: {
            label: c => {
              const suffix = c.dataset.label === "Free Cash" && free < 0 ? " (Deficit)" : "";
              return "  " + fmt(c.parsed.y) + suffix;
            }
          }
        }
      },
      scales: {
        x: { ticks: { color: "#64748b" }, grid: { display: false }, border: { display: false } },
        y: { ticks: { color: "#64748b", callback: v => "Rs." + (v >= 1000 ? (v/1000).toFixed(0)+"k" : v) }, grid: { color: "rgba(31,45,69,0.6)" }, border: { display: false } }
      }
    }
  });
}

// EXPENSE CATEGORY PIE CHART
function drawExpensePie() {
  if (expPieInst) { expPieInst.destroy(); expPieInst = null; }
  const wrap = document.getElementById("exp-pie-wrap");
  const expenses = appData.entries.filter(e => e.type === "Expense");
  if (!expenses.length) {
    if (wrap) wrap.innerHTML = '<div class="no-data">No expenses added.<br><b>Add expense entries</b> to see chart.</div>';
    return;
  }
  const cats = {};
  expenses.forEach(e => { const k = e.category || "Other"; cats[k] = (cats[k] || 0) + e.amount; });
  const labels = Object.keys(cats);
  const values = Object.values(cats);
  const total  = values.reduce((a, b) => a + b, 0);
  if (wrap && !wrap.querySelector("canvas")) wrap.innerHTML = '<canvas id="exp-pie-canvas"></canvas>';
  const palette = ["#3b82f6","#8b5cf6","#f59e0b","#10b981","#ef4444","#06b6d4","#ec4899","#a3e635"];
  expPieInst = new Chart(document.getElementById("exp-pie-canvas").getContext("2d"), {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: labels.map((_, i) => palette[i % palette.length]),
        borderColor: "#151e2e", borderWidth: 3, hoverOffset: 8
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { color: "#94a3b8", padding: 14, font: { size: 11 } } },
        tooltip: {
          backgroundColor: "#111827", borderColor: "#1f2d45", borderWidth: 1,
          titleColor: "#e2e8f0", bodyColor: "#f59e0b",
          callbacks: { label: c => "  " + fmt(c.parsed) + "  (" + Math.round(c.parsed / total * 100) + "%)" }
        }
      },
      cutout: "60%"
    }
  });
}

// SIP GROWTH PROJECTION LINE CHART  M = P × ((1+r)^n − 1) / r × (1+r), r = 12%/12
function drawSIPProjection() {
  if (sipProjInst) { sipProjInst.destroy(); sipProjInst = null; }
  const input = document.getElementById("sip-proj-amount");
  let P = parseFloat(input ? input.value : 0);
  if (!P || P <= 0) P = 5000;
  const r = 0.12 / 12;
  const years = [5, 10, 15, 20];
  const corpus   = years.map(y => { const n = y * 12; return Math.round(P * (Math.pow(1+r, n) - 1) / r * (1 + r)); });
  const invested = years.map(y => P * y * 12);
  const ctx = document.getElementById("sip-projection-chart").getContext("2d");
  sipProjInst = new Chart(ctx, {
    type: "line",
    data: {
      labels: years.map(y => y + "Y"),
      datasets: [
        {
          label: "Projected Corpus",
          data: corpus,
          borderColor: "#f59e0b", backgroundColor: "rgba(245,158,11,0.08)",
          borderWidth: 2.5, pointBackgroundColor: "#f59e0b",
          pointRadius: 5, pointHoverRadius: 7,
          fill: true, tension: 0.35
        },
        {
          label: "Amount Invested",
          data: invested,
          borderColor: "#3b82f6", backgroundColor: "rgba(59,130,246,0.06)",
          borderWidth: 2, borderDash: [5, 4], pointBackgroundColor: "#3b82f6",
          pointRadius: 4, pointHoverRadius: 6,
          fill: true, tension: 0.35
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { color: "#94a3b8", padding: 14, font: { size: 11 } } },
        tooltip: {
          backgroundColor: "#111827", borderColor: "#1f2d45", borderWidth: 1,
          titleColor: "#e2e8f0", bodyColor: "#f59e0b",
          callbacks: {
            label: c => "  " + c.dataset.label + ": " + fmt(c.parsed.y),
            afterBody: items => {
              const i = items[0].dataIndex;
              const gain = corpus[i] - invested[i];
              return ["  Gain: " + fmt(gain) + "  (" + Math.round(gain / invested[i] * 100) + "% return)"];
            }
          }
        }
      },
      scales: {
        x: { ticks: { color: "#64748b" }, grid: { color: "rgba(31,45,69,0.6)" }, border: { display: false } },
        y: {
          ticks: { color: "#64748b", callback: v => v >= 100000 ? "Rs." + (v/100000).toFixed(1) + "L" : v >= 1000 ? "Rs." + (v/1000).toFixed(0) + "k" : "Rs." + v },
          grid: { color: "rgba(31,45,69,0.6)" }, border: { display: false }
        }
      }
    }
  });
}

fetchData();
