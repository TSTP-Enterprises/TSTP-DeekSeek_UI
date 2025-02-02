// Global variables for project management
let currentProject = null;
let currentChat = null;
let selectedProjectId = null;

// State management functions
function saveState() {
    const state = {
        expandedProjects: {},
        activeSidebars: {
            chats: document.getElementById('chats-sidebar').classList.contains('active'),
            settings: document.getElementById('settings-sidebar').classList.contains('active'),
            history: document.getElementById('history-sidebar').classList.contains('active')
        },
        currentProject: currentProject,
        currentChat: currentChat
    };
    
    // Save expanded state of all projects
    document.querySelectorAll('.project-header').forEach(header => {
        const projectId = header.getAttribute('data-project-id');
        if (projectId) {
            state.expandedProjects[projectId] = header.nextElementSibling.classList.contains('active');
        }
    });
    
    localStorage.setItem('appState', JSON.stringify(state));
}

function loadState() {
    const savedState = localStorage.getItem('appState');
    if (!savedState) return {};
    
    try {
        const state = JSON.parse(savedState);
        
        // Restore current project and chat first
        if (state.currentProject) currentProject = state.currentProject;
        if (state.currentChat) currentChat = state.currentChat;
        
        // Restore sidebar states
        if (state.activeSidebars) {
            Object.entries(state.activeSidebars).forEach(([sidebar, isActive]) => {
                const sidebarElement = document.getElementById(`${sidebar}-sidebar`);
                if (sidebarElement) {
                    if (isActive) {
                        sidebarElement.classList.add('active');
                    } else {
                        sidebarElement.classList.remove('active');
                    }
                }
            });
        }
        
        return {
            expandedProjects: state.expandedProjects || {},
            activeSidebars: state.activeSidebars || {},
            currentProject: state.currentProject,
            currentChat: state.currentChat
        };
    } catch (error) {
        console.error('Error loading state:', error);
        return {};
    }
}

// Modal functions
function showModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('show'), 10);
    
    // Clear input fields
    const inputs = modal.querySelectorAll('input, textarea');
    inputs.forEach(input => input.value = '');
    
    // Add event listeners
    const closeButtons = modal.querySelectorAll('.close');
    closeButtons.forEach(btn => {
        btn.onclick = () => closeModal(modalId);
    });
    
    // Close on outside click
    modal.onclick = (e) => {
        if (e.target === modal) closeModal(modalId);
    };
    
    // Focus first input
    const firstInput = modal.querySelector('input');
    if (firstInput) firstInput.focus();
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.classList.remove('show');
    setTimeout(() => modal.style.display = 'none', 300);
}

function showNewProjectModal() {
    showModal('project-modal');
    document.getElementById('project-modal-title').textContent = 'New Project';
    const confirmButton = document.querySelector('#project-modal .confirm');
    confirmButton.textContent = 'Create Project';
    confirmButton.onclick = submitNewProject;
}

function showEditProjectModal(project) {
    showModal('project-modal');
    document.getElementById('project-modal-title').textContent = 'Edit Project';
    document.getElementById('project-name').value = project.name;
    document.getElementById('project-description').value = project.description || '';
    
    const confirmButton = document.querySelector('#project-modal .confirm');
    confirmButton.textContent = 'Save Changes';
    confirmButton.onclick = () => submitEditProject(project.id);
}

function showNewChatModal(projectId) {
    selectedProjectId = projectId;
    showModal('chat-modal');
    document.getElementById('chat-modal-title').textContent = 'New Chat';
    const confirmButton = document.querySelector('#chat-modal .confirm');
    confirmButton.textContent = 'Create Chat';
    confirmButton.onclick = submitNewChat;
}

function showEditChatModal(chat) {
    showModal('chat-modal');
    document.getElementById('chat-modal-title').textContent = 'Edit Chat';
    document.getElementById('chat-title').value = chat.title;
    
    const confirmButton = document.querySelector('#chat-modal .confirm');
    confirmButton.textContent = 'Save Changes';
    confirmButton.onclick = () => submitEditChat(chat.id);
}

// Project management functions
async function submitNewProject() {
    const nameInput = document.getElementById('project-name');
    const descInput = document.getElementById('project-description');
    const name = nameInput.value.trim();
    const description = descInput.value.trim();
    
    if (!name) {
        nameInput.focus();
        return;
    }
    
    try {
        const response = await fetch('/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, description })
        });
        
        if (response.ok) {
            closeModal('project-modal');
            loadProjects();
        }
    } catch (error) {
        console.error('Error creating project:', error);
    }
}

