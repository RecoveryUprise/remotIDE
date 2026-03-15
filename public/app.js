const pinModal = document.getElementById('pin-modal');
const mainUi = document.getElementById('main-ui');
const pinInput = document.getElementById('pin-input');
const pinSubmit = document.getElementById('pin-submit');
const pinError = document.getElementById('pin-error');

const commandInput = document.getElementById('command-input');
const terminalOutput = document.getElementById('terminal-output');
const terminalContainer = document.getElementById('terminal-container');

// New UI Elements
const pathDisplay = document.getElementById('path-display');
const tabBtns = document.querySelectorAll('.tab-btn');
const shellView = document.getElementById('shell-view');
const browserView = document.getElementById('browser-view');
const fileList = document.getElementById('file-list');
const btnUp = document.getElementById('btn-up');
const btnMkdir = document.getElementById('btn-mkdir');
const btnAbort = document.getElementById('btn-abort');
const btnTimeMachine = document.getElementById('btn-timemachine');
const btnVoice = document.getElementById('btn-voice');
const quickStartSelect = document.getElementById('quick-start-select');

const serverHost = document.getElementById('server-host');
if (serverHost) {
    serverHost.textContent = window.location.host;
}

// Phase 7 Sidebar UI
const projectSidebar = document.getElementById('project-sidebar');
const btnCloseSidebar = document.getElementById('btn-close-sidebar');
const btnNewChat = document.getElementById('btn-new-chat');
const chatHistoryList = document.getElementById('chat-history-list');
const repoCloneUrl = document.getElementById('repo-clone-url');
const btnCloneRepo = document.getElementById('btn-clone-repo');

btnCloseSidebar.addEventListener('click', () => {
    if (projectSidebar.classList.contains('open')) {
        projectSidebar.classList.remove('open');
        mainUi.classList.remove('sidebar-open-push');
    } else {
        projectSidebar.classList.add('open');
        mainUi.classList.add('sidebar-open-push');
        if (socket && socket.connected) {
            socket.emit('system:list_chats'); // Refresh list when opened
        }
    }
});

btnNewChat.addEventListener('click', () => {
    const name = prompt("Enter a name for the new project (or leave blank for random ID):");
    socket.emit('system:new_chat', { name: name || null });
    projectSidebar.classList.remove('open');
    mainUi.classList.remove('sidebar-open-push');
    
    // Clear the active DOM immediately to show UI reset
    document.querySelectorAll('.terminal-output').forEach(el => el.innerHTML = '');
    pathDisplay.textContent = '...initializing...';
});

btnCloneRepo.addEventListener('click', () => {
    const url = repoCloneUrl.value.trim();
    if (!url) return;
    socket.emit('system:git_clone', { url });
    repoCloneUrl.value = '';
    projectSidebar.classList.remove('open');
    mainUi.classList.remove('sidebar-open-push');
    
    // Clear the active DOM immediately
    document.querySelectorAll('.terminal-output').forEach(el => el.innerHTML = '');
    pathDisplay.textContent = '...cloning...';
});

// Phase 14: Project Settings
const btnProjectSettings = document.getElementById('btn-project-settings');
const projectSettingsModal = document.getElementById('project-settings-modal');
const btnCancelSettings = document.getElementById('btn-cancel-settings');
const btnSaveSettings = document.getElementById('btn-save-settings');
const settingsPromptInput = document.getElementById('settings-prompt-input');

btnProjectSettings.addEventListener('click', () => {
    projectSettingsModal.classList.remove('hidden');
    socket.emit('system:get_settings');
});

btnCancelSettings.addEventListener('click', () => {
    projectSettingsModal.classList.add('hidden');
});

btnSaveSettings.addEventListener('click', () => {
    const payload = {
        systemPrompt: settingsPromptInput.value.trim()
    };
    socket.emit('system:save_settings', payload);
    projectSettingsModal.classList.add('hidden');
});

// --- VOICE DICTATION ---
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let isRecording = false;

if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    
    recognition.onresult = (e) => {
        let transcript = '';
        for (let i = e.resultIndex; i < e.results.length; ++i) {
            transcript += e.results[i][0].transcript;
        }
        commandInput.value = transcript;
    };
    
    recognition.onerror = (e) => {
        console.error("Speech recognition error", e);
        stopRecording();
    };
    
    recognition.onend = () => {
        stopRecording();
    };
} else {
    btnVoice.style.display = 'none'; // Hide if browser doesn't support it
}

