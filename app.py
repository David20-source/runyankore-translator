import os
import sys
import json
import sqlite3
from datetime import datetime
from dotenv import load_dotenv
from flask import Flask, request, jsonify, render_template, redirect, url_for, session, send_from_directory, send_file
from flask_cors import CORS
from functools import wraps
from backend.database import get_database

# Load environment variables from .env file
load_dotenv()

# Initialize Flask app
app = Flask(__name__, 
            template_folder='templates',
            static_folder='static')

# Configuration
app.secret_key = os.environ.get('SECRET_KEY')
if not app.secret_key:
    raise ValueError("SECRET_KEY environment variable is not set in WSGI file!")

app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max upload

# Enable CORS
CORS(app)

# Create data directory if it doesn't exist
os.makedirs("backend/data", exist_ok=True)

# Admin credentials (environment variables)
ADMIN_CREDENTIALS = {
    'username': os.environ.get('ADMIN_USERNAME'),
    'password': os.environ.get('ADMIN_PASSWORD')
}

if not ADMIN_CREDENTIALS['username'] or not ADMIN_CREDENTIALS['password']:
    raise ValueError("Admin credentials not set in WSGI file!")

# Initialize database
db = get_database()

# ========== AUTHENTICATION DECORATOR ==========

def admin_required(f):
    """Decorator to protect admin routes with 10-minute auto-logout"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Check if user is logged in as admin
        if not session.get('admin_logged_in'):
            # For API routes, return JSON error
            if request.path.startswith('/admin/api/'):
                return jsonify({'error': 'Authentication required'}), 401
            # For HTML routes, redirect to login
            return redirect(url_for('show_admin_login'))
        
        # ========== 10-MINUTE AUTO-LOGOUT ==========
        login_time = session.get('admin_login_time')
        if login_time:
            try:
                login_dt = datetime.fromisoformat(login_time)
                current_time = datetime.now()
                seconds_inactive = (current_time - login_dt).total_seconds()
                
                # Logout after 10 minutes (600 seconds) of inactivity
                if seconds_inactive > 600:
                    session.clear()
                    session['login_error'] = 'Session expired due to 10 minutes of inactivity. Please login again.'
                    return redirect(url_for('show_admin_login'))
                
                # Update login time on each successful access
                session['admin_login_time'] = current_time.isoformat()
                
            except Exception as e:
                print(f"Session time error: {e}")
                session.clear()
                return redirect(url_for('show_admin_login'))
        
        return f(*args, **kwargs)
    return decorated_function

# ========== HELPER FUNCTIONS ==========

def validate_translation_request(data):
    """Validate translation request data"""
    if not data or 'text' not in data:
        return False, "No text provided"
    
    text = data.get('text', '').strip()
    
    if not text:
        return False, "Text cannot be empty"
    
    if len(text) > 5000:
        return False, "Text too long (max 5000 characters)"
    
    return True, text

def translate_text(text, from_runyankore=True, use_ai=True):
    """
    Translate text using the 5-layer system from database.py
    """
    if not text.strip():
        return "", 0.0
    
    db = get_database()
    result = db.translate_with_ai_fallback(text, from_runyankore, use_ai)
    
    if result.get('success') and result.get('translation'):
        formatted = format_translation_output(text, result['translation'])
        return formatted, result['confidence']
    else:
        return text, 0.0

def format_translation_output(original: str, translation: str) -> str:
    """Format translation to match original text's style"""
    if not original or not translation:
        return translation
    
    # Preserve capitalization
    if original and original[0].isupper():
        if translation and len(translation) > 0:
            translation = translation[0].upper() + translation[1:]
    
    # Preserve ending punctuation from original
    if original and original[-1] in ['.', '!', '?', ',', ';', ':']:
        if translation and translation[-1] not in ['.', '!', '?', ',', ';', ':']:
            translation = translation + original[-1]
    elif translation and translation[-1] not in ['.', '!', '?']:
        translation = translation + '.'
    
    return translation

# ========== PUBLIC ROUTES ==========

@app.route('/')
def home():
    """Main translator page"""
    stats = db.get_statistics()
    return render_template('index.html', stats=stats)

@app.route('/about-developer')
def about_developer():
    """Render the About Developer page"""
    return render_template('about-developer.html')

@app.route('/terms')
def terms():
    """Display Terms of Service page"""
    return render_template('terms.html')

@app.route('/privacy')
def privacy():
    """Display Privacy Policy page"""
    return render_template('privacy.html')

@app.route('/license')
def license():
    """Display Software License page"""
    return render_template('license.html')

# ========== PREMIUM PAYMENT ROUTES ==========
import secrets
from datetime import datetime, timedelta