async function submitEditProject(projectId) {
    const nameInput = document.getElementById('project-name');
    const descInput = document.getElementById('project-description');
    const name = nameInput.value.trim();
    const description = descInput.value.trim();
    
    if (!name) {
        nameInput.focus();
        return;
    }
    
    try {
        const response = await fetch(`/projects/${projectId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, description })
        });
        
        if (response.ok) {
            closeModal('project-modal');
            loadProjects();
        }
    } catch (error) {
        console.error('Error updating project:', error);
    }
}

async function submitNewChat() {
    const titleInput = document.getElementById('chat-title');
    const title = titleInput.value.trim();
    
    if (!title || !selectedProjectId) {
        titleInput.focus();
        return;
    }
    
    try {
        const response = await fetch(`/projects/${selectedProjectId}/chats`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title })
        });
        
        if (response.ok) {
            const data = await response.json();
            closeModal('chat-modal');
            // Update current project and chat
            currentProject = { id: selectedProjectId };
            currentChat = { id: data.id, title: data.title };
            await loadProjects();
            await loadChat(data.id);
            toggleChats(); // Close the sidebar after creating chat
        }
    } catch (error) {
        console.error('Error creating chat:', error);
        showError('Failed to create chat');
    }
}

async function submitEditChat(chatId) {
    const titleInput = document.getElementById('chat-title');
    const title = titleInput.value.trim();
    
    if (!title) {
        titleInput.focus();
        return;
    }
    
    try {
        const response = await fetch(`/chats/${chatId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title })
        });
        
        if (response.ok) {
            closeModal('chat-modal');
            loadProjects();
        }
    } catch (error) {
        console.error('Error updating chat:', error);
    }
}

async function loadProjects() {
    try {
        const response = await fetch('/projects');
        const projects = await response.json();
        const projectsList = document.querySelector('.projects-list');
        projectsList.innerHTML = '';
        
        // Get saved expansion states
        const expandedStates = loadState();
        
        if (projects.length === 0) {
            projectsList.innerHTML = '<div class="no-projects">No projects yet. Create one to get started!</div>';
            return;
        }
        
        projects.forEach(project => {
            const projectDiv = createProjectElement(project, expandedStates.expandedProjects[project.id]);
            projectsList.appendChild(projectDiv);
        });
        
        // If we have a current project, ensure its expanded
        if (currentProject) {
            const currentProjectElement = document.querySelector(`.project-header[data-project-id="${currentProject.id}"]`);
            if (currentProjectElement) {
                const chatList = currentProjectElement.nextElementSibling;
                chatList.classList.add('active');
                const folderIcon = currentProjectElement.querySelector('.fa-folder, .fa-folder-open');
                folderIcon.classList.remove('fa-folder');
                folderIcon.classList.add('fa-folder-open');
            }
        }
    } catch (error) {
        console.error('Error loading projects:', error);
    }
}

function createProjectElement(project, isExpanded) {
    const div = document.createElement('div');
    div.className = 'project-item';
    const isActive = isExpanded || (currentProject?.id === project.id);
    
    div.innerHTML = `
        <div class="project-header" data-project-id="${project.id}" onclick="toggleProjectChats(this)">
            <div class="project-title">
                <i class="fas fa-folder${isActive ? '-open' : ''}"></i>
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
        <div class="chat-list ${isActive ? 'active' : ''}">
            ${project.chats?.map(chat => createChatElement(chat)).join('') || ''}
            <div class="chat-item new-chat" onclick="showNewChatModal(${project.id})">
                <i class="fas fa-plus"></i> New Chat
            </div>
        </div>
    `;
    return div;
}

function createChatElement(chat) {
    return `
        <div class="chat-item ${chat.id === currentChat?.id ? 'active' : ''}" onclick="loadChat(${chat.id})">
            <div class="chat-title">
                <i class="fas fa-message"></i>
                <span>${chat.title}</span>
            </div>
            <div class="chat-actions">
                <button onclick="event.stopPropagation(); togglePinChat(${chat.id}, ${!chat.is_pinned})" class="action-button" title="Pin Chat">
                    <i class="fas fa-thumbtack ${chat.is_pinned ? 'pinned' : ''}"></i>
                </button>
                <button onclick="event.stopPropagation(); showEditChatModal(${JSON.stringify(chat)})" class="action-button" title="Edit Chat">
                    <i class="fas fa-edit"></i>
                </button>
                <button onclick="event.stopPropagation(); deleteChat(${chat.id})" class="action-button" title="Delete Chat">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `;
}