function stopRecording() {
    isRecording = false;
    btnVoice.classList.remove('pulsing');
    btnVoice.style.color = 'var(--neon-cyan)';
    if (recognition) recognition.stop();
}

btnVoice.addEventListener('click', () => {
    if (!recognition) return;
    if (isRecording) {
        stopRecording();
    } else {
        isRecording = true;
        btnVoice.classList.add('pulsing');
        btnVoice.style.color = 'var(--neon-pink)';
        recognition.start();
    }
});

const codeViewerModal = document.getElementById('code-viewer-modal');
const viewerFilename = document.getElementById('viewer-filename');
const viewerContent = document.getElementById('viewer-content');
const viewerClose = document.getElementById('viewer-close');
const viewerSave = document.getElementById('viewer-save');
const parsedVarsList = document.getElementById('parsed-vars-list');
const fileChatOutput = document.getElementById('file-chat-output');
const fileChatInput = document.getElementById('file-chat-input');
const fileChatSubmit = document.getElementById('file-chat-submit');

// --- PHASE 8: CODEMIRROR ---
const globalCM = CodeMirror.fromTextArea(viewerContent, {
    lineNumbers: true,
    theme: 'dracula',
    mode: 'javascript',
    matchBrackets: true,
    lineWrapping: true
});

// --- FILE CONTEXT CHAT ---
fileChatSubmit.addEventListener('click', () => {
    const filename = viewerFilename.textContent;
    const content = globalCM.getValue();
    const prompt = fileChatInput.value.trim();
    if (!prompt) return;
    
    fileChatInput.value = '';
    
    // Append user message locally
    const userMsg = document.createElement('div');
    userMsg.textContent = `> ${prompt}`;
    userMsg.style.color = 'var(--neon-green)';
    userMsg.style.marginBottom = '8px';
    fileChatOutput.appendChild(userMsg);
    fileChatOutput.scrollTop = fileChatOutput.scrollHeight;
    
    // Wrap the prompt with the file context
    const contextualPrompt = `I am currently looking at the file: ${filename}\n\nHere are the contents:\n\`\`\`\n${content}\n\`\`\`\n\nUser Question: ${prompt}`;
    
    socket.emit('cmd', { command: contextualPrompt, mode: 'gemini' });
});

fileChatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') fileChatSubmit.click();
});

viewerClose.addEventListener('click', () => {
    codeViewerModal.classList.add('hidden');
    browserView.classList.remove('hidden');
});

viewerSave.addEventListener('click', () => {
    const filename = viewerFilename.textContent;
    const content = globalCM.getValue();
    socket.emit('fs:write', { targetName: filename, content: content });
    codeViewerModal.classList.add('hidden');
    browserView.classList.remove('hidden');
});

let socket = null;
let currentMode = 'cmd'; // Default mode

// --- TABS AND MODES ---
tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        // Highlight active tab
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        const target = btn.dataset.target;
        
        if (target === 'browser') {
            shellView.classList.add('hidden');
            browserView.classList.remove('hidden');
            codeViewerModal.classList.add('hidden');
            if (socket && socket.connected) {
                socket.emit('fs:list');
            }
        } else {
            shellView.classList.remove('hidden');
            browserView.classList.add('hidden');
            codeViewerModal.classList.add('hidden');
            currentMode = target;
            
            let placeholderText = `> Enter ${currentMode.toUpperCase()} command...`;
            if (currentMode === 'gemini') {
                placeholderText = "> Prompt AntiGravity...";
            } else if (currentMode === 'ollama') {
                placeholderText = "> Prompt Local Llama...";
            }
            commandInput.placeholder = placeholderText;
            commandInput.focus();

            // Hide all terminal outputs, show only the active one
            document.querySelectorAll('.terminal-output').forEach(el => el.classList.add('hidden'));
            document.getElementById(`output-${currentMode}`).classList.remove('hidden');
            
            // Auto-scroll the newly visible container
            terminalContainer.scrollTop = terminalContainer.scrollHeight;
        }
    });
});

