# TSTP DeepSeek Chat UI

A chat interface powered by Flask that integrates with the Ollama API for language model responses, complete with project & chat management, chat history, and code execution functionality. Built by TSTP Solutions, this tool simplifies complex administrative tasks with intelligent automation and a user-friendly interface.

## Overview
TSTP DeepSeek Chat UI provides a comprehensive chat interface built on Flask. It leverages the Ollama API to deliver real-time, streaming AI responses and includes robust project management, chat history handling, and even live code execution capabilities. This tool is designed to support IT professionals in streamlining their workflows.

## Features
- **Real-time Chat:** Enjoy streaming responses with SSE integration.
- **Projects & Chats Management:** Organize conversations into projects and manage unsaved chats.
- **Chat History:** Export and clear chat history.
- **Code Execution:** Execute code in Python, JavaScript, or PHP securely.
- **AI Thinking Process:** Display AI "thinking" snippets based on settings.
- **Responsive UI:** Built using HTML, CSS, and JavaScript.

## Detailed Capabilities
- **Real-time Chat:**  
  Streaming responses via Server-Sent Events (SSE) allow you to see the AI's output as it is generated.
- **Projects & Chats Management:**  
  Create, edit, and delete projects and chats. You can also pin chats or projects for quick access.
- **Chat History & Export:**  
  Each conversation is recorded and can be reviewed later via a dedicated history sidebar, exported to JSON, or cleared.
- **Code Execution:**  
  Embedded code snippets in responses can be executed directly within the browser (supporting Python, JavaScript, and PHP) using secure, temporary environments.
- **Settings & Customization:**  
  Toggle settings such as displaying the AI's thinking process or stripping extra formatting. All preferences are stored in the SQLite database.
- **Server Controls:**  
  Restart or shut down the server directly from the UI if required.

## Tutorial: How to Use the Web UI
1. **Launching the Application:**  
  Begin by running the application. The app will automatically initialize the SQLite database (using `database/schema.sql`) if needed:
  ```bash
  python ollama_api.py
  ```

2. **Sending a Message:**  
  On the main chat interface, type your message into the text area and click the send button (paper plane icon). Your message is streamed to the Ollama API, and you will see the AI response in real time.

3. **Managing Chats and Projects:**  
  - **Creating a New Chat:** Click the "New Chat" button available in the header or within the chats sidebar.
  - **Editing or Deleting a Chat:** Use the action buttons (edit, delete, or pin) next to each chat item in the project list or the previous chats section.
  - **Creating or Editing a Project:** Open the projects sidebar and click the "New Project" button to add a project. Existing projects can be edited by clicking the respective edit icon.

4. **Using Chat History:**  
  Click the history icon to open the history sidebar. You can review past conversations, click any history item to reload that chat, export the history to a JSON file, or clear the history.

5. **Executing Code:**  
  If the AI response includes a code block, buttons will appear allowing you to run, save, or copy the code. This feature supports Python, JavaScript, and PHP code execution.

6. **Adjusting Settings:**  
  Click the settings icon (gear icon) to open the settings sidebar. Here you can toggle options like showing the AI's thinking process or other display preferences.

7. **Server Controls:**  
  Use the restart and shutdown buttons (with warning/error icons) in the header or settings to manage the server. Actions require confirmation via modal dialogs.

## Frequently Asked Questions (FAQ)
- **Q:** What happens if the Ollama server isn't running?  
  **A:** On startup, the application checks for the Ollama server. If it cannot be found in the default location, you will be prompted to provide the path to `ollama.exe`.
- **Q:** How is chat history managed?  
  **A:** Chat histories are stored in the SQLite database. They can be viewed, exported, or cleared via an intuitive history sidebar.
- **Q:** Can I run code snippets directly from the chat?  
  **A:** Yes, the tool supports executing code within a secure environment for languages like Python, JavaScript, and PHP.

## Installation
1. **Clone the repository:**
   ```bash
   git clone https://github.com/TSTP-Enterprises/tstp-nsatt.git
   ```
2. **Change directory:**
   ```bash
   cd tstp-nsatt
   ```
3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```
4. **Database Initialization:**
   The SQLite database is auto-created using `database/schema.sql` when the app is first started.
5. **Start the Application:**
   ```bash
   python ollama_api.py
   ```

## Configuration
- **Database:** Uses SQLite with the database file at `database/chat.db`.  
- **Ollama Executable:** When starting, if `ollama.exe` isn't found in the default location, you will be prompted to provide its path.
- **Settings:** UI settings are stored in the database and can be updated via the application interface or manually in the `settings` table.

## 💝 Support Our Work

Your support helps us maintain and enhance this tool. Consider supporting us through:

### 🎁 One-Time Donations
- [PayPal](https://www.paypal.com/donate/?hosted_button_id=RAAYNUTMHPQQN)
- [Buy Me a Coffee](https://buymeacoffee.com/thesolutionstoproblems)
- [Ko-fi](https://ko-fi.com/thesolutionstoproblems)

### 🌟 Monthly Sponsorship
- [GitHub Sponsors](https://github.com/sponsors/TSTP-Enterprises)
- [Patreon](https://www.patreon.com/thesolutionstoproblems)

### 💎 Enterprise Support
- Custom feature development
- Priority support
- Training sessions  
- Contact us at [support@tstp.xyz](mailto:support@tstp.xyz)

## 📜 License

This project is licensed under the [MIT License](https://opensource.org/licenses/MIT) – see the [LICENSE](LICENSE) file for details.

## 🔗 Quick Links

- [🌐 Official Website](https://tstp.xyz/)
- [💻 GitHub Repository](https://github.com/TSTP-Enterprises/tstp-nsatt)
- [👥 LinkedIn](https://www.linkedin.com/company/thesolutions-toproblems)
- [🎥 YouTube Channel](https://www.youtube.com/@yourpststudios)
- [📱 Facebook Page](https://www.facebook.com/profile.php?id=61557162643039)

## 📞 Contact & Support

- **Email:** [support@tstp.xyz](mailto:support@tstp.xyz)
- **Website:** [tstp.xyz](https://tstp.xyz)

## 🏢 About TSTP Solutions

TSTP Solutions specializes in developing innovative tools for IT professionals. Our mission is to simplify complex administrative tasks through intelligent automation and user-friendly interfaces.

---

© 2024 TSTP Solutions. All rights reserved.  
Made with ❤️ by the TSTP team 