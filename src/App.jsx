import { useState, useRef, useEffect } from 'react';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'openai/gpt-oss-120b';

const SYSTEM_PROMPT =
  'You are SocraticDev, an IDE coding mentor. NEVER give complete code on the first try. Guide the user through questions. Keep answers under 80 words.';

const DEFAULT_CODE = `// Paste or type your code here
function example() {
  // Your code...
}`;

export default function App() {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content:
        "👋 Hey! I'm **SocraticDev**, your Socratic coding mentor. Paste your code on the left, then ask me anything — I'll guide you with questions, not just answers.",
    },
  ]);
  const [input, setInput] = useState('');
  const [code, setCode] = useState(DEFAULT_CODE);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('editor');
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeTab]);

  const apiKey = import.meta.env.VITE_AI_API_KEY;

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
      const reply = await callGroq(userText, isHidden ? messages : nextHistory.slice(0, -1));
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: reply },
      ]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `⚠️ Error: ${e.message}` },
      ]);
    } finally {
      setLoading(false);
      if (window.innerWidth > 768) {
        inputRef.current?.focus();
      }
    }
  }

  async function handleSend() {
    await sendMessage(input, false);
  }

  async function handleConceptHint() {
    if (window.innerWidth <= 768) setActiveTab('chat');
    const prompt = `The user has this code in their editor:\n\`\`\`\n${code}\n\`\`\`\nExplain the underlying concept and logic WITHOUT giving the answer or writing any new code. Ask a guiding question to help them think it through.`;
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: '💡 **Concept Hint** requested' },
    ]);
    await sendMessage(prompt, true);
  }

  async function handleCodeSkeleton() {
    if (window.innerWidth <= 768) setActiveTab('chat');
    const prompt = `The user has this code in their editor:\n\`\`\`\n${code}\n\`\`\`\nProvide a boilerplate structure with TODO comments only. Do NOT fill in any logic. Leave all implementation as TODO placeholders.`;
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: '🦴 **Code Skeleton** requested' },
    ]);
    await sendMessage(prompt, true);
  }

  async function handleUnlockSolution() {
    if (window.innerWidth <= 768) setActiveTab('chat');
    const prompt = `The user has this code in their editor:\n\`\`\`\n${code}\n\`\`\`\nBefore revealing any solution, ask the user exactly ONE quiz question about the core concept in this code. Do not reveal the answer yet. Wait for their response.`;
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: '🔓 **Unlock Solution** requested' },
    ]);
    await sendMessage(prompt, true);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function renderMessage(content) {
    // Simple bold markdown support (**text**)
    return content
      .split(/(\*\*[^*]+\*\*)/g)
      .map((part, i) =>
        part.startsWith('**') && part.endsWith('**') ? (
          <strong key={i}>{part.slice(2, -2)}</strong>
        ) : (
          <span key={i}>{part}</span>
        )
      );
  }

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-brand">
          <span className="header-icon">🧠</span>
          <span className="header-title">SocraticDev</span>
          <span className="header-badge">AI Mentor</span>
        </div>
        <div className="header-model">⚡ Groq · GPT-OSS 120B</div>
      </header>

      {/* Mobile Tab Navigation */}
      <div className="mobile-tab-bar">
        <button
          type="button"
          className={`mobile-tab-btn ${activeTab === 'editor' ? 'active' : ''}`}
          onClick={() => setActiveTab('editor')}
        >
          📝 Code Editor
        </button>
        <button
          type="button"
          className={`mobile-tab-btn ${activeTab === 'chat' ? 'active' : ''}`}
          onClick={() => setActiveTab('chat')}
        >
          💬 Mentor Chat
        </button>
      </div>

      {/* Main layout */}
      <div className="main">
        {/* Left: Code Editor */}
        <div className={`editor-panel ${activeTab === 'editor' ? 'mobile-visible' : 'mobile-hidden'}`}>
          <div className="panel-label">
            <span className="dot dot-red" />
            <span className="dot dot-yellow" />
            <span className="dot dot-green" />
            <span className="panel-title">editor.js</span>
          </div>
          <textarea
            className="code-editor"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            spellCheck={false}
            placeholder="Paste your code here..."
          />
          {/* Action Buttons */}
          <div className="action-buttons">
            <button
              id="btn-concept-hint"
              className="action-btn btn-hint"
              onClick={handleConceptHint}
              disabled={loading}
            >
              <span>💡</span> Concept Hint
            </button>
            <button
              id="btn-code-skeleton"
              className="action-btn btn-skeleton"
              onClick={handleCodeSkeleton}
              disabled={loading}
            >
              <span>🦴</span> Code Skeleton
            </button>
            <button
              id="btn-unlock-solution"
              className="action-btn btn-unlock"
              onClick={handleUnlockSolution}
              disabled={loading}
            >
              <span>🔓</span> Unlock Solution
            </button>
          </div>
        </div>

        {/* Right: Chat */}
        <div className={`chat-panel ${activeTab === 'chat' ? 'mobile-visible' : 'mobile-hidden'}`}>
          <div className="chat-messages">
            {messages.map((msg, i) => (
              <div key={i} className={`message message-${msg.role}`}>
                <div className="message-avatar">
                  {msg.role === 'assistant' ? '🧠' : '👤'}
                </div>
                <div className="message-bubble">
                  {renderMessage(msg.content)}
                </div>
              </div>
            ))}
            {loading && (
              <div className="message message-assistant">
                <div className="message-avatar">🧠</div>
                <div className="message-bubble typing">
                  <span /><span /><span />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="chat-input-area">
            <textarea
              ref={inputRef}
              id="chat-input"
              className="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask SocraticDev anything... (Enter to send)"
              rows={2}
              disabled={loading}
            />
            <button
              id="btn-send"
              className="send-btn"
              onClick={handleSend}
              disabled={loading || !input.trim()}
            >
              {loading ? '⏳' : '➤'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
