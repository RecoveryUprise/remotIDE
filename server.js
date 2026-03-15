require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { spawn, exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const path = require('path');
const fs = require('fs');
const net = require('net');
const crypto = require('crypto');
const os = require('os');
const puppeteer = require('puppeteer');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Initialize Gemini Client
const aiOptions = process.env.GEMINI_API_KEY ? { apiKey: process.env.GEMINI_API_KEY } : {};
const gemini = new GoogleGenAI(aiOptions);

const PORT = process.env.PORT || 3000;
const PIN = '1234'; // Hardcoded 4-digit PIN

    // Helper to resolve the root Projects directory in the user's home folder
    const getProjectsDir = () => {
        const dir = path.join(os.homedir(), 'remotIDE_Projects');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        return dir;
    };
    const WORKSPACE_DIR = getProjectsDir();

    socket.on('system:git_clone', async (data) => {
        if (!data || !data.url) return;
        const url = data.url;
        const repoName = url.split('/').pop().replace('.git', '');
        const targetDir = path.join(WORKSPACE_DIR, repoName);
        
        pushLog('system', `\n[SYSTEM] Received clone request for: ${url}\n`);
        io.emit('output', `\n[SYSTEM] Received clone request for: ${url}\n`);
        
        if (fs.existsSync(targetDir)) {
            pushLog('system', `[SYSTEM ERROR] Directory ${targetDir} already exists. Please rename or delete it first.\n`);
            io.emit('output', `[SYSTEM ERROR] Directory ${targetDir} already exists.\n`);
            return;
        }

        try {
            pushLog('system', `[SYSTEM] Executing: git clone ${url} into ${targetDir}...\n`);
            io.emit('output', `[SYSTEM] Executing: git clone...\n`);
            
            const { stdout, stderr } = await execPromise(`git clone ${url} "${targetDir}"`);
            pushLog('system', stdout + '\n' + stderr + '\n');
            io.emit('output', stdout + '\n' + stderr + '\n');
            
            pushLog('system', `[SYSTEM] Clone successful! Loading into active context...\n`);
            io.emit('output', `[SYSTEM] Clone successful! Loading into active context...\n`);
            
            // Auto-load it!
            socket.currentDir = targetDir;
            socket.terminalLogs = { gemini: [], ollama: [], manual: [] };
            saveChatHistory();
            
            io.emit('system:chats_refresh_request');
            io.emit('fs:refresh_request');
            
        } catch (error) {
            pushLog('system', `[SYSTEM ERROR] Git Clone Failed: ${error.message}\n`);
            io.emit('output', `[SYSTEM ERROR] Git Clone Failed: ${error.message}\n`);
        }
    });

    // Initialize a persistent chat session for Gemini Context
    if (process.env.GEMINI_API_KEY) {
        // We instruct the chat session up front on how to output code blocks and explicitly format for auto-scaffolding
        socket.geminiChat = gemini.chats.create({
            model: 'gemini-2.5-flash',
            config: {
                systemInstruction: `You are 'AntiGravity', a highly advanced local-system Autonomous MVP Developer capable of writing fully functional software projects directly to the user's hard drive and executing terminal commands. 
CRITICAL FAST-TRACK INSTRUCTIONS: NEVER give step-by-step tutorials on how to create directories or run commands like 'npx create-react-app'. You MUST do the work for them by outputting the exact file structures required or executing the exact commands. Do not write 'boilerplate' or 'placeholder' code; write the fully functioning code required for the project.

If you need to generate or scaffold files, you MUST use the following markdown codeblock format EXACTLY so the system can parse and write it: 
\`\`\`language:filename.ext
<file contents here>
\`\`\` 
For example, to create a react component: 
\`\`\`javascript:src/components/Button.js
export default function Button() { return <button>Click</button>; }
\`\`\`

If you need to automatically execute a terminal command on the user's PC (like 'npm install', 'npm start', or 'npx...'), you MUST use this format:
\`\`\`run:cmd
<command>
\`\`\`
or 
\`\`\`run:powershell
<command>
\`\`\`

If you need to find an open port BEFORE generating your server startup files, you can use the port scanner tool:
\`\`\`run:port
scan
\`\`\`
The backend will immediately scan the host machine for the first open port >=3001 and feed the result back to you seamlessly!

If you need to read the contents of an existing file before modifying it, use the read tool:
\`\`\`read:src/App.js
\`\`\`
The backend will read the file and feed its contents back to you.

If you need to research an unknown framework or learn new syntax, use the fetch tool. Provide the exact HTTP URL:
\`\`\`run:fetch
https://react.dev/reference/react
\`\`\`
The backend will gracefully scrape the webpage DOM, convert it to markdown, and inject it into your memory loop!

If you need to find where a specific component, function, or keyword is used across the ENTIRE project directory, use the search tool:
\`\`\`run:search
UserAuth
\`\`\`
The backend will recursively grep the entire workspace and return every file and exact line number where the keyword appears. This is extremely powerful for navigating large codebases!

If you need to surgically edit an existing file without rewriting the whole thing, use the edit tool. The SEARCH block MUST match the existing file exactly:
\`\`\`edit:src/App.js
<<< SEARCH
<button>Submit</button>
=== REPLACE
<button className="synth-btn">Submit</button>
>>>
\`\`\`

If you need to permanently delete a file or directory to clean up dead code, use the delete tool:
\`\`\`run:delete
src/oldComponent.js
\`\`\`

If you need to safely rename or move a file/directory, use the rename tool (Old Path -> New Path on separate lines):
\`\`\`run:rename
src/oldComponent.js
src/newComponent.js
\`\`\`

If you need to verify the syntax of a JavaScript file before completing your turn, use the lint tool:
\`\`\`run:lint
src/App.js
\`\`\`
The backend will run a syntax check and return any errors to you so you can fix them autonomously.

If you need to safely install npm packages to the project directory without breaking your autonomous loop, use the install tool:
\`\`\`run:install
express mongoose cors
\`\`\`
The backend will silently execute npm install, parse the package.json, and return the execution results to you natively.

If you need to visually test a URL or local dev server to check for CSS misalignments or UI bugs, use the snapshot tool:
\`\`\`run:snapshot
http://localhost:3001
\`\`\`
The backend will seamlessly spin up a headless Chromium browser, capture a full-resolution screenshot of the viewport, and inject the Base64 image directly into your multi-modal vision sensors so you can act as your own QA Tester!

If you need to save your current progress, update your checklist, or record notes about the project so you don't forget them on the next turn, you MUST use the context tool:
\`\`\`run:context
# Project Name
- [x] Feature 1
- [ ] Feature 2
[Any other architectural notes, next steps, or logic you want to remember]
\`\`\`
This will overwrite a hidden '.antigravity_context.md' file in the current directory. You should use this frequently whenever you hit a milestone or need to plan ahead!

CRITICAL COMMAND INSTRUCTIONS: 
1. You MUST use 'run:cmd' or 'run:powershell' EXACTLY. NEVER use standard Markdown tags like \`\`\`bash or \`\`\`powershell or the system will fail to execute them!
2. If your generated commands depend on a newly scaffolded folder (like a react app), you MUST include the directory change (e.g., \`cd folderName &&\`) within the command block!
3. Windows PowerShell DOES NOT support the '&&' operator! If you need to chain commands, you MUST use 'run:cmd' instead of 'run:powershell', or use ';' to separate PowerShell commands!
CRITICAL PORT INSTRUCTION: When scaffolding projects that start web servers (React, Node, Vite), you MUST implement auto-incrementing port logic starting at port 3001 or higher to prevent 'EADDRINUSE' crashes, because Port 3000 is strictly reserved for the remotIDE system. You are HIGHLY ENCOURAGED to use the \`run:port\` tool to find an open port prior to generating your framework's config files!
PROJECT SCOPE INSTRUCTION: You are an Autonomous MVP Developer. Your goal is to deliver a fully working, functional product. For all initial builds, you MUST make the frontends and backends entirely locally hosted. DO NOT integrate with outside services (Firebase, AWS, External DBs) until explicitly instructed to do so for a production release. If you output valid scaffolding blocks, the system will execute them and feed you the results. You MUST continuously iterate your project, writing out the granular logic for every component, step by step. When a feature is finished, you must autonomously identify and implement the next useful feature, improvement, or UI polish. DO NOT STOP iterating. DO NOT restart the project from scratch; build upon the existing files in the directory.
The backend will intercept this block and execute it natively in the requested shell.`
            }
        });
    }
    const getDrives = () => {
        return new Promise((resolve) => {
            const proc = spawn('powershell.exe', ['-Command', '(Get-WmiObject Win32_LogicalDisk).DeviceID']);
            let output = '';
            proc.stdout.on('data', (data) => output += data.toString());
            proc.on('close', () => {
                const drives = output.split('\n').map(d => d.trim()).filter(d => d.length > 0);
                resolve(drives);
            });
        });
    };

    // Helper function to resolve paths
    const resolvePath = (targetPath) => {
        if (targetPath === '/') return '/'; // Special root case for drives
        return path.resolve(socket.currentDir, targetPath);
    };

    // Helper to persist the current Chat Logs to the active project folder
    const saveChatHistory = () => {
        if (!socket.currentDir) return;
        try {
            const historyPath = path.join(socket.currentDir, '.antigravity_chat.json');
            fs.writeFileSync(historyPath, JSON.stringify(socket.terminalLogs, null, 2), 'utf8');
        } catch(e) { console.error("Could not save chat history:", e); }
    };

    // Phase 14: Project Settings IO
    const loadProjectSettings = (dirPath) => {
        if (!dirPath) return {};
        try {
            const settingsPath = path.join(dirPath, '.antigravity_settings.json');
            if (fs.existsSync(settingsPath)) {
                return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            }
        } catch (e) {
            console.error("Error loading project settings:", e);
        }
        return {};
    };

    const saveProjectSettings = (dirPath, settingsObj) => {
        if (!dirPath) return;
        try {
            const settingsPath = path.join(dirPath, '.antigravity_settings.json');
            fs.writeFileSync(settingsPath, JSON.stringify(settingsObj, null, 2), 'utf8');
        } catch (e) {
            console.error("Error saving project settings:", e);
        }
    };

    // Helper for recursive deep file reading (Omniscient Context)
    const readDirectoryContentsDeep = (dir, depth = 0) => {
        if (depth > 5) return ""; // Max depth fuse
        let resultString = "";
        try {
            const items = fs.readdirSync(dir, { withFileTypes: true });
            for (const item of items) {
                // Ignore irrelevant/heavy dirs
                if (['node_modules', '.git', '.next', 'dist', 'build', '.vscode', 'public'].includes(item.name)) continue;
                
                const fullPath = path.join(dir, item.name);
                if (item.isDirectory()) {
                    resultString += readDirectoryContentsDeep(fullPath, depth + 1);
                } else {
                    const ext = path.extname(item.name).toLowerCase();
                    // Only read text-based code files
                    if (['.js','.jsx','.ts','.tsx','.css','.html','.md','.json','.txt', '.env'].includes(ext) || ext === '') {
                        try {
                            const content = fs.readFileSync(fullPath, 'utf8');
                            // Skip huge files
                            if (content.length < 500000) { 
                                resultString += `\n### ${fullPath}\n\`\`\`${ext.replace('.', '')}\n${content}\n\`\`\`\n`;
                            }
                        } catch(e) {}
                    }
                }
            }
        } catch (e) {}
        return resultString;
    };

    // Helper for recursive deep file searching
    const searchFilesRecursively = (dir, query) => {
        let results = [];
        try {
            const items = fs.readdirSync(dir, { withFileTypes: true });
            for (const item of items) {
                // Ignore heavy or irrelevant dirs
                if (['node_modules', '.git', '.next', 'dist', 'build', '.vscode'].includes(item.name)) continue;
                
                const fullPath = path.join(dir, item.name);
                if (item.isDirectory()) {
                    results = results.concat(searchFilesRecursively(fullPath, query));
                } else {
                    const ext = path.extname(item.name).toLowerCase();
                    if (['.js','.jsx','.ts','.tsx','.css','.html','.md','.json','.txt'].includes(ext) || ext === '') {
                        const content = fs.readFileSync(fullPath, 'utf8');
                        const lines = content.split('\n');
                        for (let i = 0; i < lines.length; i++) {
                            if (lines[i].toLowerCase().includes(query.toLowerCase())) {
                                // Extract relatively short snippet around match
                                const snippet = lines[i].trim().substring(0, 150);
                                results.push(`${fullPath}:${i + 1}: ${snippet}`);
                            }
                        }
                    }
                }
            }
        } catch (e) {}
        return results;
    };

    // --- SHELL EXECUTION ---
    socket.on('command', (payload) => {
        if (!payload || typeof payload !== 'object') return;
        
        let { command, mode, autonomous } = payload;
        if (!command || typeof command !== 'string') return;
        command = command.trim();
        
        let taggedFilesContext = '';
        const tagRegex = /@([a-zA-Z0-9_./-]+)/g;
        let tagMatch;
        while ((tagMatch = tagRegex.exec(command)) !== null) {
             const tagPath = tagMatch[1];
             const safeTagPath = resolvePath(tagPath);
             try {
                 if (fs.existsSync(safeTagPath) && fs.statSync(safeTagPath).isFile()) {
                      const content = fs.readFileSync(safeTagPath, 'utf8');
                      taggedFilesContext += `\n[MAPPED CONTEXT FOR @${tagPath}]:\n\`\`\`\n${content}\n\`\`\`\n`;
                 }
             } catch(e) {}
        }
        mode = mode || 'powershell';
        const isAutonomous = autonomous === true;
        socket.isAborting = false;

        let proc;
        try {
            // Prevent attempting to spawn in the special logical root '/'
            const cwd = socket.currentDir === '/' ? 'C:\\' : socket.currentDir;
            
            // Generic AutoScaffold Logic for both Gemini and future AI tabs
            const processAutoScaffold = async (fullResponse, aiMode, loopCount, processAITurnCallback) => {
                 if (socket.isAborting) {
                      socket.emit('output', { text: `\n[SYSTEM] Loop completely shredded. Kill sequence recognized.\n`, mode: aiMode });
                      socket.emit('system:dev_loop_end');
                      return;
                 }
                socket.emit('output', { text: `\n\n[${aiMode.toUpperCase()} response finished. Scanning for automated tasks...]\n`, mode: aiMode });
                
                const blockRegex = /```([\w-]+):([a-zA-Z0-9_./-]+)\n([\s\S]*?)```/g;
                let match;
                let tasksCompleted = 0;
                
                const pendingTasks = [];
                
                while ((match = blockRegex.exec(fullResponse)) !== null) {
                    const prefix = match[1].trim().toLowerCase();
                    const targetName = match[2].trim();
                    const content = match[3].trim();
                    
                    if (prefix === 'run') {
                        if (targetName.toLowerCase() === 'port') {
                             pendingTasks.push({ type: 'port_scan' });
                        } else if (targetName.toLowerCase() === 'context') {
                             pendingTasks.push({ type: 'context_save', content: content });
                        } else if (targetName.toLowerCase() === 'fetch') {
                             pendingTasks.push({ type: 'fetch_url', url: content });
                        } else if (targetName.toLowerCase() === 'search') {
                             pendingTasks.push({ type: 'search_files', query: content });
                        } else if (targetName.toLowerCase() === 'delete') {
                             pendingTasks.push({ type: 'file_delete', target: content });
                        } else if (targetName.toLowerCase() === 'rename') {
                             pendingTasks.push({ type: 'file_rename', content: content });
                        } else if (targetName.toLowerCase() === 'snapshot') {
                             pendingTasks.push({ type: 'snapshot', url: content });
                        } else if (targetName.toLowerCase() === 'install') {
                             pendingTasks.push({ type: 'package_install', pkgs: content });
                        } else if (targetName.toLowerCase() === 'lint') {
                             pendingTasks.push({ type: 'lint_file', filename: content });
                        } else {
                             pendingTasks.push({ type: 'command', shell: targetName.toLowerCase(), content: content });
                        }
                    } else if (prefix === 'read') {
                        pendingTasks.push({ type: 'read_file', targetName: targetName });
                    } else if (prefix === 'edit') {
                        pendingTasks.push({ type: 'edit_file', targetName: targetName, content: content });
                    } else {
                        pendingTasks.push({ type: 'file', targetName: targetName, content: content });
                    }
                }
                
                if (pendingTasks.length > 0 && cwd !== 'C:\\' && cwd !== '/') {
                    try {
                        socket.emit('output', { text: `\n[SYSTEM] Creating Time Machine Auto-Git Checkpoint...\n`, mode: aiMode });
                        // Ensure git is initialized
                        if (!fs.existsSync(path.join(cwd, '.git'))) {
                             await execPromise('git init', { cwd });
                        }
                        await execPromise('git add .', { cwd });
                        const timestamp = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
                        await execPromise(`git commit -m "Auto-checkpoint: ${timestamp}"`, { cwd });
                        socket.emit('output', { text: `[SYSTEM] Checkpoint saved successfully.\n`, mode: aiMode });
                    } catch (e) {
                         // It might throw if there is nothing to commit, which is fine
                    }
                }
                
                for (const task of pendingTasks) {
                    tasksCompleted++;
                    
                    if (task.type === 'command') {
                        socket.emit('output', { text: `\n[SYSTEM] Auto-executing background command in ${task.shell} tab: ${task.content}\n`, mode: aiMode });
                        
                        await new Promise((resolve) => {
                            let childProc;
                            try {
                                if (task.shell === 'cmd') {
                                    childProc = spawn('cmd.exe', ['/c', task.content], { cwd });
                                } else {
                                    childProc = spawn('powershell.exe', ['-Command', task.content], { cwd });
                                }
                                
                                childProc.stdout.on('data', (data) => {
                                    pushLog(task.shell, data, aiMode);
                                    socket.emit('output', { text: data.toString(), mode: task.shell });
                                });
                                
                                childProc.stderr.on('data', (data) => {
                                    pushLog(task.shell, data, aiMode);
                                    socket.emit('output', { text: data.toString(), mode: task.shell });
                                });
                                
                                childProc.on('error', (err) => {
                                    pushLog(task.shell, `Error running process: ${err.message}`, aiMode);
                                    socket.emit('output', { text: `Error running process: ${err.message}\n`, mode: task.shell });
                                    resolve(); 
                                });
                                
                                childProc.on('close', (code) => {
                                    pushLog(task.shell, `Process exited with code ${code}`, aiMode);
                                    socket.emit('output', { text: `\n[Process exited with code ${code}]\n`, mode: task.shell });
                                    resolve(); 
                                });
                                
                            } catch (err) {
                                socket.emit('output', { text: `[FS Error] Failed to spawn automated shell command: ${err.message}\n`, mode: task.shell });
                                resolve(); 
                            }
                        });
                        
                    } else if (task.type === 'port_scan') {
                        socket.emit('output', { text: `\n[SYSTEM] Scanning host machine for an available open port (>=3001)...\n`, mode: aiMode });
                        
                        const findOpenPort = (startPort) => {
                            return new Promise((resolve) => {
                                const tempServer = net.createServer();
                                tempServer.listen(startPort, () => {
                                    tempServer.once('close', () => resolve(startPort));
                                    tempServer.close();
                                });
                                tempServer.on('error', () => resolve(findOpenPort(startPort + 1)));
                            });
                        };
                        
                        const openPort = await findOpenPort(3001);
                        socket.emit('output', { text: `[SYSTEM] Open port located at: ${openPort}\n`, mode: aiMode });
                        pushLog(aiMode, `[System Port Scanner] I have confirmed that Port ${openPort} is open and available for use on the host machine.`, aiMode);
                    } else if (task.type === 'context_save') {
                        const targetDir = cwd !== 'C:\\' ? cwd : socket.currentDir;
                        if (targetDir !== 'C:\\' && targetDir !== '/') {
                             const contextPath = path.join(targetDir, '.antigravity_context.md');
                             try {
                                  fs.writeFileSync(contextPath, task.content);
                                  socket.emit('output', { text: `[SYSTEM] Successfully saved project memory to .antigravity_context.md\n`, mode: aiMode });
                             } catch (err) {
                                  socket.emit('output', { text: `[FS Error] Failed to write context memory: ${err.message}\n`, mode: aiMode });
                             }
                        }
                    } else if (task.type === 'fetch_url') {
                        socket.emit('output', { text: `\n[SYSTEM] Agent invoked Web Discovery Engine. Fetching: ${task.url}\n`, mode: aiMode });
                        try {
                             const fetchRes = await fetch(task.url.trim());
                             if (fetchRes.ok) {
                                  const textContent = await fetchRes.text();
                                  // Strip out script and style tags to prevent context bloating, then convert to basic text
                                  const cleanText = textContent.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                                                               .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
                                                               .replace(/<[^>]+>/g, ' ')
                                                               .replace(/\s+/g, ' ').substring(0, 15000); // 15k char bound to protect prompt memory
                                  pushLog(aiMode, `[System Web Fetch Tool] Successfully scraped ${task.url}:\n\`\`\`\n${cleanText}\n\`\`\``, aiMode);
                             } else {
                                  pushLog(aiMode, `[System Web Fetch Tool] Failed to fetch ${task.url}: HTTP ${fetchRes.status}`, aiMode);
                             }
                        } catch (err) {
                             pushLog(aiMode, `[System Web Fetch Tool] Failed to fetch ${task.url}: Network error or invalid URL.`, aiMode);
                        }
                    } else if (task.type === 'read_file') {
                        const safeFilePath = resolvePath(task.targetName);
                        try {
                             if (fs.existsSync(safeFilePath)) {
                                  const fileContent = fs.readFileSync(safeFilePath, 'utf8');
                                  pushLog(aiMode, `[System Read Tool] Successfully read ${task.targetName}:\n\`\`\`\n${fileContent}\n\`\`\``, aiMode);
                                  socket.emit('output', { text: `[SYSTEM] Successfully read file: ${task.targetName}\n`, mode: aiMode });
                             } else {
                                  pushLog(aiMode, `[System Read Tool] Failed to read ${task.targetName}: File does not exist.`, aiMode);
                                  socket.emit('output', { text: `[FS Error] Failed to read ${task.targetName}: File not found\n`, mode: aiMode });
                             }
                        } catch (err) {
                             pushLog(aiMode, `[System Read Tool] Error reading ${task.targetName}: ${err.message}`, aiMode);
                        }
                    } else if (task.type === 'edit_file') {
                        const safeFilePath = resolvePath(task.targetName);
                        try {
                             if (fs.existsSync(safeFilePath)) {
                                  let fileContent = fs.readFileSync(safeFilePath, 'utf8');
                                  const searchMatch = task.content.match(/<<<\s*SEARCH\n([\s\S]*?)===\s*REPLACE\n([\s\S]*?)>>>/);
                                  if (searchMatch) {
                                       const searchStr = searchMatch[1];
                                       const replaceStr = searchMatch[2];
                                       if (fileContent.includes(searchStr)) {
                                            fileContent = fileContent.replace(searchStr, replaceStr);
                                            fs.writeFileSync(safeFilePath, fileContent);
                                            pushLog(aiMode, `[System Edit Tool] Successfully edited ${task.targetName}.`, aiMode);
                                            socket.emit('output', { text: `[SYSTEM] Successfully edited: ${task.targetName}\n`, mode: aiMode });
                                       } else {
                                            pushLog(aiMode, `[System Edit Tool] Failed to edit ${task.targetName}: The SEARCH block did not exactly match any content in the file. Ensure you matched whitespace perfectly.`, aiMode);
                                            socket.emit('output', { text: `[FS Error] Edit Failed for ${task.targetName}: SEARCH string not found.\n`, mode: aiMode });
                                       }
                                  } else {
                                       pushLog(aiMode, `[System Edit Tool] Failed to edit ${task.targetName}: Invalid edit block format. Ensure you used <<< SEARCH, === REPLACE, and >>> markers.`, aiMode);
                                       socket.emit('output', { text: `[FS Error] Edit Failed for ${task.targetName}: Invalid format.\n`, mode: aiMode });
                                  }
                             } else {
                                  pushLog(aiMode, `[System Edit Tool] Failed to edit ${task.targetName}: File does not exist.`, aiMode);
                                  socket.emit('output', { text: `[FS Error] Failed to edit ${task.targetName}: File not found\n`, mode: aiMode });
                             }
                        } catch (err) {
                             pushLog(aiMode, `[System Edit Tool] Error editing ${task.targetName}: ${err.message}`, aiMode);
                        }
                    } else if (task.type === 'search_files') {
                        let safeSearchDir = cwd !== 'C:\\' ? cwd : socket.currentDir;
                        if (safeSearchDir !== 'C:\\' && safeSearchDir !== '/') {
                             socket.emit('output', { text: `\n[SYSTEM] Agent invoked Semantic Workspace Search. Scanning for '${task.query.trim()}'...\n`, mode: aiMode });
                             const results = searchFilesRecursively(safeSearchDir, task.query.trim());
                             if (results.length > 0) {
                                  // Cap results length to protect context window
                                  const formattedResults = results.slice(0, 100).join('\n');
                                  const limitNote = results.length > 100 ? `\n... (and ${results.length - 100} more matches)` : '';
                                  pushLog(aiMode, `[System Workspace Search] Found ${results.length} matches for '${task.query.trim()}':\n\`\`\`\n${formattedResults}${limitNote}\n\`\`\``, aiMode);
                                  socket.emit('output', { text: `[SYSTEM] Search complete. Found ${results.length} instances.\n`, mode: aiMode });
                             } else {
                                  pushLog(aiMode, `[System Workspace Search] Search returned 0 results for '${task.query.trim()}'.`, aiMode);
                                  socket.emit('output', { text: `[SYSTEM] Search returned 0 results.\n`, mode: aiMode });
                             }
                        } else {
                             pushLog(aiMode, `[System Workspace Search] Error: Cannot execute recursive search on drive root.`, aiMode);
                        }
                    } else if (task.type === 'file_delete') {
                        const safePath = resolvePath(task.target.trim());
                        if (safePath !== WORKSPACE_DIR && safePath !== os.homedir()) {
                            try {
                                if (fs.existsSync(safePath)) {
                                     fs.rmSync(safePath, { recursive: true, force: true });
                                     socket.emit('output', { text: `[SYSTEM] Autonomously Deleted: ${task.target}\n`, mode: aiMode });
                                     pushLog(aiMode, `[System Delete Tool] Successfully deleted ${task.target}.`, aiMode);
                                } else {
                                     pushLog(aiMode, `[System Delete Tool] Target ${task.target} does not exist.`, aiMode);
                                }
                            } catch (e) {
                                pushLog(aiMode, `[System Delete Tool] Failed: ${e.message}`, aiMode);
                            }
                        }
                    } else if (task.type === 'file_rename') {
                        try {
                            const [oldPath, newPath] = task.content.split('\n').map(l => l.trim()).filter(l => l);
                            if (oldPath && newPath) {
                                 const oldAbs = resolvePath(oldPath);
                                 const newAbs = resolvePath(newPath);
                                 if (fs.existsSync(oldAbs)) {
                                      fs.renameSync(oldAbs, newAbs);
                                      socket.emit('output', { text: `[SYSTEM] Autonomously Renamed: ${oldPath} -> ${newPath}\n`, mode: aiMode });
                                      pushLog(aiMode, `[System Rename Tool] Successfully renamed ${oldPath} to ${newPath}.`, aiMode);
                                 } else {
                                      pushLog(aiMode, `[System Rename Tool] Failed: Target ${oldPath} mapped to ${oldAbs} does not exist.`, aiMode);
                                 }
                            }
                        } catch(e) {
                             pushLog(aiMode, `[System Rename Tool] Failed: ${e.message}`, aiMode);
                        }
                    } else if (task.type === 'lint_file') {
                        socket.emit('output', { text: `\n[SYSTEM] Agent invoked Syntax Linter on: ${task.filename}\n`, mode: aiMode });
                        try {
                            const lintTarget = resolvePath(task.filename.trim());
                            if (fs.existsSync(lintTarget)) {
                                 const { stdout, stderr } = await execPromise(`node --check "${lintTarget}"`, { cwd });
                                 pushLog(aiMode, `[System Linter] Successfully passed syntax check for ${task.filename}.`, aiMode);
                                 socket.emit('output', { text: `[SYSTEM] Syntax check passed.\n`, mode: aiMode });
                            } else {
                                 pushLog(aiMode, `[System Linter] Failed: File ${task.filename} does not exist.`, aiMode);
                                 socket.emit('output', { text: `[FS Error] File not found.\n`, mode: aiMode });
                            }
                        } catch (err) {
                            pushLog(aiMode, `[System Linter] Syntax Error found in ${task.filename}:\n${err.stderr || err.message}`, aiMode);
                            socket.emit('output', { text: `[System Error] Syntax check failed for ${task.filename}.\n`, mode: aiMode });
                        }
                    } else if (task.type === 'package_install') {
                        socket.emit('output', { text: `\n[SYSTEM] Agent invoked Native Package Manager. Installing dependencies...\n`, mode: aiMode });
                        try {
                            const pkgs = task.pkgs.split('\n').map(p => p.trim()).filter(p => p).join(' ');
                            if (pkgs) {
                                socket.emit('output', { text: `[SYSTEM] Running: npm install ${pkgs}\n`, mode: aiMode });
                                const { stdout, stderr } = await execPromise(`npm install ${pkgs}`, { cwd });
                                pushLog(aiMode, `[System Package Manager] Successfully installed ${pkgs}.\nOutput:\n${stdout}`, aiMode);
                                socket.emit('output', { text: `[SYSTEM] Packages successfully installed.\n`, mode: aiMode });
                            }
                        } catch (err) {
                            pushLog(aiMode, `[System Package Manager] Failed to install packages: ${err.message}`, aiMode);
                            socket.emit('output', { text: `[System Error] npm install failed: ${err.message}\n`, mode: aiMode });
                        }
                    } else if (task.type === 'snapshot') {
                        socket.emit('output', { text: `\n[SYSTEM] Agent invoked Visual QA Snapshot Tool. Initializing headless engine for: ${task.url}\n`, mode: aiMode });
                        try {
                            const browser = await puppeteer.launch({ 
                                headless: 'new',
                                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
                                args: ['--no-sandbox', '--disable-setuid-sandbox']
                            });
                            const page = await browser.newPage();
                            await page.setViewport({ width: 1280, height: 800 });
                            
                            socket.emit('output', { text: `[SYSTEM] Navigating to ${task.url}...\n`, mode: aiMode });
                            // Wait until network is mostly idle to ensure CSS/JS has evaluated
                            await page.goto(task.url.trim(), { waitUntil: 'networkidle0', timeout: 15000 });
                            
                            socket.emit('output', { text: `[SYSTEM] Capturing viewport...\n`, mode: aiMode });
                            const b64Screen = await page.screenshot({ encoding: 'base64' });
                            await browser.close();
                            
                            // Attach the image object directly to the pending logs for this turn
                            pushLog(aiMode, `[System Snapshot Tool] Successfully captured visual screenshot of ${task.url}. Image data attached to context window.`, aiMode);
                            socket.emit('output', { text: `[SYSTEM] Snapshot successful. Image injected into Agent visual cortex.\n`, mode: aiMode });
                            
                            // To actually feed this to Gemini, we need to pass the multimodal object back in the next `processAITurnCallback`.
                            // So we attach the image to the socket object temporarily so the callback can find it:
                            if (!socket.pendingImages) socket.pendingImages = [];
                            socket.pendingImages.push({
                                inlineData: {
                                    data: b64Screen,
                                    mimeType: "image/png"
                                }
                            });
                            
                        } catch (err) {
                            pushLog(aiMode, `[System Snapshot Tool] Failed to snapshot ${task.url}: ${err.message}`, aiMode);
                            socket.emit('output', { text: `[System Error] Puppeteer failed: ${err.message}\n`, mode: aiMode });
                        }
                    } else if (task.type === 'file') {
                        const safeFilePath = resolvePath(task.targetName);
                        
                        if (cwd !== 'C:\\' && safeFilePath !== '/') {
                            try {
                                const targetDir = path.dirname(safeFilePath);
                                if (!fs.existsSync(targetDir)) {
                                    fs.mkdirSync(targetDir, { recursive: true });
                                }
                                
                                fs.writeFileSync(safeFilePath, task.content);
                                socket.emit('output', { text: `[SYSTEM] Successfully generated: ${task.targetName}\n`, mode: aiMode });
                            } catch (fileErr) {
                                socket.emit('output', { text: `[FS Error] Failed to write ${task.targetName}: ${fileErr.message}\n`, mode: aiMode });
                            }
                        } else {
                            socket.emit('output', { text: `[FS Error] Cannot scaffold files directly into the drive root.\n`, mode: aiMode });
                        }
                    }
                }
                
                if (tasksCompleted > 0) {
                    socket.emit('output', { text: `\n[SYSTEM] Automated tasks complete. ${tasksCompleted} actions resolved.\n\n`, mode: aiMode });
                    socket.emit('fs:refresh_request'); 
                    
                    const hasFeedbackTask = pendingTasks.some(t => ['command', 'read_file', 'edit_file', 'port_scan', 'fetch_url', 'search_files'].includes(t.type));
                    if (socket.isAborting) {
                        socket.emit('output', { text: `\n[SYSTEM] Loop aborted gracefully after completing pending execution tasks.\n`, mode: aiMode });
                        socket.emit('system:dev_loop_end');
                        return;
                    }
                    if (hasFeedbackTask && processAITurnCallback && isAutonomous) {
                        socket.emit('output', { text: `[SYSTEM] Auto-feeding system feedback back to ${aiMode.toUpperCase()} for autonomous evaluation...\n`, mode: aiMode });
                        const autoPrompt = `[Automated System Feedback] The requested actions have finished executing. Here is the recent system feedback and terminal output:\n${socket.terminalLogs[aiMode].join('\n')}\nPlease use this information to proceed with the next step.`;
                        await processAITurnCallback(autoPrompt, loopCount + 1);
                    } else if (!hasFeedbackTask && processAITurnCallback && isAutonomous) {
                        socket.emit('output', { text: `[SYSTEM] Scaffolding tasks complete. Auto-feeding file success back to ${aiMode.toUpperCase()}...\n`, mode: aiMode });
                        const autoPrompt = `[Automated System Feedback] I have successfully scaffolded those ${tasksCompleted} files. Please process the next step of the project scope. If the primary tasks are finished, autonomously identify and implement the next useful feature or improvement.`;
                        await processAITurnCallback(autoPrompt, loopCount + 1);
                    } else if (hasCommands && !isAutonomous) {
                        socket.emit('output', { text: `[SYSTEM] Automated commands finished. Autonomous Development is disabled. Standing by for manual instruction.\n`, mode: aiMode });
                    }
                } else {
                    if (processAITurnCallback && isAutonomous) {
                        const genericBlockRegex = /```(javascript|html|css|json|typescript|ts|tsx|jsx|bash|sh|ps1|python|md|markdown)?\n([\s\S]*?)```/g;
                        const hasGenericBlocks = genericBlockRegex.test(fullResponse);
                        
                        if (hasGenericBlocks) {
                             socket.emit('output', { text: `[SYSTEM] Agent outputted untagged markdown blocks. Injecting targeted syntax error...\n\n`, mode: aiMode });
                             const autoPrompt = `[SYSTEM ERROR] I detected a generic markdown code block in your response. This is INVALID. You MUST use a colon to tag the filename directly after the language (e.g. \`\`\`javascript:src/App.js) so I can parse and save your work! DO NOT output conversational boilerplate, just output the corrected code block.`;
                             await processAITurnCallback(autoPrompt, loopCount + 1);
                        } else {
                             socket.emit('output', { text: `[SYSTEM] Agent outputted text, but no valid scaffolding tasks detected. Enforcing formatting rules...\n\n`, mode: aiMode });
                             const autoPrompt = `[Automated System Feedback] No valid 'run:cmd', 'run:powershell', or 'language:filename' markdown blocks were detected in your last response. You MUST continue iterating the project. Please output the next block using the strict formatting rules. If the current feature is finished, identify and implement the next useful improvement.`;
                             await processAITurnCallback(autoPrompt, loopCount + 1);
                        }
                    } else {
                        socket.emit('output', { text: `[SYSTEM] No valid automated task codeblocks detected.\n\n`, mode: aiMode });
                    }
                }
            };
            
            if (mode.toLowerCase() === 'gemini') {
                if (!process.env.GEMINI_API_KEY || !socket.geminiChat) {
                     socket.emit('output', { text: '[System Error] GEMINI_API_KEY is not set in the .env file.\n', mode: 'gemini' });
                     return;
                }
                
                // Inject the Omniscient Project Context
                const omniscientContext = readDirectoryContentsDeep(cwd);
                
                let persistentContext = '';
                try {
                     const contextPath = path.join(cwd, '.antigravity_context.md');
                     if (fs.existsSync(contextPath)) {
                          persistentContext = `\n\n[PERSISTENT PROJECT MEMORY (.antigravity_context.md)]:\n${fs.readFileSync(contextPath, 'utf8')}\n`;
                     }
                } catch(e) {}
                
                // Phase 14: Load custom settings prompt
                const projectSettings = loadProjectSettings(cwd);
                const customPrompt = projectSettings.systemPrompt ? `[PROJECT LEVEL INSTRUCTIONS]:\n${projectSettings.systemPrompt}\n\n` : '';
                
                const logContext = socket.terminalLogs['gemini'].length > 0 ? `\n\n[Recent Terminal History (Last 50 Lines)]:\n${socket.terminalLogs['gemini'].join('\n')}` : '';
                const contextualizedMessage = `${customPrompt}[System Context: The user is currently operating in the local directory: ${cwd}. \n\n### OMNISCIENT PROJECT STATE ###\nThe following is the complete contents of every code file currently in the project directory:\n${omniscientContext}\n################################\n]${persistentContext}${logContext}${taggedFilesContext}\n\nUser Request: ${command}`;
                
                // We don't want to block the thread, so we immediately execute async code to stream the AI response
                const processGeminiTurn = async (messagePrompt, loopCount = 0) => {
                     if (loopCount >= 15) {
                          socket.emit('output', { text: `\n[SYSTEM] Autonomous loop limit reached (max 15) to prevent runaway API usage.\n`, mode: 'gemini' });
                          return;
                     }
                
                     let fullResponse = '';
                     try {
                          // Assemble multimodal payload if we have pending images from a recent snapshot
                          const messageContents = [messagePrompt];
                          if (socket.pendingImages && socket.pendingImages.length > 0) {
                               messageContents.push(...socket.pendingImages);
                               socket.pendingImages = []; // clear the buffer after feeding to AI
                          }

                          const responseStream = await socket.geminiChat.sendMessageStream({
                              message: messageContents
                          });
                          
                          for await (const chunk of responseStream) {
                              fullResponse += chunk.text;
                              socket.emit('output', { text: chunk.text, mode: 'gemini' });
                          }
                          await processAutoScaffold(fullResponse, 'gemini', loopCount, processGeminiTurn);
                          
                     } catch (err) {
                          socket.emit('output', { text: `[Gemini API Error] ${err.message}\n`, mode: 'gemini' });
                     }
                };
                
                // Kick off the initial turn
                processGeminiTurn(contextualizedMessage);
                
                return; // End execution block here for Gemini; the rest of the spawn events below are for processes
            } else if (mode.toLowerCase() === 'ollama') {
                 const processOllamaTurn = async (messagePrompt, loopCount = 0) => {
                     // Send the system instructions on every turn manually since Ollama api/generate is stateless
                     const systemInstruction = `You are 'AntiGravity', a highly advanced local-system Autonomous MVP Developer capable of writing fully functional software projects directly to the user's hard drive and executing terminal commands. 
CRITICAL FAST-TRACK INSTRUCTIONS: NEVER give step-by-step tutorials on how to create directories or run commands like 'npx create-react-app'. You MUST do the work for them by outputting the exact file structures required or executing the exact commands. Do not write 'boilerplate' or 'placeholder' code; write the fully functioning code required for the project.

If you need to generate or scaffold files, you MUST use the following markdown codeblock format EXACTLY so the system can parse and write it: 
\`\`\`language:filename.ext
<file contents here>
\`\`\` 
For example, to create a react component: 
\`\`\`javascript:src/components/Button.js
export default function Button() { return <button>Click</button>; }
\`\`\`

If you need to automatically execute a terminal command on the user's PC (like 'npm install', 'npm start', or 'npx...'), you MUST use this format:
\`\`\`run:cmd
<command>
\`\`\`
or 
\`\`\`run:powershell
<command>
\`\`\`

If you need to find an open port BEFORE generating your server startup files, you can use the port scanner tool:
\`\`\`run:port
scan
\`\`\`
The backend will immediately scan the host machine for the first open port >=3001 and feed the result back to you seamlessly!

If you need to read the contents of an existing file before modifying it, use the read tool:
\`\`\`read:src/App.js
\`\`\`
The backend will read the file and feed its contents back to you.

If you need to surgically edit an existing file without rewriting the whole thing, use the edit tool. The SEARCH block MUST match the existing file exactly:
\`\`\`edit:src/App.js
<<< SEARCH
<button>Submit</button>
=== REPLACE
<button className="synth-btn">Submit</button>
>>>
\`\`\`

If you need to permanently delete a file or directory to clean up dead code, use the delete tool:
\`\`\`run:delete
src/oldComponent.js
\`\`\`

If you need to safely rename or move a file/directory, use the rename tool (Old Path -> New Path on separate lines):
\`\`\`run:rename
src/oldComponent.js
src/newComponent.js
\`\`\`

If you need to verify the syntax of a JavaScript file before completing your turn, use the lint tool:
\`\`\`run:lint
src/App.js
\`\`\`
The backend will run a syntax check and return any errors to you so you can fix them autonomously.

If you need to safely install npm packages to the project directory without breaking your autonomous loop, use the install tool:
\`\`\`run:install
express mongoose cors
\`\`\`
The backend will silently execute npm install, parse the package.json, and return the execution results to you natively.

If you need to save your current progress, update your checklist, or record notes about the project so you don't forget them on the next turn, you MUST use the context tool:
\`\`\`run:context
# Project Name
- [x] Feature 1
- [ ] Feature 2
[Any other architectural notes, next steps, or logic you want to remember]
\`\`\`
This will overwrite a hidden '.antigravity_context.md' file in the current directory. You should use this frequently whenever you hit a milestone or need to plan ahead!

CRITICAL COMMAND INSTRUCTIONS: 
1. You MUST use 'run:cmd' or 'run:powershell' EXACTLY. NEVER use standard Markdown tags like \`\`\`bash or \`\`\`powershell or the system will fail to execute them!
2. If your generated commands depend on a newly scaffolded folder (like a react app), you MUST include the directory change (e.g., \`cd folderName &&\`) within the command block!
3. Windows PowerShell DOES NOT support the '&&' operator! If you need to chain commands, you MUST use 'run:cmd' instead of 'run:powershell', or use ';' to separate PowerShell commands!
CRITICAL PORT INSTRUCTION: When scaffolding projects that start web servers (React, Node, Vite), you MUST implement auto-incrementing port logic starting at port 3001 or higher to prevent 'EADDRINUSE' crashes, because Port 3000 is strictly reserved for the AntiGravity system. You are HIGHLY ENCOURAGED to use the \`run:port\` tool to find an open port prior to generating your framework's config files!
PROJECT SCOPE INSTRUCTION: You are an Autonomous MVP Developer. Your goal is to deliver a fully working, functional product. If you output valid scaffolding blocks, the system will execute them and feed you the results. You MUST continuously iterate your project, writing out the granular logic for every component, step by step. When a feature is finished, you must autonomously identify and implement the next useful feature, improvement, or UI polish. DO NOT STOP iterating. DO NOT restart the project from scratch; build upon the existing files in the directory.

WHAT NOT TO DO (ANTI-PATTERNS):
- NEVER output a markdown block without a colon and filename (e.g. \`\`\`javascript). This will break the parser! Always use \`\`\`language:filename.ext!
- NEVER apologize or output filler conversational text if you make a mistake. Just output the corrected code block immediately.
- NEVER leave a file partially finished with "// code goes here" comments. Write the complete, functional code.`;

                     // Inject the Omniscient Project Context for Ollama
                     const omniscientContext = readDirectoryContentsDeep(cwd);
                     
                     let persistentContext = '';
                     try {
                          const contextPath = path.join(cwd, '.antigravity_context.md');
                          if (fs.existsSync(contextPath)) {
                               persistentContext = `\n\n[PERSISTENT PROJECT MEMORY (.antigravity_context.md)]:\n${fs.readFileSync(contextPath, 'utf8')}\n`;
                          }
                     } catch(e) {}
                     
                     // Phase 14: Load custom settings prompt
                     const projectSettings = loadProjectSettings(cwd);
                     const customPrompt = projectSettings.systemPrompt ? `[PROJECT LEVEL INSTRUCTIONS]:\n${projectSettings.systemPrompt}\n\n` : '';
                     
                     const logContext = socket.terminalLogs['ollama'].length > 0 ? `\n\n[Recent Terminal History (Last 50 Lines)]:\n${socket.terminalLogs['ollama'].join('\n')}` : '';
                     const contextualizedMessage = `${customPrompt}[System Context: The user is currently operating in the local directory: ${cwd}. \n\n### OMNISCIENT PROJECT STATE ###\nThe following is the complete contents of every code file currently in the project directory:\n${omniscientContext}\n################################\n]${persistentContext}${logContext}${taggedFilesContext}\n\nUser Request: ${messagePrompt}`;
                     
                     try {
                         const payload = {
                             model: 'llama3:8b-instruct-q6_K',
                             prompt: contextualizedMessage,
                             system: systemInstruction,
                             stream: true
                         };
                         
                         const response = await fetch('http://localhost:11434/api/generate', {
                             method: 'POST',
                             headers: { 'Content-Type': 'application/json' },
                             body: JSON.stringify(payload)
                         });
                         
                         if (!response.ok) {
                             throw new Error(`Ollama Server Error: ${response.statusText}`);
                         }
                         
                         const reader = response.body.getReader();
                         const decoder = new TextDecoder('utf-8');
                         let fullResponse = '';
                         
                         while (true) {
                             const { done, value } = await reader.read();
                             if (done) break;
                             
                             const chunkStr = decoder.decode(value, { stream: true });
                             // Ollama streams back newline delineated JSON objects
                             const lines = chunkStr.split('\n').filter(line => line.trim().length > 0);
                             
                             for (const line of lines) {
                                 try {
                                     const json = JSON.parse(line);
                                     if (json.response) {
                                         fullResponse += json.response;
                                         socket.emit('output', { text: json.response, mode: 'ollama' });
                                     }
                                 } catch (e) {
                                     // Malformed json chunk
                                 }
                             }
                         }
                         
                         await processAutoScaffold(fullResponse, 'ollama', loopCount, processOllamaTurn);
                         
                     } catch (err) {
                         socket.emit('output', { text: `[Ollama API Error] Failed to connect to localhost:11434. Is Ollama running? (${err.message})\n`, mode: 'ollama' });
                     }
                 };
                 
                 let dirContents = '';
                 try { dirContents = fs.readdirSync(cwd).join(', '); } catch(e) {}
                 
                 let persistentContext = '';
                 try {
                      const contextPath = path.join(cwd, '.antigravity_context.md');
                      if (fs.existsSync(contextPath)) {
                           persistentContext = `\n\n[PERSISTENT PROJECT MEMORY (.antigravity_context.md)]:\n${fs.readFileSync(contextPath, 'utf8')}\n`;
                      }
                 } catch(e) {}
                 
                 const logContext = socket.terminalLogs['ollama'].length > 0 ? `\n\n[Recent Terminal History (Last 50 Lines)]:\n${socket.terminalLogs['ollama'].join('\n')}` : '';
                 const contextualizedMessage = `[System Context: The user is currently operating in the local directory: ${cwd}. Directory contents: ${dirContents}]${persistentContext}${logContext}${taggedFilesContext}\n\nUser Request: ${command}`;
                 
                 processOllamaTurn(contextualizedMessage);
                 
                 return; // End execution block here for Ollama
            } else if (mode.toLowerCase() === 'cmd') {
                 proc = spawn('cmd.exe', ['/c', command], { cwd });
            } else {
                 // standard powershell
                 proc = spawn('powershell.exe', ['-Command', command], { cwd });
            }
        } catch (err) {
            pushLog(mode, `Error spawning process: ${err.message}`);
            socket.emit('output', { text: `Error spawning process: ${err.message}\n`, mode });
            return;
        }

        proc.stdout.on('data', (data) => {
            pushLog(mode, data, 'manual');
            socket.emit('output', { text: data.toString(), mode });
        });

        proc.stderr.on('data', (data) => {
            pushLog(mode, data, 'manual');
            socket.emit('output', { text: data.toString(), mode });
        });

        proc.on('close', (code) => {
            pushLog(mode, `Process exited with code ${code}`, 'manual');
            socket.emit('output', { text: `\n[Process exited with code ${code}]\n`, mode });
        });
        
        proc.on('error', (err) => {
            pushLog(mode, `Error running process: ${err.message}`, 'manual');
            socket.emit('output', { text: `Error running process: ${err.message}\n`, mode });
        });
    });

    // --- FILE SYSTEM BROWSER API ---
    socket.on('fs:list', async () => {
        try {
             if (socket.currentDir === '/') {
                 // Showing Drives
                 const drives = await getDrives();
                 const files = drives.map(drive => ({
                     name: drive + '\\',
                     isDirectory: true
                 }));
                 socket.emit('fs:list_result', { path: 'My PC (Drives)', items: files });
             } else {
                 // Normal Folder
                 const items = fs.readdirSync(socket.currentDir, { withFileTypes: true });
                 const files = items.map(item => ({
                     name: item.name,
                     isDirectory: item.isDirectory()
                 }));
                 socket.emit('fs:list_result', { path: socket.currentDir, items: files });
             }
        } catch (err) {
             socket.emit('output', `[FS Error]: ${err.message}\n`);
        }
    });

    socket.on('fs:cd', (target) => {
        if (!target) return;
        
        let newPath;
        if (target === '..') {
            if (socket.currentDir === '/') return; // Already at root
            
            const parent = path.resolve(socket.currentDir, '..');
            // If traversing up from C:\, go to the special '/' root
            if (parent === socket.currentDir) {
                newPath = '/';
            } else {
                newPath = parent;
            }
        } else {
             newPath = resolvePath(target);
        }

        try {
            if (newPath === '/') {
                socket.currentDir = newPath;
                socket.emit('output', `[SYSTEM] Directory changed to: My PC (Drives)\n`);
                socket.emit('fs:refresh_request');
            } else if (fs.existsSync(newPath) && fs.statSync(newPath).isDirectory()) {
                socket.currentDir = newPath;
                socket.emit('output', `[SYSTEM] Directory changed to: ${socket.currentDir}\n`);
                socket.emit('fs:refresh_request');
            } else {
                socket.emit('output', `[FS Error]: Directory does not exist.\n`);
            }
        } catch (err) {
            socket.emit('output', `[FS Error]: ${err.message}\n`);
        }
    });

    socket.on('fs:read', (targetPath) => {
        try {
            const safePath = resolvePath(targetPath);
            if (fs.existsSync(safePath) && fs.statSync(safePath).isFile()) {
                const content = fs.readFileSync(safePath, 'utf8');
                socket.emit('fs:read_result', { name: targetPath, content: content });
            }
        } catch (err) {
            socket.emit('output', { text: `[FS Error] Could not read file: ${err.message}\n`, mode: 'browser' });
        }
    });

    socket.on('fs:write', (payload) => {
        try {
            if (!payload || !payload.targetName || typeof payload.content !== 'string') return;
            const safePath = resolvePath(payload.targetName);
            if (socket.currentDir === '/' || safePath === '/') {
                socket.emit('output', { text: `[FS Error] Cannot manually edit files in the root drive.\n`, mode: 'browser' });
                return;
            }
            
            fs.writeFileSync(safePath, payload.content);
            socket.emit('output', { text: `[SYSTEM] Manual Edit Saved: ${payload.targetName}\n`, mode: 'browser' });
            pushLog('browser', `[User Manual Edit] The user manually edited ${payload.targetName} from the Mobile UI.`, 'browser');
        } catch (err) {
            socket.emit('output', { text: `[FS Error] Could not save file: ${err.message}\n`, mode: 'browser' });
        }
    });

    socket.on('fs:mkdir', (folderName) => {
        if (!folderName) return;
        if (socket.currentDir === '/') {
            socket.emit('output', '[FS Error] Cannot create a folder at the drive root.\n');
            return;
        }
        
        const newPath = resolvePath(folderName);
        try {
            if (!fs.existsSync(newPath)) {
                fs.mkdirSync(newPath);
                socket.emit('output', `[SYSTEM] Created directory: ${folderName}\n`);
                socket.emit('fs:refresh_request');
            } else {
            }
        } catch (err) {
            socket.emit('output', `[FS Error]: ${err.message}\n`);
        }
    });

    socket.on('fs:rename', (payload) => {
        try {
            if (!payload || !payload.oldPath || !payload.newPath) return;
            const oldAbs = resolvePath(payload.oldPath);
            const newAbs = resolvePath(payload.newPath);
            fs.renameSync(oldAbs, newAbs);
            socket.emit('output', { text: `[FS] Renamed ${payload.oldPath} -> ${payload.newPath}\n`, mode: 'browser' });
            socket.emit('fs:refresh_request');
            pushLog('browser', `[User Manual Edit] The user renamed ${payload.oldPath} to ${payload.newPath}.`, 'browser');
        } catch (err) {
            socket.emit('output', { text: `[FS Error] Rename Failed: ${err.message}\n`, mode: 'browser' });
        }
    });

    socket.on('fs:delete', (payload) => {
        try {
            if (!payload || !payload.targetPath) return;
            const safePath = resolvePath(payload.targetPath);
            // Protect against deleting the root execution directory accidentally
            if (safePath === WORKSPACE_DIR || safePath === os.homedir()) {
                 socket.emit('output', { text: `[FS Error] Cannot delete root workspace directory!\n`, mode: 'browser' });
                 return;
            }
            fs.rmSync(safePath, { recursive: true, force: true });
            socket.emit('output', { text: `[FS] Deleted ${payload.targetPath}\n`, mode: 'browser' });
            socket.emit('fs:refresh_request');
            pushLog('browser', `[User Manual Edit] The user deleted ${payload.targetPath}.`, 'browser');
        } catch (err) {
            socket.emit('output', { text: `[FS Error] Delete Failed: ${err.message}\n`, mode: 'browser' });
        }
    });

    socket.on('system:abort', () => {
        socket.isAborting = true;
    });

    socket.on('system:timemachine', async () => {
         const targetDir = socket.currentDir !== '/' ? socket.currentDir : 'C:\\';
         if (targetDir === 'C:\\' || targetDir === '/') {
              socket.emit('output', { text: `[Time Machine Error] Cannot rollback the root drive.\n`, mode: 'browser' });
              return;
         }
         try {
             socket.emit('output', { text: `\n[SYSTEM] INITIATING TIME MACHINE REVERT TO LAST CHECKPOINT...\n`, mode: 'browser' });
             await execPromise('git reset --hard HEAD~1', { cwd: targetDir });
             await execPromise('git clean -fd', { cwd: targetDir });
             socket.emit('output', { text: `[SYSTEM] TIME MACHINE REVERT COMPLETE. Workspace restored to previous stable state.\n`, mode: 'browser' });
             socket.emit('fs:refresh_request');
         } catch (e) {
             socket.emit('output', { text: `[Time Machine Error] Failed to rollback. Are there previous commits?\n${e.message}\n`, mode: 'browser' });
         }
    });

    // --- PHASE 7: PROJECT MANAGER ---
    socket.on('system:list_chats', () => {
        try {
            const projectsDir = getProjectsDir();
            const items = fs.readdirSync(projectsDir, { withFileTypes: true });
            const chats = [];
            
            for (const item of items) {
                if (item.isDirectory()) {
                    const projectPath = path.join(projectsDir, item.name);
                    const historyPath = path.join(projectPath, '.antigravity_chat.json');
                    
                    chats.push({
                        id: item.name,
                        path: projectPath,
                        hasHistory: fs.existsSync(historyPath)
                    });
                }
            }
            
            // Sort by most recently created (basic alphabetical for UUIDs or custom if timestamped)
            socket.emit('system:chats_result', chats);
        } catch (e) {
            console.error("Failed to list chats", e);
        }
    });

    socket.on('system:new_chat', (payload) => {
        try {
            const projectName = payload?.name || `Project_${crypto.randomUUID().substring(0,8)}`;
            const newPath = path.join(getProjectsDir(), projectName);
            
            if (!fs.existsSync(newPath)) {
                fs.mkdirSync(newPath, { recursive: true });
            }
            
            socket.currentDir = newPath;
            
            // Reset local memory for the new chat
            socket.terminalLogs = {
                cmd: [],
                powershell: [],
                gemini: [],
                ollama: [],
                manual: []
            };
            
            socket.emit('output', { text: `\n[SYSTEM] Started new workspace: ${projectName}\n`, mode: 'gemini' });
            socket.emit('fs:refresh_request');
            socket.emit('system:chats_refresh_request');
        } catch(e) {
            socket.emit('output', { text: `[Error making new chat] ${e.message}\n`, mode: 'gemini' });
        }
    });

    socket.on('system:load_chat', (projectId) => {
        try {
            const projectPath = path.join(getProjectsDir(), projectId);
            if (!fs.existsSync(projectPath)) return;
            
            socket.currentDir = projectPath;
            const historyPath = path.join(projectPath, '.antigravity_chat.json');
            
            if (fs.existsSync(historyPath)) {
                const history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
                if (history && typeof history === 'object') {
                    socket.terminalLogs = history;
                }
            } else {
                // Folder exists but no history file, fresh state
                socket.terminalLogs = { cmd: [], powershell: [], gemini: [], ollama: [], manual: [] };
            }
            
            socket.emit('system:chat_loaded', socket.terminalLogs);
            socket.emit('output', { text: `\n[SYSTEM] Restored workspace context: ${projectId}\n`, mode: 'gemini' });
            socket.emit('fs:refresh_request');
        } catch(e) {
            socket.emit('output', { text: `[Error loading chat] ${e.message}\n`, mode: 'gemini' });
        }
    });

    // Phase 14: Project Settings
    socket.on('system:get_settings', (payload) => {
        if (!payload || !payload.projectId) return;
        const projectPath = path.join(getProjectsDir(), payload.projectId);
        const settingsObj = loadProjectSettings(projectPath);
        socket.emit('system:settings_loaded', settingsObj);
    });

    socket.on('system:save_settings', (payload) => {
        if (!payload || !payload.projectId) return;
        const projectPath = path.join(getProjectsDir(), payload.projectId);
        saveProjectSettings(projectPath, payload);
        socket.emit('output', { text: `\n[SYSTEM] Project Settings Saved for ${payload.projectId}.\n`, mode: 'gemini' });
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });

function startServer(port) {
    server.listen(port, '0.0.0.0', () => {
        console.log(`remotIDE server listening on http://0.0.0.0:${port}`);
    });

    server.once('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.log(`Port ${port} is in use, trying port ${port + 1}...`);
            startServer(port + 1);
        } else {
            console.error(err);
        }
    });
}

startServer(PORT);