// --- QUICK START TEMPLATES ---
quickStartSelect.addEventListener('change', (e) => {
    const template = e.target.value;
    if (!template) return;
    
    let prompt = "";
    if (template === 'react-vite') {
        prompt = "Scaffold a brand new React + Vite single page application. Create the necessary package.json, vite.config.js, index.html, and a beautiful landing page component in src/App.jsx using modern CSS. Do not use Tailwind. Remember to run:port first to find an open port, and include `npm install` and `npm run dev` in your run blocks!";
    } else if (template === 'express-api') {
        prompt = "Scaffold a modern Express.js REST API backend. Create a package.json, server.js with middleware (cors, express.json), a sample generic /api/health route, and a .env file. Remember to run:port first to find an open port, and include `npm install` and `npm start` in your run blocks!";
    } else if (template === 'vanilla-html') {
        prompt = "Scaffold a classic Vanilla HTML, CSS, and JS project. Create an index.html, style.css, and app.js with a stunning, modern, glassmorphism UI. Include a basic Node.js Express server to serve the static files on an open port (use run:port first!).";
    }
    
    if (prompt) {
        // Auto-switch to Gemini tab to handle this complex scaffold
        document.querySelector('[data-target="gemini"]').click();
        socket.emit('cmd', { command: prompt, mode: 'gemini' });
    }
    
    // Reset dropdown visually
    quickStartSelect.value = "";
});

function appendToTerminal(text, targetMode = currentMode) {
    // If the file viewer/chat pane is open and the message is from an AI, route it there instead
    if (!codeViewerModal.classList.contains('hidden') && (targetMode === 'gemini' || targetMode === 'ollama')) {
        const fileChatOutput = document.getElementById('file-chat-output');
        fileChatOutput.dataset.rawMarkdown = (fileChatOutput.dataset.rawMarkdown || '') + text;
        
        marked.setOptions({
            highlight: function(code, lang) {
                const language = hljs.getLanguage(lang) ? lang : 'plaintext';
                return hljs.highlight(code, { language }).value;
            },
            langPrefix: 'hljs language-'
        });
        fileChatOutput.innerHTML = DOMPurify.sanitize(marked.parse(fileChatOutput.dataset.rawMarkdown));
        fileChatOutput.scrollTop = fileChatOutput.scrollHeight;
        return;
    }

    const targetDiv = document.getElementById(`output-${targetMode}`);
    if (targetDiv) {
        if (targetMode === 'gemini' || targetMode === 'ollama') {
            targetDiv.dataset.rawMarkdown = (targetDiv.dataset.rawMarkdown || '') + text;
            
            marked.setOptions({
                highlight: function(code, lang) {
                    const language = hljs.getLanguage(lang) ? lang : 'plaintext';
                    return hljs.highlight(code, { language }).value;
                },
                langPrefix: 'hljs language-'
            });
            targetDiv.innerHTML = DOMPurify.sanitize(marked.parse(targetDiv.dataset.rawMarkdown));
        } else {
            // raw text appending for standard console streams
            targetDiv.textContent += text;
        }
        
        // Only autoscroll if we are appending to the currently visible tab
        if (targetMode === currentMode && !shellView.classList.contains('hidden')) {
            terminalContainer.scrollTop = terminalContainer.scrollHeight;
        }
    }
}

