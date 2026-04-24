from flask import Flask, render_template, request, jsonify, session, redirect, url_for
import hashlib, secrets
from datetime import datetime
import json, os

# ── FILE PATHS ────────────────────────────────────────
DATA_FILE     = os.path.join(os.path.dirname(__file__), '..', 'data.json')
PAYMENTS_FILE = os.path.join(os.path.dirname(__file__), '..', 'payments.json')

# ── JSON HELPERS ──────────────────────────────────────
def read_data():
    try:
        with open(DATA_FILE, 'r') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"users": {}, "user_data": {}}

def write_data(data):
    with open(DATA_FILE, 'w') as f:
        json.dump(data, f, indent=2)

def read_payments():
    try:
        with open(PAYMENTS_FILE, 'r') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return []

def write_payments(payments):
    with open(PAYMENTS_FILE, 'w') as f:
        json.dump(payments, f, indent=2)

def get_user_data(u):
    """Return the user_data dict for a username, creating it if missing."""
    data = read_data()
    if "user_data" not in data:
        data["user_data"] = {}
    if u not in data["user_data"]:
        data["user_data"][u] = {"income": 0, "entries": [], "goals": []}
        write_data(data)
    return data["user_data"][u]

def ensure_user_data(data, u):
    """Ensure user_data[u] exists with all required keys. Mutates data in place."""
    if "user_data" not in data:
        data["user_data"] = {}
    if u not in data["user_data"]:
        data["user_data"][u] = {"income": 0, "entries": [], "goals": []}
    ud = data["user_data"][u]
    if "entries" not in ud:
        ud["entries"] = []
    if "goals" not in ud:
        ud["goals"] = []
    if "income" not in ud:
        ud["income"] = 0

# ── APP SETUP ─────────────────────────────────────────
app = Flask(__name__, template_folder='../templates', static_folder='../static')
app.secret_key = os.environ.get("SECRET_KEY", "fintrack-dev-key-2024")

def hash_pw(pw):
    return hashlib.sha256(pw.encode()).hexdigest()

def ok():
    return "username" in session

# ── AUTH ──────────────────────────────────────────────

@app.route("/")
def index():
    if not ok():
        return redirect(url_for("login_page"))
    return render_template("index.html",
                           username=session["username"],
                           name=session.get("name", ""))

@app.route("/login")
def login_page():
    if ok():
        return redirect(url_for("index"))
    return render_template("login.html")

@app.route("/api/register", methods=["POST"])
def register():
    b = request.get_json(silent=True) or {}
    u = b.get("username", "").strip().lower()
    p = b.get("password", "")
    n = b.get("name", "").strip()

    if not u or not p or not n:
        return jsonify({"success": False, "error": "Please fill all fields."})

    data = read_data()
    if "users" not in data:
        data["users"] = {}
    if "user_data" not in data:
        data["user_data"] = {}

    if u in data["users"]:
        return jsonify({"success": False, "error": "Username already taken."})

    data["users"][u] = {
        "name": n,
        "password": hash_pw(p),
        "created": datetime.now().isoformat()
    }
    data["user_data"][u] = {"income": 0, "entries": [], "goals": []}
    write_data(data)

    session["username"] = u
    session["name"] = n
    return jsonify({"success": True})

@app.route("/api/login", methods=["POST"])
def login():
    b = request.get_json(silent=True) or {}
    u = b.get("username", "").strip().lower()
    p = b.get("password", "")

    if not u or not p:
        return jsonify({"success": False, "error": "Please fill all fields."})

    data = read_data()
    users = data.get("users", {})

    if u not in users:
        return jsonify({"success": False, "error": "User not found."})

    if users[u]["password"] != hash_pw(p):
        return jsonify({"success": False, "error": "Incorrect password."})

    # FIX: ensure user_data exists for legacy accounts that may be missing it
    ensure_user_data(data, u)
    write_data(data)

    session["username"] = u
    session["name"] = users[u]["name"]
    return jsonify({"success": True})

