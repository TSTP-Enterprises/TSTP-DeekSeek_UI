const sendButton = document.getElementById('sendButton');
const spinner = document.getElementById('spinner');
const progress = document.getElementById('progress');

// Global variables
let messageInput = null;
let currentResponse = '';
let isProcessing = false;
let currentMessageDiv = null;
let progressBar = null;
let isStreaming = true;

// Add global settings object
let currentSettings = {
    show_thinking: false,
    remove_thinking_tags: true
};

// Update the sidebar state management
const SIDEBAR_STATES = {
    'chats-sidebar': false,
    'settings-sidebar': false,
    'history-sidebar': false
};

// Initialize everything when the DOM is loaded
document.addEventListener('DOMContentLoaded', async function() {
    // Initialize message input
    messageInput = document.getElementById('message-input');
    if (messageInput) {
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }
    
    // Initialize send button
    const sendButton = document.getElementById('sendButton');
    if (sendButton) {
        sendButton.addEventListener('click', sendMessage);
    }
    
    // Initialize progress bar
    progressBar = document.querySelector('.input-area .progress');
    
    // Restore sidebar states from localStorage
    const savedStates = localStorage.getItem('sidebarStates');
    if (savedStates) {
        const states = JSON.parse(savedStates);
        Object.entries(states).forEach(([id, isActive]) => {
            const sidebar = document.getElementById(id);
            if (sidebar) {
                if (isActive) {
                    sidebar.classList.add('active');
                    SIDEBAR_STATES[id] = true;
                    // Load content for active sidebars
                    switch(id) {
                        case 'chats-sidebar':
                            loadProjects();
                            loadPreviousChats();
                            break;
                        case 'settings-sidebar':
                            loadSettings();
                            loadRules();
                            break;
                        case 'history-sidebar':
                            loadHistory();
                            break;
                    }
                } else {
                    sidebar.classList.remove('active');
                    SIDEBAR_STATES[id] = false;
                }
            }
        });
    }
    
    // Initialize modals
    initializeModals();
    
    // Load initial settings
    loadSettings();
    
    // Initialize projects
    loadProjects();
    
    // Initialize scroll observer
    setupScrollObserver();
});

function toggleSidebar(sidebarId) {
    const sidebar = document.getElementById(sidebarId);
    if (!sidebar) return;

    // Close other sidebars first
    Object.keys(SIDEBAR_STATES).forEach(id => {
        if (id !== sidebarId) {
            const otherSidebar = document.getElementById(id);
            if (otherSidebar && otherSidebar.classList.contains('active')) {
                otherSidebar.classList.remove('active');
                SIDEBAR_STATES[id] = false;
            }
        }
    });

    // Toggle current sidebar
    const willBeActive = !sidebar.classList.contains('active');
    sidebar.classList.toggle('active');
    SIDEBAR_STATES[sidebarId] = willBeActive;

    // Load content if sidebar is being opened
    if (willBeActive) {
        switch(sidebarId) {
            case 'chats-sidebar':
                loadProjects();
                loadPreviousChats();
                break;
            case 'settings-sidebar':
                loadSettings();
                loadRules();
                break;
            case 'history-sidebar':
                loadHistory();
                break;
        }
    }

    // Save state to localStorage
    localStorage.setItem('sidebarStates', JSON.stringify(SIDEBAR_STATES));
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
                            <button onclick="copyCodeBlock(this)" class="code-action-button" title="Copy code">
                                <i class="fas fa-copy"></i>
                            </button>
                            <button onclick="saveCodeBlock(this)" class="code-action-button" title="Save to file">
                                <i class="fas fa-save"></i>
                            </button>
                            <button onclick="runCodeBlock(this)" class="code-action-button" title="Run code">
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
    
    // Add sender label
    const senderLabel = document.createElement('div');
    senderLabel.className = 'message-sender';
    senderLabel.textContent = isBot ? 'AI' : 'User';
    messageDiv.appendChild(senderLabel);
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    messageDiv.appendChild(contentDiv);
    
    // Add message ID for history navigation
    if (message.id) {
        messageDiv.dataset.messageId = message.id;
    }
    
    // Add to chat
    const chat = document.getElementById('chat');
    chat.appendChild(messageDiv);
    
    // Update content, ensuring no leading blank space
    contentDiv.innerHTML = formatMessage(message.trim());
    
    // Scroll to bottom
    chat.scrollTop = chat.scrollHeight;
    
    return messageDiv;
}