@app.route('/api/premium/initiate-mobile', methods=['POST'])
def initiate_mobile_payment():
    """Generate unique code for manual Mobile Money verification with database storage"""
    try:
        data = request.json
        plan = data.get('plan')
        phone_number = data.get('phone_number', '').strip()
        user_token = data.get('user_token')
        
        if not phone_number:
            return jsonify({'success': False, 'error': 'Phone number is required for verification'}), 400
        
        amounts = {
            'monthly': 7000,
            'yearly': 70000,
            'lifetime': 350000
        }
        
        # Generate unique transaction ID
        transaction_id = secrets.token_hex(8).upper()
        
        # Calculate expiry
        if plan == 'monthly':
            expiry_days = 30
        elif plan == 'yearly':
            expiry_days = 365
        else:
            expiry_days = 3650
        
        expires_at = (datetime.now() + timedelta(days=expiry_days)).isoformat()
        
        # Save to database using the premium method
        db.save_premium_user(
            user_token=user_token,
            phone_number=phone_number,
            plan=plan,
            transaction_id=transaction_id,
            status='pending',
            expires_at=expires_at
        )
        
        return jsonify({
            'success': True,
            'transaction_id': transaction_id,
            'amount': amounts.get(plan, 7000),
            'plan': plan,
            'expires_at': expires_at,
            'instructions': {
                'mtn': '+256 781 182 967',
                'airtel': '+256 742 462 938',
                'reference': transaction_id,
                'phone_number': phone_number,
                'message': f'Send UGX {amounts.get(plan, 7000)} to MTN or Airtel with reference: {transaction_id}\n\nYour phone number: {phone_number} (for verification)'
            }
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/premium/initiate-bank', methods=['POST'])
def initiate_bank_payment():
    """Generate unique code for Bank Transfer verification"""
    try:
        data = request.json
        plan = data.get('plan')
        user_token = data.get('user_token')
        
        amounts = {
            'monthly': 7000,
            'yearly': 70000,
            'lifetime': 350000
        }
        
        # Generate unique transaction ID
        transaction_id = secrets.token_hex(8).upper()
        
        # Calculate expiry
        if plan == 'monthly':
            expiry_days = 30
        elif plan == 'yearly':
            expiry_days = 365
        else:
            expiry_days = 3650
        
        expires_at = (datetime.now() + timedelta(days=expiry_days)).isoformat()
        
        # Save to database
        db.save_premium_user(
            user_token=user_token,
            phone_number='Bank Transfer',  # Mark as bank transfer
            plan=plan,
            transaction_id=transaction_id,
            status='pending',
            expires_at=expires_at
        )
        
        return jsonify({
            'success': True,
            'transaction_id': transaction_id,
            'amount': amounts.get(plan, 7000),
            'plan': plan,
            'expires_at': expires_at,
            'instructions': {
                'bank': 'Centenary Bank',
                'account_name': 'David Nyanzwengye',
                'account_number': '3101345897',
                'reference': transaction_id,
                'message': f'Send UGX {amounts.get(plan, 7000)} to:\n\nBank: Centenary Bank\nAccount Name: David Nyanzwengye\nAccount Number: 3101345897\n\nREFERENCE: {transaction_id}\n\nAfter sending, admin will verify within 24 hours.'
            }
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500       

@app.route('/api/premium/check-status', methods=['POST'])
def check_premium_status():
    """Check premium status from database"""
    try:
        data = request.json
        user_token = data.get('user_token')
        
        if not user_token:
            return jsonify({'success': False, 'error': 'User token required'}), 400
        
        # Query database for premium status
        user = db.get_premium_user_by_token(user_token)
        
        if user:
            is_active = user['status'] == 'active' and datetime.fromisoformat(user['expires_at']) > datetime.now()
            
            return jsonify({
                'success': True,
                'is_premium': is_active,
                'status': user['status'],
                'plan': user['plan'],
                'expires_at': user['expires_at'],
                'transaction_id': user['transaction_id'],
                'verified_at': user['verified_at'],
                'phone_number': user['phone_number']
            })
        
        return jsonify({'success': True, 'is_premium': False, 'status': 'none'})
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/premium/check-transaction', methods=['POST'])
def check_transaction_status():
    """Check specific transaction status"""
    try:
        data = request.json
        transaction_id = data.get('transaction_id')
        user_token = data.get('user_token')
        
        user = db.get_premium_user_by_transaction(transaction_id)
        
        if user and user['user_token'] == user_token:
            is_verified = user['status'] == 'active'
            return jsonify({
                'success': True,
                'verified': is_verified,
                'plan': user['plan'],
                'expires_at': user['expires_at'],
                'verified_at': user['verified_at'],
                'message': 'Payment verified! Premium activated.' if is_verified else 'Pending verification. Admin will verify within 24 hours.'
            })
        
        return jsonify({'success': False, 'message': 'Transaction not found'})
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/premium/verify-mobile-admin', methods=['POST'])
def verify_mobile_admin():
    """Admin endpoint to verify mobile money payments using database"""
    try:
        data = request.json
        admin_key = data.get('admin_key')
        transaction_id = data.get('transaction_id')
        
        # CHANGE THIS TO YOUR SECURE KEY!
        if admin_key != 'RunyankoreAdmin25!!':
            return jsonify({'success': False, 'message': 'Unauthorized'})
        
        # Verify using database method
        result = db.verify_premium_user(transaction_id, 'admin')
        
        if result:
            return jsonify({'success': True, 'message': 'Payment verified successfully'})
        
        return jsonify({'success': False, 'message': 'Transaction not found or already verified'})
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/premium/unverify-mobile-admin', methods=['POST'])
def unverify_mobile_admin():
    """Admin endpoint to revoke premium access"""
    try:
        data = request.json
        admin_key = data.get('admin_key')
        transaction_id = data.get('transaction_id')
        
        if admin_key != 'RunyankoreAdmin25!!':
            return jsonify({'success': False, 'message': 'Unauthorized'})
        
        # Revoke using database method
        result = db.revoke_premium_user(transaction_id)
        
        if result:
            return jsonify({'success': True, 'message': 'Premium access revoked successfully'})
        
        return jsonify({'success': False, 'message': 'Active transaction not found'})
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/premium/pending-mobile-payments', methods=['POST'])
def get_pending_mobile_payments():
    """Get all pending mobile payments for admin"""
    try:
        data = request.json
        admin_key = data.get('admin_key')
        
        if admin_key != 'RunyankoreAdmin25!!':
            return jsonify({'success': False, 'message': 'Unauthorized'})
        
        pending = db.get_all_pending_premium_users()
        
        # Add amount (calculate from plan)
        amounts = {'monthly': 7000, 'yearly': 70000, 'lifetime': 350000}
        for p in pending:
            p['amount'] = amounts.get(p['plan'], 7000)
        
        return jsonify({'success': True, 'payments': pending})
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/premium/expired-payments', methods=['POST'])
def get_expired_payments():
    """Get all expired premium payments for admin"""
    try:
        data = request.json
        admin_key = data.get('admin_key')
        
        if admin_key != 'RunyankoreAdmin25!!':
            return jsonify({'success': False, 'message': 'Unauthorized'})
        
        expired = db.fetch_all("""
            SELECT transaction_id, plan, phone_number, user_token, created_at, verified_at, expires_at
            FROM premium_users 
            WHERE status = 'active' AND expires_at < datetime('now')
            ORDER BY expires_at DESC
        """)
        
        amounts = {'monthly': 7000, 'yearly': 70000, 'lifetime': 350000}
        for e in expired:
            e['amount'] = amounts.get(e['plan'], 7000)
        
        return jsonify({'success': True, 'payments': expired})
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500        

@app.route('/api/premium/active-payments', methods=['POST'])
def get_active_payments():
    """Get all active premium payments for admin (to unverify)"""
    try:
        data = request.json
        admin_key = data.get('admin_key')
        
        if admin_key != 'RunyankoreAdmin25!!':
            return jsonify({'success': False, 'message': 'Unauthorized'})
        
        active = db.get_all_active_premium_users()
        
        amounts = {'monthly': 7000, 'yearly': 70000, 'lifetime': 350000}
        for a in active:
            a['amount'] = amounts.get(a['plan'], 7000)
        
        return jsonify({'success': True, 'payments': active})
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/premium/delete-record', methods=['POST'])
def delete_premium_record():
    """Admin endpoint to permanently delete a premium record"""
    try:
        data = request.json
        admin_key = data.get('admin_key')
        transaction_id = data.get('transaction_id')
        
        if admin_key != 'RunyankoreAdmin25!!':
            return jsonify({'success': False, 'message': 'Unauthorized'})
        
        db.execute_query("DELETE FROM premium_users WHERE transaction_id = ?", (transaction_id,))
        
        return jsonify({'success': True, 'message': 'Record permanently deleted'})
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500        

@app.route('/admin/verify')
def admin_verify_page():
    """Admin page to verify mobile money payments"""
    return render_template('admin_verify.html')

# ========== ADMIN ROUTES ==========

@app.route('/admin')
def admin_entry():
    """Admin entry point - ALWAYS redirect to login, never skip"""
    return redirect(url_for('show_admin_login'))

@app.route('/admin/login', methods=['GET'])
def show_admin_login():
    """Show admin login page"""
    if 'admin_logged_in' in session:
        session.pop('admin_logged_in', None)
    if 'admin_username' in session:
        session.pop('admin_username', None)
    
    error = session.pop('login_error', None)
    return render_template('admin_login.html', error=error)

@app.route('/admin/login', methods=['POST'])
def handle_admin_login():
    """Handle admin login"""
    username = request.form.get('username', '').strip()
    password = request.form.get('password', '').strip()
    
    if username == ADMIN_CREDENTIALS['username'] and password == ADMIN_CREDENTIALS['password']:
        session['admin_logged_in'] = True
        session['admin_username'] = username
        session['admin_login_time'] = datetime.now().isoformat()
        
        if 'login_error' in session:
            session.pop('login_error')
        
        return redirect(url_for('admin_dashboard'))
    else:
        session['login_error'] = 'Invalid credentials'
        return redirect(url_for('show_admin_login'))

@app.route('/admin/dashboard')
@admin_required
def admin_dashboard():
    """Admin dashboard"""
    stats = db.get_statistics()
    translations = db.get_all_translations()
    
    feedback_stats = db.get_feedback_stats()
    unread_feedback_count = feedback_stats.get('unread', 0)
    
    return render_template('admin_dashboard.html',
                         username=session.get('admin_username'),
                         total=stats.get('total_translations', 0),
                         deleted=stats.get('deleted_translations', 0),
                         translations=translations,
                         unread_feedback_count=unread_feedback_count)

@app.route('/admin/logout')
def admin_logout():
    """Logout admin"""
    session.clear()
    return redirect(url_for('show_admin_login'))

# ========== TRASH BIN ROUTES ==========

@app.route('/admin/trash')
@admin_required
def admin_trash():
    """Admin trash bin page"""
    deleted_translations = db.get_deleted_translations()
    trash_stats = db.get_trash_statistics()
    stats = db.get_statistics()
    
    return render_template('admin_trash.html',
                         username=session.get('admin_username'),
                         translations=deleted_translations,
                         trash_stats=trash_stats,
                         total=stats.get('total_translations', 0),
                         deleted=stats.get('deleted_translations', 0))

# ========== API ROUTES ==========

@app.route('/api/translate', methods=['POST'])
def translate():
    """Main translation endpoint"""
    data = request.json
    text = data.get('text', '').strip()
    from_runyankore = data.get('from_runyankore', True)
    use_ai = data.get('use_ai', True)
    
    if not text:
        return jsonify({'error': 'No text provided'}), 400
    
    db = get_database()
    user_ip = request.remote_addr
    user_agent = request.headers.get('User-Agent')
    
    result = db.translate_with_ai_fallback(text, from_runyankore, use_ai)
    
    if result.get('success') and result.get('translation'):
        db.save_to_history(
            original=text,
            translation=result['translation'],
            direction='run_to_en' if from_runyankore else 'en_to_run',
            confidence=result.get('confidence', 0),
            source=result.get('source', 'unknown')
        )
    
    direction_str = 'run_to_en' if from_runyankore else 'en_to_run'
    db.save_user_search(
        search_text=text,
        direction=direction_str,
        translation_result=result,
        user_ip=user_ip,
        user_agent=user_agent
    )
    
    return jsonify(result)

@app.route('/api/translate/rny-to-eng', methods=['POST'])
def translate_to_english():
    """Translate Runyankore text to English"""
    try:
        data = request.get_json()
        
        if not data or 'text' not in data:
            return jsonify({"success": False, "error": "No text provided"}), 400
        
        text = data.get('text', '').strip()
        
        if not text:
            return jsonify({"success": False, "error": "Empty text"}), 400
        
        user_ip = request.remote_addr
        user_agent = request.headers.get('User-Agent')
        
        db = get_database()
        result = db.translate_with_ai_fallback(text, from_runyankore=True, use_ai=True)

        db.save_user_search(
            search_text=text,
            direction='run_to_en',
            translation_result=result,
            user_ip=user_ip,
            user_agent=user_agent
        )
        
        if result.get('success'):
            return jsonify({
                "success": True,
                "original": result.get('original', text),
                "translation": result.get('translation'),
                "confidence": result.get('confidence', 0),
                "direction": "runyankore_to_english",
                "timestamp": datetime.utcnow().isoformat() + 'Z'
            })
        else:
            return jsonify({
                "success": False,
                "error": result.get('message', 'Translation failed'),
                "message": "Translation not found"
            }), 404
    
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/translate/eng-to-rny', methods=['POST'])
def translate_to_runyankore():
    """Translate English text to Runyankore"""
    try:
        data = request.get_json()
        
        if not data or 'text' not in data:
            return jsonify({"success": False, "error": "No text provided"}), 400
        
        text = data.get('text', '').strip()
        
        if not text:
            return jsonify({"success": False, "error": "Empty text"}), 400
        
        user_ip = request.remote_addr
        user_agent = request.headers.get('User-Agent')
        
        db = get_database()
        result = db.translate_with_ai_fallback(text, from_runyankore=False, use_ai=True)

        db.save_user_search(
            search_text=text,
            direction='en_to_run',
            translation_result=result,
            user_ip=user_ip,
            user_agent=user_agent
        )
        
        if result.get('success'):
            return jsonify({
                "success": True,
                "original": result.get('original', text),
                "translation": result.get('translation'),
                "confidence": result.get('confidence', 0),
                "direction": "english_to_runyankore",
                "timestamp": datetime.utcnow().isoformat() + 'Z'
            })
        else:
            return jsonify({
                "success": False,
                "error": result.get('message', 'Translation failed'),
                "message": "Translation not found"
            }), 404
    
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/dictionary/search', methods=['POST'])
def dictionary_search():
    """Search dictionary"""
    try:
        data = request.get_json()
        query = data.get('query', '').strip()
        
        if not query:
            return jsonify({"success": False, "error": "Search query cannot be empty"}), 400
        
        user_ip = request.remote_addr
        user_agent = request.headers.get('User-Agent')
        
        results = db.search_translations(query, limit=50)
        
        db.save_user_search(
            search_text=query,
            direction='dictionary_search',
            translation_result={
                'success': len(results) > 0,
                'translation': None,
                'confidence': 1.0 if len(results) > 0 else 0,
                'source': 'dictionary'
            },
            user_ip=user_ip,
            user_agent=user_agent
        )
        
        return jsonify({
            "success": True,
            "query": query,
            "count": len(results),
            "results": results
        })
    
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/translations/add', methods=['POST'])
def add_translation():
    """Add new translation"""
    try:
        data = request.get_json()
        
        if not data or 'runyankore' not in data or 'english' not in data:
            return jsonify({"success": False, "error": "Missing fields"}), 400
        
        runyankore = data['runyankore'].strip()
        english = data['english'].strip()
        category = data.get('category', 'general')
        
        if not runyankore or not english:
            return jsonify({"success": False, "error": "Empty fields"}), 400
        
        result = db.add_translation(runyankore, english, category)
        return jsonify(result)
    
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/history')
def get_translation_history():
    """Get translation history"""
    try:
        history = db.get_translation_history(limit=50)
        return jsonify({'success': True, 'count': len(history), 'history': history})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/history/save', methods=['POST'])
def save_translation_history():
    """Save a translation to history"""
    try:
        data = request.get_json()
        
        if not data or 'original' not in data or 'translation' not in data:
            return jsonify({'success': False, 'error': 'Missing required fields'}), 400
        
        result = db.save_to_history(
            original=data.get('original'),
            translation=data.get('translation'),
            direction=data.get('direction', 'unknown'),
            confidence=data.get('confidence', 0.0),
            source=data.get('source', 'web')
        )
        return jsonify(result)
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/history/clear', methods=['DELETE'])
def clear_translation_history():
    """Clear translation history"""
    try:
        result = db.clear_history()
        return jsonify(result)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# ========== ADMIN API ROUTES ==========

@app.route('/admin/api/translations', methods=['GET'])
@admin_required
def admin_api_translations():
    """Get all translations (admin only)"""
    try:
        translations = db.get_all_translations()
        return jsonify({'success': True, 'count': len(translations), 'translations': translations})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/admin/api/translations/pending')
@admin_required
def admin_api_pending_translations():
    """Get all translations needing review"""
    try:
        translations = db.get_translations_needing_review()
        response = jsonify({'success': True, 'count': len(translations), 'translations': translations})
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        return response
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/admin/api/translations/approve/<int:translation_id>', methods=['POST'])
@admin_required
def admin_api_approve_translation(translation_id):
    """Approve a translation"""
    try:
        data = request.get_json()
        runyankore = data.get('runyankore') if data else None
        english = data.get('english') if data else None
        
        if runyankore and english:
            update_result = db.update_translation(translation_id, runyankore, english, None)
            if not update_result.get('success'):
                return jsonify({'success': False, 'error': update_result.get('message')}), 404
        
        result = db.approve_translation(translation_id, session.get('admin_username', 'admin'))
        return jsonify(result)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/admin/api/translations/approve-all', methods=['POST'])
@admin_required
def admin_api_approve_all():
    """Approve ALL pending translations at once"""
    try:
        result = db.approve_all_pending(session.get('admin_username', 'admin'))
        return jsonify(result)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/admin/api/translations/reject/<int:translation_id>', methods=['POST'])
@admin_required
def admin_api_reject_translation(translation_id):
    """Reject a translation"""
    try:
        result = db.delete_translation(translation_id, permanent=False)
        return jsonify(result)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/admin/api/translations/get/<int:translation_id>')
@admin_required
def admin_api_get_single_translation(translation_id):
    """Get single translation by ID"""
    try:
        translation = db.get_translation_by_id(translation_id)
        if translation:
            return jsonify({'success': True, 'translation': translation})
        return jsonify({'success': False, 'error': 'Translation not found'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/admin/api/translations/update/<int:translation_id>', methods=['POST'])
@admin_required
def admin_api_update_translation(translation_id):
    """Update a translation"""
    try:
        data = request.get_json()
        runyankore = data.get('runyankore', '').strip()
        english = data.get('english', '').strip()
        
        if not runyankore or not english:
            return jsonify({'success': False, 'error': 'Both fields are required'}), 400
        
        result = db.update_translation(translation_id, runyankore, english, None)
        
        if result.get('success'):
            return jsonify({'success': True, 'message': 'Translation updated successfully!', 'translation': result.get('translation', {})})
        return jsonify({'success': False, 'error': result.get('message')}), 404
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/admin/api/translations/<int:translation_id>', methods=['PUT', 'DELETE'])
@admin_required
def admin_api_translation(translation_id):
    """Update or delete translation"""
    try:
        if request.method == 'PUT':
            data = request.get_json()
            result = db.update_translation(translation_id, data.get('runyankore'), data.get('english'), data.get('category', 'general'))
            return jsonify(result)
        elif request.method == 'DELETE':
            permanent = request.args.get('permanent', 'false') == 'true'
            result = db.delete_translation(translation_id, permanent=permanent)
            return jsonify(result)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/admin/api/translations/restore/<int:translation_id>', methods=['POST'])
@admin_required
def admin_api_restore(translation_id):
    """Restore deleted translation"""
    try:
        result = db.restore_translation(translation_id)
        return jsonify(result)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/admin/api/export', methods=['GET'])
@admin_required
def admin_api_export():
    """Export translations"""
    try:
        translations = db.export_all()
        return jsonify({'success': True, 'format': 'json', 'count': len(translations), 'data': translations})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/admin/api/import', methods=['POST'])
@admin_required
def admin_api_import():
    """Import translations"""
    try:
        data = request.get_json()
        if not data or 'translations' not in data:
            return jsonify({'success': False, 'error': 'No translations data provided'}), 400
        
        imported = db.bulk_import(data['translations'])
        return jsonify({'success': True, 'message': f'Successfully imported {imported} translations', 'imported': imported})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/admin/api/export-offline', methods=['POST'])
@admin_required
def admin_export_offline():
    """Export to offline database"""
    import subprocess
    
    try:
        script_path = '/home/runyankoretranslator/runyankore-translator/export_offline_database.py'
        
        if not os.path.exists(script_path):
            return jsonify({'success': False, 'error': f'Export script not found'})
        
        result = subprocess.run(['python3', script_path], capture_output=True, text=True, timeout=30)
        
        if result.returncode == 0:
            return jsonify({'success': True, 'message': 'Offline database updated successfully'})
        else:
            return jsonify({'success': False, 'error': result.stderr[:500]})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

# ========== SYNONYM MANAGEMENT ROUTES ==========

@app.route('/admin/synonyms')
@admin_required
def admin_synonyms():
    """Admin synonym management page"""
    return render_template('admin_synonyms.html', username=session.get('admin_username'), current_year=datetime.now().year)

@app.route('/admin/api/synonyms/add', methods=['POST'])
@admin_required
def admin_api_add_synonym():
    try:
        data = request.get_json()
        word = data.get('word', '').strip()
        synonym_of = data.get('synonym_of', '').strip()
        if not word or not synonym_of:
            return jsonify({'success': False, 'error': 'Both words are required'})
        result = db.add_synonym(word, synonym_of, 'english', session.get('admin_username', 'admin'))
        return jsonify(result)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/admin/api/synonyms/list')
@admin_required
def admin_api_list_synonyms():
    try:
        synonyms = db.get_all_synonym_pairs()
        return jsonify({'success': True, 'count': len(synonyms), 'synonyms': synonyms})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/admin/api/synonyms/search')
@admin_required
def admin_api_search_synonyms():
    query = request.args.get('q', '')
    if not query:
        return jsonify({'success': True, 'synonyms': []})
    try:
        synonyms = db.search_synonyms(query)
        return jsonify({'success': True, 'count': len(synonyms), 'synonyms': synonyms})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/admin/api/synonyms/delete/<int:synonym_id>', methods=['DELETE'])
@admin_required
def admin_api_delete_synonym(synonym_id):
    try:
        result = db.delete_synonym(synonym_id)
        return jsonify(result)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/admin/api/synonyms/check/<path:word>')
@admin_required
def admin_api_check_synonyms(word):
    try:
        synonyms = db.get_synonyms(word)
        return jsonify({'success': True, 'word': word, 'synonyms': synonyms})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# ========== USER SEARCHES ROUTES ==========

@app.route('/admin/searches')
@admin_required
def admin_searches():
    stats = db.get_user_search_stats()
    return render_template('admin_searches.html', username=session.get('admin_username'), stats=stats, current_year=datetime.now().year)

@app.route('/admin/api/searches')
@admin_required
def admin_api_get_searches():
    try:
        limit = int(request.args.get('limit', 100))
        include_reviewed = request.args.get('include_reviewed', 'true') == 'true'
        reviewed_only = request.args.get('reviewed_only', 'false') == 'true'
        search_term = request.args.get('search', '')
        direction = request.args.get('direction', '')
        
        searches = db.get_user_searches(limit=limit, include_reviewed=include_reviewed, search_term=search_term if search_term else None, direction=direction if direction else None, reviewed_only=reviewed_only)
        return jsonify({'success': True, 'count': len(searches), 'searches': searches})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/admin/api/searches/stats')
@admin_required
def admin_api_search_stats():
    try:
        stats = db.get_user_search_stats()
        return jsonify({'success': True, 'stats': stats})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/admin/api/searches/mark-reviewed/<int:search_id>', methods=['POST'])
@admin_required
def admin_api_mark_search_reviewed(search_id):
    try:
        data = request.get_json() or {}
        notes = data.get('notes', '')
        result = db.mark_search_reviewed(search_id, session.get('admin_username', 'admin'), notes)
        return jsonify(result)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/admin/api/searches/delete/<int:search_id>', methods=['DELETE'])
@admin_required
def admin_api_delete_search(search_id):
    try:
        result = db.delete_user_search(search_id)
        return jsonify(result)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# ========== TRASH BIN API ROUTES ==========

@app.route('/admin/api/trash/items')
@admin_required
def admin_api_trash_items():
    try:
        deleted_items = db.get_deleted_translations()
        return jsonify({'success': True, 'count': len(deleted_items), 'items': deleted_items})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/admin/api/trash/restore/<int:translation_id>', methods=['POST'])
@admin_required
def admin_api_trash_restore(translation_id):
    try:
        result = db.restore_translation(translation_id)
        return jsonify(result)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/admin/api/trash/permanent/<int:translation_id>', methods=['DELETE'])
@admin_required
def admin_api_trash_permanent(translation_id):
    try:
        result = db.permanent_delete(translation_id)
        return jsonify(result)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/admin/api/trash/empty', methods=['DELETE'])
@admin_required
def admin_api_empty_trash():
    try:
        result = db.empty_trash()
        return jsonify(result)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/admin/api/trash/bulk/restore', methods=['POST'])
@admin_required
def admin_api_bulk_restore():
    try:
        data = request.get_json()
        if not data or 'ids' not in data:
            return jsonify({'success': False, 'error': 'No IDs provided'}), 400
        result = db.bulk_restore(data['ids'])
        return jsonify(result)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/admin/api/trash/bulk/delete', methods=['POST'])
@admin_required
def admin_api_bulk_delete():
    try:
        data = request.get_json()
        if not data or 'ids' not in data:
            return jsonify({'success': False, 'error': 'No IDs provided'}), 400
        result = db.bulk_permanent_delete(data['ids'])
        return jsonify(result)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# ========== ADDITIONAL ADMIN PAGES ==========

@app.route('/admin/translations')
@admin_required
def admin_translations_page():
    stats = db.get_statistics()
    translations = db.get_all_translations()
    return render_template('admin_dashboard.html', username=session.get('admin_username'), total=stats.get('total_translations', 0), deleted=stats.get('deleted_translations', 0), translations=translations, active_tab='translations')

@app.route('/admin/review')
@admin_required
def admin_review():
    return render_template('admin_review.html', username=session.get('admin_username'), current_year=datetime.now().year)

# ========== FEEDBACK SYSTEM ROUTES ==========

@app.route('/api/feedback/submit', methods=['POST'])
def submit_feedback():
    try:
        data = request.json
        name = data.get('name', '').strip()
        email = data.get('email', '').strip()
        feedback_type = data.get('type', 'general')
        message = data.get('message', '').strip()
        
        if not message:
            return jsonify({'success': False, 'error': 'Message cannot be empty'}), 400
        
        user_token = request.headers.get('X-User-Token')
        if not user_token:
            import hashlib
            import time
            token_string = f"{request.remote_addr}{time.time()}{request.headers.get('User-Agent', '')}"
            user_token = hashlib.md5(token_string.encode()).hexdigest()
        
        ip_address = request.remote_addr
        user_agent = request.headers.get('User-Agent', '')
        
        result = db.save_feedback(name=name, email=email, feedback_type=feedback_type, message=message, ip_address=ip_address, user_agent=user_agent, user_token=user_token)
        
        if result['success']:
            return jsonify({'success': True, 'message': 'Feedback submitted successfully!', 'token': user_token, 'id': result['id']})
        return jsonify({'success': False, 'error': 'Failed to save feedback'}), 500
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/user/feedback', methods=['GET'])
def get_user_feedback():
    user_token = request.args.get('token')
    if not user_token:
        return jsonify({'success': False, 'error': 'No token provided'}), 400
    feedback = db.get_user_feedback(user_token)
    return jsonify({'success': True, 'count': len(feedback), 'feedback': feedback})

@app.route('/api/feedback/delete/<int:feedback_id>', methods=['DELETE'])
def delete_user_feedback(feedback_id):
    user_token = request.headers.get('X-User-Token')
    if not user_token:
        return jsonify({'success': False, 'error': 'No token provided'}), 401
    result = db.delete_feedback(feedback_id, user_token=user_token, is_admin=False)
    return jsonify(result)

# ========== ADMIN FEEDBACK ROUTES ==========

@app.route('/admin/feedback')
@admin_required
def admin_feedback():
    return render_template('admin_feedback.html', username=session.get('admin_username'))

@app.route('/admin/api/feedback')
@admin_required
def admin_api_get_feedback():
    limit = int(request.args.get('limit', 500))
    include_read = request.args.get('include_read', 'true') == 'true'
    feedback_type = request.args.get('type', 'all')
    feedback = db.get_all_feedback(limit, include_read, feedback_type)
    stats = db.get_feedback_stats()
    return jsonify({'success': True, 'count': len(feedback), 'feedback': feedback, 'stats': stats})

@app.route('/admin/api/feedback/stats')
@admin_required
def admin_api_feedback_stats():
    stats = db.get_feedback_stats()
    return jsonify({'success': True, 'stats': stats})

@app.route('/admin/api/feedback/<int:feedback_id>/read', methods=['POST'])
@admin_required
def admin_api_mark_read(feedback_id):
    result = db.mark_feedback_read(feedback_id)
    return jsonify(result)

@app.route('/admin/api/feedback/<int:feedback_id>/reply', methods=['POST'])
@admin_required
def admin_api_reply_feedback(feedback_id):
    data = request.json
    reply = data.get('reply', '').strip()
    if not reply:
        return jsonify({'success': False, 'error': 'Reply cannot be empty'}), 400
    result = db.reply_to_feedback(feedback_id, reply, session.get('admin_username', 'admin'))
    return jsonify(result)

@app.route('/admin/api/feedback/<int:feedback_id>/delete', methods=['DELETE'])
@admin_required
def admin_api_delete_feedback(feedback_id):
    result = db.delete_feedback(feedback_id, is_admin=True)
    return jsonify(result)

@app.route('/admin/api/feedback/bulk/delete', methods=['POST'])
@admin_required
def admin_api_feedback_bulk_delete():
    data = request.json
    feedback_ids = data.get('ids', [])
    if not feedback_ids:
        return jsonify({'success': False, 'error': 'No IDs provided'}), 400
    result = db.bulk_delete_feedback(feedback_ids, is_admin=True)
    return jsonify(result)

def send_feedback_reply_email(user_email, reply_text):
    try:
        import importlib
        flask_mail = importlib.import_module('flask_mail')
        Mail = flask_mail.Mail
        Message = flask_mail.Message
        
        if os.environ.get('MAIL_USERNAME') and os.environ.get('MAIL_PASSWORD'):
            if 'mail' not in app.extensions:
                app.config['MAIL_SERVER'] = 'smtp.gmail.com'
                app.config['MAIL_PORT'] = 587
                app.config['MAIL_USE_TLS'] = True
                app.config['MAIL_USERNAME'] = os.environ.get('MAIL_USERNAME')
                app.config['MAIL_PASSWORD'] = os.environ.get('MAIL_PASSWORD')
                mail = Mail(app)
            else:
                mail = app.extensions['mail']
            
            msg = Message(subject="Reply to your feedback - Runyankore Translator", recipients=[user_email], body=f"Thank you for your feedback!\n\nOur response: {reply_text}\n\nBest regards,\nRunyankore Translator Team")
            mail.send(msg)
    except Exception as e:
        print(f"Email error: {e}")

# ========== PWA ROUTES ==========

@app.route('/manifest.webmanifest')
def manifest():
    return send_from_directory('static', 'manifest.webmanifest')

@app.route('/service-worker.js')
def service_worker():
    return send_from_directory('static/js', 'service-worker.js')

# ========== OFFLINE DATABASE ROUTES ==========

@app.route('/api/database/download')
def download_database():
    db_path = 'static/data/offline_dictionary.db'
    if not os.path.exists(db_path):
        return jsonify({'success': False, 'error': 'Offline database not available yet'}), 404
    return send_file(db_path, as_attachment=True, download_name='runyankore_dictionary.db', mimetype='application/vnd.sqlite3')

@app.route('/api/database/version')
def database_version():
    version_path = 'static/data/database_version.json'
    if os.path.exists(version_path):
        with open(version_path, 'r') as f:
            version_info = json.load(f)
        clean_version = version_info.get('display_version') or version_info.get('version')
        if clean_version and ('T' in clean_version or '-' in clean_version):
            try:
                date_obj = datetime.fromisoformat(clean_version.replace('Z', ''))
                clean_version = f"v{date_obj.year % 100}.{date_obj.month}.{date_obj.day}"
            except:
                clean_version = "v1.0"
        return jsonify({'success': True, 'version': {'display': clean_version or 'v1.0', 'semantic': version_info.get('semantic_version', '1.0'), 'timestamp': version_info.get('timestamp', ''), 'build_date': version_info.get('build_date', ''), 'total': version_info.get('total_translations', 0), 'words': version_info.get('words', 0), 'phrases': version_info.get('phrases', 0), 'categories': version_info.get('categories', 0)}})
    return jsonify({'success': True, 'version': {'display': 'v1.0', 'semantic': '1.0', 'total': 1000, 'words': 800, 'phrases': 200, 'categories': 10}})

@app.route('/api/database/stats')
def database_stats():
    db_path = 'static/data/offline_dictionary.db'
    if not os.path.exists(db_path):
        return jsonify({'success': False, 'error': 'Database not found'})
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute('SELECT COUNT(*) FROM translations WHERE is_deleted = FALSE')
        total = cursor.fetchone()[0]
        cursor.execute('SELECT COUNT(*) FROM translations WHERE word_type = "phrase"')
        phrases = cursor.fetchone()[0]
        cursor.execute('SELECT COUNT(*) FROM translations WHERE word_type = "word"')
        words = cursor.fetchone()[0]
        cursor.execute('SELECT COUNT(DISTINCT category) FROM translations WHERE category IS NOT NULL')
        categories = cursor.fetchone()[0]
        conn.close()
        return jsonify({'success': True, 'stats': {'total': total, 'words': words, 'phrases': phrases, 'categories': categories, 'size_kb': os.path.getsize(db_path) / 1024}})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/admin/users')
@admin_required
def admin_users():
    return render_template('admin_users.html', username=session.get('admin_username'))

@app.route('/admin/settings')
@admin_required
def admin_settings():
    return render_template('admin_settings.html', username=session.get('admin_username'))

# ========== CACHE CONTROL MIDDLEWARE ==========
@app.after_request
def add_header(response):
    if request.path.startswith('/static/'):
        response.headers['Cache-Control'] = 'public, max-age=31536000, immutable'
    elif request.path.startswith('/admin/'):
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
    elif request.path == '/' or request.path == '/about-developer':
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
    return response

# ========== ERROR HANDLERS ==========

@app.errorhandler(404)
def not_found(error):
    return jsonify({"success": False, "error": "Endpoint not found", "message": "The requested endpoint does not exist"}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({"success": False, "error": "Internal server error", "message": "An unexpected error occurred"}), 500

# ========== APPLICATION STARTUP ==========

if __name__ == '__main__':
    print("=" * 60)
    print("Runyankore-English Translator")
    print("=" * 60)
    print("\n📊 Database initialized successfully")
    print("🌐 App is ready for deployment to PythonAnywhere!")
    pass