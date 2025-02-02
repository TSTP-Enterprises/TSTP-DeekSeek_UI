from flask import Flask, request, jsonify, render_template, Response, send_file, send_from_directory
import requests
import logging
import time
import os
import json
from db_handler import DatabaseHandler
import sqlite3
from datetime import datetime
import re
import sys
import subprocess
import signal
import psutil  # You may need to install this: pip install psutil

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
    """Send a message and get a response"""
    try:
        data = request.json
        message = data.get('message')
        project_id = data.get('project_id')
        chat_id = data.get('chat_id')
        
        if not message:
            return jsonify({"error": "Message is required"}), 400
        
        if not check_ollama_status():
            logging.error("Ollama server is not running")
            return jsonify({"error": "Ollama server is not running"}), 500

        logging.info(f"Sending message to Ollama: {message}")
        
        # Get relevant settings
        with sqlite3.connect(db.db_path) as conn:
            cursor = conn.execute("SELECT name, value FROM settings WHERE name IN ('show_thinking', 'remove_thinking_tags')")
            settings = dict(cursor.fetchall())
        
        def generate():
            try:
                response = requests.post(
                    f"{OLLAMA_API_BASE}/api/generate",
                    json={
                        "model": "deepseek-r1:7b",
                        "prompt": message,
                        "stream": True
                    },
                    stream=True
                )
                
                if response.status_code == 200:
                    # Initialize variables for response tracking
                    full_response = ""  # Complete response including think tags
                    main_response = ""  # Response without think sections
                    current_thinking = ""  # Current think section being built
                    thinking_process = ""  # Complete thinking process
                    in_thinking = False
                    
                    for line in response.iter_lines():
                        if line:
                            try:
                                json_response = json.loads(line)
                                response_part = json_response.get("response", "")
                                
                                # Process the response part character by character
                                for char in response_part:
                                    full_response += char  # Always accumulate complete response
                                    
                                    # Check for thinking tags
                                    if full_response.endswith("<think>"):
                                        in_thinking = True
                                        current_thinking = ""
                                        continue
                                        
                                    if full_response.endswith("</think>"):
                                        in_thinking = False
                                        thinking_process = current_thinking  # Store the complete thinking section
                                        continue
                                    
                                    if in_thinking:
                                        current_thinking += char
                                        # Stream the thinking process as it's being built
                                        thinking_process = current_thinking
                                    else:
                                        if not full_response.endswith("</think>"):
                                            main_response += char
                                
                                # Prepare display versions based on settings
                                display_response = main_response.strip()
                                display_thinking = ""
                                
                                if settings.get('show_thinking') == 'true':
                                    if settings.get('remove_thinking_tags') == 'true':
                                        display_thinking = thinking_process
                                    else:
                                        if in_thinking:
                                            display_thinking = f"<think>{thinking_process}"
                                        else:
                                            display_thinking = f"<think>{thinking_process}</think>" if thinking_process else ""
                                
                                # Send each chunk as an SSE event with all versions
                                event_data = {
                                    'response': display_response,
                                    'thinking': display_thinking,
                                    'raw_response': full_response,
                                    'raw_thinking': thinking_process,
                                    'main_response': main_response,
                                    'settings': settings,
                                    'in_thinking': in_thinking,
                                    'done': json_response.get('done', False)
                                }
                                yield f"data: {json.dumps(event_data)}\n\n"
                                
                                # If response is done, save complete versions to database
                                if json_response.get('done', False):
                                    db.save_conversation(
                                        user_message=message,
                                        ai_response=full_response,  # Save complete response with tags
                                        thinking_process=thinking_process,  # Save complete thinking process
                                        model_name="deepseek-r1:7b",
                                        project_id=project_id,
                                        chat_id=chat_id
                                    )
                                    logging.debug(f"Full response from Ollama: {full_response}")
                                    
                            except json.JSONDecodeError as e:
                                logging.error(f"Error decoding JSON: {e}")
                                continue
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
                'Content-Type': 'text/event-stream',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no'
            }
        )

    except Exception as e:
        logging.error(f"Error sending message: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/rules', methods=['GET'])
def get_rules():
    """Get the contents of rules.txt"""
    try:
        with open('rules.txt', 'r') as f:
            return f.read()
    except FileNotFoundError:
        return '', 404

@app.route('/rules', methods=['POST'])
def save_rules():
    """Save changes to rules.txt"""
    try:
        with open('rules.txt', 'w') as f:
            f.write(request.get_data(as_text=True))
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/history', methods=['GET'])
def get_history():
    """Get chat history"""
    try:
        chat_id = request.args.get('chat_id', type=int)
        history = db.get_chat_history(chat_id)
        return jsonify(history)
    except Exception as e:
        logging.error(f"Error getting history: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/export-history', methods=['GET'])
def export_history():
    """Export chat history"""
    try:
        export_path = 'exports'
        if not os.path.exists(export_path):
            os.makedirs(export_path)
        filepath = os.path.join(export_path, f'chat-history-{datetime.now().strftime("%Y%m%d-%H%M%S")}.json')
        db.export_history(filepath)
        return send_file(filepath, as_attachment=True)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/clear-history', methods=['POST'])
def clear_history():
    """Clear chat history"""
    try:
        chat_id = request.args.get('chat_id', type=int)
        db.clear_chat_history(chat_id)
        return jsonify({"status": "success"})
    except Exception as e:
        logging.error(f"Error clearing history: {str(e)}")
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

@app.route('/server/restart', methods=['POST'])
def restart_server():
    """Restart the server"""
    try:
        # Get the current process
        current_process = psutil.Process(os.getpid())
        
        # Create scripts directory if it doesn't exist
        scripts_dir = os.path.join(os.path.dirname(__file__), 'static', 'scripts')
        if not os.path.exists(scripts_dir):
            os.makedirs(scripts_dir)
        
        # Create batch file in the scripts directory
        batch_script = os.path.join(scripts_dir, 'restart.bat')
        with open(batch_script, 'w') as f:
            f.write('@echo off\n')
            f.write('timeout /t 1 /nobreak >nul\n')
            f.write(f'start "" "{sys.executable}" "{os.path.abspath(__file__)}"\n')
        
        # Start the batch file
        subprocess.Popen(['start', '/B', batch_script], shell=True)
        
        # Kill the current process
        current_process.kill()
        
        return jsonify({"message": "Server is restarting"}), 200
    except Exception as e:
        logging.error(f"Failed to restart server: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/server/shutdown', methods=['POST'])
def shutdown_server():
    """Shutdown the server"""
    try:
        # Get the current process
        current_process = psutil.Process(os.getpid())
        
        # Create scripts directory if it doesn't exist
        scripts_dir = os.path.join(os.path.dirname(__file__), 'static', 'scripts')
        if not os.path.exists(scripts_dir):
            os.makedirs(scripts_dir)
        
        # Create batch file in the scripts directory
        batch_script = os.path.join(scripts_dir, 'cleanup.bat')
        with open(batch_script, 'w') as f:
            f.write('@echo off\n')
            f.write('timeout /t 1 /nobreak >nul\n')
            f.write(f'del "{batch_script}"\n')
        
        # Start the cleanup batch file
        subprocess.Popen(['start', '/B', batch_script], shell=True)
        
        # Kill the current process
        current_process.kill()
        
        return jsonify({"message": "Server is shutting down"}), 200
    except Exception as e:
        logging.error(f"Failed to shutdown server: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/health')
def health_check():
    """Check if server is running"""
    return jsonify({"status": "ok"}), 200

@app.route('/projects', methods=['GET'])
def get_projects():
    """Get all projects with their chats"""
    try:
        projects = db.get_projects(include_chats=True)
        return jsonify(projects)
    except Exception as e:
        logging.error(f"Error getting projects: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/projects', methods=['POST'])
def create_project():
    """Create a new project"""
    try:
        data = request.json
        name = data.get('name')
        description = data.get('description')
        
        if not name:
            return jsonify({"error": "Project name is required"}), 400
            
        project_id = db.create_project(name, description)
        return jsonify({"id": project_id, "name": name, "description": description})
    except Exception as e:
        logging.error(f"Error creating project: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/projects/<int:project_id>', methods=['PUT'])
def update_project(project_id):
    """Update a project"""
    try:
        data = request.json
        db.update_project(
            project_id,
            name=data.get('name'),
            description=data.get('description'),
            is_pinned=data.get('is_pinned')
        )
        return jsonify({"status": "success"})
    except Exception as e:
        logging.error(f"Error updating project: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/projects/<int:project_id>', methods=['DELETE'])
def delete_project(project_id):
    """Delete a project"""
    try:
        db.delete_project(project_id)
        return jsonify({"status": "success"})
    except Exception as e:
        logging.error(f"Error deleting project: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/projects/<int:project_id>/chats', methods=['GET'])
def get_chats(project_id):
    """Get all chats for a project"""
    try:
        chats = db.get_chats(project_id)
        return jsonify(chats)
    except Exception as e:
        logging.error(f"Error getting chats: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/projects/<int:project_id>/chats', methods=['POST'])
def create_project_chat(project_id):
    """Create a new chat in a project"""
    try:
        data = request.json
        title = data.get('title')
        
        if not title:
            return jsonify({"error": "Chat title is required"}), 400
            
        chat_id = db.create_chat(project_id, title)
        return jsonify({"id": chat_id, "title": title})
    except Exception as e:
        logging.error(f"Error creating chat: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/chats/<int:chat_id>', methods=['PUT'])
def update_chat(chat_id):
    """Update a chat"""
    try:
        data = request.json
        db.update_chat(
            chat_id,
            title=data.get('title'),
            is_pinned=data.get('is_pinned')
        )
        return jsonify({"status": "success"})
    except Exception as e:
        logging.error(f"Error updating chat: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/chats/<int:chat_id>', methods=['DELETE'])
def delete_chat(chat_id):
    """Delete a chat"""
    try:
        db.delete_chat(chat_id)
        return jsonify({"status": "success"})
    except Exception as e:
        logging.error(f"Error deleting chat: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/database/rebuild', methods=['POST'])
def rebuild_database():
    """Rebuild the database from schema"""
    try:
        db.rebuild_database()
        return jsonify({"status": "success", "message": "Database rebuilt successfully"})
    except Exception as e:
        logging.error(f"Error rebuilding database: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/chats/<int:chat_id>/messages', methods=['GET'])
def get_chat_messages(chat_id):
    """Get all messages for a specific chat"""
    try:
        messages = db.get_chat_messages(chat_id)
        return jsonify(messages)
    except Exception as e:
        logging.error(f"Error getting chat messages: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/messages/<int:message_id>', methods=['GET'])
def get_message(message_id):
    """Get a specific message"""
    try:
        message = db.get_message(message_id)
        if message is None:
            return jsonify({"error": "Message not found"}), 404
        return jsonify(message)
    except Exception as e:
        logging.error(f"Error getting message: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/chats', methods=['GET'])
def get_all_chats():
    """Get all chats, optionally filtered by type (unsaved)"""
    try:
        chat_type = request.args.get('type')
        if chat_type == 'unsaved':
            chats = db.get_unsaved_chats()
        else:
            chats = db.get_all_chats()
        return jsonify(chats)
    except Exception as e:
        logging.error(f"Error getting chats: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/chats', methods=['POST'])
def create_unsaved_chat():
    """Create a new chat without a project"""
    try:
        data = request.json
        title = data.get('title', f'Chat {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}')
        chat_id = db.create_chat(None, title)
        return jsonify({"id": chat_id, "title": title})
    except Exception as e:
        logging.error(f"Error creating chat: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/chats/<int:chat_id>/save', methods=['POST'])
def save_chat_to_project(chat_id):
    """Save a chat to a project"""
    try:
        data = request.json
        project_id = data.get('project_id')
        title = data.get('title')
        
        if not project_id or not title:
            return jsonify({"error": "Project ID and title are required"}), 400
            
        db.save_chat_to_project(chat_id, project_id, title)
        return jsonify({"status": "success"})
    except Exception as e:
        logging.error(f"Error saving chat to project: {str(e)}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    try:
        if not check_ollama_status():
            logging.info("Ollama server not running. Attempting to start Ollama...")
            try:
                # Check default Windows install location
                default_path = os.path.join(os.environ['LOCALAPPDATA'], 'Programs', 'Ollama', 'ollama.exe')
                
                if os.path.exists(default_path):
                    ollama_path = default_path
                else:
                    # Prompt user for ollama.exe location
                    print("\nOllama executable not found in default location.")
                    print("Please enter the full path to ollama.exe (e.g. C:\\Users\\Username\\AppData\\Local\\Programs\\Ollama\\ollama.exe):")
                    ollama_path = input().strip('"')  # Remove quotes if user includes them
                    
                    if not os.path.exists(ollama_path):
                        raise FileNotFoundError(f"Could not find ollama.exe at: {ollama_path}")

                # Start Ollama process with full path
                subprocess.Popen([ollama_path, 'serve'],
                               stdout=subprocess.PIPE,
                               stderr=subprocess.PIPE)
                
                # Wait for Ollama to start (max 30 seconds)
                start_time = time.time()
                while not check_ollama_status():
                    if time.time() - start_time > 30:
                        raise TimeoutError("Ollama failed to start within 30 seconds")
                    time.sleep(1)
                    
                logging.info("Ollama server started successfully")
            except Exception as e:
                logging.error(f"Failed to start Ollama: {str(e)}")
                print(f"Error: Failed to start Ollama: {str(e)}")
                exit(1)
            
        logging.info("Starting Flask server...")
        # Use threaded=True and debug=False for better process management
        app.run(host='0.0.0.0', port=5000, threaded=True, debug=False)
    except Exception as e:
        logging.error(f"Failed to start application: {str(e)}")