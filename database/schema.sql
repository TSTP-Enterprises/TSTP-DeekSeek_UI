CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    user_message TEXT,
    ai_response TEXT,
    thinking_process TEXT,
    model_name TEXT,
    project_id INTEGER,
    chat_id INTEGER,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS saved_code (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER,
    code TEXT,
    language TEXT,
    filename TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY,
    name TEXT UNIQUE,
    value TEXT,
    type TEXT,  -- 'checkbox', 'text', 'number', 'select'
    label TEXT,
    options TEXT  -- JSON string for dropdown options
);

CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_pinned BOOLEAN DEFAULT 0
);

CREATE TABLE IF NOT EXISTS chats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER,
    title TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_pinned BOOLEAN DEFAULT 0,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Insert default settings with proper types
INSERT OR IGNORE INTO settings (name, value, type, label) VALUES
    ('remove_thinking_tags', 'true', 'checkbox', 'Remove Thinking Tags'),
    ('strip_whitespace', 'true', 'checkbox', 'Strip Extra Whitespace'),
    ('format_code', 'true', 'checkbox', 'Format Code Blocks'),
    ('auto_save_code', 'true', 'checkbox', 'Auto-save Code Snippets'),
    ('show_thinking', 'false', 'checkbox', 'Show AI Thinking Process'),
    ('enable_streaming', 'true', 'checkbox', 'Enable Response Streaming'),
    ('max_response_length', '2000', 'number', 'Maximum Response Length'),
    ('use_markdown', 'true', 'checkbox', 'Use Markdown Formatting'),
    ('code_save_path', './saved_code', 'text', 'Code Save Location');

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_conversations_timestamp ON conversations(timestamp);
CREATE INDEX IF NOT EXISTS idx_conversations_project ON conversations(project_id);
CREATE INDEX IF NOT EXISTS idx_conversations_chat ON conversations(chat_id);
CREATE INDEX IF NOT EXISTS idx_chats_project ON chats(project_id);
CREATE INDEX IF NOT EXISTS idx_projects_pinned ON projects(is_pinned);
CREATE INDEX IF NOT EXISTS idx_chats_pinned ON chats(is_pinned); 