// --- FILE SYSTEM BROWSER RENDERING ---
function renderFileList(path, items) {
    pathDisplay.textContent = path;
    fileList.innerHTML = '';
    
    // Sort directories first
    items.sort((a, b) => {
        if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
        return a.isDirectory ? -1 : 1;
    });

    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'file-item';
        div.style.display = 'flex';
        div.style.justifyContent = 'space-between';
        div.style.alignItems = 'center';
        
        // Left side: Clickable Icon and Name
        const leftGroup = document.createElement('div');
        leftGroup.style.display = 'flex';
        leftGroup.style.alignItems = 'center';
        leftGroup.style.cursor = 'pointer';
        leftGroup.style.flex = '1';
        leftGroup.style.overflow = 'hidden';
        
        const icon = document.createElement('span');
        icon.className = 'file-icon';
        icon.textContent = item.isDirectory ? '📁' : '📄';
        
        const name = document.createElement('span');
        name.className = 'file-name';
        name.textContent = item.name;
        name.style.whiteSpace = 'nowrap';
        name.style.overflow = 'hidden';
        name.style.textOverflow = 'ellipsis';

        leftGroup.appendChild(icon);
        leftGroup.appendChild(name);

        leftGroup.addEventListener('click', () => {
            if (item.isDirectory) {
                socket.emit('fs:cd', item.name);
            } else {
                socket.emit('fs:read', item.name);
            }
        });

        // Right side: Action Buttons (Phase 9)
        const actionGroup = document.createElement('div');
        actionGroup.style.display = 'flex';
        actionGroup.style.gap = '8px';

        const btnRen = document.createElement('button');
        btnRen.textContent = 'REN';
        btnRen.className = 'synth-btn small-btn';
        btnRen.style.padding = '2px 6px';
        btnRen.style.fontSize = '0.7em';
        btnRen.style.minWidth = '45px';
        btnRen.addEventListener('click', (e) => {
            e.stopPropagation();
            const newName = prompt(`Rename ${item.name} to:`, item.name);
            if (newName && newName !== item.name) {
                socket.emit('fs:rename', { oldPath: item.name, newPath: newName });
            }
        });

        const btnDel = document.createElement('button');
        btnDel.textContent = 'DEL';
        btnDel.className = 'synth-btn small-btn abort-btn';
        btnDel.style.padding = '2px 6px';
        btnDel.style.fontSize = '0.7em';
        btnDel.style.minWidth = '45px';
        btnDel.style.animation = 'none'; // Stop the constant red pulse
        btnDel.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`Are you sure you want to delete ${item.name}? This is permanent.`)) {
                socket.emit('fs:delete', { targetPath: item.name });
            }
        });
        
        actionGroup.appendChild(btnRen);
        actionGroup.appendChild(btnDel);

        div.appendChild(leftGroup);
        div.appendChild(actionGroup);
        
        fileList.appendChild(div);
    });
}

