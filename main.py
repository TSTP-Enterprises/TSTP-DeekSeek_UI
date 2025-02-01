import os
import sys
import json
import requests
import logging
import logging.handlers
import tempfile
import subprocess
import threading
from queue import Queue
from PyQt5.QtCore import Qt, QTimer, pyqtSignal, QObject, QThread
from PyQt5.QtWidgets import (
    QApplication, QMainWindow, QFileDialog, QTreeWidgetItem,
    QMessageBox, QTreeWidget, QPlainTextEdit, QPushButton,
    QHBoxLayout, QVBoxLayout, QWidget, QCheckBox, QSplitter,
    QListWidget, QListWidgetItem, QLabel, QComboBox, QAction,
    QProgressBar, QDialog
)
import re
from PyQt5.QtGui import QPalette, QColor
import warnings
from flask import Flask, send_from_directory

warnings.filterwarnings("ignore", category=DeprecationWarning)

OLLAMA_API_BASE = "http://localhost:11434"

class Theme:
    def __init__(self):
        self.dark = {
            'window': '#1e1e1e',
            'text': '#ffffff',
            'input': '#2d2d2d',
            'button': '#3d3d3d',
            'button_hover': '#4d4d4d',
            'accent': '#007acc',
            'error': '#ff3333',
            'success': '#33cc33',
            'border': '#404040'
        }
        
        self.light = {
            'window': '#ffffff',
            'text': '#000000',
            'input': '#f5f5f5',
            'button': '#e0e0e0',
            'button_hover': '#d0d0d0',
            'accent': '#0066cc',
            'error': '#cc0000',
            'success': '#00cc00',
            'border': '#cccccc'
        }

    def get_palette(self, dark_mode=True):
        colors = self.dark if dark_mode else self.light
        palette = QPalette()
        
        # Set colors for various UI elements
        palette.setColor(QPalette.Window, QColor(colors['window']))
        palette.setColor(QPalette.WindowText, QColor(colors['text']))
        palette.setColor(QPalette.Base, QColor(colors['input']))
        palette.setColor(QPalette.AlternateBase, QColor(colors['button']))
        palette.setColor(QPalette.Text, QColor(colors['text']))
        palette.setColor(QPalette.Button, QColor(colors['button']))
        palette.setColor(QPalette.ButtonText, QColor(colors['text']))
        palette.setColor(QPalette.Link, QColor(colors['accent']))
        palette.setColor(QPalette.Highlight, QColor(colors['accent']))
        palette.setColor(QPalette.HighlightedText, QColor(colors['text']))
        
        return palette

class WorkerSignals(QObject):
    finished = pyqtSignal()
    error = pyqtSignal(str)
    result = pyqtSignal(str)  # Changed to str for message response
    progress = pyqtSignal(str)
    message = pyqtSignal(str)  # Added for streaming messages

class Worker(QThread):
    def __init__(self, fn, *args, **kwargs):
        super().__init__()
        self.fn = fn
        self.args = args
        self.kwargs = kwargs
        self.signals = WorkerSignals()
        self.is_running = True

    def run(self):
        try:
            self.fn(*self.args, **self.kwargs, signals=self.signals)
        except Exception as e:
            self.signals.error.emit(str(e))
        finally:
            self.is_running = False
            self.signals.finished.emit()

    def stop(self):
        self.is_running = False

class MessageAccumulator:
    def __init__(self):
        self.buffer = ""
        self.complete_messages = Queue()
        self.lock = threading.Lock()

    def add_text(self, text):
        with self.lock:
            self.buffer += text
            if '\n' in self.buffer:
                lines = self.buffer.split('\n')
                self.buffer = lines[-1]
                for line in lines[:-1]:
                    if line.strip():
                        self.complete_messages.put(line)

    def get_message(self):
        try:
            return self.complete_messages.get_nowait()
        except:
            return None

class SignalEmitter(QObject):
    output_received = pyqtSignal(str)
    error_occurred = pyqtSignal(str)
    progress_updated = pyqtSignal(str)
    code_executed = pyqtSignal(dict)  # For code execution results