async function deleteProject(projectId) {
    if (!confirm('Are you sure you want to delete this project and all its chats?')) return;
    
    try {
        const response = await fetch(`/projects/${projectId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            if (currentProject?.id === projectId) {
                currentProject = null;
                currentChat = null;
            }
            loadProjects();
        }
    } catch (error) {
        console.error('Error deleting project:', error);
    }
}

async function deleteChat(chatId) {
    if (!confirm('Are you sure you want to delete this chat and all its messages?')) return;
    
    try {
        const response = await fetch(`/chats/${chatId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            if (currentChat?.id === chatId) {
                currentChat = null;
                document.getElementById('chat').innerHTML = '';
            }
            await loadProjects();
            await loadPreviousChats();
            showSuccess('Chat deleted successfully');
        }
    } catch (error) {
        console.error('Error deleting chat:', error);
        showError('Failed to delete chat');
    }
}

async function togglePinProject(projectId, isPinned) {
    try {
        const response = await fetch(`/projects/${projectId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_pinned: isPinned })
        });
        
        if (response.ok) {
            loadProjects();
        }
    } catch (error) {
        console.error('Error toggling project pin:', error);
    }
}

async function togglePinChat(chatId, isPinned) {
    try {
        const response = await fetch(`/chats/${chatId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_pinned: isPinned })
        });
        
        if (response.ok) {
            loadProjects();
        }
    } catch (error) {
        console.error('Error toggling chat pin:', error);
    }
}

async function loadChat(chatId) {
    try {
        // Clear chat messages first
        document.getElementById('chat').innerHTML = '';
        
        // Get chat messages
        const response = await fetch(`/chats/${chatId}/messages`);
        const messages = await response.json();
        
        // Update current chat
        currentChat = { id: chatId };
        
        // Update active states in both project chats and previous chats
        document.querySelectorAll('.chat-item').forEach(item => item.classList.remove('active'));
        document.querySelector(`.chat-item[onclick*="loadChat(${chatId})"]`)?.classList.add('active');
        
        // Load messages
        messages.forEach(msg => {
            // Add user message
            if (msg.user_message) {
                const messageDiv = addMessage(msg.user_message, false);
                if (messageDiv && msg.id) {
                    messageDiv.dataset.messageId = msg.id;
                }
            }
            
            // Add AI response
            if (msg.ai_response) {
                const aiMessageDiv = addMessage(msg.ai_response, true);
                if (aiMessageDiv && msg.id) {
                    aiMessageDiv.dataset.messageId = msg.id;
                }
            }
        });
        
        // Update project state if the chat belongs to a project
        if (messages.length > 0 && messages[0].project_id) {
            currentProject = { id: messages[0].project_id };
            
            // Get saved state to maintain other project expansions
            const savedState = loadState();
            
            // Update projects with current expansions
            await loadProjects();
            
            // Restore other expanded projects
            if (savedState.expandedProjects) {
                Object.entries(savedState.expandedProjects).forEach(([projectId, isExpanded]) => {
                    if (isExpanded && projectId !== messages[0].project_id.toString()) {
                        const projectHeader = document.querySelector(`.project-header[data-project-id="${projectId}"]`);
                        if (projectHeader) {
                            const chatList = projectHeader.nextElementSibling;
                            chatList.classList.add('active');
                            const folderIcon = projectHeader.querySelector('.fa-folder, .fa-folder-open');
                            folderIcon.classList.remove('fa-folder');
                            folderIcon.classList.add('fa-folder-open');
                        }
                    }
                });
            }
            
            // Ensure current project is expanded
            const projectHeader = document.querySelector(`.project-header[data-project-id="${messages[0].project_id}"]`);
            if (projectHeader) {
                const chatList = projectHeader.nextElementSibling;
                chatList.classList.add('active');
                const folderIcon = projectHeader.querySelector('.fa-folder, .fa-folder-open');
                folderIcon.classList.remove('fa-folder');
                folderIcon.classList.add('fa-folder-open');
            }
        } else {
            currentProject = null;
        }
        
        // Update previous chats list
        await loadPreviousChats();
        
        // Save state after everything is updated
        saveState();
        
        // Scroll to bottom of chat
        const chatContainer = document.getElementById('chat');
        chatContainer.scrollTop = chatContainer.scrollHeight;
        
    } catch (error) {
        console.error('Error loading chat:', error);
        showError('Failed to load chat');
    }
}

function toggleProjectChats(header) {
    const chatList = header.nextElementSibling;
    const folderIcon = header.querySelector('.fa-folder, .fa-folder-open');
    
    chatList.classList.toggle('active');
    folderIcon.classList.toggle('fa-folder');
    folderIcon.classList.toggle('fa-folder-open');
    
    // Save state immediately after toggling
    saveState();
}

