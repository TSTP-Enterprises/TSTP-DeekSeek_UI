const sendButton = document.getElementById('sendButton');
const spinner = document.getElementById('spinner');
const progress = document.getElementById('progress');

// Initialize everything when the DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    loadSettings();
});

function toggleSidebar(sidebarId) {
    const sidebar = document.getElementById(sidebarId);
    const otherSidebarId = sidebarId === 'settings-sidebar' ? 'history-sidebar' : 'settings-sidebar';
    const otherSidebar = document.getElementById(otherSidebarId);
    
    // Close other sidebar if open
    if (otherSidebar.classList.contains('active')) {
        otherSidebar.classList.remove('active');
    }
    
    // Toggle current sidebar
    sidebar.classList.toggle('active');
}

function toggleSettings() {
    toggleSidebar('settings-sidebar');
    loadRules(); // Load rules when opening settings
}

function toggleHistory() {
    toggleSidebar('history-sidebar');
    loadHistory(); // Load history when opening sidebar
}

function formatMessage(message) {
    let formattedMessage = '';
    let codeBlockOpen = false;
    let currentLanguage = '';
    let currentCode = '';
    
    // Split message into lines to process code blocks
    const lines = message.split('\n');
    
    for (let line of lines) {
        // Check for code block start
        const startMatch = line.match(/^```(\w+)?/);
        if (startMatch && !codeBlockOpen) {
            codeBlockOpen = true;
            currentLanguage = startMatch[1] || 'plaintext';
            // Start code block HTML
            formattedMessage += `
                <div class="code-block">
                    <div class="code-header">
                        <span class="code-language">${currentLanguage}</span>
                        <div class="code-actions">
                            <button onclick="copyCodeBlock(this)" class="action-button" title="Copy code">
                                <i class="fas fa-copy"></i>
                            </button>
                            <button onclick="saveCodeBlock(this)" class="action-button" title="Save to file">
                                <i class="fas fa-save"></i>
                            </button>
                            <button onclick="runCodeBlock(this)" class="action-button" title="Run code">
                                <i class="fas fa-play"></i>
                            </button>
                        </div>
                    </div>
                    <pre><code class="language-${currentLanguage}">`;
            // Remove the opening ``` from the line
            line = line.replace(/^```(\w+)?/, '');
        }
        
        // Check for code block end
        if (line.includes('```') && codeBlockOpen) {
            codeBlockOpen = false;
            // Remove the closing ``` from the line
            line = line.replace(/```$/, '');
            if (line.trim()) {
                formattedMessage += escapeHtml(line) + '\n';
            }
            formattedMessage += `</code></pre></div>`;
            continue;
        }
        
        // Handle content based on whether we're in a code block
        if (codeBlockOpen) {
            formattedMessage += escapeHtml(line) + '\n';
        } else {
            // Regular text - replace newlines with <br> tags
            formattedMessage += line + '<br>';
        }
    }
    
    // Close any open code block (in case of malformed input)
    if (codeBlockOpen) {
        formattedMessage += `</code></pre></div>`;
    }
    
    return formattedMessage;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function copyCodeBlock(button) {
    const codeBlock = button.closest('.code-block').querySelector('code');
    const text = codeBlock.innerText; // Use innerText to preserve formatting
    
    try {
        await navigator.clipboard.writeText(text);
        const icon = button.querySelector('i');
        const originalClass = icon.className;
        icon.className = 'fas fa-check';
        button.classList.add('success');
        setTimeout(() => {
            icon.className = originalClass;
            button.classList.remove('success');
        }, 2000);
    } catch (err) {
        console.error('Failed to copy:', err);
        button.classList.add('error');
        setTimeout(() => {
            button.classList.remove('error');
        }, 2000);
    }
}

async function saveCodeBlock(button) {
    const codeBlock = button.closest('.code-block');
    const code = codeBlock.querySelector('code').innerText;
    let language = codeBlock.querySelector('.code-language')?.textContent?.toLowerCase() || 'txt';
    
    // Map language identifiers to proper file extensions
    const extensionMap = {
        'python': 'py',
        'py': 'py',
        'javascript': 'js',
        'js': 'js',
        'html': 'html',
        'css': 'css',
        'php': 'php',
        'csharp': 'cs',
        'c#': 'cs',
        'ruby': 'rb',
        'powershell': 'ps1',
        'shell': 'sh',
        'bash': 'sh',
        'typescript': 'ts',
        'ts': 'ts',
        'java': 'java',
        'sql': 'sql',
        'yaml': 'yml',
        'json': 'json',
        'xml': 'xml',
        'markdown': 'md',
        'md': 'md'
    };

    // Get the proper file extension
    const extension = extensionMap[language] || language;
    
    // Create a default filename based on language
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const defaultFilename = `code_${timestamp}.${extension}`;
    
    // Prompt for filename
    const filename = prompt('Enter filename to save as:', defaultFilename);
    if (!filename) return;

    try {
        const blob = new Blob([code], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        const icon = button.querySelector('i');
        const originalClass = icon.className;
        icon.className = 'fas fa-check';
        button.classList.add('success');
        setTimeout(() => {
            icon.className = originalClass;
            button.classList.remove('success');
        }, 2000);
    } catch (err) {
        console.error('Failed to save:', err);
        button.classList.add('error');
        setTimeout(() => {
            button.classList.remove('error');
        }, 2000);
    }
}

async function runCodeBlock(button) {
    const codeBlock = button.closest('.code-block');
    const code = codeBlock.querySelector('code').innerText;
    const language = codeBlock.querySelector('.code-language')?.textContent?.toLowerCase() || '';
    
    button.disabled = true;
    const icon = button.querySelector('i');
    const originalClass = icon.className;
    icon.className = 'fas fa-spinner fa-spin';
    
    try {
        // Special handling for HTML and CSS
        if (language === 'html') {
            // Create new window and write HTML content
            const newWindow = window.open('', '_blank');
            if (newWindow) {
                newWindow.document.write(code);
                newWindow.document.close();
                icon.className = 'fas fa-check';
                button.classList.add('success');
            } else {
                throw new Error('Popup blocked. Please allow popups to run HTML code.');
            }
        } else if (language === 'css') {
            // Create new window with CSS preview
            const newWindow = window.open('', '_blank');
            if (newWindow) {
                newWindow.document.write(`
                    <html>
                        <head>
                            <style>${code}</style>
                        </head>
                        <body>
                            <div class="css-preview">
                                <h2>CSS Preview</h2>
                                <pre>${escapeHtml(code)}</pre>
                            </div>
                        </body>
                    </html>
                `);
                newWindow.document.close();
                icon.className = 'fas fa-check';
                button.classList.add('success');
            } else {
                throw new Error('Popup blocked. Please allow popups to preview CSS.');
            }
        } else {
            // Handle other languages with the existing API
            const response = await fetch('/execute-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, language })
            });
            
            const data = await response.json();
            
            if (data.error) {
                console.error('Error running code:', data.error);
                button.classList.add('error');
                
                // Format and display the error message
                const errorMessage = formatErrorMessage(data.error, language);
                const messageDiv = document.createElement('div');
                messageDiv.className = 'error-message';
                messageDiv.innerHTML = errorMessage;
                
                // Add to chat
                const chat = document.getElementById('chat');
                chat.appendChild(messageDiv);
                chat.scrollTop = chat.scrollHeight;
            } else {
                icon.className = 'fas fa-check';
                button.classList.add('success');
                if (data.output) {
                    addMessage(`Code output:\n${data.output}`, true);
                }
            }
        }
    } catch (err) {
        console.error('Failed to run code:', err);
        button.classList.add('error');
        
        // Format and display the error message
        const errorMessage = formatErrorMessage(err.message, language);
        const messageDiv = document.createElement('div');
        messageDiv.className = 'error-message';
        messageDiv.innerHTML = errorMessage;
        
        // Add to chat
        const chat = document.getElementById('chat');
        chat.appendChild(messageDiv);
        chat.scrollTop = chat.scrollHeight;
    } finally {
        button.disabled = false;
        setTimeout(() => {
            icon.className = originalClass;
            button.classList.remove('error', 'success');
        }, 2000);
    }
}

function formatErrorMessage(error, language) {
    // Extract line number and error type from common error formats
    const syntaxErrorMatch = error.match(/line (\d+)/);
    const lineNumber = syntaxErrorMatch ? syntaxErrorMatch[1] : null;
    
    let errorHTML = `
        <div class="error-title">
            <i class="fas fa-exclamation-circle"></i>
            Error running ${language} code
        </div>
        <div class="error-details">
    `;

    if (lineNumber) {
        // Split the error message into lines
        const errorLines = error.split('\n');
        errorHTML += `<div class="error-context">`;
        
        errorLines.forEach(line => {
            if (line.includes(`line ${lineNumber}`)) {
                errorHTML += `<div class="error-line">${escapeHtml(line)}</div>`;
            } else {
                errorHTML += `<div>${escapeHtml(line)}</div>`;
            }
        });
        
        errorHTML += `</div>`;
    } else {
        errorHTML += `<div class="error-context">${escapeHtml(error)}</div>`;
    }

    errorHTML += `</div>`;
    return errorHTML;
}

function addMessage(message, isBot = false, isPending = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isBot ? 'bot-message' : 'user-message'}`;
    if (isPending) messageDiv.classList.add('pending');
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    messageDiv.appendChild(contentDiv);
    
    // Add to chat
    const chat = document.getElementById('chat');
    chat.appendChild(messageDiv);
    
    // Update content
    contentDiv.innerHTML = formatMessage(message);
    
    // Scroll to bottom
    chat.scrollTop = chat.scrollHeight;
    
    return messageDiv;
}

function updateMessageContent(messageDiv, content) {
    const contentDiv = messageDiv.querySelector('.message-content');
    if (contentDiv) {
        contentDiv.innerHTML = formatMessage(content);
        const chat = document.getElementById('chat');
        chat.scrollTop = chat.scrollHeight;
    }
}

function initializeCodeBlocks(container) {
    // Since we're using onclick attributes now, we don't need to add event listeners
    // This function is kept for backward compatibility and potential future use
    return container;
}

async function sendMessage() {
    const messageInput = document.getElementById('message');
    const message = messageInput.value;
    if (!message) return;
    
    // Disable input and show loading state
    sendButton.disabled = true;
    spinner.style.display = 'block';
    updateProgress('thinking');
    
    // Add user message immediately
    addMessage(message, false);
    messageInput.value = '';
    
    try {
        const response = await fetch('/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: message })
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let currentBotMessage = null;
        let fullResponse = '';
        let lastUpdateTime = Date.now();
        const updateInterval = 50; // Update more frequently (changed from 100ms)

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(5).trim());
                        if (data.response) {
                            fullResponse = data.response;
                            
                            // Always update immediately when a code block starts or ends
                            const shouldUpdateImmediately = 
                                fullResponse.includes('```') || 
                                (currentBotMessage && Date.now() - lastUpdateTime >= updateInterval);

                            if (!currentBotMessage) {
                                currentBotMessage = addMessage(fullResponse, true);
                            } else if (shouldUpdateImmediately) {
                                const messageContent = currentBotMessage.querySelector('.message-content');
                                if (messageContent) {
                                    messageContent.innerHTML = formatMessage(fullResponse);
                                    lastUpdateTime = Date.now();
                                }
                            }
                        }
                    } catch (e) {
                        console.error('Error parsing SSE data:', e);
                    }
                }
            }
        }

        // Ensure final state is displayed
        if (currentBotMessage) {
            const messageContent = currentBotMessage.querySelector('.message-content');
            if (messageContent) {
                messageContent.innerHTML = formatMessage(fullResponse);
            }
        }
        
        updateProgress('success');
    } catch (error) {
        console.error('Error:', error);
        addMessage('Error: Failed to get response', true);
        updateProgress('error');
    } finally {
        sendButton.disabled = false;
        spinner.style.display = 'none';
    }
}