class CodeExecutor:
    def __init__(self):
        self.language_config = {
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
            },
            'powershell': {
                'ext': '.ps1',
                'cmd': ['powershell', '-ExecutionPolicy', 'Bypass', '-File'],
                'timeout': 30
            },
            'shell': {
                'ext': '.sh',
                'cmd': ['bash'],
                'timeout': 30
            }
        }

    def execute_code(self, code, language):
        """Execute code in a safe environment"""
        try:
            # Get language configuration
            lang_config = self.language_config.get(language.lower())
            if not lang_config:
                return {'error': f'Unsupported language: {language}'}

            # Create temporary directory and file
            with tempfile.TemporaryDirectory() as temp_dir:
                file_path = os.path.join(temp_dir, f"code{lang_config['ext']}")
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(code)

                try:
                    # Execute the code with timeout
                    result = subprocess.run(
                        [*lang_config['cmd'], file_path],
                        capture_output=True,
                        text=True,
                        timeout=lang_config['timeout']
                    )

                    if result.returncode != 0:
                        return {
                            'error': result.stderr,
                            'output': result.stdout
                        }

                    return {
                        'output': result.stdout,
                        'error': None
                    }

                except subprocess.TimeoutExpired:
                    return {'error': 'Code execution timed out'}
                except subprocess.SubprocessError as e:
                    return {'error': str(e)}

        except Exception as e:
            return {'error': str(e)}