// --- SOCKET INITIALIZATION ---
function initializeSocket(token) {
    socket = io({
        auth: { token }
    });

    socket.on('connect', () => {
        pinModal.classList.add('hidden');
        mainUi.classList.remove('hidden');
        localStorage.setItem('ag_remote_pin', token);
        appendToTerminal('[SYSTEM] Connected securely.\n');
        
        // Initial fetch of directory
        socket.emit('fs:list');
        commandInput.focus();
    });

    socket.on('connect_error', (err) => {
        pinError.textContent = 'Auth Failed: ' + err.message;
        socket.disconnect();
        localStorage.removeItem('ag_remote_pin');
    });

    socket.on('output', (data) => {
        if (typeof data === 'object' && data !== null) {
            appendToTerminal(data.text, data.mode);
        } else {
            // Fallback for flat strings from older connections
            appendToTerminal(data, currentMode);
        }
    });
    
    // File System Events
    socket.on('fs:list_result', (data) => {
        renderFileList(data.path, data.items);
    });

    socket.on('fs:read_result', (data) => {
        viewerFilename.textContent = data.name;
        globalCM.setValue(data.content);
        
        const ext = data.name.split('.').pop().toLowerCase();
        let cmMode = 'javascript';
        if (ext === 'css') cmMode = 'css';
        else if (ext === 'html') cmMode = 'htmlmixed';
        else if (ext === 'md') cmMode = 'markdown';
        globalCM.setOption('mode', cmMode);
        
        // Refresh to ensure layout paints correctly inside the modal
        setTimeout(() => globalCM.refresh(), 50);
        
        // Parse Variables (ENV rules or Export Constants)
        parsedVarsList.innerHTML = '';
        const lines = data.content.split('\n');
        const varRegex = /^(?:export\s+)?(?:const|let|var)\s+([a-zA-Z0-9_]+)\s*=\s*(.*)$|^(?:process\.env\.|import\.meta\.env\.)([a-zA-Z0-9_]+)|^[ \t]*([A-Z0-9_]+)\s*=\s*(.*)$/gm;
        
        let match;
        let foundVars = [];
        
        // Use a Set to avoid duplicates if process.env.X is called multiple times
        const uniqueVars = new Set();
        
        while ((match = varRegex.exec(data.content)) !== null) {
            let varName = match[1] || match[3] || match[4];
            let isUsage = !!match[3]; // process.env.X
            let varVal = match[2] || match[5] || "";
            
            if (varName && !uniqueVars.has(varName)) {
                uniqueVars.add(varName);
                const li = document.createElement('li');
                li.style.marginBottom = '8px';
                li.style.display = 'flex';
                li.style.flexDirection = 'column';
                li.style.gap = '4px';
                
                if (isUsage) {
                    li.innerHTML = `<label style="color:var(--neon-pink);"><span style="color:var(--neon-cyan);">></span> ${varName} <span style="font-size:0.8em; color:gray;">(Usage)</span></label>`;
                } else {
                    li.innerHTML = `
                        <label style="color:var(--neon-pink);"><span style="color:var(--neon-cyan);">></span> ${varName}</label>
                        <input type="text" class="var-edit-input" data-key="${varName}" value="${varVal.replace(/"/g, '&quot;').replace(/'/g, '&#39;')}" style="background: rgba(0,0,0,0.5); border: 1px solid rgba(0,255,255,0.3); color: #fff; padding: 4px; font-family: monospace; border-radius: 2px; outline: none; transition: border 0.2s; width: 100%; box-sizing: border-box;">
                    `;
                }
                parsedVarsList.appendChild(li);
                foundVars.push(varName);
            }
        }
        
        // Attach event listeners to editable variables
        document.querySelectorAll('.var-edit-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const updatedVal = e.target.value;
                const key = e.target.dataset.key;
                let currentContent = globalCM.getValue();
                
                // Safe Regex to replace the value assigned to the key
                const replaceRegex = new RegExp(`(^(?:export\\s+)?(?:const|let|var)\\s+${key}\\s*=\\s*|^[ \\t]*${key}\\s*=\\s*)(.*)$`, 'gm');
                
                globalCM.setValue(currentContent.replace(replaceRegex, `$1${updatedVal}`));
                viewerSave.style.boxShadow = '0 0 10px var(--neon-pink)'; // Hint to save
            });
            input.addEventListener('focus', () => { input.style.borderColor = 'var(--neon-cyan)'; });
            input.addEventListener('blur', () => { input.style.borderColor = 'rgba(0,255,255,0.3)'; });
        });
        
        if (foundVars.length === 0) {
            const li = document.createElement('li');
            li.textContent = "No variables detected.";
            li.style.color = "rgba(255,255,255,0.5)";
            parsedVarsList.appendChild(li);
        }

        // Auto-route incoming socket AI responses to this chat pane if open
        fileChatOutput.innerHTML = ''; 
        
        browserView.classList.add('hidden');
        codeViewerModal.classList.remove('hidden');
    });
    
    socket.on('fs:refresh_request', () => {
        socket.emit('fs:list');
    });

    socket.on('system:dev_loop_start', () => {
        btnAbort.classList.remove('hidden');
    });

    socket.on('system:dev_loop_end', () => {
        btnAbort.classList.add('hidden');
    });

    // --- PHASE 7: PROJECT MANAGER ---
    socket.on('system:chats_result', (chats) => {
        chatHistoryList.innerHTML = '';
        if (!chats || chats.length === 0) {
            chatHistoryList.innerHTML = '<div style="color:gray; font-size:0.8em; text-align:center; padding:10px;">No projects found.</div>';
            return;
        }
        
        chats.forEach(chat => {
            const btn = document.createElement('div');
            btn.className = 'chat-item';
            btn.innerHTML = `
                <div class="chat-icon">${chat.id.charAt(0).toUpperCase()}</div>
                <div class="chat-item-text">
                    <strong>${chat.id}</strong><br/>
                    <span style="font-size:0.75em; color:gray;">${chat.hasHistory ? 'Saved State' : 'Empty State'}</span>
                </div>
            `;
            
            btn.addEventListener('click', () => {
                socket.emit('system:load_chat', chat.id);
                projectSidebar.classList.remove('open');
            });
            chatHistoryList.appendChild(btn);
        });
    });

    socket.on('system:chats_refresh_request', () => {
        socket.emit('system:list_chats');
    });

    socket.on('system:chat_loaded', (historyObj) => {
        // Clear all current DOM terminals
        document.querySelectorAll('.terminal-output').forEach(el => {
            el.innerHTML = '';
            el.dataset.rawMarkdown = '';
        });
        
        const fileChatOutput = document.getElementById('file-chat-output');
        fileChatOutput.innerHTML = '';
        fileChatOutput.dataset.rawMarkdown = '';
        
        // Hydrate logs back into the DOM
        if (historyObj.cmd) historyObj.cmd.forEach(l => appendToTerminal(l, 'cmd'));
        if (historyObj.powershell) historyObj.powershell.forEach(l => appendToTerminal(l, 'powershell'));
        if (historyObj.gemini) historyObj.gemini.forEach(l => appendToTerminal(l, 'gemini'));
        if (historyObj.ollama) historyObj.ollama.forEach(l => appendToTerminal(l, 'ollama'));
        
        // Auto-switch to gemini mode if no mode is selected
        document.querySelector('[data-target="gemini"]').click();
        
        pathDisplay.textContent = '...loading...';
    });

    // Phase 14: Settings Injection
    socket.on('system:settings_loaded', (settings) => {
        if (settings && settings.systemPrompt) {
            settingsPromptInput.value = settings.systemPrompt;
        } else {
            settingsPromptInput.value = '';
        }
    });

    socket.on('disconnect', () => {
        appendToTerminal('\n[SYSTEM] Disconnected from server.\n');
    });
}