async function loadConversationContext(messageId) {
    try {
        const response = await fetch(`/messages/${messageId}`);
        const message = await response.json();
        
        if (message.chat_id) {
            // Update current project and chat
            currentProject = { id: message.project_id };
            currentChat = { id: message.chat_id };
            
            // Load the chat
            await loadChat(message.chat_id);
            
            // Scroll to the specific message after a short delay
            setTimeout(() => {
                const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
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
}

// Add function to handle previous chats
async function loadPreviousChats() {
    try {
        const response = await fetch('/chats?type=unsaved');
        const chats = await response.json();
        const previousChatsList = document.getElementById('previous-chats-list');
        
        if (!previousChatsList) return;
        
        previousChatsList.innerHTML = '';
        
        chats.forEach(chat => {
            const chatDiv = document.createElement('div');
            chatDiv.className = `chat-item ${chat.id === currentChat?.id ? 'active' : ''}`;
            chatDiv.innerHTML = `
                <div class="chat-title">
                    <i class="fas fa-message"></i>
                    <span>${chat.title || 'Untitled Chat'}</span>
                </div>
                <div class="chat-actions">
                    <button onclick="event.stopPropagation(); showSaveToProjectModal(${chat.id})" class="action-button" title="Save to Project">
                        <i class="fas fa-save"></i>
                    </button>
                    <button onclick="event.stopPropagation(); deleteChat(${chat.id})" class="action-button" title="Delete Chat">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            chatDiv.onclick = () => loadChat(chat.id);
            previousChatsList.appendChild(chatDiv);
        });
    } catch (error) {
        console.error('Error loading previous chats:', error);
    }
}

// Add function to create a new unsaved chat
async function createUnsavedChat() {
    try {
        const response = await fetch('/chats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: `Chat ${new Date().toLocaleString()}` })
        });
        
        if (response.ok) {
            const chat = await response.json();
            currentChat = { id: chat.id, title: chat.title };
            await loadPreviousChats();
            return chat;
        }
    } catch (error) {
        console.error('Error creating unsaved chat:', error);
        showError('Failed to create unsaved chat');
    }
    return null;
}

// Add function to show save to project modal
function showSaveToProjectModal(chatId = null) {
    const modalId = 'save-to-project-modal';
    showModal(modalId);
    
    // Load projects into select
    loadProjectsForSelect();
    
    // Set up event handlers
    const modal = document.getElementById(modalId);
    const confirmButton = modal.querySelector('.confirm');
    
    confirmButton.onclick = async () => {
        const projectId = document.getElementById('project-select').value;
        const title = document.getElementById('chat-title-input').value.trim();
        
        if (!projectId || !title) {
            alert('Please select a project and enter a title');
            return;
        }
        
        await saveToProject(chatId || currentChat?.id, projectId, title);
        closeModal(modalId);
    };
}

// Add function to load projects for select
async function loadProjectsForSelect() {
    try {
        const response = await fetch('/projects');
        const projects = await response.json();
        const select = document.getElementById('project-select');
        
        // Clear existing options except the first one
        while (select.options.length > 1) {
            select.remove(1);
        }
        
        projects.forEach(project => {
            const option = document.createElement('option');
            option.value = project.id;
            option.textContent = project.name;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading projects for select:', error);
        showError('Failed to load projects');
    }
}

// Add function to save chat to project
async function saveToProject(chatId, projectId, title) {
    if (!chatId || !projectId || !title) return;
    
    try {
        const response = await fetch(`/chats/${chatId}/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ project_id: projectId, title })
        });
        
        if (response.ok) {
            await loadProjects();
            await loadPreviousChats();
            showSuccess('Chat saved to project successfully');
        }
    } catch (error) {
        console.error('Error saving chat to project:', error);
        showError('Failed to save chat to project');
    }
}

// Add new chat creation function
async function createNewChat() {
    try {
        const newChat = await createUnsavedChat();
        if (newChat) {
            currentChat = { id: newChat.id, title: newChat.title };
            currentProject = null;
            
            // Clear the chat area
            document.getElementById('chat').innerHTML = '';
            
            // Update UI
            await loadPreviousChats();
            await loadProjects();
            
            // Show success message
            showSuccess('New chat created');
            
            // Save state
            saveState();
        }
    } catch (error) {
        console.error('Error creating new chat:', error);
        showError('Failed to create new chat');
    }
}

// Update sidebar toggle functions
function toggleSidebar(sidebarId) {
    const sidebar = document.getElementById(sidebarId);
    const otherSidebarIds = ['chats-sidebar', 'settings-sidebar', 'history-sidebar'].filter(id => id !== sidebarId);
    
    // Close other sidebars
    otherSidebarIds.forEach(id => {
        const otherSidebar = document.getElementById(id);
        if (otherSidebar && otherSidebar.classList.contains('active')) {
            otherSidebar.classList.remove('active');
        }
    });
    
    // Toggle current sidebar
    if (sidebar) {
        const willBeActive = !sidebar.classList.contains('active');
        sidebar.classList.toggle('active');
        
        // Load content if sidebar is being opened
        if (willBeActive) {
            switch(sidebarId) {
                case 'chats-sidebar':
                    loadProjects();
                    break;
                case 'settings-sidebar':
                    loadRules();
                    break;
                case 'history-sidebar':
                    loadHistory();
                    break;
            }
        }
        
        // Save state immediately after toggling
        saveState();
    }
}

// Update initialization to load saved state
document.addEventListener('DOMContentLoaded', async () => {
    // Load saved state first
    const savedState = loadState();
    
    // Then load current data
    await loadProjects();
    await loadPreviousChats();
    
    // Set up save to project button
    const saveButton = document.getElementById('saveToProjectButton');
    if (saveButton) {
        saveButton.onclick = () => showSaveToProjectModal();
    }
    
    // Create initial unsaved chat if needed and if no chat is currently active
    if (!currentChat) {
        await createUnsavedChat();
    }
    
    // Restore expanded states after projects are loaded
    if (savedState.expandedProjects) {
        Object.entries(savedState.expandedProjects).forEach(([projectId, isExpanded]) => {
            if (isExpanded) {
                const projectHeader = document.querySelector(`.project-header[data-project-id="${projectId}"]`);
                if (projectHeader) {
                    const chatList = projectHeader.nextElementSibling;
                    chatList.classList.add('active');
                    const folderIcon = projectHeader.querySelector('.fa-folder, .fa-folder-open');
                    folderIcon.classList.remove('fa-folder');
                    folderIcon.classList.add('fa-folder-open');
                }
            }
        });
    }
    
    // Restore sidebar states from saved state
    if (savedState.activeSidebars) {
        Object.entries(savedState.activeSidebars).forEach(([sidebar, isActive]) => {
            const sidebarElement = document.getElementById(`${sidebar}-sidebar`);
            if (sidebarElement) {
                if (isActive) {
                    sidebarElement.classList.add('active');
                    // Load content for active sidebars
                    switch(sidebar) {
                        case 'chats':
                            loadProjects();
                            break;
                        case 'settings':
                            loadRules();
                            break;
                        case 'history':
                            loadHistory();
                            break;
                    }
                } else {
                    sidebarElement.classList.remove('active');
                }
            }
        });
    }
    
    // Save initial state
    saveState();
});

// Update toggleChats function to not automatically open the sidebar
function toggleChats() {
    toggleSidebar('chats-sidebar');
}

// Update toggleSettings function
function toggleSettings() {
    toggleSidebar('settings-sidebar');
}

// Update toggleHistory function
function toggleHistory() {
    toggleSidebar('history-sidebar');
}

// Update the addMessage function to better handle message formatting
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
    
    // Add to chat
    const chat = document.getElementById('chat');
    chat.appendChild(messageDiv);
    
    // Update content, ensuring no leading blank space
    if (typeof message === 'string') {
        contentDiv.innerHTML = formatMessage(message.trim());
    } else {
        console.warn('Message is not a string:', message);
        contentDiv.innerHTML = formatMessage(String(message).trim());
    }
    
    // Scroll to bottom
    chat.scrollTop = chat.scrollHeight;
    
    return messageDiv;
}

// Add a helper function to format the message
function formatMessage(message) {
    // First handle any thinking tags if present
    let displayMessage = message;
    if (currentSettings?.show_thinking) {
        const thinkMatch = message.match(/<think>(.*?)<\/think>/s);
        if (thinkMatch) {
            const thinking = thinkMatch[1].trim();
            if (currentSettings?.remove_thinking_tags) {
                displayMessage = thinking + '\n\n' + message.replace(/<think>.*?<\/think>/s, '').trim();
            }
        }
    } else {
        displayMessage = message.replace(/<think>.*?<\/think>/s, '').trim();
    }
    
    // Then handle code blocks and other formatting
    return displayMessage.split('\n').map(line => {
        // Handle code blocks and other formatting as needed
        return line;
    }).join('<br>');
} 