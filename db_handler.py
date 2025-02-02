import sqlite3
import os
import json
from datetime import datetime

class DatabaseHandler:
    def __init__(self, db_path="database/chat.db"):
        self.db_path = db_path
        self.init_db()

    def init_db(self):
        """Initialize the database with schema"""
        try:
            if not os.path.exists(os.path.dirname(self.db_path)):
                os.makedirs(os.path.dirname(self.db_path))
                
            with sqlite3.connect(self.db_path) as conn:
                with open('database/schema.sql') as f:
                    conn.executescript(f.read())
        except Exception as e:
            raise RuntimeError(f"Failed to initialize the database: {str(e)}")

    def save_conversation(self, user_message, ai_response, thinking_process, model_name, project_id=None, chat_id=None):
        """Save a conversation to the database"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.execute("""
                    INSERT INTO conversations (user_message, ai_response, thinking_process, model_name, project_id, chat_id)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (user_message, ai_response, thinking_process, model_name, project_id, chat_id))
                return cursor.lastrowid
        except Exception as e:
            raise RuntimeError(f"Failed to save conversation: {str(e)}")

    def save_code(self, conversation_id, code, language, filename):
        """Save code snippet from a conversation"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute("""
                    INSERT INTO saved_code (conversation_id, code, language, filename)
                    VALUES (?, ?, ?, ?)
                """, (conversation_id, code, language, filename))
        except Exception as e:
            raise RuntimeError(f"Failed to save code snippet: {str(e)}")

    def get_conversations(self, limit=50, offset=0, project_id=None, chat_id=None):
        """Get recent conversations with optional project and chat filters"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                query = "SELECT * FROM conversations WHERE 1=1"
                params = []
                
                if project_id is not None:
                    query += " AND project_id = ?"
                    params.append(project_id)
                if chat_id is not None:
                    query += " AND chat_id = ?"
                    params.append(chat_id)
                    
                query += " ORDER BY timestamp DESC LIMIT ? OFFSET ?"
                params.extend([limit, offset])
                
                cursor = conn.execute(query, params)
                return [dict(row) for row in cursor.fetchall()]
        except Exception as e:
            raise RuntimeError(f"Failed to get conversations: {str(e)}")

    def create_project(self, name, description=None):
        """Create a new project"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.execute("""
                    INSERT INTO projects (name, description)
                    VALUES (?, ?)
                """, (name, description))
                return cursor.lastrowid
        except Exception as e:
            raise RuntimeError(f"Failed to create project: {str(e)}")

    def create_chat(self, project_id, title):
        """Create a new chat"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.execute("""
                    INSERT INTO chats (project_id, title, created_at, updated_at)
                    VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                """, (project_id, title))
                return cursor.lastrowid
        except Exception as e:
            raise RuntimeError(f"Failed to create chat: {str(e)}")

    def get_projects(self, include_chats=False):
        """Get all projects with optional chat inclusion"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                projects = [dict(row) for row in conn.execute("SELECT * FROM projects ORDER BY is_pinned DESC, updated_at DESC").fetchall()]
                
                if include_chats:
                    for project in projects:
                        chats = [dict(row) for row in conn.execute(
                            "SELECT * FROM chats WHERE project_id = ? ORDER BY is_pinned DESC, updated_at DESC",
                            (project['id'],)
                        ).fetchall()]
                        project['chats'] = chats
                
                return projects
        except Exception as e:
            raise RuntimeError(f"Failed to get projects: {str(e)}")

    def get_chats(self, project_id=None):
        """Get all chats for a project"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                query = "SELECT * FROM chats"
                params = []
                
                if project_id is not None:
                    query += " WHERE project_id = ?"
                    params.append(project_id)
                    
                query += " ORDER BY is_pinned DESC, updated_at DESC"
                return [dict(row) for row in conn.execute(query, params).fetchall()]
        except Exception as e:
            raise RuntimeError(f"Failed to get chats: {str(e)}")

    def update_project(self, project_id, name=None, description=None, is_pinned=None):
        """Update project details"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                updates = []
                params = []
                
                if name is not None:
                    updates.append("name = ?")
                    params.append(name)
                if description is not None:
                    updates.append("description = ?")
                    params.append(description)
                if is_pinned is not None:
                    updates.append("is_pinned = ?")
                    params.append(is_pinned)
                    
                if updates:
                    updates.append("updated_at = CURRENT_TIMESTAMP")
                    query = f"UPDATE projects SET {', '.join(updates)} WHERE id = ?"
                    params.append(project_id)
                    conn.execute(query, params)
        except Exception as e:
            raise RuntimeError(f"Failed to update project: {str(e)}")

    def update_chat(self, chat_id, title=None, is_pinned=None):
        """Update chat details"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                updates = []
                params = []
                
                if title is not None:
                    updates.append("title = ?")
                    params.append(title)
                if is_pinned is not None:
                    updates.append("is_pinned = ?")
                    params.append(is_pinned)
                    
                if updates:
                    updates.append("updated_at = CURRENT_TIMESTAMP")
                    query = f"UPDATE chats SET {', '.join(updates)} WHERE id = ?"
                    params.append(chat_id)
                    conn.execute(query, params)
        except Exception as e:
            raise RuntimeError(f"Failed to update chat: {str(e)}")

    def delete_project(self, project_id):
        """Delete a project and all its associated chats and conversations"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute("DELETE FROM projects WHERE id = ?", (project_id,))
        except Exception as e:
            raise RuntimeError(f"Failed to delete project: {str(e)}")

    def delete_chat(self, chat_id):
        """Delete a chat and all its conversations"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute("DELETE FROM chats WHERE id = ?", (chat_id,))
        except Exception as e:
            raise RuntimeError(f"Failed to delete chat: {str(e)}")

    def export_history(self, filepath):
        """Export chat history to JSON"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                projects = self.get_projects(include_chats=True)
                
                for project in projects:
                    for chat in project['chats']:
                        conversations = conn.execute("""
                            SELECT c.*, sc.* 
                            FROM conversations c
                            LEFT JOIN saved_code sc ON c.id = sc.conversation_id
                            WHERE c.project_id = ? AND c.chat_id = ?
                            ORDER BY c.timestamp
                        """, (project['id'], chat['id'])).fetchall()
                        
                        chat['conversations'] = [dict(conv) for conv in conversations]
                
            with open(filepath, 'w') as f:
                json.dump(projects, f, indent=2)
        except Exception as e:
            raise RuntimeError(f"Failed to export history: {str(e)}")

    def clear_all(self):
        """Clear all data from the database"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute("DELETE FROM saved_code")
                conn.execute("DELETE FROM conversations")
                conn.execute("DELETE FROM chats")
                conn.execute("DELETE FROM projects")
                conn.commit()
        except Exception as e:
            raise RuntimeError(f"Failed to clear all data: {str(e)}")

    def rebuild_database(self):
        """Delete and rebuild the database from schema"""
        try:
            if os.path.exists(self.db_path):
                os.remove(self.db_path)
            self.init_db()  # Reinitialize the database
        except Exception as e:
            raise RuntimeError(f"Failed to rebuild the database: {str(e)}")

    def get_chat_history(self, chat_id=None):
        """Get chat history with optional filtering by chat_id"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                query = """
                    SELECT c.*, p.name as project_name, ch.title as chat_title
                    FROM conversations c
                    LEFT JOIN projects p ON c.project_id = p.id
                    LEFT JOIN chats ch ON c.chat_id = ch.id
                """
                params = []
                
                if chat_id is not None:
                    query += " WHERE c.chat_id = ?"
                    params.append(chat_id)
                    
                query += " ORDER BY c.timestamp DESC"
                return [dict(row) for row in conn.execute(query, params).fetchall()]
        except Exception as e:
            raise RuntimeError(f"Failed to get chat history: {str(e)}")

    def clear_chat_history(self, chat_id=None):
        """Clear chat history, optionally for a specific chat"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                if chat_id is not None:
                    conn.execute("DELETE FROM conversations WHERE chat_id = ?", (chat_id,))
                else:
                    conn.execute("DELETE FROM conversations WHERE chat_id IS NULL")
        except Exception as e:
            raise RuntimeError(f"Failed to clear chat history: {str(e)}")

    def get_chat_messages(self, chat_id):
        """Get all messages for a specific chat"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                query = """
                    SELECT c.*, p.name as project_name, ch.title as chat_title
                    FROM conversations c
                    LEFT JOIN projects p ON c.project_id = p.id
                    LEFT JOIN chats ch ON c.chat_id = ch.id
                    WHERE c.chat_id = ?
                    ORDER BY c.timestamp ASC
                """
                return [dict(row) for row in conn.execute(query, (chat_id,)).fetchall()]
        except Exception as e:
            raise RuntimeError(f"Failed to get chat messages: {str(e)}")

    def add_message(self, user_message, ai_response, thinking_process=None, project_id=None, chat_id=None):
        """Add a new message to the conversation"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute("""
                    INSERT INTO conversations (user_message, ai_response, thinking_process, project_id, chat_id)
                    VALUES (?, ?, ?, ?, ?)
                """, (user_message, ai_response, thinking_process, project_id, chat_id))
        except Exception as e:
            raise RuntimeError(f"Failed to add message: {str(e)}")

    def get_message(self, message_id):
        """Get a specific message by ID"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                query = """
                    SELECT c.*, p.name as project_name, ch.title as chat_title
                    FROM conversations c
                    LEFT JOIN projects p ON c.project_id = p.id
                    LEFT JOIN chats ch ON c.chat_id = ch.id
                    WHERE c.id = ?
                """
                result = conn.execute(query, (message_id,)).fetchone()
                return dict(result) if result else None
        except Exception as e:
            raise RuntimeError(f"Failed to get message: {str(e)}")

    def get_unsaved_chats(self):
        """Get all chats that are not associated with a project"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                cursor = conn.execute("""
                    SELECT c.*, COUNT(conv.id) as message_count 
                    FROM chats c
                    LEFT JOIN conversations conv ON c.id = conv.chat_id
                    WHERE c.project_id IS NULL
                    GROUP BY c.id
                    ORDER BY c.created_at DESC
                """)
                return [dict(row) for row in cursor.fetchall()]
        except Exception as e:
            raise RuntimeError(f"Failed to get unsaved chats: {str(e)}")

    def get_all_chats(self):
        """Get all chats"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                cursor = conn.execute("""
                    SELECT c.*, p.name as project_name, COUNT(conv.id) as message_count 
                    FROM chats c
                    LEFT JOIN projects p ON c.project_id = p.id
                    LEFT JOIN conversations conv ON c.id = conv.chat_id
                    GROUP BY c.id
                    ORDER BY c.created_at DESC
                """)
                return [dict(row) for row in cursor.fetchall()]
        except Exception as e:
            raise RuntimeError(f"Failed to get all chats: {str(e)}")

    def save_chat_to_project(self, chat_id, project_id, title):
        """Save a chat to a project"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                # Update the chat with the new project_id and title
                conn.execute("""
                    UPDATE chats 
                    SET project_id = ?, title = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                """, (project_id, title, chat_id))
                
                # Update all associated conversations
                conn.execute("""
                    UPDATE conversations
                    SET project_id = ?
                    WHERE chat_id = ?
                """, (project_id, chat_id))
        except Exception as e:
            raise RuntimeError(f"Failed to save chat to project: {str(e)}")