# FinTrack — Personal Finance Management System

A dark-themed, single-page web app built with Flask and Chart.js for tracking EMIs, SIPs, expenses, savings goals, and actual payments — all in one place, with no database required.

---

## Features

### Dashboard
- **Stats overview** — Monthly income, total outflow, free cash, SIP total, active goals count
- **Income Commitment Ratio** — Colour-coded progress bar (green < 60%, amber 60–80%, red > 80%) showing what % of income is committed to EMIs, SIPs, and expenses
- **EMI Summary** — Per-loan repayment progress bars with months remaining
- **Upcoming Due Dates** — Next 6 dues this month, with entries due in ≤ 3 days highlighted red

### Log Payment
- Log real-world payments (EMI, SIP, Rent, Variable Expense, Other) against a date and note
- Edit and delete any logged payment inline, without page reload
- All payments persisted to `payments.json` and scoped per user

### Entries
- Add recurring monthly commitments in three types:
  - **EMI** — loan name, monthly amount, due date, tenure, months remaining, lender
  - **SIP** — fund name, monthly amount, due date, duration, months elapsed, fund house
  - **Expense** — name, monthly amount, due date, category (Housing / Transport / Utilities / Education / Health / Subscriptions / Other)
- Filter table by All / EMI / SIP / Expense
- Remove any entry instantly

### Savings Goals
- Create goals with a name, emoji icon, target amount, amount already saved, monthly saving, and a target date
- Visual progress bar per goal showing % saved and months to completion
- Add money to any goal with a deposit modal

### Reports & Charts
Eight Chart.js visualisations, all driven by live data:

| # | Chart | Type | What it shows |
|---|-------|------|---------------|
| 1 | Outflow Breakdown | Doughnut | EMI vs SIP vs Expense split |
| 2 | Monthly Category Comparison | Grouped Bar | 6-month projection of current monthly values |
| 3 | Expense by Category | Horizontal Bar | Variable expense breakdown by category |
| 4 | SIP Corpus Tracker | Stacked Bar | Invested vs remaining per SIP fund |
| 5 | EMI Breakdown | Vertical Bar | Monthly EMI amount per loan |
| 6 | Monthly Cash Flow | Grouped Bar | Income vs Outflow vs Free Cash |
| 7 | Expense Category Breakdown | Doughnut | Expense entries by category (with % in tooltip) |
| 8 | SIP Growth Projection | Line | Corpus at 5 / 10 / 15 / 20 years at 12% p.a. — interactive monthly SIP input |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Python 3, Flask 3.1.2 |
| Frontend | Vanilla JS (ES2020), Chart.js (CDN) |
| Storage | Flat JSON files (`data.json`, `payments.json`) |
| Auth | Flask sessions + SHA-256 password hashing |
| Styling | Inline CSS (dark theme, `#0a0e1a` background, amber accent) |

No database, no ORM, no frontend framework — just Flask + vanilla JS.

---

## Project Structure

```
finance-management-system/
├── src/
│   └── app.py              # Flask app — all routes and backend logic
├── static/
│   ├── css/
│   │   └── style.css       # Base stylesheet
│   └── js/
│       └── app.js          # All frontend JS — data fetching, rendering, charts
├── templates/
│   ├── index.html          # Main SPA shell — 4 tabs, 5 modals, 8 chart canvases
│   └── login.html          # Auth page — login + register with live validation
├── data.json               # User accounts and financial entries (auto-created)
├── payments.json           # Payment log (auto-created)
├── requirements.txt        # flask==3.1.2
└── README.md
```

---

## Getting Started

### Prerequisites
- Python 3.8 or higher
- pip

### Installation

```bash
# Clone the repository
git clone https://github.com/sahilkawankar-hub/finance-management-system.git
cd finance-management-system

# Install dependencies
pip install -r requirements.txt

# Run the app
python src/app.py
```

Open your browser at `http://127.0.0.1:5000`

`data.json` and `payments.json` are created automatically on first use.

---

## API Routes

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/` | Main app (redirects to `/login` if unauthenticated) |
| GET | `/login` | Login / register page |
| POST | `/api/register` | Create a new account |
| POST | `/api/login` | Authenticate and start session |
| POST | `/api/logout` | Clear session |
| GET | `/api/data` | Get current user's full data (income, entries, goals) |
| POST | `/api/income` | Set monthly income |
| POST | `/api/entries` | Add a new EMI / SIP / Expense entry |
| DELETE | `/api/entries/<id>` | Delete an entry |
| POST | `/api/goals` | Add a savings goal |
| DELETE | `/api/goals/<id>` | Delete a goal |
| POST | `/log_payment` | Log a payment (writes to `payments.json`) |
| GET | `/get_payments` | Get all payments for the current user |
| PUT | `/edit_payment/<id>` | Edit a logged payment |
| DELETE | `/delete_payment/<id>` | Delete a logged payment |

---

## Data Storage

### `data.json`
Stores all user accounts and per-user financial data:

```json
{
  "users": {
    "username": {
      "name": "Full Name",
      "password": "<sha256-hex>",
      "created": "2026-01-01T00:00:00"
    }
  },
  "user_data": {
    "username": {
      "income": 75000,
      "entries": [...],
      "goals": [...]
    }
  }
}
```

### `payments.json`
A flat array of payment records:

```json
[
  {
    "id": 1775282997978,
    "user": "username",
    "category": "Rent",
    "amount": 12000.0,
    "date": "2026-04-04",
    "note": "April rent"
  }
]
```

---

## Authentication

- Passwords are hashed with **SHA-256** before storage
- Sessions are managed by Flask's built-in session mechanism
- All `/api/*` and payment routes return `401 Unauthorized` if the user is not logged in
- Registration enforces: username 3–20 chars (alphanumeric + `_`), password 6–32 chars, name 2–40 chars
- The login page includes live validation with character counters and rule indicators

---

## SIP Growth Formula

The projection chart uses the standard SIP future value formula:

```
M = P × ((1 + r)^n − 1) / r × (1 + r)

where:
  P = monthly SIP amount
  r = monthly rate = 12% / 12 = 0.01
  n = number of months (60 / 120 / 180 / 240 for 5/10/15/20 years)
  M = projected corpus
```

---

## License

MIT
