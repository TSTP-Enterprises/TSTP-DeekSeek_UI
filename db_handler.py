import sqlite3
import os
import json
from datetime import datetime

class DatabaseHandler:
    def __init__(self, db_path="deepseek_ui/chat.db"):
        self.db_path = db_path
        self.init_db()

    def init_db(self):
        """Initialize the database with schema"""
        if not os.path.exists(os.path.dirname(self.db_path)):
            os.makedirs(os.path.dirname(self.db_path))
            
        with sqlite3.connect(self.db_path) as conn:
            with open('deepseek_ui/schema.sql') as f:
                conn.executescript(f.read())

    def save_conversation(self, user_message, ai_response, thinking_process, model_name):
        """Save a conversation to the database"""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                INSERT INTO conversations (user_message, ai_response, thinking_process, model_name)
                VALUES (?, ?, ?, ?)
            """, (user_message, ai_response, thinking_process, model_name))

    def save_code(self, conversation_id, code, language, filename):
        """Save code snippet from a conversation"""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                INSERT INTO saved_code (conversation_id, code, language, filename)
                VALUES (?, ?, ?, ?)
            """, (conversation_id, code, language, filename))

    def get_conversations(self, limit=50, offset=0):
        """Get recent conversations"""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute("""
                SELECT * FROM conversations 
                ORDER BY timestamp DESC 
                LIMIT ? OFFSET ?
            """, (limit, offset))
            return [dict(row) for row in cursor.fetchall()]

    def delete_conversation(self, conversation_id):
        """Delete a conversation and its associated code snippets"""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("DELETE FROM saved_code WHERE conversation_id = ?", (conversation_id,))
            conn.execute("DELETE FROM conversations WHERE id = ?", (conversation_id,))

    def export_history(self, filepath):
        """Export chat history to JSON"""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            conversations = conn.execute("SELECT * FROM conversations ORDER BY timestamp").fetchall()
            data = []
            for conv in conversations:
                conv_dict = dict(conv)
                code_snippets = conn.execute(
                    "SELECT * FROM saved_code WHERE conversation_id = ?", 
                    (conv_dict['id'],)
                ).fetchall()
                conv_dict['code_snippets'] = [dict(code) for code in code_snippets]
                data.append(conv_dict)
                
        with open(filepath, 'w') as f:
            json.dump(data, f, indent=2)

    def clear_all(self):
        """Clear all conversations and code snippets"""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("DELETE FROM saved_code")
            conn.execute("DELETE FROM conversations")
            conn.commit() 