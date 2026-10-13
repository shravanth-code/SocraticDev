import { useState, useRef, useEffect, useCallback } from 'react';
import Editor from '@monaco-editor/react';

// ─── Groq / AI Config (Preserved) ───────────────────────────────────────────
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'openai/gpt-oss-120b';

const SYSTEM_PROMPT =
  'You are SocraticDev, an IDE coding mentor. NEVER give complete code on the first try. Guide the user through questions. Keep answers under 80 words.';

// ─── Helper: File language detection ─────────────────────────────────────────
function getFileLanguage(filename) {
  if (!filename) return 'plaintext';
  const ext = filename.split('.').pop().toLowerCase();
  const map = {
    py: 'python',
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    hpp: 'cpp',
    html: 'html',
    css: 'css',
    json: 'json',
    md: 'markdown',
    sql: 'sql',
    sh: 'shell',
    java: 'java',
    rs: 'rust',
    go: 'go',
    txt: 'plaintext',
  };
  return map[ext] || 'plaintext';
}

// ─── Helper: File extension badge ───────────────────────────────────────────
function LangBadge({ lang, filename }) {
  const l = lang || (filename ? filename.split('.').pop().toLowerCase() : 'txt');
  const map = {
    py:   { label: '🐍', text: 'PY', color: '#22d3ee' },
    js:   { label: '⚡', text: 'JS', color: '#fbbf24' },
    jsx:  { label: '⚛️', text: 'JSX', color: '#67e8f9' },
    ts:   { label: '📘', text: 'TS', color: '#38bdf8' },
    tsx:  { label: '⚛️', text: 'TSX', color: '#818cf8' },
    c:    { label: '⚙️', text: 'C',  color: '#fbbf24' },
    cpp:  { label: '⚙️', text: 'C++', color: '#f97316' },
    html: { label: '🌐', text: 'HTML', color: '#f87171' },
    css:  { label: '🎨', text: 'CSS', color: '#a78bfa' },
    json: { label: '{ }', text: 'JSON', color: '#fb923c' },
    md:   { label: '📄', text: 'MD', color: '#38bdf8' },
    txt:  { label: '📝', text: 'TXT', color: '#94a3b8' },
  };
  const m = map[l] || { label: '📄', text: l.toUpperCase(), color: '#94a3b8' };
  return (
    <span style={{ fontSize: 12, lineHeight: 1 }} title={m.text}>
      {m.label}
    </span>
  );
}

