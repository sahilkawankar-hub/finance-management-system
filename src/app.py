from flask import Flask, render_template, request, jsonify, session, redirect, url_for, flash
from functools import wraps
import json, os
from datetime import datetime

app = Flask(__name__, template_folder="../templates", static_folder="../static")
app.secret_key = 'fintrack-prototype-key-change-in-prod'
DATA_FILE = "data.json"

def load():
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE) as f:
            return json.load(f)
    return { "income": 0, "entries": [], "goals": [] }

def save(data):
    with open(DATA_FILE, "w") as f:
        json.dump(data, f, indent=2)

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get('logged_in'):
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function

@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form["username"]
        password = request.form["password"]
        if username == "user" and password == "pass123":
            session["logged_in"] = True
            return redirect(url_for("index"))
        flash("Invalid username or password!")
    return render_template("login.html")

@app.route("/logout")
def logout():
    session.pop("logged_in", None)
    flash("Logged out successfully!")
    return redirect(url_for("login"))

@app.route("/")
@login_required
def index():
    return render_template("index.html")

@app.route("/api/data")
def get_data():
    if not session.get('logged_in'):
        return jsonify({"error": "login_required"}), 401
    data = load()
    if "goals" not in data:
        data["goals"] = []
    return jsonify(data)

@app.route("/api/income", methods=["POST"])
@login_required
def set_income():
    data = load()
    data["income"] = request.json.get("income", 0)
    save(data)
    return jsonify({"success": True})

@app.route("/api/entries", methods=["POST"])
@login_required
def add_entry():
    data = load()
    entry = request.json
    entry["id"]      = int(datetime.now().timestamp() * 1000)
    entry["amount"]  = float(entry["amount"])
    entry["dueDate"] = int(entry["dueDate"])
    data["entries"].append(entry)
    save(data)
    return jsonify({"success": True, "entry": entry})

@app.route("/api/entries/<int:eid>", methods=["DELETE"])
@login_required
def del_entry(eid):
    data = load()
    data["entries"] = [e for e in data["entries"] if e["id"] != eid]
    save(data)
    return jsonify({"success": True})

@app.route("/api/goals", methods=["POST"])
@login_required
def add_goal():
    data = load()
    if "goals" not in data:
        data["goals"] = []
    goal = request.json
    goal["id"]            = int(datetime.now().timestamp() * 1000)
    goal["targetAmount"]  = float(goal["targetAmount"])
    goal["savedAmount"]   = float(goal.get("savedAmount", 0))
    goal["monthlyTarget"] = float(goal.get("monthlyTarget", 0))
    data["goals"].append(goal)
    save(data)
    return jsonify({"success": True, "goal": goal})

@app.route("/api/goals/<int:gid>", methods=["DELETE"])
@login_required
def del_goal(gid):
    data = load()
    data["goals"] = [g for g in data.get("goals", []) if g["id"] != gid]
    save(data)
    return jsonify({"success": True})

@app.route("/api/goals/<int:gid>/deposit", methods=["POST"])
@login_required
def deposit_goal(gid):
    data   = load()
    amount = float(request.json.get("amount", 0))
    for g in data.get("goals", []):
        if g["id"] == gid:
            g["savedAmount"] = min(g["savedAmount"] + amount, g["targetAmount"])
            break
    save(data)
    return jsonify({"success": True})

@app.route("/api/recommendations")
@login_required
def get_recommendations():
    data = load()
    income  = data.get("income", 0)
    entries = data.get("entries", [])

    emi_total = sum(e["amount"] for e in entries if e["type"] == "EMI")
    sip_total = sum(e["amount"] for e in entries if e["type"] == "SIP")
    exp_total = sum(e["amount"] for e in entries if e["type"] == "Expense")
    total_out = emi_total + sip_total + exp_total
    free_cash = income - total_out

    warnings    = []
    suggestions = []
    score       = 100

    # EMI check
    if income > 0:
        emi_ratio = (emi_total / income) * 100
        if emi_ratio > 50:
            warnings.append("Your EMI is more than 50% of income. This is dangerous.")
            score -= 30
        elif emi_ratio > 40:
            warnings.append("Your EMI is more than 40% of income. Try to reduce debt.")
            score -= 15

    # Savings check
    if sip_total == 0:
        warnings.append("You have no SIP or investments. Start saving now.")
        score -= 20
        if free_cash > 2000:
            suggestions.append("Start a SIP of Rs. " + str(int(free_cash * 0.2)) + "/month.")

    # Free cash check
    if free_cash < 0:
        warnings.append("You are spending more than you earn. Immediate action needed.")
        score -= 30
    elif free_cash < income * 0.1:
        warnings.append("Very little free cash left. Try cutting expenses.")
        score -= 10
    else:
        suggestions.append("You have Rs. " + str(int(free_cash)) + " free. Consider investing 20% of it.")

    # SIP suggestion
    if free_cash > 5000 and sip_total < income * 0.1:
        suggestions.append("Increase your SIP. Aim for 10% of income = Rs. " + str(int(income * 0.1)) + "/month.")

    # Score floor
    score = max(0, score)

    # Grade
    if score >= 80:
        grade = "Excellent"
    elif score >= 60:
        grade = "Good"
    elif score >= 40:
        grade = "Average"
    else:
        grade = "Poor"

    return jsonify({
        "score":       score,
        "grade":       grade,
        "warnings":    warnings,
        "suggestions": suggestions,
        "free_cash":   free_cash,
        "emi_total":   emi_total,
        "sip_total":   sip_total,
        "exp_total":   exp_total
    })

if __name__ == "__main__":
    app.run(debug=True)