@app.route("/api/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"success": True})

# ── DATA ──────────────────────────────────────────────

@app.route("/api/data")
def get_data():
    if not ok():
        return jsonify({"error": "Unauthorized"}), 401
    u = session["username"]
    ud = get_user_data(u)
    return jsonify({
        "income":  ud.get("income", 0),
        "entries": ud.get("entries", []),
        "goals":   ud.get("goals", []),
        "name":    session.get("name", u)
    })

@app.route("/api/income", methods=["POST"])
def set_income():
    if not ok():
        return jsonify({"error": "Unauthorized"}), 401
    u = session["username"]
    b = request.get_json(silent=True) or {}
    income = float(b.get("income", 0))

    data = read_data()
    ensure_user_data(data, u)
    data["user_data"][u]["income"] = income
    write_data(data)
    return jsonify({"success": True})

@app.route("/api/entries", methods=["POST"])
def add_entry():
    if not ok():
        return jsonify({"error": "Unauthorized"}), 401
    u = session["username"]
    e = request.get_json(silent=True) or {}
    eid = int(datetime.now().timestamp() * 1000)

    new_entry = {
        "id":      eid,
        "name":    e.get("name", ""),
        "type":    e.get("type", "Expense"),
        "amount":  float(e.get("amount", 0)),
        "dueDate": int(e.get("dueDate", 1)),
    }
    if new_entry["type"] == "EMI":
        new_entry["tenure"]    = int(e.get("tenure", 0))
        new_entry["remaining"] = int(e.get("remaining", 0))
        new_entry["bank"]      = e.get("bank", "")
    if new_entry["type"] == "SIP":
        new_entry["duration"]  = int(e.get("duration", 0))
        new_entry["elapsed"]   = int(e.get("elapsed", 0))
        new_entry["fund"]      = e.get("fund", "")
    if new_entry["type"] == "Expense":
        new_entry["category"]  = e.get("category", "Other")

    data = read_data()
    ensure_user_data(data, u)  # FIX: was crashing with KeyError if user_data[u] missing
    data["user_data"][u]["entries"].append(new_entry)
    write_data(data)
    return jsonify({"success": True, "entry": new_entry})

@app.route("/api/entries/<int:eid>", methods=["DELETE"])
def del_entry(eid):
    if not ok():
        return jsonify({"error": "Unauthorized"}), 401
    u = session["username"]

    data = read_data()
    ensure_user_data(data, u)
    entries = data["user_data"][u].get("entries", [])
    data["user_data"][u]["entries"] = [e for e in entries if e["id"] != eid]
    write_data(data)
    return jsonify({"success": True})

@app.route("/api/goals", methods=["POST"])
def add_goal():
    if not ok():
        return jsonify({"error": "Unauthorized"}), 401
    u = session["username"]
    g = request.get_json(silent=True) or {}
    gid = int(datetime.now().timestamp() * 1000)

    new_goal = {
        "id":            gid,
        "name":          g.get("name", ""),
        "icon":          g.get("icon", "🎯"),
        "targetAmount":  float(g.get("targetAmount", 0)),
        "savedAmount":   float(g.get("savedAmount", 0)),
        "monthlyTarget": float(g.get("monthlyTarget", 0)),
        "deadline":      g.get("deadline", "")
    }

    data = read_data()
    ensure_user_data(data, u)  # FIX: was using raw check, now consistent
    data["user_data"][u]["goals"].append(new_goal)
    write_data(data)
    return jsonify({"success": True, "goal": new_goal})

@app.route("/api/goals/<int:gid>", methods=["DELETE"])
def del_goal(gid):
    if not ok():
        return jsonify({"error": "Unauthorized"}), 401
    u = session["username"]

    data = read_data()
    ensure_user_data(data, u)
    goals = data["user_data"][u].get("goals", [])
    data["user_data"][u]["goals"] = [g for g in goals if g["id"] != gid]
    write_data(data)
    return jsonify({"success": True})

@app.route("/api/entries/<int:eid>/pay", methods=["POST"])
def pay_entry(eid):
    if not ok():
        return jsonify({"error": "Unauthorized"}), 401
    u = session["username"]
    current_month = datetime.now().strftime("%Y-%m")

    data = read_data()
    ensure_user_data(data, u)
    entries = data["user_data"][u].get("entries", [])
    entry = next((e for e in entries if e["id"] == eid), None)
    if not entry:
        return jsonify({"success": False, "error": "Entry not found."}), 404

    entry["paidMonth"] = current_month
    write_data(data)

    pid = int(datetime.now().timestamp() * 1000)
    new_payment = {
        "id":       pid,
        "user":     u,
        "category": entry.get("type", "Other"),
        "amount":   entry["amount"],
        "date":     datetime.now().strftime("%Y-%m-%d"),
        "note":     entry["name"] + " — auto logged"
    }
    payments = read_payments()
    payments.append(new_payment)
    write_payments(payments)

    return jsonify({"success": True, "payment": new_payment})

@app.route("/api/goals/<int:gid>/deposit", methods=["POST"])
def deposit_goal(gid):
    if not ok():
        return jsonify({"error": "Unauthorized"}), 401
    u = session["username"]
    b = request.get_json(silent=True) or {}
    amount = float(b.get("amount", 0))
    if amount <= 0:
        return jsonify({"success": False, "error": "Amount must be positive."})

    data = read_data()
    ensure_user_data(data, u)
    goals = data["user_data"][u].get("goals", [])
    for g in goals:
        if g["id"] == gid:
            g["savedAmount"] = round(g["savedAmount"] + amount, 2)
            write_data(data)
            return jsonify({"success": True, "goal": g})

    return jsonify({"success": False, "error": "Goal not found."}), 404

# ── PAYMENTS ──────────────────────────────────────────

@app.route("/log_payment", methods=["POST"])
def log_payment():
    if not ok():
        return jsonify({"error": "Unauthorized"}), 401
    b = request.get_json(silent=True) or {}
    category = b.get("category", "").strip()
    note     = b.get("note", "").strip()
    try:
        amount = float(b.get("amount", 0))
        date   = b.get("date", "").strip()
    except (ValueError, TypeError):
        return jsonify({"success": False, "error": "Invalid amount or date."}), 400

    if not category or not date or amount <= 0:
        return jsonify({"success": False, "error": "category, amount, and date are required."}), 400

    pid = int(datetime.now().timestamp() * 1000)
    new_payment = {
        "id":       pid,
        "user":     session["username"],
        "category": category,
        "amount":   amount,
        "date":     date,
        "note":     note
    }

    payments = read_payments()
    payments.append(new_payment)
    write_payments(payments)
    return jsonify({"success": True, "payment": new_payment})

@app.route("/get_payments")
def get_payments():
    if not ok():
        return jsonify({"error": "Unauthorized"}), 401
    u = session["username"]
    payments = read_payments()
    user_payments = [p for p in payments if p.get("user") == u]
    return jsonify(user_payments)

@app.route("/edit_payment/<int:pid>", methods=["PUT"])
def edit_payment(pid):
    if not ok():
        return jsonify({"error": "Unauthorized"}), 401
    u = session["username"]
    b = request.get_json(silent=True) or {}
    category = b.get("category", "").strip()
    note     = b.get("note", "").strip()
    try:
        amount = float(b.get("amount", 0))
        date   = b.get("date", "").strip()
    except (ValueError, TypeError):
        return jsonify({"success": False, "error": "Invalid amount or date."}), 400

    if not category or not date or amount <= 0:
        return jsonify({"success": False, "error": "category, amount, and date are required."}), 400

    payments = read_payments()
    for p in payments:
        if p["id"] == pid and p.get("user") == u:
            p["category"] = category
            p["amount"]   = amount
            p["date"]     = date
            p["note"]     = note
            write_payments(payments)
            return jsonify({"success": True})

    return jsonify({"success": False, "error": "Payment not found."}), 404

@app.route("/delete_payment/<int:pid>", methods=["DELETE"])
def delete_payment(pid):
    if not ok():
        return jsonify({"error": "Unauthorized"}), 401
    u = session["username"]

    payments = read_payments()
    new_payments = [p for p in payments if not (p["id"] == pid and p.get("user") == u)]
    write_payments(new_payments)
    return jsonify({"success": True})

# ── RECOMMENDATIONS ───────────────────────────────────

@app.route("/api/recommendations")
def get_recommendations():
    if not ok():
        return jsonify({"error": "Unauthorized"}), 401

    from datetime import date
    today = date.today()

    u  = session["username"]
    ud = get_user_data(u)

    income   = ud.get("income", 0)
    entries  = ud.get("entries", [])
    goals    = ud.get("goals", [])

    emis     = [e for e in entries if e.get("type") == "EMI"]
    sips     = [e for e in entries if e.get("type") == "SIP"]
    expenses = [e for e in entries if e.get("type") == "Expense"]

    total_emi     = sum(e.get("amount", 0) for e in emis)
    total_sip     = sum(e.get("amount", 0) for e in sips)
    total_expense = sum(e.get("amount", 0) for e in expenses)
    total_out     = total_emi + total_sip + total_expense
    free_cash     = income - total_out
    ratio         = round((total_out / income * 100), 1) if income else 0

    cards = []

    def sip_fv(monthly, months):
        r = 0.12 / 12
        if r == 0 or months <= 0:
            return monthly * months
        return round(monthly * ((pow(1 + r, months) - 1) / r) * (1 + r))

    if income == 0:
        cards.append({
            "icon": "📥", "title": "Set Your Income First",
            "category": "spending", "type": "info", "tag": "Setup",
            "summary": "No income set. All recommendations need your monthly take-home to calculate ratios.",
            "action": "Click 'Set Income' in the header and enter your monthly take-home salary.",
            "impact": "Unlocks all personalised recommendations instantly"
        })
    elif ratio > 90:
        shortfall = total_out - income
        cards.append({
            "icon": "🚨", "title": "Severe Overspend — Act Now",
            "category": "spending", "type": "danger", "tag": "Critical",
            "summary": f"You're spending ₹{shortfall:,.0f} MORE than you earn every month. This is unsustainable.",
            "action": f"Cut at least ₹{shortfall + int(income * 0.1):,.0f}/mo immediately — start with largest expense.",
            "impact": f"Every ₹1,000 cut saves ₹12,000/year and stops debt from growing"
        })
    elif ratio > 80:
        to_safe = int((ratio - 60) / 100 * income)
        cards.append({
            "icon": "⚠️", "title": "Commitment Ratio Too High",
            "category": "spending", "type": "danger", "tag": "High Risk",
            "summary": f"{ratio}% of your ₹{income:,} income is locked in. You have only ₹{int(free_cash):,} left for emergencies.",
            "action": f"Find and cut ₹{to_safe:,}/mo in expenses — review subscriptions and dining first.",
            "impact": f"Cutting to 60% ratio frees ₹{to_safe:,}/mo = ₹{to_safe*12:,}/year"
        })
    elif ratio > 60:
        to_safe = int((ratio - 60) / 100 * income)
        cards.append({
            "icon": "📊", "title": "Ratio Nearing Danger Zone",
            "category": "spending", "type": "warning", "tag": "Watch Out",
            "summary": f"At {ratio}%, you're {ratio - 60:.0f}% above the safe 60% limit. Just ₹{to_safe:,}/mo to fix.",
            "action": "Audit recurring expenses this week — cancel or downgrade one subscription.",
            "impact": f"Saving ₹{to_safe:,}/mo gets ratio to 60% and frees up ₹{to_safe*12:,}/year"
        })
    else:
        cards.append({
            "icon": "✅", "title": "Healthy Spending Ratio",
            "category": "spending", "type": "success", "tag": "On Track",
            "summary": f"Excellent! Only {ratio}% of income committed. You have ₹{int(free_cash):,}/mo in free cash.",
            "action": "Don't let free cash sit idle — assign it to a SIP or goal deposit this week.",
            "impact": f"₹{int(free_cash * 0.5):,}/mo invested at 12% p.a. = significant wealth in 10 years"
        })

    if emis:
        heaviest = max(emis, key=lambda e: e.get("remaining", 0))
        amt      = heaviest.get("amount", 0)
        rem      = heaviest.get("remaining", 0)
        name     = heaviest.get("name", "EMI")
        bank     = heaviest.get("bank", "")
        total_interest_approx = int(amt * rem * 0.004)

        if rem > 36:
            prepay_amt = max(amt, int(income * 0.05))
            months_saved = int(prepay_amt / amt * 6)
            cards.append({
                "icon": "🏦", "title": f"Prepay {name} Early",
                "category": "emi", "type": "info", "tag": "EMI Tip",
                "summary": f"₹{amt:,}/mo for {rem} months left{' · ' + bank if bank else ''}. Estimated interest remaining: ₹{total_interest_approx:,}.",
                "action": f"Pay ₹{prepay_amt:,} extra next month as principal — tell {bank or 'your bank'} it's a part-prepayment.",
                "impact": f"One extra payment of ₹{prepay_amt:,} saves ~{months_saved} months of EMI"
            })
        elif rem > 0:
            cards.append({
                "icon": "🏁", "title": f"{name} Almost Done!",
                "category": "emi", "type": "success", "tag": "Finish Line",
                "summary": f"Only {rem} months left on {name}. ₹{amt * rem:,} total remaining — you're nearly there.",
                "action": f"Consider a lump-sum payment of ₹{int(amt * rem):,} to close this loan immediately.",
                "impact": f"Closing now saves ~₹{total_interest_approx:,} in remaining interest"
            })

        emi_ratio = round(total_emi / income * 100, 1) if income else 0
        if emi_ratio > 40:
            cards.append({
                "icon": "📉", "title": "EMI Burden Is Very High",
                "category": "emi", "type": "warning", "tag": "Debt Heavy",
                "summary": f"EMIs eat {emi_ratio}% of income (₹{int(total_emi):,}/mo). Safe limit is 30-35% for financial flexibility.",
                "action": "Do not take any new loan until at least one EMI is fully closed.",
                "impact": f"Closing any one EMI frees ₹{int(min(e.get('amount',0) for e in emis)):,}–₹{int(max(e.get('amount',0) for e in emis)):,}/mo"
            })
    else:
        if income > 0:
            cards.append({
                "icon": "🎉", "title": "Zero EMIs — Rare Achievement",
                "category": "emi", "type": "success", "tag": "Debt Free",
                "summary": f"No active loans! Your full ₹{int(free_cash + total_sip):,}/mo can build wealth instead of paying interest.",
                "action": "Redirect what would have been EMI money into an index fund SIP.",
                "impact": "Debt-free investing compounds 3× faster than EMI repayment phase"
            })

    if sips:
        for s in sips:
            elapsed  = s.get("elapsed", 0)
            duration = s.get("duration", 1)
            amt      = s.get("amount", 0)
            name     = s.get("name", "SIP")
            progress = round((elapsed / duration * 100), 1) if duration else 0
            months_left = max(0, duration - elapsed)
            invested_so_far = amt * elapsed
            proj_corpus = sip_fv(amt, duration)
            extra_500_corpus = sip_fv(amt + 500, duration) - proj_corpus

            if progress < 25:
                cards.append({
                    "icon": "🌱", "title": f"Boost {name} Early",
                    "category": "investment", "type": "success", "tag": "Compound Now",
                    "summary": f"Only {progress:.0f}% through {name}. Projected corpus: ₹{proj_corpus:,}. Early boosts compound the most.",
                    "action": f"Increase {name} by ₹500/mo today — compounding works best at the start.",
                    "impact": f"+₹500/mo now = ₹{extra_500_corpus:,} extra corpus by maturity"
                })
            elif progress > 75:
                cards.append({
                    "icon": "🏆", "title": f"{name} Nearing Maturity",
                    "category": "investment", "type": "info", "tag": "Plan Ahead",
                    "summary": f"{name} is {progress:.0f}% complete — ₹{invested_so_far:,} invested. Corpus will mature in {months_left} months.",
                    "action": f"Decide NOW where to redeploy maturity corpus — don't let ₹{proj_corpus:,} sit idle.",
                    "impact": f"Reinvesting ₹{proj_corpus:,} immediately avoids 1–2 months of lost returns"
                })

        sip_ratio = round(total_sip / income * 100, 1) if income else 0
        if sip_ratio < 10 and income > 0 and free_cash > 2000:
            ideal_sip = int(income * 0.15)
            extra = ideal_sip - int(total_sip)
            cards.append({
                "icon": "📈", "title": "SIP Below 15% of Income",
                "category": "investment", "type": "warning", "tag": "Invest More",
                "summary": f"Only {sip_ratio}% of income in SIPs (₹{int(total_sip):,}/mo). Wealth-builders invest 15–20%.",
                "action": f"Start a new SIP of ₹{extra:,}/mo in a Nifty 50 index fund — takes 5 minutes.",
                "impact": f"₹{extra:,}/mo extra SIP = ₹{sip_fv(extra, 120):,} corpus in 10 years"
            })
    else:
        if income > 0 and free_cash > 1000:
            starter = max(500, int(free_cash * 0.3))
            cards.append({
                "icon": "🚀", "title": "Start Your First SIP Today",
                "category": "investment", "type": "warning", "tag": "No SIPs Yet",
                "summary": f"No SIPs set up. You have ₹{int(free_cash):,}/mo free. Even ₹{starter:,}/mo SIP builds real wealth.",
                "action": "Open any mutual fund app (Zerodha, Groww, Paytm Money) and start a ₹500 Nifty 50 SIP.",
                "impact": f"₹{starter:,}/mo for 10 years at 12% p.a. = ₹{sip_fv(starter, 120):,} corpus"
            })

    if goals:
        for g in goals:
            target  = g.get("targetAmount", 0)
            saved   = g.get("savedAmount", 0)
            monthly = g.get("monthlyTarget", 0)
            name    = g.get("name", "Goal")
            dl_str  = g.get("deadline", "")
            pct     = round((saved / target * 100), 1) if target else 0

            if saved >= target:
                cards.append({
                    "icon": "🥳", "title": f"'{name}' Goal Complete!",
                    "category": "goal", "type": "success", "tag": "Achieved",
                    "summary": f"You've fully funded '{name}' with ₹{int(saved):,}. Congratulations!",
                    "action": "Withdraw and use it, or redirect the monthly contribution to your next goal.",
                    "impact": f"Redirect ₹{int(monthly):,}/mo to a new goal or SIP immediately"
                })
                continue

            if dl_str:
                try:
                    dl = date.fromisoformat(dl_str)
                    months_left = max(1, (dl.year - today.year) * 12 + (dl.month - today.month))
                    needed_pm   = (target - saved) / months_left
                    shortfall_pm = needed_pm - monthly

                    if shortfall_pm > 0:
                        cards.append({
                            "icon": "🎯", "title": f"'{name}' Goal at Risk",
                            "category": "goal", "type": "warning", "tag": "Goal Risk",
                            "summary": f"Need ₹{needed_pm:,.0f}/mo for {months_left} months to reach ₹{target:,}. Currently saving ₹{monthly:,}/mo.",
                            "action": f"Increase deposit to ₹{int(needed_pm):,}/mo — go to Goals tab and add money now.",
                            "impact": f"Gap of ₹{int(shortfall_pm * months_left):,} by deadline if not corrected"
                        })
                    else:
                        cards.append({
                            "icon": "✨", "title": f"'{name}' On Track",
                            "category": "goal", "type": "success", "tag": "On Schedule",
                            "summary": f"₹{int(saved):,} saved of ₹{target:,} ({pct}%). Current pace hits deadline {months_left} months away.",
                            "action": f"Stay consistent with ₹{int(monthly):,}/mo. Consider a bonus top-up to finish early.",
                            "impact": f"One extra deposit of ₹{int(monthly*2):,} could shave 2+ months off timeline"
                        })
                except Exception:
                    pass
            elif monthly > 0 and target > 0:
                months_needed = max(1, int((target - saved) / monthly))
                cards.append({
                    "icon": "📅", "title": f"Set Deadline for '{name}'",
                    "category": "goal", "type": "info", "tag": "No Deadline",
                    "summary": f"At ₹{int(monthly):,}/mo, '{name}' takes {months_needed} months. Set a deadline to stay accountable.",
                    "action": "Edit the goal and add a target date — it makes you 3× more likely to hit it.",
                    "impact": f"Goals with deadlines are achieved 3× more often than open-ended ones"
                })
    else:
        cards.append({
            "icon": "🎯", "title": "No Savings Goals Set",
            "category": "goal", "type": "info", "tag": "Get Started",
            "summary": "Goals give your free cash a purpose and dramatically improve saving discipline.",
            "action": "Go to the Goals tab and add one goal — a trip, gadget, or emergency fund.",
            "impact": "People with written goals save 2× more than those without"
        })

    if income > 0 and free_cash > income * 0.20:
        idle_invest = int(free_cash * 0.5)
        cards.append({
            "icon": "💰", "title": "Large Free Cash Detected",
            "category": "savings", "type": "success", "tag": "Opportunity",
            "summary": f"₹{int(free_cash):,}/mo free after all commitments — that's {round(free_cash/income*100,1)}% of income sitting idle.",
            "action": f"Automate ₹{idle_invest:,}/mo into a liquid fund or index fund SIP — do it today.",
            "impact": f"₹{idle_invest:,}/mo at 12% p.a. = ₹{sip_fv(idle_invest, 60):,} in 5 years"
        })

    monthly_expenses_approx = total_expense + total_sip
    emergency_target = monthly_expenses_approx * 6
    if income > 0 and emergency_target > 0:
        cards.append({
            "icon": "🛡️", "title": "Build Your Emergency Fund",
            "category": "savings", "type": "info", "tag": "Safety Net",
            "summary": f"6-month emergency fund target: ₹{int(emergency_target):,}. Keep it in a liquid fund, not savings account.",
            "action": "Open a liquid mutual fund (e.g. Parag Parikh, ICICI Pru Liquid) and start parking funds.",
            "impact": f"₹{int(emergency_target):,} buffer = financial security against job loss or medical crisis"
        })

    seen_cats = {}
    final_cards = []
    priority_order = {"danger": 0, "warning": 1, "success": 2, "info": 3}
    cards.sort(key=lambda c: priority_order.get(c.get("type", "info"), 99))

    for c in cards:
        cat = c.get("category", "other")
        count = seen_cats.get(cat, 0)
        if count < 2:
            final_cards.append(c)
            seen_cats[cat] = count + 1
        if len(final_cards) >= 8:
            break

    if not final_cards:
        final_cards.append({
            "icon": "📊", "title": "Add Data to Get Started",
            "category": "spending", "type": "info", "tag": "Setup",
            "summary": "Set your income and add EMI, SIP, and expense entries to unlock personalised recommendations.",
            "action": "Click 'Set Income' and '+ Add Entry' in the top bar to get started.",
            "impact": "Full analysis unlocked once your financial data is entered"
        })

    return jsonify({
        "cards": final_cards,
        "meta": {
            "income": income,
            "total_out": total_out,
            "ratio": ratio,
            "free_cash": int(free_cash)
        }
    })


# ── RUN ───────────────────────────────────────────────
if __name__ == "__main__":
    app.run(debug=os.environ.get("FLASK_DEBUG", "false").lower() == "true")
