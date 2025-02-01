CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    user_message TEXT,
    ai_response TEXT,
    thinking_process TEXT,
    model_name TEXT
);

CREATE TABLE IF NOT EXISTS saved_code (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER,
    code TEXT,
    language TEXT,
    filename TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY,
    name TEXT UNIQUE,
    value TEXT,
    type TEXT,  -- 'checkbox', 'text', 'number', 'select'
    label TEXT,
    options TEXT  -- JSON string for dropdown options
);

-- Insert default settings with proper types
INSERT OR IGNORE INTO settings (name, value, type, label) VALUES
    ('remove_thinking_tags', 'true', 'checkbox', 'Remove Thinking Tags'),
    ('strip_whitespace', 'true', 'checkbox', 'Strip Extra Whitespace'),
    ('format_code', 'true', 'checkbox', 'Format Code Blocks'),
    ('auto_save_code', 'true', 'checkbox', 'Auto-save Code Snippets'),
    ('show_thinking', 'false', 'checkbox', 'Show AI Thinking Process'),
    ('max_response_length', '2000', 'number', 'Maximum Response Length'),
    ('use_markdown', 'true', 'checkbox', 'Use Markdown Formatting'),
    ('code_save_path', './saved_code', 'text', 'Code Save Location');

CREATE INDEX IF NOT EXISTS idx_conversations_timestamp ON conversations(timestamp); 