function updateMessageContent(messageDiv, content, thinking = null, rawResponse = null, rawThinking = null, mainResponse = null, isThinking = false) {
    if (!messageDiv) return;
    
    // Store all versions in the message div for later updates
    if (rawResponse !== null) messageDiv.dataset.rawResponse = rawResponse;
    if (rawThinking !== null) messageDiv.dataset.rawThinking = rawThinking;
    if (mainResponse !== null) messageDiv.dataset.mainResponse = mainResponse;
    
    // Get or create the content div
    let contentDiv = messageDiv.querySelector('.message-content');
    if (!contentDiv) {
        contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        messageDiv.appendChild(contentDiv);
    }
    
    // Get or create the thinking section
    let thinkingSection = messageDiv.querySelector('.thinking-section');
    if (!thinkingSection) {
        thinkingSection = document.createElement('div');
        thinkingSection.className = 'thinking-section';
        messageDiv.insertBefore(thinkingSection, contentDiv);
    }
    
    // Get or create the loading overlay
    let loadingOverlay = messageDiv.querySelector('.loading-overlay');
    if (!loadingOverlay) {
        loadingOverlay = document.createElement('div');
        loadingOverlay.className = 'loading-overlay';
        loadingOverlay.innerHTML = '<div class="loading-message">Show Thinking Disabled - Loading Response</div>';
        messageDiv.appendChild(loadingOverlay);
    }
    
    // Update content based on current settings and state
    if (thinking !== null) {
        thinkingSection.dataset.thinking = thinking; // Store the thinking content
        if (currentSettings.show_thinking) {
            thinkingSection.textContent = thinking;
            thinkingSection.classList.add('visible');
            loadingOverlay.classList.remove('visible');
            // Auto-scroll when thinking content updates
            autoScroll();
        } else {
            thinkingSection.classList.remove('visible');
            // Show loading overlay only during thinking phase
            if (isThinking) {
                loadingOverlay.classList.add('visible');
            } else {
                loadingOverlay.classList.remove('visible');
            }
        }
    }
    
    contentDiv.innerHTML = formatMessage(content.trim());
    
    // Auto-scroll when content updates
    autoScroll();
}

function autoScroll() {
    const chat = document.getElementById('chat');
    const lastMessage = chat.lastElementChild;
    
    if (lastMessage) {
        const messageRect = lastMessage.getBoundingClientRect();
        const chatRect = chat.getBoundingClientRect();
        
        // Check if the last message is partially or fully below the visible area
        if (messageRect.bottom > chatRect.bottom) {
            // Calculate how much of the message is visible
            const visibleHeight = chatRect.bottom - messageRect.top;
            const messageHeight = messageRect.height;
            const visibleRatio = visibleHeight / messageHeight;
            
            // If less than 20% of the message is visible, scroll to show the full message
            if (visibleRatio < 0.2) {
                chat.scrollTo({
                    top: chat.scrollHeight,
                    behavior: 'smooth'
                });
            }
        }
    }
}

// Add scroll observer to handle auto-scrolling
let isAutoScrollEnabled = true;
let lastScrollTop = 0;

