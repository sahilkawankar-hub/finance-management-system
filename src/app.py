from flask import Flask, render_template, request, redirect

app = Flask(__name__, template_folder='../templates', static_folder='../static')

@app.route('/')
def home():
    return render_template('login.html')

@app.route('/test')
def test():
    return render_template('test.html')

@app.route('/dashboard', methods=['GET', 'POST'])
def dashboard():
    if request.method == 'POST':
        # Check if it's the login form
        if 'username' in request.form and 'password' in request.form:
            username = request.form['username']
            return render_template('dashboard.html', username=username)
        # If it's the finance form, redirect to analysis
        else:
            return analysis()
    return render_template('dashboard.html')

@app.route('/analysis', methods=['POST'])
def analysis():
    # Get all form data
    data = {
        'income': float(request.form['income']),
        'emi': float(request.form['emi']),
        'rent': float(request.form['rent']),
        'insurance': float(request.form['insurance']),
        'loan': float(request.form['loan']),
        'groceries': float(request.form['groceries']),
        'transport': float(request.form['transport']),
        'utilities': float(request.form['utilities']),
        'entertainment': float(request.form['entertainment']),
        'goal_name': request.form['goal_name'],
        'goal_amount': float(request.form['goal_amount']),
        'goal_date': request.form['goal_date']
    }
    
    # Calculate totals
    total_fixed = data['emi'] + data['rent'] + data['insurance'] + data['loan']
    total_variable = data['groceries'] + data['transport'] + data['utilities'] + data['entertainment']
    total_expenses = total_fixed + total_variable
    remaining = data['income'] - total_expenses
    
    # Create result message
    result = f"""
    <h1>Financial Analysis</h1>
    <h2>Income & Expenses</h2>
    <p>Monthly Income: ₹{data['income']}</p>
    <p>Total Fixed Expenses: ₹{total_fixed}</p>
    <p>Total Variable Expenses: ₹{total_variable}</p>
    <p>Total Expenses: ₹{total_expenses}</p>
    <p><strong>Remaining Amount: ₹{remaining}</strong></p>
    
    <h2>Financial Goal: {data['goal_name']}</h2>
    <p>Target Amount: ₹{data['goal_amount']}</p>
    <p>Target Date: {data['goal_date']}</p>
    
    <h2>Recommendations</h2>
    """
    
    if remaining > 0:
        months_to_goal = data['goal_amount'] / remaining if remaining > 0 else 0
        result += f"<p>✓ You can save ₹{remaining} per month</p>"
        result += f"<p>✓ You can reach your goal in {int(months_to_goal)} months</p>"
        
        if remaining > data['goal_amount'] * 0.1:
            result += f"<p>✓ Consider investing ₹{remaining * 0.3:.0f} in SIP for long-term growth</p>"
        
        if total_variable > data['income'] * 0.3:
            result += "<p>⚠ Variable expenses are high. Try reducing by 10-15%</p>"
    else:
        result += "<p>⚠ Expenses exceed income. Immediate action needed:</p>"
        result += "<p>• Reduce variable expenses</p>"
        result += "<p>• Find additional income sources</p>"
    
    return result

if __name__ == '__main__':
    app.run(debug=True)