// Allow Enter key to send message
document.getElementById('message').addEventListener('keypress', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

function updateProgress(status) {
    progress.className = 'progress ' + status;
    switch(status) {
        case 'thinking':
            progress.style.width = '50%';
            break;
        case 'error':
            progress.style.width = '100%';
            break;
        case 'success':
            progress.style.width = '100%';
            setTimeout(() => {
                progress.style.width = '0';
                progress.className = 'progress';
            }, 1000);
            break;
        default:
            progress.style.width = '0';
    }
}

async function loadSettings() {
    try {
        const response = await fetch('/settings');
        const settings = await response.json();
        
        // Create settings UI
        const settingsSection = document.querySelector('.settings-section');
        settingsSection.innerHTML = '';
        
        settings.forEach(setting => {
            const settingDiv = document.createElement('div');
            settingDiv.className = 'setting-item';
            
            const label = document.createElement('label');
            label.className = 'setting-label';
            label.textContent = setting.label;
            
            let input;
            if (setting.type === 'checkbox') {
                input = document.createElement('input');
                input.type = 'checkbox';
                input.checked = setting.value === 'true';
                input.dataset.setting = setting.name;
            } else if (setting.type === 'number') {
                input = document.createElement('input');
                input.type = 'number';
                input.value = setting.value;
                input.dataset.setting = setting.name;
            } else if (setting.type === 'select' && setting.options) {
                input = document.createElement('select');
                input.dataset.setting = setting.name;
                JSON.parse(setting.options).forEach(option => {
                    const opt = document.createElement('option');
                    opt.value = option;
                    opt.textContent = option;
                    opt.selected = option === setting.value;
                    input.appendChild(opt);
                });
            } else {
                input = document.createElement('input');
                input.type = 'text';
                input.value = setting.value;
                input.dataset.setting = setting.name;
            }
            
            input.addEventListener('change', () => {
                const value = input.type === 'checkbox' ? input.checked : input.value;
                updateSetting(setting.name, value);
                
                // Immediately update display for relevant settings
                if (setting.name === 'show_thinking') {
                    refreshMessageDisplay();
                }
            });
            
            settingDiv.appendChild(label);
            settingDiv.appendChild(input);
            settingsSection.appendChild(settingDiv);
        });
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

function refreshMessageDisplay() {
    const chatDiv = document.getElementById('chat');
    const messages = Array.from(chatDiv.children);
    messages.forEach(messageDiv => {
        if (messageDiv.classList.contains('bot-message')) {
            const messageContent = messageDiv.querySelector('.message-content')?.textContent;
            const thinkingSection = messageDiv.querySelector('.thinking-section');
            if (thinkingSection) {
                const thinkingContent = thinkingSection.textContent;
                const fullMessage = `<think>${thinkingContent}</think>${messageContent}`;
                const newMessageDiv = addMessage(fullMessage, true);
                messageDiv.replaceWith(newMessageDiv);
            }
        }
    });
}

async function updateSetting(name, value) {
    try {
        const response = await fetch('/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, value: value.toString() })
        });
        
        if (response.ok) {
            // Refresh all messages in the chat to reflect new settings
            refreshMessageDisplay();
        }
    } catch (error) {
        console.error('Error updating setting:', error);
    }
}

async function loadRules() {
    try {
        const response = await fetch('/rules');
        const rules = await response.text();
        document.getElementById('rules-editor').value = rules;
    } catch (error) {
        console.error('Error loading rules:', error);
    }
}

async function saveRules() {
    try {
        const rules = document.getElementById('rules-editor').value;
        const response = await fetch('/rules', {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: rules
        });
        
        if (response.ok) {
            updateProgress('success');
        } else {
            updateProgress('error');
        }
    } catch (error) {
        console.error('Error saving rules:', error);
        updateProgress('error');
    }
}

async function loadHistory() {
    try {
        const response = await fetch('/history');
        const history = await response.json();
        const historyList = document.getElementById('history-list');
        historyList.innerHTML = '';
        
        // Group conversations by date
        const groupedHistory = history.reduce((groups, item) => {
            const date = new Date(item.timestamp).toLocaleDateString();
            if (!groups[date]) {
                groups[date] = [];
            }
            groups[date].push(item);
            return groups;
        }, {});
        
        // Create sections for each date
        Object.entries(groupedHistory).forEach(([date, items]) => {
            const dateSection = document.createElement('div');
            dateSection.className = 'history-date-section';
            dateSection.innerHTML = `<div class="history-date">${date}</div>`;
            
            items.forEach(item => {
                const historyItem = document.createElement('div');
                historyItem.className = 'history-item';
                const time = new Date(item.timestamp).toLocaleTimeString();
                const preview = item.user_message.substring(0, 50) + (item.user_message.length > 50 ? '...' : '');
                
                historyItem.innerHTML = `
                    <div class="history-time">${time}</div>
                    <div class="history-preview">${preview}</div>
                `;
                
                historyItem.onclick = () => loadConversationContext(item.id);
                dateSection.appendChild(historyItem);
            });
            
            historyList.appendChild(dateSection);
        });
    } catch (error) {
        console.error('Error loading history:', error);
    }
}

async function loadConversationContext(id) {
    try {
        const response = await fetch(`/conversation/${id}`);
        const conversation = await response.json();
        
        // Get the full conversation context
        const contextResponse = await fetch('/history');
        const allConversations = await contextResponse.json();
        
        // Find the index of the selected conversation
        const selectedIndex = allConversations.findIndex(conv => conv.id === id);
        if (selectedIndex === -1) return;
        
        // Get conversations from the start of the current chat session
        // (conversations until we find a significant time gap, e.g., > 30 minutes)
        const contextConversations = [];
        const timeGapThreshold = 30 * 60 * 1000; // 30 minutes in milliseconds
        
        for (let i = selectedIndex; i < allConversations.length; i++) {
            const current = allConversations[i];
            const next = allConversations[i + 1];
            
            contextConversations.push(current);
            
            if (next) {
                const timeGap = new Date(current.timestamp) - new Date(next.timestamp);
                if (timeGap > timeGapThreshold) break;
            }
        }
        
        // Clear chat and add all messages in context
        document.getElementById('chat').innerHTML = '';
        contextConversations.reverse().forEach(conv => {
            addMessage(conv.user_message, false);
            addMessage(conv.ai_response, true);
        });
        
        // Close the history sidebar
        toggleHistory();
        
    } catch (error) {
        console.error('Error loading conversation:', error);
    }
}

async function exportHistory() {
    try {
        const response = await fetch('/export-history');
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `chat-history-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Error exporting history:', error);
    }
}

async function clearHistory() {
    if (confirm('Are you sure you want to clear all chat history? This cannot be undone.')) {
        try {
            const response = await fetch('/clear-history', { method: 'POST' });
            if (response.ok) {
                document.getElementById('history-list').innerHTML = '';
                updateProgress('success');
            } else {
                updateProgress('error');
            }
        } catch (error) {
            console.error('Error clearing history:', error);
            updateProgress('error');
        }
    }
}