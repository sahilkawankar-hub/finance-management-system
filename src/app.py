from flask import Flask, render_template, request, jsonify, session, redirect, url_for
import json, os, hashlib, secrets
from datetime import datetime

app = Flask(__name__)
app.secret_key = secrets.token_hex(32)
DATA_FILE = "data.json"

def load():
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE) as f: return json.load(f)
    return {"users": {}, "user_data": {}}

def save(data):
    with open(DATA_FILE, "w") as f: json.dump(data, f, indent=2)

def hash_pw(pw): return hashlib.sha256(pw.encode()).hexdigest()

def get_udata(u):
    data = load()
    if u not in data.get("user_data", {}):
        data.setdefault("user_data", {})[u] = {"income":0,"entries":[],"goals":[]}
        save(data)
    return data["user_data"][u]

def save_udata(u, ud):
    data = load(); data.setdefault("user_data",{})[u] = ud; save(data)

def ok(): return "username" in session

@app.route("/")
def index():
    if not ok(): return redirect(url_for("login_page"))
    return render_template("index.html", username=session["username"], name=session.get("name",""))

@app.route("/login")
def login_page():
    if ok(): return redirect(url_for("index"))
    return render_template("login.html")

@app.route("/api/register", methods=["POST"])
def register():
    b = request.json
    u = b.get("username","").strip().lower()
    p = b.get("password","")
    n = b.get("name","").strip()
    if not u or not p or not n: return jsonify({"success":False,"error":"Please fill all fields."})
    if len(u) < 3:  return jsonify({"success":False,"error":"Username must be at least 3 characters."})
    if len(u) > 20: return jsonify({"success":False,"error":"Username must be at most 20 characters."})
    if not u.replace('_','').isalnum(): return jsonify({"success":False,"error":"Username can only contain letters, numbers and underscore."})
    if len(p) < 6:  return jsonify({"success":False,"error":"Password must be at least 6 characters."})
    if len(p) > 32: return jsonify({"success":False,"error":"Password must be at most 32 characters."})
    if len(n) < 2:  return jsonify({"success":False,"error":"Name must be at least 2 characters."})
    if len(n) > 40: return jsonify({"success":False,"error":"Name must be at most 40 characters."})
    data = load(); data.setdefault("users",{})
    if u in data["users"]: return jsonify({"success":False,"error":"Username already taken."})
    data["users"][u] = {"name":n,"password":hash_pw(p),"created":datetime.now().isoformat()}
    data.setdefault("user_data",{})[u] = {"income":0,"entries":[],"goals":[]}
    save(data); session["username"]=u; session["name"]=n
    return jsonify({"success":True})

@app.route("/api/login", methods=["POST"])
def login():
    b = request.json
    u = b.get("username","").strip().lower()
    p = b.get("password","")
    if not u or not p: return jsonify({"success":False,"error":"Please fill all fields."})
    data = load(); users = data.get("users",{})
    if u not in users: return jsonify({"success":False,"error":"User not found. Please register."})
    if users[u]["password"] != hash_pw(p): return jsonify({"success":False,"error":"Incorrect password."})
    session["username"]=u; session["name"]=users[u]["name"]
    return jsonify({"success":True})

@app.route("/api/logout", methods=["POST"])
def logout():
    session.clear(); return jsonify({"success":True})

@app.route("/api/data")
def get_data():
    if not ok(): return jsonify({"error":"Unauthorized"}),401
    ud = get_udata(session["username"]); ud.setdefault("goals",[])
    ud["name"] = session.get("name",session["username"]); return jsonify(ud)

@app.route("/api/income", methods=["POST"])
def set_income():
    if not ok(): return jsonify({"error":"Unauthorized"}),401
    ud = get_udata(session["username"]); ud["income"]=request.json.get("income",0)
    save_udata(session["username"],ud); return jsonify({"success":True})

@app.route("/api/entries", methods=["POST"])
def add_entry():
    if not ok(): return jsonify({"error":"Unauthorized"}),401
    ud = get_udata(session["username"]); e = request.json
    e["id"]=int(datetime.now().timestamp()*1000); e["amount"]=float(e["amount"]); e["dueDate"]=int(e["dueDate"])
    ud["entries"].append(e); save_udata(session["username"],ud); return jsonify({"success":True,"entry":e})

@app.route("/api/entries/<int:eid>", methods=["DELETE"])
def del_entry(eid):
    if not ok(): return jsonify({"error":"Unauthorized"}),401
    ud = get_udata(session["username"]); ud["entries"]=[e for e in ud["entries"] if e["id"]!=eid]
    save_udata(session["username"],ud); return jsonify({"success":True})

@app.route("/api/goals", methods=["POST"])
def add_goal():
    if not ok(): return jsonify({"error":"Unauthorized"}),401
    ud = get_udata(session["username"]); ud.setdefault("goals",[])
    g = request.json; g["id"]=int(datetime.now().timestamp()*1000)
    g["targetAmount"]=float(g["targetAmount"]); g["savedAmount"]=float(g.get("savedAmount",0))
    g["monthlyTarget"]=float(g.get("monthlyTarget",0))
    ud["goals"].append(g); save_udata(session["username"],ud); return jsonify({"success":True,"goal":g})

@app.route("/api/goals/<int:gid>", methods=["DELETE"])
def del_goal(gid):
    if not ok(): return jsonify({"error":"Unauthorized"}),401
    ud = get_udata(session["username"]); ud["goals"]=[g for g in ud.get("goals",[]) if g["id"]!=gid]
    save_udata(session["username"],ud); return jsonify({"success":True})

@app.route("/api/goals/<int:gid>/deposit", methods=["POST"])
def deposit_goal(gid):
    if not ok(): return jsonify({"error":"Unauthorized"}),401
    ud = get_udata(session["username"]); amt=float(request.json.get("amount",0))
    for g in ud.get("goals",[]):
        if g["id"]==gid: g["savedAmount"]=min(g["savedAmount"]+amt,g["targetAmount"]); break
    save_udata(session["username"],ud); return jsonify({"success":True})

if __name__ == "__main__":
    app.run(debug=True)
