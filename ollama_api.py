from flask import Flask, request, jsonify, render_template, Response, send_file, send_from_directory
import requests
import logging
import os
import json
from db_handler import DatabaseHandler
import sqlite3
from datetime import datetime
import re

app = Flask(__name__)

# Setup logging with file output
log_dir = os.path.join(os.path.dirname(__file__), 'logs')
if not os.path.exists(log_dir):
    os.makedirs(log_dir)

logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(os.path.join(log_dir, 'ollama_api.log')),
        logging.StreamHandler()
    ]
)

OLLAMA_API_BASE = "http://localhost:11434"

# Add after app initialization
db = DatabaseHandler()

def check_ollama_status():
    """Check if Ollama server is running"""
    try:
        response = requests.head(f"{OLLAMA_API_BASE}/")
        return response.status_code == 200
    except requests.exceptions.ConnectionError:
        return False

@app.route('/')
def index():
    """Render the web UI."""
    return render_template('index.html')

@app.route('/send', methods=['POST'])
def send_message():
    """Endpoint to send a message to the Ollama model."""
    try:
        if not check_ollama_status():
            logging.error("Ollama server is not running")
            return jsonify({"error": "Ollama server is not running"}), 500

        user_input = request.json.get('message')
        if not user_input:
            logging.warning("No message provided in request.")
            return jsonify({"error": "No message provided"}), 400

        logging.info(f"Sending message to Ollama: {user_input}")
        
        def generate():
            try:
                response = requests.post(
                    f"{OLLAMA_API_BASE}/api/generate",
                    json={
                        "model": "deepseek-r1:7b",
                        "prompt": user_input,
                        "stream": True
                    },
                    stream=True
                )
                
                if response.status_code == 200:
                    accumulated_response = ""
                    thinking_process = ""
                    
                    for line in response.iter_lines():
                        if line:
                            try:
                                json_response = json.loads(line)
                                response_part = json_response.get("response", "")
                                accumulated_response += response_part
                                
                                # Check for thinking section
                                if '<think>' in accumulated_response and '</think>' in accumulated_response:
                                    match = re.search(r'<think>(.*?)</think>\s*(.*)', accumulated_response, re.DOTALL)
                                    if match:
                                        thinking_process = match.group(1).strip()
                                        actual_response = match.group(2).strip()
                                    else:
                                        actual_response = accumulated_response
                                else:
                                    actual_response = accumulated_response
                                
                                yield f"data: {json.dumps({'response': accumulated_response})}\n\n"
                            except json.JSONDecodeError as e:
                                logging.error(f"Error decoding JSON: {e}")
                    
                    # Save the conversation after completion
                    db.save_conversation(
                        user_message=user_input,
                        ai_response=actual_response,
                        thinking_process=thinking_process,
                        model_name="deepseek-r1:7b"
                    )
                    
                    logging.debug(f"Full response from Ollama: {accumulated_response}")
                else:
                    error_msg = json.dumps({"error": f"Ollama API error: {response.text}"})
                    yield f"data: {error_msg}\n\n"
                    
            except Exception as e:
                error_msg = json.dumps({"error": str(e)})
                yield f"data: {error_msg}\n\n"
                
        return Response(
            generate(),
            mimetype='text/event-stream',
            headers={
                'Cache-Control': 'no-cache',
                'X-Accel-Buffering': 'no'
            }
        )

    except Exception as e:
        logging.error(f"Error in send_message: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/rules', methods=['GET'])
def get_rules():
    """Get the contents of rules.txt"""
    try:
        with open('deepseek_ui/rules.txt', 'r') as f:
            return f.read()
    except FileNotFoundError:
        return '', 404

@app.route('/rules', methods=['POST'])
def save_rules():
    """Save changes to rules.txt"""
    try:
        with open('deepseek_ui/rules.txt', 'w') as f:
            f.write(request.get_data(as_text=True))
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/history', methods=['GET'])
def get_history():
    """Get chat history"""
    try:
        history = db.get_conversations()
        return jsonify(history)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/export-history', methods=['GET'])
def export_history():
    """Export chat history"""
    try:
        export_path = 'deepseek_ui/exports'
        if not os.path.exists(export_path):
            os.makedirs(export_path)
        filepath = os.path.join(export_path, f'chat-history-{datetime.now().strftime("%Y%m%d-%H%M%S")}.json')
        db.export_history(filepath)
        return send_file(filepath, as_attachment=True)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/clear-history', methods=['POST'])
def clear_history():
    """Clear all chat history"""
    try:
        db.clear_all()
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/conversation/<int:id>', methods=['GET'])
def get_conversation(id):
    """Get a specific conversation"""
    try:
        with sqlite3.connect(db.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute("SELECT * FROM conversations WHERE id = ?", (id,))
            conversation = cursor.fetchone()
            if conversation:
                return jsonify(dict(conversation))
            return jsonify({"error": "Conversation not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/settings', methods=['GET'])
def get_settings():
    """Get all settings"""
    try:
        with sqlite3.connect(db.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute("SELECT * FROM settings")
            settings = [dict(row) for row in cursor.fetchall()]
            return jsonify(settings)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/settings', methods=['POST'])
def update_setting():
    """Update a setting"""
    try:
        data = request.json
        with sqlite3.connect(db.db_path) as conn:
            conn.execute(
                "UPDATE settings SET value = ? WHERE name = ?",
                (data['value'], data['name'])
            )
            return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

def process_response(response):
    """Process the response to handle thinking sections based on settings"""
    try:
        with sqlite3.connect(db.db_path) as conn:
            cursor = conn.execute("SELECT value FROM settings WHERE name = 'show_thinking'")
            show_thinking = cursor.fetchone()[0] == 'true'
            
        if '<think>' in response and '</think>' in response:
            match = re.search(r'<think>(.*?)</think>\s*(.*)', response, re.DOTALL)
            if match:
                thinking = match.group(1).strip()
                response = match.group(2).strip()
                if show_thinking:
                    return f"{thinking}\n\n{response}"
                return response
        return response
    except Exception as e:
        logging.error(f"Error processing response: {e}")
        return response

@app.route('/execute-code', methods=['POST'])
def execute_code():
    """Execute code in a safe environment"""
    try:
        data = request.json
        code = data.get('code')
        language = data.get('language', '').lower()

        if not code:
            return jsonify({"error": "No code provided"}), 400

        # Create a temporary directory for code execution
        import tempfile
        import subprocess
        import os
        from pathlib import Path

        with tempfile.TemporaryDirectory() as temp_dir:
            # Map language to file extension and command
            language_config = {
                'python': {
                    'ext': '.py',
                    'cmd': ['python'],
                    'timeout': 30
                },
                'javascript': {
                    'ext': '.js',
                    'cmd': ['node'],
                    'timeout': 30
                },
                'php': {
                    'ext': '.php',
                    'cmd': ['php'],
                    'timeout': 30
                }
            }

            # Get language configuration
            lang_config = language_config.get(language)
            if not lang_config:
                return jsonify({"error": f"Unsupported language: {language}"}), 400

            # Create temporary file with the code
            file_path = Path(temp_dir) / f"code{lang_config['ext']}"
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(code)

            try:
                # Execute the code with timeout
                result = subprocess.run(
                    [*lang_config['cmd'], str(file_path)],
                    capture_output=True,
                    text=True,
                    timeout=lang_config['timeout']
                )

                # Check for errors
                if result.returncode != 0:
                    return jsonify({
                        "error": result.stderr,
                        "output": result.stdout
                    })

                return jsonify({
                    "output": result.stdout,
                    "error": None
                })

            except subprocess.TimeoutExpired:
                return jsonify({"error": "Code execution timed out"}), 408
            except subprocess.SubprocessError as e:
                return jsonify({"error": str(e)}), 500

    except Exception as e:
        logging.error(f"Error executing code: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/static/<path:path>')
def serve_static(path):
    return send_from_directory('static', path)

if __name__ == '__main__':
    try:
        if not check_ollama_status():
            logging.error("Ollama server is not running. Please start Ollama first.")
            print("Error: Ollama server is not running. Please start Ollama first.")
            exit(1)
            
        logging.info("Starting Flask server...")
        app.run(host='0.0.0.0', port=5000)
    except Exception as e:
        logging.error(f"Failed to start application: {str(e)}") 