// --- AUTH ---
function handleLogin() {
    const pin = pinInput.value.trim();
    if (pin.length !== 4) {
        pinError.textContent = 'PIN must be 4 digits';
        return;
    }
    pinError.textContent = 'Connecting...';
    initializeSocket(pin);
}

pinSubmit.addEventListener('click', handleLogin);
pinInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleLogin();
});

// --- EXECUTION & BROWSER CONTROLS ---
function sendCommand() {
    if (!socket || !socket.connected) return;
    const cmd = commandInput.value.trim();
    if (!cmd) return;
    
    if (cmd.toLowerCase() === '/review') {
        const reviewPrompt = `[System Command] The user has requested a Deep Project Review. Please strictly analyze the entire Omniscient Context provided above. Identify missing edge cases, security flaws, architectural issues, or UX improvements. Output a structured Markdown critique outlining your findings. DO NOT write any code blocks to execute or scaffold; just provide the analysis report.`;
        appendToTerminal(`\n[SYSTEM] Triggering Deep Project Review... Initializing Omniscient Context Check.\n`);
        
        // Auto-switch to gemini mode for complex analysis if not already on an AI tab
        if (currentMode !== 'gemini' && currentMode !== 'ollama') {
             document.querySelector('[data-target="gemini"]').click();
        }
        socket.emit('command', { command: reviewPrompt, mode: currentMode === 'ollama' ? 'ollama' : 'gemini', autonomous: false });
        commandInput.value = '';
        return;
    }

    const isAutonomous = document.getElementById('auto-dev-toggle').checked;

    appendToTerminal(`\n[${currentMode.toUpperCase()}] > ${cmd}\n`);
    socket.emit('command', { command: cmd, mode: currentMode, autonomous: isAutonomous });
    commandInput.value = '';
}

commandInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendCommand();
});

btnAbort.addEventListener('click', () => {
    if (socket && socket.connected) {
         socket.emit('system:abort');
         appendToTerminal(`\n[SYSTEM] Sent localized ABORT KILL-SIGNAL to the Node Engine... waiting for loop shredder.\n`, currentMode);
    }
});

btnTimeMachine.addEventListener('click', () => {
    if (socket && socket.connected) {
         if (confirm("TIME MACHINE: Are you sure you want to revert to the last auto-checkpoint? This will permanently destroy uncommitted work!")) {
              socket.emit('system:timemachine');
         }
    }
});

btnUp.addEventListener('click', () => {
    if (socket && socket.connected) socket.emit('fs:cd', '..');
});

btnMkdir.addEventListener('click', () => {
    const name = prompt("Enter new folder name:");
    if (name && socket && socket.connected) {
        socket.emit('fs:mkdir', name);
    }
});

// Auto-login check
const savedPin = localStorage.getItem('ag_remote_pin');
if (savedPin) {
    initializeSocket(savedPin);
} else {
    pinInput.focus();
}

// Global Keyboard Shortcuts
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key.toLowerCase() === 'c') {
        const selectedText = window.getSelection().toString();
        // If the user isn't copying text, trigger the loop shredder
        if (selectedText.length === 0) {
            e.preventDefault();
            btnAbort.click();
        }
    }
});
