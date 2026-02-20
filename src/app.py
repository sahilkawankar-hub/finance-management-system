from flask import Flask, render_template, request, jsonify
import json, os
from datetime import datetime

app = Flask(__name__)
DATA_FILE = "data.json"

def load():
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE) as f:
            return json.load(f)
    return { "income": 0, "entries": [], "goals": [] }

def save(data):
    with open(DATA_FILE, "w") as f:
        json.dump(data, f, indent=2)

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/data")
def get_data():
    data = load()
    if "goals" not in data:
        data["goals"] = []
    return jsonify(data)

@app.route("/api/income", methods=["POST"])
def set_income():
    data = load()
    data["income"] = request.json.get("income", 0)
    save(data)
    return jsonify({"success": True})

@app.route("/api/entries", methods=["POST"])
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
def del_entry(eid):
    data = load()
    data["entries"] = [e for e in data["entries"] if e["id"] != eid]
    save(data)
    return jsonify({"success": True})

@app.route("/api/goals", methods=["POST"])
def add_goal():
    data = load()
    if "goals" not in data:
        data["goals"] = []
    goal = request.json
    goal["id"]           = int(datetime.now().timestamp() * 1000)
    goal["targetAmount"] = float(goal["targetAmount"])
    goal["savedAmount"]  = float(goal.get("savedAmount", 0))
    goal["monthlyTarget"]= float(goal.get("monthlyTarget", 0))
    data["goals"].append(goal)
    save(data)
    return jsonify({"success": True, "goal": goal})

@app.route("/api/goals/<int:gid>", methods=["DELETE"])
def del_goal(gid):
    data = load()
    data["goals"] = [g for g in data.get("goals", []) if g["id"] != gid]
    save(data)
    return jsonify({"success": True})

@app.route("/api/goals/<int:gid>/deposit", methods=["POST"])
def deposit_goal(gid):
    data   = load()
    amount = float(request.json.get("amount", 0))
    for g in data.get("goals", []):
        if g["id"] == gid:
            g["savedAmount"] = min(g["savedAmount"] + amount, g["targetAmount"])
            break
    save(data)
    return jsonify({"success": True})

if __name__ == "__main__":
    app.run(debug=True)