function setupScrollObserver() {
    const chat = document.getElementById('chat');
    if (!chat) return;
    
    // Handle manual scroll
    chat.addEventListener('scroll', () => {
        const currentScrollTop = chat.scrollTop;
        const maxScroll = chat.scrollHeight - chat.clientHeight;
        
        // If user scrolls up, disable auto-scroll
        if (currentScrollTop < lastScrollTop) {
            isAutoScrollEnabled = false;
        }
        
        // If user scrolls to bottom, re-enable auto-scroll
        if (Math.abs(currentScrollTop - maxScroll) < 10) {
            isAutoScrollEnabled = true;
        }
        
        lastScrollTop = currentScrollTop;
    });
}

function initializeCodeBlocks(container) {
    // Since we're using onclick attributes now, we don't need to add event listeners
    // This function is kept for backward compatibility and potential future use
    return container;
}

async function sendMessage() {
    if (!messageInput || isProcessing) return;
    
    const message = messageInput.value.trim();
    if (!message) return;
    
    isProcessing = true;
    messageInput.value = '';
    updateProgress('thinking');
    
    // Create a new unsaved chat if we don't have one
    if (!currentChat) {
        const newChat = await createUnsavedChat();
        if (!newChat) {
            showError('Failed to create new chat');
            isProcessing = false;
            return;
        }
        currentChat = { id: newChat.id, title: newChat.title };
        await loadPreviousChats();
    }
    
    // Add user message
    const userMessageDiv = addMessage(message, false);
    
    try {
        // Create initial message div for AI response
        currentMessageDiv = addMessage('', true, true);
        
        // Create form data with project and chat IDs
        const data = {
            message,
            project_id: currentProject?.id || null,
            chat_id: currentChat?.id || null
        };
        
        // Make the initial POST request
        const response = await fetch('/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let messageId = null;
        
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            
            // Process complete SSE messages
            const messages = buffer.split('\n\n');
            buffer = messages.pop() || '';
            
            for (const message of messages) {
                if (message.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(message.slice(6));
                        
                        if (data.error) {
                            showError(data.error);
                            updateProgress('error');
                            return;
                        }
                        
                        // Store message ID if provided
                        if (data.message_id) {
                            messageId = data.message_id;
                            if (userMessageDiv) userMessageDiv.dataset.messageId = messageId;
                            if (currentMessageDiv) currentMessageDiv.dataset.messageId = messageId;
                        }
                        
                        // Update current settings if provided
                        if (data.settings) {
                            Object.entries(data.settings).forEach(([key, value]) => {
                                currentSettings[key] = value === 'true';
                            });
                        }
                        
                        // Update message content with all versions
                        if (data.response !== undefined) {
                            updateMessageContent(
                                currentMessageDiv,
                                data.response,
                                data.thinking,
                                data.raw_response,
                                data.raw_thinking,
                                data.main_response,
                                data.in_thinking
                            );
                            
                            // Update progress
                            if (data.done) {
                                updateProgress('success');
                            } else {
                                updateProgress('streaming');
                            }
                        }
                    } catch (e) {
                        console.error('Error parsing SSE data:', e);
                    }
                }
            }
        }
        
        updateProgress('success');
    } catch (error) {
        console.error('Error sending message:', error);
        showError('Failed to send message');
        updateProgress('error');
    } finally {
        isProcessing = false;
    }
}

function updateProgress(status) {
    if (!progressBar) {
        progressBar = document.querySelector('.input-area .progress');
        if (!progressBar) return;
    }
    
    progressBar.className = 'progress ' + status;
    switch(status) {
        case 'thinking':
            progressBar.style.width = '30%';
            break;
        case 'streaming':
            progressBar.style.width = '60%';
            progressBar.style.transition = 'width 0.3s ease-in-out';
            break;
        case 'error':
            progressBar.style.width = '100%';
            progressBar.style.background = 'var(--error)';
            break;
        case 'success':
            progressBar.style.width = '100%';
            progressBar.style.background = 'var(--success)';
            setTimeout(() => {
                progressBar.style.width = '0';
                progressBar.className = 'progress';
                progressBar.style.background = '';
            }, 1000);
            break;
        default:
            progressBar.style.width = '0';
            progressBar.style.background = '';
            progressBar.style.transition = '';
    }
}