class ChatMessage(QWidget):
    def __init__(self, sender, message, is_bot=False, is_pending=False):
        super().__init__()
        layout = QVBoxLayout()
        
        # Create header with sender name
        self.sender_label = QLabel(f"{'DeepSeek' if is_bot else 'You'}:")
        self.sender_label.setStyleSheet(
            "font-weight: bold; color: #2E86C1" if is_bot else "font-weight: bold; color: #28B463"
        )
        
        # Create message content with proper formatting
        self.message_content = QPlainTextEdit()
        self.message_content.setReadOnly(True)
        self.message_content.setPlainText(message)
        self.message_content.setMinimumHeight(50)
        self.message_content.setStyleSheet("""
            QPlainTextEdit {
                background-color: transparent;
                border: none;
                padding: 5px;
                font-family: 'Consolas', 'Monaco', monospace;
                line-height: 1.5;
            }
        """)
        
        # Make it expand with content
        doc_height = self.message_content.document().size().height()
        self.message_content.setMinimumHeight(min(doc_height + 20, 300))
        
        # Add click handler
        self.message_content.mousePressEvent = lambda e: self.show_full_message(message)
        
        layout.addWidget(self.sender_label)
        layout.addWidget(self.message_content)
        self.setLayout(layout)

    def show_full_message(self, message):
        """Show full message in a separate window"""
        dialog = QDialog(self)
        dialog.setWindowTitle("Message Details")
        dialog.setMinimumSize(600, 400)
        
        layout = QVBoxLayout()
        
        text_edit = QPlainTextEdit()
        text_edit.setPlainText(message)
        text_edit.setReadOnly(True)
        text_edit.setStyleSheet("""
            QPlainTextEdit {
                font-family: 'Consolas', 'Monaco', monospace;
                padding: 10px;
                line-height: 1.5;
            }
        """)
        
        layout.addWidget(text_edit)
        
        close_btn = QPushButton("Close")
        close_btn.clicked.connect(dialog.close)
        layout.addWidget(close_btn)
        
        dialog.setLayout(layout)
        dialog.exec_()

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setup_logging()
        self.signal_emitter = SignalEmitter()
        self.code_executor = CodeExecutor()
        self.message_accumulator = MessageAccumulator()
        self.theme = Theme()
        self.dark_mode = True
        self.current_project = None
        self.active_model = "deepseek-r1:7b"
        self.worker = None
        self.init_ui()
        self.apply_theme()
        self.load_settings()
        
        # Connect signals
        self.signal_emitter.output_received.connect(self.handle_ollama_output)
        self.signal_emitter.error_occurred.connect(self.show_error)
        self.signal_emitter.progress_updated.connect(self.update_progress)
        self.signal_emitter.code_executed.connect(self.handle_code_execution)

        # Setup message processing timer
        self.message_timer = QTimer()
        self.message_timer.timeout.connect(self.process_messages)
        self.message_timer.start(100)

    def setup_logging(self):
        """Setup rotating file logger"""
        self.logger = logging.getLogger('DeepseekUI')
        self.logger.setLevel(logging.DEBUG)
        
        log_dir = os.path.join(os.path.dirname(__file__), 'logs')
        if not os.path.exists(log_dir):
            os.makedirs(log_dir)
            
        file_handler = logging.handlers.TimedRotatingFileHandler(
            filename=os.path.join(log_dir, 'deepseek_ui.log'),
            when='midnight',
            backupCount=7,
            encoding='utf-8'
        )
        formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
        file_handler.setFormatter(formatter)
        self.logger.addHandler(file_handler)

    def init_ui(self):
        self.setWindowTitle("DeepSeek Helper")
        self.setGeometry(100, 100, 1200, 800)
        
        main_splitter = QSplitter(Qt.Horizontal)
        
        # Left Panel - Chat History
        left_panel = QWidget()
        left_layout = QVBoxLayout(left_panel)
        
        self.chat_history = QListWidget()
        left_layout.addWidget(self.chat_history)
        
        # Remove project-related buttons since we're focusing on chat functionality
        control_buttons = QHBoxLayout()
        self.clear_chat_btn = QPushButton("Clear Chat")
        self.clear_chat_btn.clicked.connect(self.clear_chat)
        control_buttons.addWidget(self.clear_chat_btn)
        left_layout.addLayout(control_buttons)
        
        # Right Panel - Input and Console
        right_panel = QWidget()
        right_layout = QVBoxLayout(right_panel)
        
        # Model selector
        model_layout = QHBoxLayout()
        model_layout.addWidget(QLabel("Model:"))
        self.model_selector = QComboBox()
        self.model_selector.addItem(self.active_model)
        self.model_selector.currentTextChanged.connect(self.change_model)
        model_layout.addWidget(self.model_selector)
        right_layout.addLayout(model_layout)
        
        # Console output
        self.console_output = QPlainTextEdit()
        self.console_output.setReadOnly(True)
        right_layout.addWidget(self.console_output)
        
        # Input area
        input_layout = QVBoxLayout()
        self.command_input = QPlainTextEdit()
        self.command_input.setPlaceholderText("Type your message here...")
        self.command_input.setMaximumHeight(100)
        input_layout.addWidget(self.command_input)
        
        # Control panel
        control_panel = QHBoxLayout()
        self.execute_btn = QPushButton("Send")
        self.execute_btn.clicked.connect(self.send_to_ai)
        control_panel.addWidget(self.execute_btn)
        
        # Progress bar
        self.progress_bar = QProgressBar()
        self.progress_bar.setTextVisible(False)
        self.progress_bar.setMaximumHeight(3)
        self.progress_bar.hide()
        
        input_layout.addLayout(control_panel)
        input_layout.addWidget(self.progress_bar)
        right_layout.addLayout(input_layout)
        
        # Add panels to splitter
        main_splitter.addWidget(left_panel)
        main_splitter.addWidget(right_panel)
        self.setCentralWidget(main_splitter)
        
        # Add menu bar
        self.create_menu_bar()

        # Create static directories if they don't exist
        static_dirs = [
            os.path.join(os.path.dirname(__file__), 'static'),
            os.path.join(os.path.dirname(__file__), 'static', 'css'),
            os.path.join(os.path.dirname(__file__), 'static', 'js')
        ]
        for directory in static_dirs:
            if not os.path.exists(directory):
                os.makedirs(directory)

    def create_menu_bar(self):
        menubar = self.menuBar()
        
        # File menu
        file_menu = menubar.addMenu('File')
        
        export_action = QAction('Export Chat', self)
        export_action.triggered.connect(self.export_chat)
        file_menu.addAction(export_action)
        
        # View menu
        view_menu = menubar.addMenu('View')
        
        toggle_console = QAction('Toggle Console', self)
        toggle_console.triggered.connect(self.toggle_console)
        view_menu.addAction(toggle_console)
        
        # Theme menu
        theme_action = QAction('Toggle Dark Mode', self)
        theme_action.triggered.connect(self.toggle_theme)
        view_menu.addAction(theme_action)

    def clear_chat(self):
        """Clear the chat history"""
        if QMessageBox.question(self, 'Clear Chat', 
                              'Are you sure you want to clear the chat history?',
                              QMessageBox.Yes | QMessageBox.No) == QMessageBox.Yes:
            self.chat_history.clear()
            self.console_output.clear()

    def export_chat(self):
        """Export chat history to file"""
        try:
            file_name, _ = QFileDialog.getSaveFileName(
                self,
                "Export Chat History",
                "",
                "Text Files (*.txt);;All Files (*.*)"
            )
            if file_name:
                with open(file_name, 'w', encoding='utf-8') as f:
                    for i in range(self.chat_history.count()):
                        item = self.chat_history.item(i)
                        widget = self.chat_history.itemWidget(item)
                        if widget:
                            sender = widget.sender_label.text()
                            message = widget.message_content.text()
                            f.write(f"{sender}\n{message}\n\n")
                self.signal_emitter.output_received.emit(f"Chat history exported to {file_name}")
        except Exception as e:
            self.signal_emitter.error_occurred.emit(f"Error exporting chat: {str(e)}")

    def execute_code(self, code, language):
        """Execute code and emit results"""
        try:
            result = self.code_executor.execute_code(code, language)
            self.signal_emitter.code_executed.emit(result)
        except Exception as e:
            self.signal_emitter.error_occurred.emit(str(e))

    def handle_code_execution(self, result):
        """Handle code execution results"""
        if result.get('error'):
            self.show_error(f"Code execution error: {result['error']}")
            if result.get('output'):
                self.console_output.appendPlainText(f"Output before error:\n{result['output']}")
        else:
            self.console_output.appendPlainText(f"Output:\n{result['output']}")

    def process_messages(self):
        """Process accumulated messages"""
        message = self.message_accumulator.get_message()
        while message:
            self.handle_ollama_output(message)
            message = self.message_accumulator.get_message()

    def send_to_ai(self):
        """Send message to AI via API"""
        message = self.command_input.toPlainText().strip()
        if not message:
            return

        # Add user message to chat
        self.add_chat_message(message, is_bot=False)
        self.command_input.clear()

        # Disable UI elements
        self.execute_btn.setEnabled(False)
        self.progress_bar.show()
        self.update_progress('thinking')

        # Create and setup worker
        self.worker = Worker(self._send_message_worker, message)
        self.worker.signals.message.connect(self.handle_stream_message)
        self.worker.signals.result.connect(self.handle_api_response)
        self.worker.signals.error.connect(self.handle_api_error)
        self.worker.signals.finished.connect(self.handle_worker_finished)
        self.worker.start()

    def _send_message_worker(self, message, signals):
        """Worker function for sending messages"""
        try:
            response = requests.post(
                f"{OLLAMA_API_BASE}/api/generate",
                json={
                    "model": self.active_model,
                    "prompt": message,
                    "stream": True
                },
                stream=True
            )
            
            if response.status_code != 200:
                raise Exception(f"API error: {response.text}")

            accumulated_response = ""
            for line in response.iter_lines():
                if not self.worker.is_running:
                    break
                    
                if line:
                    try:
                        json_response = json.loads(line)
                        if 'response' in json_response:
                            accumulated_response += json_response['response']
                            # Emit the message for streaming updates
                            signals.message.emit(json_response['response'])
                    except json.JSONDecodeError:
                        continue

            signals.result.emit(accumulated_response)

        except Exception as e:
            signals.error.emit(str(e))

    def handle_stream_message(self, message):
        """Handle streaming message updates"""
        self.message_accumulator.add_text(message)
        self.process_messages()

    def handle_worker_finished(self):
        """Handle worker completion"""
        self.execute_btn.setEnabled(True)
        self.progress_bar.hide()
        if self.worker:
            self.worker.deleteLater()
            self.worker = None

    def handle_api_response(self, response):
        """Handle successful API response"""
        self.update_progress('success')
        self.progress_bar.hide()

    def handle_api_error(self, error_message):
        """Handle API error"""
        self.show_error(error_message)
        self.update_progress('error')
        self.progress_bar.hide()

    def update_chat_message(self, message):
        """Update or create chat message"""
        last_item = self.chat_history.item(self.chat_history.count() - 1)
        if last_item and isinstance(self.chat_history.itemWidget(last_item), ChatMessage):
            widget = self.chat_history.itemWidget(last_item)
            if widget.sender_label.text().startswith('DeepSeek'):
                widget.message_content.setText(message)
                return

        self.add_chat_message(message, is_bot=True)

    def save_code(self, code, language):
        """Save code to file"""
        try:
            file_name, _ = QFileDialog.getSaveFileName(
                self,
                "Save Code",
                "",
                f"{language.upper()} Files (*.{language.lower()});;All Files (*.*)"
            )
            if file_name:
                with open(file_name, 'w', encoding='utf-8') as f:
                    f.write(code)
                self.signal_emitter.output_received.emit(f"Code saved to {file_name}")
        except Exception as e:
            self.signal_emitter.error_occurred.emit(f"Error saving code: {str(e)}")

    def update_progress(self, status):
        """Update progress bar status"""
        if status == 'thinking':
            self.progress_bar.setStyleSheet("""
                QProgressBar::chunk {
                    background-color: #f1c40f;
                }
            """)
            self.progress_bar.setValue(50)
        elif status == 'error':
            self.progress_bar.setStyleSheet("""
                QProgressBar::chunk {
                    background-color: #e74c3c;
                }
            """)
            self.progress_bar.setValue(100)
        elif status == 'success':
            self.progress_bar.setStyleSheet("""
                QProgressBar::chunk {
                    background-color: #2ecc71;
                }
            """)
            self.progress_bar.setValue(100)
            QTimer.singleShot(1000, lambda: self.progress_bar.hide())

    def change_model(self, model_name):
        """Switch to different model"""
        self.active_model = model_name
        # No need to restart the Ollama process here since we're using the API
        self.model_selector.setCurrentText(model_name)

    def toggle_console(self):
        """Toggle console visibility"""
        self.console_output.setVisible(not self.console_output.isVisible())

    def toggle_theme(self):
        """Toggle between light and dark mode"""
        self.dark_mode = not self.dark_mode
        self.apply_theme()
        self.save_settings()

    def apply_theme(self):
        """Apply the current theme"""
        app = QApplication.instance()
        app.setPalette(self.theme.get_palette(self.dark_mode))
        
        # Apply theme to chat messages
        for i in range(self.chat_history.count()):
            item = self.chat_history.item(i)
            widget = self.chat_history.itemWidget(item)
            if widget:
                self.apply_widget_theme(widget)

    def apply_widget_theme(self, widget):
        """Apply theme to specific widget"""
        colors = self.theme.dark if self.dark_mode else self.theme.light
        
        if isinstance(widget, ChatMessage):
            widget.setStyleSheet(f"""
                QWidget {{
                    background-color: {colors['window']};
                    color: {colors['text']};
                }}
                QPlainTextEdit {{
                    background-color: {colors['input']};
                    color: {colors['text']};
                    border: 1px solid {colors['border']};
                    border-radius: 4px;
                    padding: 5px;
                }}
            """)

    def add_chat_message(self, message, is_bot=False):
        item = QListWidgetItem()
        widget = ChatMessage("AI" if is_bot else "User", message, is_bot)
        item.setSizeHint(widget.sizeHint())
        self.chat_history.addItem(item)
        self.chat_history.setItemWidget(item, widget)
        self.chat_history.scrollToBottom()
        
    def load_settings(self):
        """Load application settings"""
        try:
            with open("settings.json") as f:
                settings = json.load(f)
            self.resize(*settings.get("window_size", (1200, 800)))
            self.active_model = settings.get("default_model", "deepseek-r1:7b")
            self.dark_mode = settings.get("dark_mode", True)
            self.apply_theme()
        except FileNotFoundError:
            pass

    def show_error(self, message):
        QMessageBox.critical(self, "Error", message)
        
    def closeEvent(self, event):
        """Cleanup on exit"""
        if self.worker:
            self.worker.stop()
            self.worker.wait()
        self.save_settings()
        super().closeEvent(event)

    def save_settings(self):
        """Save application settings"""
        settings = {
            "window_size": (self.size().width(), self.size().height()),
            "window_pos": (self.pos().x(), self.pos().y()),
            "default_model": self.active_model,
            "console_visible": self.console_output.isVisible(),
            "dark_mode": self.dark_mode
        }
        try:
            with open("settings.json", "w") as f:
                json.dump(settings, f)
        except Exception as e:
            self.show_error(f"Failed to save settings: {str(e)}")

    def handle_ollama_output(self, output):
        """Handle output from Ollama"""
        try:
            message = output.strip()
            if not message:
                return

            # Parse thinking section if present
            think_match = re.match(r'<think>(.*?)</think>\s*(.*)', message, re.DOTALL)
            if think_match:
                thinking = think_match.group(1).strip()
                response = think_match.group(2).strip()
                formatted_message = response
            else:
                formatted_message = message

            # Format code blocks
            if '```' in formatted_message:
                formatted_message = self.format_code_blocks(formatted_message)

            # Update or create chat message
            self.update_chat_message(formatted_message)

            # Update console with proper formatting
            self.console_output.setPlainText(formatted_message)
            self.console_output.verticalScrollBar().setValue(
                self.console_output.verticalScrollBar().maximum()
            )

        except Exception as e:
            self.logger.error(f"Error handling output: {str(e)}")

    def format_code_blocks(self, text):
        """Format code blocks with proper indentation"""
        def replace_code_block(match):
            lang = match.group(1) or 'text'
            code = match.group(2).strip()
            # Indent code properly
            indented_code = '\n'.join('    ' + line for line in code.split('\n'))
            return f"```{lang}\n{indented_code}\n```"

        pattern = r'```(\w+)?\n(.*?)```'
        return re.sub(pattern, replace_code_block, text, flags=re.DOTALL)

if __name__ == "__main__":
    app = QApplication(sys.argv)
    
    # Set application style
    app.setStyle('Fusion')
    
    # Create and show the main window
    window = MainWindow()
    window.show()
    
    sys.exit(app.exec_())