// ─── Helper: Render markdown bold + inline code ─────────────────────────────
function RenderMessage({ content }) {
  const parts = content.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**'))
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        if (part.startsWith('`') && part.endsWith('`'))
          return (
            <code
              key={i}
              style={{
                fontFamily: 'Fira Code, monospace',
                fontSize: 11,
                color: '#fbbf24',
                background: 'rgba(251,191,36,0.08)',
                padding: '1px 4px',
                borderRadius: 3,
              }}
            >
              {part.slice(1, -1)}
            </code>
          );
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN APPLICATION COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function App() {
  // ── Clean Slate Workspace State (No hardcoded files!) ──────────────────────
  const [files, setFiles] = useState([]);
  const [activeFileId, setActiveFileId] = useState(null);
  const [openTabs, setOpenTabs] = useState([]);
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [newFileName, setNewFileName] = useState('');

  // ── Layout Toggles ─────────────────────────────────────────────────────────
  const [showSidebar, setShowSidebar] = useState(true);
  const [showMentor, setShowMentor] = useState(true);
  const [showTerminal, setShowTerminal] = useState(true);
  const [showMinimap, setShowMinimap] = useState(true);

  // ── Active Dropdown Menu State ─────────────────────────────────────────────
  const [activeMenu, setActiveMenu] = useState(null);

  // ── Status & Notification State ───────────────────────────────────────────
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [toastMessage, setToastMessage] = useState(null);

  // ── Socratic Mentor & Groq State (Intact) ──────────────────────────────────
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content:
        "Welcome to **SocraticDev Studio PRO**! Your workspace is fresh and clean. Click **+ New File** in the explorer to start writing your algorithm, and use the Socratic tools on the right to guide your reasoning.",
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [inlineInput, setInlineInput] = useState('');

  // ── Terminal State ────────────────────────────────────────────────────────
  const [terminalLog, setTerminalLog] = useState([
    { type: 'info', text: 'SocraticDev Studio PRO [Version 2.4.0]' },
    { type: 'info', text: 'Connected to neural-kernel-workspace (Clean slate)' },
    { type: 'prompt', text: 'ready for commands or execution...' },
  ]);

  // ── References ────────────────────────────────────────────────────────────
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);
  const terminalRef = useRef(null);
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const menuBarRef = useRef(null);
  const newFileInputRef = useRef(null);

  const apiKey = import.meta.env.VITE_AI_API_KEY;
  const activeFile = files.find((f) => f.id === activeFileId) || null;

  // ── Show brief toast notification ──────────────────────────────────────────
  const showToast = useCallback((msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 2400);
  }, []);

  // ── Auto-scroll chat & terminal ────────────────────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (terminalRef.current)
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
  }, [terminalLog]);

  // ── Click outside to close menus ──────────────────────────────────────────
  useEffect(() => {
    function handleClickOutside(e) {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target)) {
        setActiveMenu(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ── Interactive File System Handlers ──────────────────────────────────────
  const startCreatingFile = () => {
    setShowSidebar(true);
    setIsCreatingFile(true);
    setNewFileName('');
    setTimeout(() => {
      newFileInputRef.current?.focus();
    }, 50);
  };

  const confirmCreateFile = () => {
    let rawName = newFileName.trim();
    if (!rawName) {
      rawName = `untitled-${files.length + 1}.py`;
    }

    // Default extension to .py if none provided
    if (!rawName.includes('.')) {
      rawName += '.py';
    }

    const newId = `file_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newFileObj = {
      id: newId,
      name: rawName,
      content: '',
      lang: getFileLanguage(rawName),
    };

    setFiles((prev) => [...prev, newFileObj]);
    setOpenTabs((prev) => (prev.includes(newId) ? prev : [...prev, newId]));
    setActiveFileId(newId);
    setIsCreatingFile(false);
    setNewFileName('');
    showToast(`Created ${rawName}`);
  };

  const cancelCreateFile = () => {
    setIsCreatingFile(false);
    setNewFileName('');
  };

  const selectFile = (fileId) => {
    setActiveFileId(fileId);
    setOpenTabs((prev) => (prev.includes(fileId) ? prev : [...prev, fileId]));
  };

  const closeTab = (fileId) => {
    setOpenTabs((prev) => {
      const filtered = prev.filter((id) => id !== fileId);
      if (activeFileId === fileId) {
        if (filtered.length > 0) {
          setActiveFileId(filtered[filtered.length - 1]);
        } else {
          setActiveFileId(null);
        }
      }
      return filtered;
    });
  };

  const deleteFile = (fileId) => {
    const fileToDelete = files.find((f) => f.id === fileId);
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
    setOpenTabs((prev) => {
      const filtered = prev.filter((id) => id !== fileId);
      if (activeFileId === fileId) {
        setActiveFileId(filtered.length > 0 ? filtered[filtered.length - 1] : null);
      }
      return filtered;
    });
    if (fileToDelete) {
      showToast(`Deleted ${fileToDelete.name}`);
    }
  };

  const handleCodeChange = (newCode) => {
    if (!activeFileId) return;
    setFiles((prev) =>
      prev.map((f) => (f.id === activeFileId ? { ...f, content: newCode ?? '' } : f))
    );
  };

  const handleSaveFile = () => {
    if (activeFile) {
      showToast(`✔ Saved ${activeFile.name}`);
    } else {
      showToast(`✔ All changes up to date`);
    }
  };

  // ── Helper to read current typed text from Monaco Editor ─────────────────
  const getActiveEditorCode = () => {
    if (editorRef.current) {
      return editorRef.current.getValue();
    }
    return activeFile ? activeFile.content : '';
  };

  // ── Groq API Calling Logic (Intact) ───────────────────────────────────────
  async function callGroq(userMessage, historyOverride = null) {
    const history = historyOverride ?? messages;
    const payload = {
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...history.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: userMessage },
      ],
      max_tokens: 300,
      temperature: 0.7,
    };

    const res = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err?.error?.message ?? 'API error');
    }
    const data = await res.json();
    return data.choices[0].message.content;
  }

  async function sendMessage(userText, isHidden = false) {
    if (!userText.trim() || loading) return;
    setLoading(true);
    const userMsg = { role: 'user', content: userText };
    const nextHistory = isHidden ? messages : [...messages, userMsg];
    if (!isHidden) {
      setMessages(nextHistory);
      setInput('');
    }
    try {
      const reply = await callGroq(
        userText,
        isHidden ? messages : nextHistory.slice(0, -1)
      );
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `⚠️ Error: ${e.message}` },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  // ── Three Magic Buttons (Connected to Monaco Editor Code) ────────────────
  async function handleConceptHint() {
    const currentCode = getActiveEditorCode();
    const lang = activeFile ? activeFile.lang : 'python';
    const fname = activeFile ? activeFile.name : 'current buffer';

    const prompt = currentCode.trim()
      ? `The user has this code in their editor (${fname}):\n\`\`\`${lang}\n${currentCode}\n\`\`\`\nExplain the underlying concept and logic WITHOUT giving the answer or writing any new code. Ask a guiding question to help them think it through.`
      : `The user's code editor is currently empty. Ask them what algorithm, data structure, or problem they want to solve today, and provide a thoughtful guiding question to help them get started.`;

    setMessages((prev) => [...prev, { role: 'user', content: '💡 **Concept Hint** requested' }]);
    await sendMessage(prompt, true);
  }

  async function handleCodeSkeleton() {
    const currentCode = getActiveEditorCode();
    const lang = activeFile ? activeFile.lang : 'python';
    const fname = activeFile ? activeFile.name : 'current buffer';

    const prompt = currentCode.trim()
      ? `The user has this code in their editor (${fname}):\n\`\`\`${lang}\n${currentCode}\n\`\`\`\nProvide a boilerplate structure with TODO comments only. Do NOT fill in any logic. Leave all implementation as TODO placeholders.`
      : `The user's code editor is currently empty. Provide a clean boilerplate template structure with TODO comments only for an algorithmic task. Do NOT fill in the core logic.`;

    setMessages((prev) => [...prev, { role: 'user', content: '🧱 **Code Skeleton** requested' }]);
    await sendMessage(prompt, true);
  }

  async function handleUnlockSolution() {
    const currentCode = getActiveEditorCode();
    const lang = activeFile ? activeFile.lang : 'python';
    const fname = activeFile ? activeFile.name : 'current buffer';

    const prompt = currentCode.trim()
      ? `The user has this code in their editor (${fname}):\n\`\`\`${lang}\n${currentCode}\n\`\`\`\nBefore revealing any solution, ask the user exactly ONE quiz question about the core concept in this code. Do not reveal the answer yet. Wait for their response.`
      : `The user's editor is empty. Ask the user one fundamental quiz question about algorithmic edge cases and design invariants before they begin. Wait for their response.`;

    setMessages((prev) => [...prev, { role: 'user', content: '🔓 **Unlock Solution** requested' }]);
    await sendMessage(prompt, true);
  }

  function handleSend() {
    sendMessage(input, false);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleInlineEnter(e) {
    if (e.key === 'Enter' && inlineInput.trim()) {
      const userQuestion = inlineInput.trim();
      const currentCode = getActiveEditorCode();
      const prompt = currentCode.trim()
        ? `User question inside editor buffer: "${userQuestion}"\n\nCurrent code in editor:\n\`\`\`\n${currentCode}\n\`\`\`\nGuide the user with Socratic questions without writing the full solution.`
        : userQuestion;

      setMessages((prev) => [...prev, { role: 'user', content: userQuestion }]);
      sendMessage(prompt, true);
      setInlineInput('');
    }
  }

  function handleRunCode() {
    setShowTerminal(true);
    const fname = activeFile ? activeFile.name : 'main.py';
    const lang = activeFile ? activeFile.lang : 'python';
    const currentCode = getActiveEditorCode();

    const cmd =
      lang === 'python'
        ? `python3 ${fname}`
        : lang === 'javascript'
        ? `node ${fname}`
        : `./run ${fname}`;

    setTerminalLog((prev) => [
      ...prev,
      { type: 'prompt', text: cmd },
      {
        type: 'info',
        text: currentCode.trim()
          ? `Executing buffer (${currentCode.split('\n').length} lines) in Socratic environment...`
          : `Warning: Buffer is empty.`,
      },
      {
        type: 'success',
        text: `Execution finished with exit code 0.`,
      },
    ]);
  }

  function handleClearChat() {
    setMessages([
      {
        role: 'assistant',
        content:
          'Chat session reset. What programming concept or bug would you like to explore together in **SocraticDev Studio PRO**?',
      },
    ]);
  }

  // ── Keyboard Shortcuts (Alt+1, Alt+2, Alt+3, Ctrl+N, Ctrl+S) ─────────────
  useEffect(() => {
    function onKey(e) {
      if (e.altKey && e.key === '1') {
        e.preventDefault();
        handleConceptHint();
      } else if (e.altKey && e.key === '2') {
        e.preventDefault();
        handleCodeSkeleton();
      } else if (e.altKey && e.key === '3') {
        e.preventDefault();
        handleUnlockSolution();
      } else if (e.altKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        inputRef.current?.focus();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        startCreatingFile();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        handleSaveFile();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        setShowSidebar((prev) => !prev);
      } else if (e.key === 'F5') {
        e.preventDefault();
        handleRunCode();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [files, activeFileId, loading]);

  // ── Monaco Editor Mount Handler ───────────────────────────────────────────
  function handleEditorDidMount(editor, monaco) {
    editorRef.current = editor;
    monacoRef.current = monaco;

    editor.onDidChangeCursorPosition((e) => {
      setCursorPos({ line: e.position.lineNumber, col: e.position.column });
    });
    editor.focus();
  }

  // ── Top Menu Bar Definitions ──────────────────────────────────────────────
  const MENU_DEFINITIONS = [
    {
      label: 'File',
      items: [
        { label: 'New File', shortcut: 'Ctrl+N', action: () => startCreatingFile() },
        { label: 'Save File', shortcut: 'Ctrl+S', action: () => handleSaveFile() },
        { type: 'separator' },
        {
          label: 'Close Tab',
          shortcut: 'Ctrl+W',
          disabled: !activeFileId,
          action: () => activeFileId && closeTab(activeFileId),
        },
        {
          label: 'Close All Tabs',
          disabled: openTabs.length === 0,
          action: () => {
            setOpenTabs([]);
            setActiveFileId(null);
          },
        },
        { type: 'separator' },
        {
          label: 'Clear Workspace',
          action: () => {
            setFiles([]);
            setOpenTabs([]);
            setActiveFileId(null);
            showToast('Workspace reset');
          },
        },
      ],
    },
    {
      label: 'Edit',
      items: [
        {
          label: 'Undo',
          shortcut: 'Ctrl+Z',
          action: () => editorRef.current?.trigger('source', 'undo'),
        },
        {
          label: 'Redo',
          shortcut: 'Ctrl+Y',
          action: () => editorRef.current?.trigger('source', 'redo'),
        },
        { type: 'separator' },
        {
          label: 'Find',
          shortcut: 'Ctrl+F',
          action: () => editorRef.current?.getAction('actions.find')?.run(),
        },
        {
          label: 'Select All',
          shortcut: 'Ctrl+A',
          action: () => editorRef.current?.getAction('editor.action.selectAll')?.run(),
        },
      ],
    },
    {
      label: 'Selection',
      items: [
        {
          label: 'Select All',
          shortcut: 'Ctrl+A',
          action: () => editorRef.current?.getAction('editor.action.selectAll')?.run(),
        },
        {
          label: 'Expand Selection',
          shortcut: 'Shift+Alt+→',
          action: () =>
            editorRef.current?.getAction('editor.action.smartSelect.expand')?.run(),
        },
        {
          label: 'Shrink Selection',
          shortcut: 'Shift+Alt+←',
          action: () =>
            editorRef.current?.getAction('editor.action.smartSelect.shrink')?.run(),
        },
      ],
    },
    {
      label: 'View',
      items: [
        {
          label: showSidebar ? 'Hide File Explorer' : 'Show File Explorer',
          shortcut: 'Ctrl+B',
          action: () => setShowSidebar((prev) => !prev),
        },
        {
          label: showMentor ? 'Hide Socratic Mentor' : 'Show Socratic Mentor',
          action: () => setShowMentor((prev) => !prev),
        },
        {
          label: showTerminal ? 'Hide Terminal Drawer' : 'Show Terminal Drawer',
          shortcut: 'Ctrl+`',
          action: () => setShowTerminal((prev) => !prev),
        },
        {
          label: showMinimap ? 'Hide Minimap' : 'Show Minimap',
          action: () => setShowMinimap((prev) => !prev),
        },
      ],
    },
    {
      label: 'Go',
      items: [
        {
          label: 'Go to Line...',
          shortcut: 'Ctrl+G',
          action: () => editorRef.current?.getAction('editor.action.gotoLine')?.run(),
        },
        {
          label: 'Top of File',
          action: () => editorRef.current?.setPosition({ lineNumber: 1, column: 1 }),
        },
        {
          label: 'Bottom of File',
          action: () => {
            const count = editorRef.current?.getModel()?.getLineCount() || 1;
            editorRef.current?.setPosition({ lineNumber: count, column: 1 });
          },
        },
      ],
    },
    {
      label: 'Run',
      items: [
        { label: 'Run Code', shortcut: 'F5', action: () => handleRunCode() },
        { label: 'Clear Terminal Output', action: () => setTerminalLog([]) },
      ],
    },
    {
      label: 'Terminal',
      items: [
        {
          label: 'New Terminal Prompt',
          action: () => {
            setShowTerminal(true);
            setTerminalLog((prev) => [...prev, { type: 'prompt', text: '' }]);
          },
        },
        { label: 'Clear Terminal', action: () => setTerminalLog([]) },
        {
          label: 'Toggle Terminal',
          action: () => setShowTerminal((prev) => !prev),
        },
      ],
    },
    {
      label: 'Help',
      items: [
        {
          label: '💡 How Socratic Mentor Works',
          action: () => {
            setMessages((prev) => [
              ...prev,
              {
                role: 'assistant',
                content:
                  "**SocraticDev Principles:**\n\n1. **💡 Concept Hint (Alt+1)** — Explains the core theory without giving away answers.\n2. **🧱 Code Skeleton (Alt+2)** — Provides clean templates with `TODO` markers.\n3. **🔓 Unlock Solution (Alt+3)** — Quizzes you before revealing the algorithm.",
              },
            ]);
          },
        },
        {
          label: '⌨️ Keyboard Shortcuts',
          action: () => {
            setMessages((prev) => [
              ...prev,
              {
                role: 'assistant',
                content:
                  "**Quick Shortcuts:**\n- `Alt+1`: Concept Hint\n- `Alt+2`: Code Skeleton\n- `Alt+3`: Unlock Solution\n- `Alt+S`: Focus Chat\n- `Ctrl+N`: New File\n- `Ctrl+S`: Save File\n- `Ctrl+B`: Toggle Explorer\n- `F5`: Run Code",
              },
            ]);
          },
        },
        {
          label: 'ℹ️ About SocraticDev Studio PRO',
          action: () => {
            setMessages((prev) => [
              ...prev,
              {
                role: 'assistant',
                content:
                  '**SocraticDev Studio PRO Edition** — Real VS Code Monaco Editor powered by Groq Llama-3 AI pedagogical mentoring.',
              },
            ]);
          },
        },
      ],
    },
  ];

  // ═════════════════════════════════════════════════════════════════════════
  // JSX RENDERING
  // ═════════════════════════════════════════════════════════════════════════
  return (
    <div className="ide-shell">
      {/* ── 1. TITLE BAR WITH FUNCTIONAL DROPDOWN MENUS ──────────────── */}
      <header className="title-bar">
        <div className="title-bar-left">
          <div className="brand-badge">
            <div className="brand-icon">
              <svg
                width="14"
                height="14"
                fill="none"
                stroke="#22d3ee"
                strokeWidth="2.5"
                viewBox="0 0 24 24"
              >
                <path
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>
          <div className="brand-name">
            <span className="brand-title">SocraticDev Studio</span>
            <span className="brand-pro">PRO</span>
          </div>

          {/* Interactive Menu Bar */}
          <nav className="menu-bar" ref={menuBarRef}>
            {MENU_DEFINITIONS.map((menu) => (
              <div key={menu.label} className="menu-item-wrapper">
                <button
                  className={`menu-item ${
                    activeMenu === menu.label ? 'menu-item-active' : ''
                  }`}
                  onClick={() =>
                    setActiveMenu(activeMenu === menu.label ? null : menu.label)
                  }
                  onMouseEnter={() => {
                    if (activeMenu) setActiveMenu(menu.label);
                  }}
                >
                  {menu.label}
                </button>

                {activeMenu === menu.label && (
                  <div className="menu-dropdown">
                    {menu.items.map((item, idx) =>
                      item.type === 'separator' ? (
                        <div key={idx} className="menu-separator" />
                      ) : (
                        <div
                          key={idx}
                          className={`menu-dropdown-item ${
                            item.disabled ? 'disabled' : ''
                          }`}
                          onClick={() => {
                            if (!item.disabled) {
                              item.action();
                              setActiveMenu(null);
                            }
                          }}
                        >
                          <span className="menu-item-label">{item.label}</span>
                          {item.shortcut && (
                            <kbd className="menu-item-shortcut">{item.shortcut}</kbd>
                          )}
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            ))}
          </nav>
        </div>

        <div className="title-bar-center">
          <div className="command-palette" onClick={startCreatingFile}>
            <svg
              width="14"
              height="14"
              fill="none"
              stroke="#22d3ee"
              viewBox="0 0 24 24"
            >
              <path
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
              />
            </svg>
            <span className="cp-text">
              SocraticDev Studio (PRO) —{' '}
              {activeFile ? activeFile.name : 'Workspace (Empty)'} —
              neural-kernel-workspace
            </span>
            <div className="cp-right">
              <span className="pro-active-pill">
                <span className="pulse-dot" />
                PRO Active
              </span>
              <kbd>Ctrl+P</kbd>
            </div>
          </div>
        </div>

        <div className="title-bar-right">
          <div className="python-pill">
            <span className="status-green" />
            {activeFile ? activeFile.lang.toUpperCase() : 'IDE Ready'}
          </div>
          <div className="wc-btns">
            <button className="wc-btn" title="Minimize">
              −
            </button>
            <button className="wc-btn" title="Maximize">
              □
            </button>
            <button className="wc-btn wc-close" title="Close">
              ✕
            </button>
          </div>
        </div>
      </header>

      {/* ── 2. MAIN WORKSPACE ─────────────────────────────────────────── */}
      <div className="workspace">
        {/* Left Activity Bar */}
        <nav className="activity-bar" aria-label="Activity Bar">
          <div className="activity-top">
            <button
              className={`act-btn ${showSidebar ? 'act-active' : ''}`}
              title="Explorer (Ctrl+B)"
              onClick={() => setShowSidebar((prev) => !prev)}
            >
              {showSidebar && <div className="act-indicator" />}
              <svg
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                viewBox="0 0 24 24"
              >
                <path
                  d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button
              className="act-btn"
              title="Search"
              onClick={() => editorRef.current?.getAction('actions.find')?.run()}
            >
              <svg
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                viewBox="0 0 24 24"
              >
                <path
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button
              className="act-btn"
              title="Source Control"
              style={{ position: 'relative' }}
              onClick={handleSaveFile}
            >
              <svg
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                viewBox="0 0 24 24"
              >
                <circle cx="6" cy="6" r="2.5" />
                <circle cx="6" cy="18" r="2.5" />
                <circle cx="18" cy="10" r="2.5" />
                <path
                  d="M6 8.5v7M8.5 6.5l7 3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="act-badge">{files.length}</span>
            </button>
            <button
              className="act-btn"
              title="Run Code (F5)"
              onClick={handleRunCode}
            >
              <svg
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                viewBox="0 0 24 24"
              >
                <path
                  d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button
              className={`act-btn act-socratic ${showMentor ? 'act-active' : ''}`}
              title="Toggle SocraticDev AI Mentor"
              onClick={() => setShowMentor((prev) => !prev)}
            >
              <svg
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="act-online-dot" />
            </button>
          </div>
          <div className="activity-bottom">
            <button
              className="act-btn"
              title="Settings"
              onClick={() => setShowMinimap((prev) => !prev)}
            >
              <svg
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                viewBox="0 0 24 24"
              >
                <path
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
            <div className="avatar-pill" title="Socratic Developer">
              <span className="avatar-text">PRO</span>
              <span className="avatar-online" />
            </div>
          </div>
        </nav>

        {/* ── INTERACTIVE FILE EXPLORER (React State Driven) ──────────── */}
        {showSidebar && (
          <aside className="file-explorer">
            <div className="explorer-header">
              <span className="explorer-title">EXPLORER — WORKSPACE</span>
              <div className="explorer-actions">
                <button
                  className="exp-btn"
                  title="New File (Ctrl+N)"
                  onClick={startCreatingFile}
                  id="btn-new-file"
                >
                  <svg
                    width="14"
                    height="14"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                    />
                  </svg>
                </button>
                <button
                  className="exp-btn"
                  title="Refresh Workspace"
                  onClick={() => showToast('Explorer refreshed')}
                >
                  <svg
                    width="14"
                    height="14"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                    />
                  </svg>
                </button>
              </div>
            </div>

            <div className="file-tree">
              {/* New file inline input */}
              {isCreatingFile && (
                <div className="file-create-row">
                  <span className="file-create-icon">📄</span>
                  <input
                    ref={newFileInputRef}
                    type="text"
                    className="file-create-input"
                    value={newFileName}
                    onChange={(e) => setNewFileName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') confirmCreateFile();
                      if (e.key === 'Escape') cancelCreateFile();
                    }}
                    onBlur={confirmCreateFile}
                    placeholder="filename.py (Press Enter)"
                    autoFocus
                  />
                </div>
              )}

              {/* Empty state when no files exist */}
              {files.length === 0 && !isCreatingFile && (
                <div className="explorer-empty">
                  <p className="explorer-empty-text">No files in workspace</p>
                  <button
                    className="explorer-new-file-btn"
                    onClick={startCreatingFile}
                  >
                    + New File
                  </button>
                </div>
              )}

              {/* Render dynamic files list */}
              {files.map((f) => (
                <div
                  key={f.id}
                  className={`file-row ${activeFileId === f.id ? 'file-active' : ''}`}
                  onClick={() => selectFile(f.id)}
                >
                  <div className="file-row-inner">
                    <span
                      className={`file-dot ${
                        activeFileId === f.id ? 'file-dot-active' : ''
                      }`}
                    />
                    <LangBadge lang={f.lang} filename={f.name} />
                    <span className="file-name">{f.name}</span>
                  </div>
                  <div className="file-row-actions">
                    {activeFileId === f.id && <span className="file-pro-tag">PRO</span>}
                    <button
                      className="file-delete-btn"
                      title="Delete file"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteFile(f.id);
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Active Session Card */}
            <div className="session-card">
              <div className="session-card-glow" />
              <div className="session-header">
                <span className="session-label">
                  <span className="pulse-dot-sm" />
                  WORKSPACE STATUS
                </span>
                <span className="session-pro">Active</span>
              </div>
              <div className="session-stats">
                <div className="session-row">
                  <span>Files Created:</span>
                  <span className="stat-green">{files.length}</span>
                </div>
                <div className="session-row">
                  <span>Active Buffer:</span>
                  <span style={{ color: '#22d3ee' }}>
                    {activeFile ? activeFile.name : 'None'}
                  </span>
                </div>
              </div>
              <div className="session-bar-bg">
                <div
                  className="session-bar-fill"
                  style={{ width: `${Math.min(files.length * 25, 100)}%` }}
                />
              </div>
            </div>
          </aside>
        )}

        {/* ── 3. CENTER MONACO EDITOR CANVAS ──────────────────────────── */}
        <main className="editor-main">
          {/* Tab Bar */}
          <div className="tab-bar">
            <div className="tabs">
              {openTabs.map((id) => {
                const f = files.find((item) => item.id === id);
                if (!f) return null;
                const isActive = activeFileId === id;
                return (
                  <div
                    key={id}
                    className={`tab ${isActive ? 'tab-active' : 'tab-inactive'}`}
                    onClick={() => selectFile(id)}
                  >
                    <LangBadge lang={f.lang} filename={f.name} />
                    <span>{f.name}</span>
                    {isActive && <span className="tab-dot" />}
                    <button
                      className="tab-close"
                      title="Close Tab (Ctrl+W)"
                      onClick={(e) => {
                        e.stopPropagation();
                        closeTab(id);
                      }}
                    >
                      ✕
                    </button>
                    {isActive && <div className="tab-underline" />}
                  </div>
                );
              })}

              {/* Add tab button */}
              <button
                className="tab-add-btn"
                title="New File (Ctrl+N)"
                onClick={startCreatingFile}
              >
                +
              </button>
            </div>

            <div className="editor-toolbar">
              <button
                className="run-btn"
                onClick={handleRunCode}
                id="btn-run-code"
                title="Run Code (F5)"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path d="M4 4l12 6-12 6z" />
                </svg>
                Run
              </button>
              <button
                className="toolbar-icon-btn"
                title="Toggle Minimap"
                onClick={() => setShowMinimap((prev) => !prev)}
              >
                <svg
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M9 4v16m6-16v16M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  />
                </svg>
              </button>
            </div>
          </div>

          {/* Breadcrumb */}
          <div className="breadcrumb">
            <span className="bc-item">workspace</span>
            <span className="bc-sep">›</span>
            <span className="bc-item">
              {activeFile ? activeFile.name : '(no file open)'}
            </span>
            {activeFile && (
              <>
                <span className="bc-sep">›</span>
                <span className="bc-item bc-class">{activeFile.lang}</span>
              </>
            )}
          </div>

          {/* Monaco Code Editor Canvas */}
          <div className="code-canvas-monaco">
            {activeFile ? (
              <Editor
                height="100%"
                language={activeFile.lang}
                theme="vs-dark"
                value={activeFile.content}
                onChange={handleCodeChange}
                onMount={handleEditorDidMount}
                options={{
                  fontSize: 14,
                  fontFamily: "'Fira Code', 'Cascadia Code', Consolas, monospace",
                  fontLigatures: true,
                  minimap: { enabled: showMinimap },
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  tabSize: 4,
                  lineNumbers: 'on',
                  renderLineHighlight: 'all',
                  smoothScrolling: true,
                  cursorBlinking: 'smooth',
                  cursorSmoothCaretAnimation: 'on',
                  bracketPairColorization: { enabled: true },
                  padding: { top: 12, bottom: 12 },
                  wordWrap: 'on',
                }}
                loading={
                  <div className="monaco-loading">
                    <span className="pulse-dot" />
                    <span>Loading Monaco Editor...</span>
                  </div>
                }
              />
            ) : (
              /* Sleek Empty Workspace Screen */
              <div className="empty-workspace-view">
                <div className="empty-ws-card">
                  <div className="empty-ws-logo">
                    <svg
                      width="38"
                      height="38"
                      fill="none"
                      stroke="#22d3ee"
                      strokeWidth="1.8"
                      viewBox="0 0 24 24"
                    >
                      <path
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <h2 className="empty-ws-title">SocraticDev Studio</h2>
                  <p className="empty-ws-subtitle">
                    Clean workspace ready. Create a file to write code with VS Code
                    Monaco Editor and real-time Socratic AI guidance.
                  </p>

                  <div className="empty-ws-actions">
                    <button
                      className="empty-ws-primary-btn"
                      onClick={startCreatingFile}
                    >
                      <svg
                        width="16"
                        height="16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                      >
                        <path
                          d="M12 4v16m8-8H4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      Create New File
                    </button>
                  </div>

                  <div className="empty-ws-shortcuts">
                    <div className="empty-ws-sc-row">
                      <span>Create New File</span>
                      <kbd>Ctrl+N</kbd>
                    </div>
                    <div className="empty-ws-sc-row">
                      <span>Save Workspace File</span>
                      <kbd>Ctrl+S</kbd>
                    </div>
                    <div className="empty-ws-sc-row">
                      <span>Concept Hint</span>
                      <kbd>Alt+1</kbd>
                    </div>
                    <div className="empty-ws-sc-row">
                      <span>Code Skeleton</span>
                      <kbd>Alt+2</kbd>
                    </div>
                    <div className="empty-ws-sc-row">
                      <span>Unlock Solution</span>
                      <kbd>Alt+3</kbd>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Inline AI Prompt Bar */}
          <div className="inline-ai-bar">
            <div className="inline-ai-pill">
              <div className="inline-ai-input-row">
                <span className="inline-spark">✨</span>
                <input
                  className="inline-ai-input"
                  value={inlineInput}
                  onChange={(e) => setInlineInput(e.target.value)}
                  onKeyDown={handleInlineEnter}
                  placeholder={
                    activeFile
                      ? `Ask Socratic mentor about ${activeFile.name}...`
                      : 'Ask Socratic mentor or create a file to start...'
                  }
                  id="inline-ai-input"
                />
                <kbd className="inline-kbd">Enter</kbd>
              </div>
              <div className="inline-chips">
                <button className="chip chip-indigo" onClick={handleConceptHint}>
                  ✦ Concept Hint
                </button>
                <button className="chip chip-cyan" onClick={handleCodeSkeleton}>
                  ⚡ Code Skeleton
                </button>
                <button className="chip chip-violet" onClick={handleUnlockSolution}>
                  🔍 Quiz / Unlock
                </button>
              </div>
            </div>
          </div>

          {/* Integrated Terminal Drawer */}
          {showTerminal && (
            <div className="terminal-drawer">
              <div className="terminal-tab-bar">
                <div className="terminal-tabs">
                  <span className="term-tab term-active">TERMINAL</span>
                  <span className="term-tab">OUTPUT</span>
                  <span className="term-tab">
                    PROBLEMS
                    <span className="problems-badge">0</span>
                  </span>
                  <span className="term-tab">DEBUG CONSOLE</span>
                </div>
                <div className="terminal-meta">
                  <span>bash — 80x24 (WSL)</span>
                  <button
                    className="term-close"
                    onClick={() => setShowTerminal(false)}
                  >
                    ×
                  </button>
                </div>
              </div>
              <div className="terminal-body" ref={terminalRef}>
                {terminalLog.map((line, i) => (
                  <div key={i} className={`term-line term-${line.type}`}>
                    {line.type === 'prompt' && (
                      <>
                        <span className="term-prompt">
                          user@neural-kernel:~/workspace$
                        </span>{' '}
                        {line.text}
                      </>
                    )}
                    {line.type !== 'prompt' && line.text}
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>

        {/* ── 4. RIGHT SOCRATIC MENTOR PANEL (Completely Intact) ──────── */}
        {showMentor && (
          <aside className="mentor-panel">
            {/* Mentor Header */}
            <div className="mentor-header">
              <div className="mentor-brand">
                <div className="mentor-icon">
                  <svg
                    width="16"
                    height="16"
                    fill="none"
                    stroke="#22d3ee"
                    strokeWidth="2.5"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <div>
                  <div className="mentor-title-row">
                    <h2 className="mentor-title">SocraticDev Mentor</h2>
                    <span className="mentor-pro-pill">PRO Active</span>
                  </div>
                  <div className="mentor-status">
                    <span className="pulse-dot-sm pulse-green" />
                    Socrates Connected
                  </div>
                </div>
              </div>
              <div className="mentor-actions">
                <button
                  className="mentor-icon-btn"
                  onClick={handleClearChat}
                  id="btn-clear-chat"
                  title="Clear Discussion"
                >
                  <svg
                    width="14"
                    height="14"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                    />
                  </svg>
                </button>
                <button
                  className="mentor-icon-btn"
                  title="Close Mentor Panel"
                  onClick={() => setShowMentor(false)}
                >
                  <svg
                    width="14"
                    height="14"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M6 18L18 6M6 6l12 12"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                    />
                  </svg>
                </button>
              </div>
            </div>

            {/* Target Bar */}
            <div className="target-bar">
              <span className="target-label">
                Target:{' '}
                <strong style={{ color: '#fff' }}>
                  {activeFile ? activeFile.name : 'Workspace (Clean)'}
                </strong>
              </span>
              <span className="depth-pill">Mode: Socratic</span>
            </div>

            {/* Chat Messages */}
            <div className="chat-messages" id="chat-messages-container">
              {messages.map((msg, i) => (
                <div key={i} className={`chat-msg chat-msg-${msg.role}`}>
                  {msg.role === 'assistant' ? (
                    <>
                      <div className="sd-avatar">SD</div>
                      <div className="sd-bubble">
                        <div className="sd-bubble-header">
                          <span className="sd-name">
                            SocraticDev <span className="sd-pro-tag">PRO</span>
                          </span>
                          <span className="sd-time">Just now</span>
                        </div>
                        <div className="sd-content">
                          <RenderMessage content={msg.content} />
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="user-bubble">
                        <div className="user-label">You</div>
                        <div className="user-content">
                          <RenderMessage content={msg.content} />
                        </div>
                      </div>
                      <div className="me-avatar">ME</div>
                    </>
                  )}
                </div>
              ))}
              {loading && (
                <div className="chat-msg chat-msg-assistant">
                  <div className="sd-avatar">SD</div>
                  <div className="sd-bubble">
                    <div className="typing-indicator">
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Chat Footer */}
            <div className="chat-footer">
              {/* Input */}
              <div className="chat-input-wrap">
                <input
                  ref={inputRef}
                  id="mentor-user-input"
                  className="mentor-input"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask a question or explain your intuition..."
                  disabled={loading}
                />
                <button
                  id="btn-send-message"
                  className="send-btn"
                  onClick={handleSend}
                  disabled={loading || !input.trim()}
                  title="Send (Enter)"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    style={{ transform: 'rotate(45deg)', marginTop: -2 }}
                  >
                    <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                  </svg>
                </button>
              </div>

              {/* 3 PRO Action Buttons (Intact and Linked to Monaco) */}
              <div className="pro-btns">
                <button
                  id="btn-concept-hint"
                  className="pro-btn pro-btn-violet"
                  onClick={handleConceptHint}
                  disabled={loading}
                  title="Concept Hint (Alt+1)"
                >
                  <div className="pro-btn-top">
                    <span>💡</span>
                    <kbd className="pro-kbd">Alt+1</kbd>
                  </div>
                  <span className="pro-btn-label">Concept Hint</span>
                </button>

                <button
                  id="btn-code-skeleton"
                  className="pro-btn pro-btn-emerald"
                  onClick={handleCodeSkeleton}
                  disabled={loading}
                  title="Code Skeleton (Alt+2)"
                >
                  <div className="pro-btn-top">
                    <span>🧱</span>
                    <kbd className="pro-kbd pro-kbd-emerald">Alt+2</kbd>
                  </div>
                  <span className="pro-btn-label">Code Skeleton</span>
                </button>

                <button
                  id="btn-unlock-solution"
                  className="pro-btn pro-btn-amber"
                  onClick={handleUnlockSolution}
                  disabled={loading}
                  title="Unlock Solution (Alt+3)"
                >
                  <div className="pro-btn-top">
                    <span>🔓</span>
                    <kbd className="pro-kbd pro-kbd-amber">Alt+3</kbd>
                  </div>
                  <span className="pro-btn-label">Unlock Solution</span>
                </button>
              </div>

              {/* Mode indicator */}
              <div className="mode-bar">
                <span className="mode-label">Mode: Socratic Reasoning (PRO)</span>
                <span
                  className="mode-shortcut"
                  onClick={() => inputRef.current?.focus()}
                >
                  Alt+S to focus
                </span>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* ── 5. STATUS BAR WITH REAL-TIME MONACO CURSOR POSITION ──────── */}
      <footer className="status-bar">
        <div className="status-left">
          <div className="remote-pill">
            <svg
              width="12"
              height="12"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
              />
            </svg>
            WSL: Ubuntu-22.04
          </div>
          <div className="status-item" onClick={handleSaveFile}>
            <svg
              width="12"
              height="12"
              fill="none"
              stroke="#22d3ee"
              viewBox="0 0 24 24"
            >
              <path
                d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
              />
            </svg>
            main*
          </div>
          <div className="status-errors">
            <span style={{ color: '#94a3b8' }}>⨂ 0</span>
            <span style={{ color: '#34d399', fontWeight: 600 }}>✔ Ready</span>
          </div>
          <div className="status-item status-socratic">
            <span className="pulse-dot-sm pulse-cyan" />
            SocraticDev: PRO Ready
          </div>
        </div>

        <div className="status-right">
          <span className="status-token">
            Ln {cursorPos.line}, Col {cursorPos.col}
          </span>
          <span className="status-token">Spaces: 4</span>
          <span className="status-token">UTF-8</span>
          <span className="status-token">LF</span>
          <span
            className="status-token"
            style={{ color: '#22d3ee', fontWeight: 700 }}
          >
            {activeFile ? activeFile.lang.toUpperCase() : 'Plain Text'}
          </span>
          <span className="status-token" style={{ color: '#f59e0b' }}>
            🔔
          </span>
        </div>
      </footer>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="save-toast">
          <span className="pulse-dot-sm pulse-green" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