function showError(message) {
    // Add error message to chat
    const errorDiv = document.createElement('div');
    errorDiv.className = 'message error-message';
    errorDiv.textContent = `Error: ${message}`;
    document.getElementById('chat')?.appendChild(errorDiv);
}

function showSuccess(message) {
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.textContent = message;
    document.getElementById('chat').appendChild(successDiv);
}

async function loadSettings() {
    try {
        const response = await fetch('/settings');
        const settings = await response.json();
        
        // Create settings UI
        const settingsSection = document.querySelector('.settings-section');
        if (!settingsSection) return;
        
        settingsSection.innerHTML = '';
        
        settings.forEach(setting => {
            // Update current settings
            if (setting.name in currentSettings) {
                currentSettings[setting.name] = setting.value === 'true';
            }
            
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
            // Update current settings
            currentSettings[name] = value === 'true' || value === true;
            
            // Update all existing messages
            const chat = document.getElementById('chat');
            const messages = chat.querySelectorAll('.bot-message');
            
            messages.forEach(messageDiv => {
                const rawResponse = messageDiv.dataset.rawResponse;
                const rawThinking = messageDiv.dataset.rawThinking;
                const mainResponse = messageDiv.dataset.mainResponse;
                
                if (rawResponse) {
                    let displayResponse = mainResponse || '';
                    let displayThinking = '';
                    
                    // Handle thinking display based on settings
                    if (currentSettings.show_thinking && rawThinking) {
                        if (currentSettings.remove_thinking_tags) {
                            displayThinking = rawThinking;
                        } else {
                            displayThinking = `<think>${rawThinking}</think>`;
                        }
                    }
                    
                    updateMessageContent(
                        messageDiv,
                        displayResponse,
                        displayThinking,
                        rawResponse,
                        rawThinking,
                        mainResponse
                    );
                }
            });
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
        const chatId = currentChat?.id;
        const url = chatId ? `/history?chat_id=${chatId}` : '/history';
        const response = await fetch(url);
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
                const projectInfo = item.project_name ? `<div class="history-project">${item.project_name} / ${item.chat_title || 'General Chat'}</div>` : '';
                
                historyItem.innerHTML = `
                    <div class="history-time">${time}</div>
                    ${projectInfo}
                    <div class="history-preview">${preview}</div>
                `;
                
                historyItem.onclick = async () => {
                    try {
                        // Load the conversation context
                        const messageResponse = await fetch(`/messages/${item.id}`);
                        const message = await messageResponse.json();
                        
                        if (message.chat_id) {
                            // Update current project and chat
                            currentProject = { id: message.project_id };
                            currentChat = { id: message.chat_id };
                            
                            // Load the chat and scroll to message
                            await loadChat(message.chat_id);
                            
                            setTimeout(() => {
                                const messageElement = document.querySelector(`[data-message-id="${item.id}"]`);
                                if (messageElement) {
                                    messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    messageElement.classList.add('highlight');
                                    setTimeout(() => messageElement.classList.remove('highlight'), 2000);
                                }
                            }, 100);
                        }
                        
                        toggleHistory(); // Close the history sidebar
                    } catch (error) {
                        console.error('Error loading conversation:', error);
                    }
                };
                
                dateSection.appendChild(historyItem);
            });
            
            historyList.appendChild(dateSection);
        });
    } catch (error) {
        console.error('Error loading history:', error);
    }
}

