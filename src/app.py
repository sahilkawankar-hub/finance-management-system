from flask import Flask, render_template, request, redirect

app = Flask(__name__, template_folder='../templates', static_folder='../static')

@app.route('/')
def home():
    return render_template('login.html')

@app.route('/dashboard', methods=['POST'])
def dashboard():
    username = request.form['username']
    return f"Welcome {username}! Dashboard coming soon..."

if __name__ == '__main__':
    app.run(debug=True)