async function loadConversationContext(messageId) {
    try {
        const response = await fetch(`/messages/${messageId}`);
        const message = await response.json();
        
        if (message.chat_id) {
            await loadChat(message.chat_id);
            
            // Scroll to the specific message
            setTimeout(() => {
                const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
                if (messageElement) {
                    messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    messageElement.classList.add('highlight');
                    setTimeout(() => messageElement.classList.remove('highlight'), 2000);
                }
            }, 100);
        }
        
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
    if (!confirm('Are you sure you want to clear the chat history? This cannot be undone.')) return;
    
    try {
        const chatId = currentChat?.id;
        const url = chatId ? `/clear-history?chat_id=${chatId}` : '/clear-history';
        const response = await fetch(url, { method: 'POST' });
        
        if (response.ok) {
            document.getElementById('history-list').innerHTML = '';
            if (chatId) {
                document.getElementById('chat').innerHTML = '';
            }
            updateProgress('success');
        } else {
            updateProgress('error');
        }
    } catch (error) {
        console.error('Error clearing history:', error);
        updateProgress('error');
    }
}

// Add these functions for chat management
function toggleChats() {
    toggleSidebar('chats-sidebar');
    loadProjects();
}

async function loadProjects() {
    try {
        const response = await fetch('/projects');
        const projects = await response.json();
        const projectsList = document.querySelector('.projects-list');
        if (!projectsList) return;

        projectsList.innerHTML = '';

        // Get expanded states
        const expandedProjects = JSON.parse(localStorage.getItem('expandedProjects') || '{}');

        projects.forEach(project => {
            const isExpanded = expandedProjects[project.id] || false;
            const projectDiv = createProjectElement(project, isExpanded);
            projectsList.appendChild(projectDiv);
        });

        // If we have a current project, ensure it's expanded
        if (currentProject?.id) {
            const currentProjectHeader = document.querySelector(`.project-header[data-project-id="${currentProject.id}"]`);
            if (currentProjectHeader) {
                const chatList = currentProjectHeader.nextElementSibling;
                const folderIcon = currentProjectHeader.querySelector('.fa-folder, .fa-folder-open');
                chatList.classList.add('active');
                folderIcon.classList.remove('fa-folder');
                folderIcon.classList.add('fa-folder-open');
            }
        }
    } catch (error) {
        console.error('Error loading projects:', error);
    }
}

function createProjectElement(project, isExpanded = false) {
    const div = document.createElement('div');
    div.className = 'project-item';
    div.innerHTML = `
        <div class="project-header" data-project-id="${project.id}" onclick="toggleProjectChats(this)">
            <div class="project-title">
                <i class="fas fa-folder${isExpanded || project.id === currentProject?.id ? '-open' : ''}"></i>
                <span>${project.name}</span>
            </div>
            <div class="project-actions">
                <button onclick="event.stopPropagation(); togglePinProject(${project.id}, ${!project.is_pinned})" class="action-button" title="Pin Project">
                    <i class="fas fa-thumbtack ${project.is_pinned ? 'pinned' : ''}"></i>
                </button>
                <button onclick="event.stopPropagation(); showEditProjectModal(${JSON.stringify(project)})" class="action-button" title="Edit Project">
                    <i class="fas fa-edit"></i>
                </button>
                <button onclick="event.stopPropagation(); deleteProject(${project.id})" class="action-button" title="Delete Project">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
        <div class="chat-list ${isExpanded || project.id === currentProject?.id ? 'active' : ''}">
            ${project.chats?.map(chat => createChatElement(chat)).join('') || ''}
            <div class="chat-item new-chat" onclick="showNewChatModal(${project.id})">
                <i class="fas fa-plus"></i> New Chat
            </div>
        </div>
    `;
    return div;
}

async function createNewProject() {
    const name = prompt('Enter project name:');
    if (!name) return;
    
    try {
        const response = await fetch('/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        
        if (response.ok) {
            loadProjects();
        }
    } catch (error) {
        console.error('Error creating project:', error);
    }
}

function toggleProjectChats(header) {
    const chatList = header.nextElementSibling;
    const folderIcon = header.querySelector('.fa-folder, .fa-folder-open');
    const projectId = header.getAttribute('data-project-id');
    
    chatList.classList.toggle('active');
    folderIcon.classList.toggle('fa-folder');
    folderIcon.classList.toggle('fa-folder-open');

    // Save project expansion state
    const expandedProjects = JSON.parse(localStorage.getItem('expandedProjects') || '{}');
    expandedProjects[projectId] = chatList.classList.contains('active');
    localStorage.setItem('expandedProjects', JSON.stringify(expandedProjects));
}

// Add other necessary functions for project/chat management

// Server control functions
function showRestartModal() {
    const modal = document.getElementById('restart-modal');
    modal.style.display = 'flex';
    modal.classList.add('show');
}

function showShutdownModal() {
    const modal = document.getElementById('shutdown-modal');
    modal.style.display = 'flex';
    modal.classList.add('show');
}

async function confirmRestart() {
    try {
        closeModal('restart-modal');
        showServerMessage('Restarting server...', 'warning');
        
        const response = await fetch('/server/restart', { method: 'POST' });
        if (response.ok) {
            showServerMessage('Server is restarting...', 'warning');
            // Wait for server to come back online
            await waitForServer();
            showServerMessage('Server restarted successfully!', 'success');
            // Reload the page after successful restart
            setTimeout(() => window.location.reload(), 2000);
        } else {
            showServerMessage('Failed to restart server', 'error');
        }
    } catch (error) {
        console.error('Error restarting server:', error);
        showServerMessage('Failed to restart server', 'error');
    }
}

async function confirmShutdown() {
    try {
        closeModal('shutdown-modal');
        showServerMessage('Shutting down server...', 'warning');
        
        const response = await fetch('/server/shutdown', { method: 'POST' });
        if (response.ok) {
            showServerMessage('Server is shutting down...', 'warning');
            // Show final message before server becomes unavailable
            setTimeout(() => {
                showServerMessage('Server has been shut down. Please restart manually.', 'success');
            }, 2000);
        } else {
            showServerMessage('Failed to shutdown server', 'error');
        }
    } catch (error) {
        console.error('Error shutting down server:', error);
        showServerMessage('Failed to shutdown server', 'error');
    }
}

async function waitForServer() {
    const maxAttempts = 30; // 30 seconds timeout
    let attempts = 0;
    
    while (attempts < maxAttempts) {
        try {
            const response = await fetch('/health');
            if (response.ok) {
                return true;
            }
        } catch (error) {
            // Server not ready yet
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
    }
    
    throw new Error('Server failed to restart');
}

function showServerMessage(message, type) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `server-message ${type}`;
    messageDiv.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'warning' ? 'exclamation-triangle' : 'times-circle'}"></i>
        ${message}
    `;
    document.body.appendChild(messageDiv);
    
    setTimeout(() => {
        messageDiv.classList.add('fade-out');
        setTimeout(() => messageDiv.remove(), 300);
    }, 5000);
}

// Modal handling
function initializeModals() {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        const closeBtn = modal.querySelector('.close');
        if (closeBtn) {
            closeBtn.onclick = () => modal.style.display = 'none';
        }
        
        window.onclick = (event) => {
            if (event.target === modal) {
                modal.style.display = 'none';
            }
        };
    });
}

// Add CSS styles for the loading overlay
const style = document.createElement('style');
style.textContent = `
    .loading-overlay {
        display: none;
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        justify-content: center;
        align-items: center;
        border-radius: 12px;
        z-index: 10;
    }
    
    .loading-overlay.visible {
        display: flex;
    }
    
    .loading-message {
        color: #fff;
        background: rgba(0, 0, 0, 0.8);
        padding: 10px 20px;
        border-radius: 4px;
        font-size: 14px;
        animation: pulse 1.5s infinite;
    }
    
    @keyframes pulse {
        0% { opacity: 0.6; }
        50% { opacity: 1; }
        100% { opacity: 0.6; }
    }
    
    .message {
        position: relative;
    }
`;
document.head.appendChild(style);