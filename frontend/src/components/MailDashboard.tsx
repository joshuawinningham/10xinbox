import React, { useState, useEffect, useRef } from "react";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "./ui/resizable";
import { Inbox, Send, FileText, AlertTriangle, Trash2, Archive, X, Minimize2, Maximize2, Reply, ReplyAll, MoreVertical } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

const FOLDER_LABELS = [
  { name: "Inbox", label: "INBOX", icon: <Inbox className="h-4 w-4 mr-2" /> },
  { name: "Sent", label: "SENT", icon: <Send className="h-4 w-4 mr-2" /> },
  { name: "Drafts", label: "DRAFT", icon: <FileText className="h-4 w-4 mr-2" /> },
  { name: "Spam", label: "SPAM", icon: <AlertTriangle className="h-4 w-4 mr-2" /> },
  { name: "Trash", label: "TRASH", icon: <Trash2 className="h-4 w-4 mr-2" /> },
  { name: "Archive", label: "ARCHIVE", icon: <Archive className="h-4 w-4 mr-2" /> },
];

const COMMON_OPERATORS = [
  "from:", "to:", "subject:", "has:attachment", "in:inbox", "in:sent", "in:drafts", "is:unread", "is:starred"
];

function getRecentSearches() {
  return JSON.parse(localStorage.getItem('recentMailSearches') || '[]');
}
function saveRecentSearch(query: string) {
  if (!query) return;
  let recent = getRecentSearches();
  recent = [query, ...recent.filter((q: string) => q !== query)].slice(0, 5);
  localStorage.setItem('recentMailSearches', JSON.stringify(recent));
}
function clearRecentSearches() {
  localStorage.removeItem('recentMailSearches');
}

function getSenderName(sender: string) {
  // Match 'Name <email@domain.com>'
  const match = sender.match(/^(.*?)\s*<.*?>$/);
  if (match && match[1]) {
    return match[1].trim();
  }
  return sender;
}

function formatEmailDate(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();

  // If today
  if (
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear()
  ) {
    // Show time
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // If this year
  if (date.getFullYear() === now.getFullYear()) {
    // Show month and day
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  // Else, show year
  return date.getFullYear();
}

function getTimeAgo(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffDay > 0) return `${diffDay} day${diffDay > 1 ? 's' : ''} ago`;
  if (diffHr > 0) return `${diffHr} hour${diffHr > 1 ? 's' : ''} ago`;
  if (diffMin > 0) return `${diffMin} minute${diffMin > 1 ? 's' : ''} ago`;
  return 'just now';
}

function formatEmailDetailDate(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();

  if (
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear()
  ) {
    // Today: show time
    return `${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (${getTimeAgo(dateStr)})`;
  }

  // Else: show weekday, month, day, time
  return `${date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (${getTimeAgo(dateStr)})`;
}

function ComposeEmail({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const [isShrunk, setIsShrunk] = useState(false);
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [fromName, setFromName] = useState<string | null>(null);
  const [fromEmail, setFromEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    const name = user.user_metadata?.name || user.name || null;
    const email = user.email || null;
    setFromName(name);
    setFromEmail(email);
    if (!name || !email) {
      fetch(`http://localhost:3001/api/gmail/is-connected`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id }),
      })
        .then(() =>
          fetch(`http://localhost:54321/rest/v1/gmail_tokens?user_id=eq.${user.id}`, {
            headers: { 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY }
          })
        )
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data) && data.length > 0) {
            setFromName(data[0].name || null);
            setFromEmail(data[0].email || null);
          }
        });
    }
  }, [user]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setSendSuccess(false);
    setSendError(null);
    try {
      const res = await fetch('http://localhost:3001/api/gmail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user?.id,
          to,
          subject,
          body,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || 'Failed to send email');
      setSendSuccess(true);
      setTo('');
      setSubject('');
      setBody('');
      setTimeout(() => {
        setSendSuccess(false);
        onClose();
      }, 1200);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setSendError(err.message || 'Failed to send email');
      } else {
        setSendError('Failed to send email');
      }
    } finally {
      setSending(false);
    }
  }

  // Modal or shrunk box
  if (!open) return null;
  if (isShrunk) {
    return (
      <div className="absolute z-50 shadow-lg rounded-lg border bg-card w-96 max-w-full bottom-4 right-4">
        <div className="flex items-center justify-between px-4 py-2 border-b bg-muted rounded-t-lg">
          <span className="font-semibold">New Message</span>
          <div className="flex gap-2">
            <button onClick={() => setIsShrunk(false)} className="p-1 rounded hover:bg-accent"><Maximize2 className="w-4 h-4" /></button>
            <button onClick={onClose} className="p-1 rounded hover:bg-accent"><X className="w-4 h-4" /></button>
          </div>
        </div>
        <form className="p-4 space-y-2" onSubmit={handleSend}>
          {fromName && fromEmail && (
            <div className="mb-2 text-sm text-muted-foreground">
              <span>From: <span className="font-medium text-foreground">{fromName}</span> (<span className="text-muted-foreground">{fromEmail}</span>)</span>
            </div>
          )}
          <input
            className="w-full rounded border px-3 py-2 bg-background text-foreground"
            placeholder="To"
            value={to}
            onChange={e => setTo(e.target.value)}
            disabled={sending}
          />
          <input
            className="w-full rounded border px-3 py-2 bg-background text-foreground"
            placeholder="Subject"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            disabled={sending}
          />
          <textarea
            className="w-full rounded border px-3 py-2 bg-background text-foreground min-h-[80px]"
            placeholder="Message"
            value={body}
            onChange={e => setBody(e.target.value)}
            disabled={sending}
          />
          <div className="flex justify-end gap-2 mt-2">
            <button type="button" className="px-4 py-2 rounded bg-muted text-foreground hover:bg-accent" onClick={onClose} disabled={sending}>Cancel</button>
            <button type="submit" className="px-4 py-2 rounded bg-primary text-primary-foreground font-semibold hover:bg-primary/90" disabled={sending}>{sending ? 'Sending...' : 'Send'}</button>
          </div>
          {sendSuccess && <div className="text-green-600 mt-2">Email sent!</div>}
          {sendError && <div className="text-red-600 mt-2">{sendError}</div>}
        </form>
      </div>
    );
  }
  // Modal (centered)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-card rounded-lg shadow-lg border w-full max-w-lg mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b bg-muted rounded-t-lg">
          <span className="font-semibold">New Message</span>
          <div className="flex gap-2">
            <button onClick={() => setIsShrunk(true)} className="p-1 rounded hover:bg-accent"><Minimize2 className="w-4 h-4" /></button>
            <button onClick={onClose} className="p-1 rounded hover:bg-accent"><X className="w-4 h-4" /></button>
          </div>
        </div>
        <form className="p-6 space-y-4" onSubmit={handleSend}>
          {fromName && fromEmail && (
            <div className="mb-2 text-sm text-muted-foreground">
              <span>From: <span className="font-medium text-foreground">{fromName}</span> (<span className="text-muted-foreground">{fromEmail}</span>)</span>
            </div>
          )}
          <input
            className="w-full rounded border px-3 py-2 bg-background text-foreground"
            placeholder="To"
            value={to}
            onChange={e => setTo(e.target.value)}
            disabled={sending}
          />
          <input
            className="w-full rounded border px-3 py-2 bg-background text-foreground"
            placeholder="Subject"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            disabled={sending}
          />
          <textarea
            className="w-full rounded border px-3 py-2 bg-background text-foreground min-h-[120px]"
            placeholder="Message"
            value={body}
            onChange={e => setBody(e.target.value)}
            disabled={sending}
          />
          <div className="flex justify-end gap-2 mt-2">
            <button type="button" className="px-4 py-2 rounded bg-muted text-foreground hover:bg-accent" onClick={onClose} disabled={sending}>Cancel</button>
            <button type="submit" className="px-4 py-2 rounded bg-primary text-primary-foreground font-semibold hover:bg-primary/90" disabled={sending}>{sending ? 'Sending...' : 'Send'}</button>
          </div>
          {sendSuccess && <div className="text-green-600 mt-2">Email sent!</div>}
          {sendError && <div className="text-red-600 mt-2">{sendError}</div>}
        </form>
      </div>
    </div>
  );
}

interface Email {
  id: string;
  sender: string;
  subject: string;
  snippet: string;
  date: string;
  labelIds?: string[];
}

export default function MailDashboard() {
  const { user } = useAuth();
  const [selectedFolder, setSelectedFolder] = useState(FOLDER_LABELS[0].label);
  const [emails, setEmails] = useState<Email[]>([]);
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailBody, setEmailBody] = useState<string>('');
  const [bodyLoading, setBodyLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const suggestionsRef = useRef<HTMLInputElement>(null);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [replySending, setReplySending] = useState(false);
  const [replySuccess, setReplySuccess] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [replyMode, setReplyMode] = useState<'reply' | 'replyAll' | 'forward' | null>(null);
  const [fromName, setFromName] = useState<string | null>(null);
  const [fromEmail, setFromEmail] = useState<string | null>(null);

  // Collect unique senders from emails for contact autocomplete
  const uniqueSenders = Array.from(
    new Set(
      emails
        .map((email) => {
          // Try to extract email address from sender string
          const match = email.sender.match(/<(.+?)>/);
          return match ? match[1] : email.sender;
        })
        .filter(Boolean)
    )
  );

  // Build suggestions list
  let suggestions: string[] = [];
  if (searchInput.startsWith('from:')) {
    const inputVal = searchInput.slice(5).toLowerCase();
    suggestions = uniqueSenders
      .filter((sender) => sender.toLowerCase().includes(inputVal))
      .map((sender) => `from:${sender}`);
  } else {
    suggestions = [
      ...COMMON_OPERATORS.filter(
        (op) => op.startsWith(searchInput) || searchInput === ''
      ),
      ...getRecentSearches().filter((q: string) => q.toLowerCase().includes(searchInput.toLowerCase())),
    ];
  }
  // Remove duplicates
  suggestions = Array.from(new Set(suggestions));

  // Keyboard navigation handlers
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showSuggestions || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter') {
      if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
        setSearchInput(suggestions[highlightedIndex]);
        setSearch(suggestions[highlightedIndex]);
        saveRecentSearch(suggestions[highlightedIndex]);
        setShowSuggestions(false);
        setHighlightedIndex(-1);
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setHighlightedIndex(-1);
    }
  }

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    setError(null);
    setEmails([]);
    setSelectedEmailId(null);
    const url = new URL('http://localhost:3001/api/gmail/messages');
    url.searchParams.set('user_id', user.id);
    url.searchParams.set('label', selectedFolder);
    let searchQuery = search;
    if (showUnreadOnly) {
      searchQuery = searchQuery ? `${searchQuery} is:unread` : 'is:unread';
    }
    if (searchQuery) url.searchParams.set('q', searchQuery);
    fetch(url.toString())
      .then(res => res.json())
      .then(data => {
        setEmails(data.emails || []);
        setLoading(false);
        if (data.emails && data.emails.length > 0) {
          setSelectedEmailId(data.emails[0].id);
        }
      })
      .catch(() => {
        setError('Failed to fetch emails');
        setLoading(false);
      });
  }, [user, selectedFolder, search, showUnreadOnly]);

  // Fetch full email body when selectedEmailId changes
  useEffect(() => {
    if (!user || !selectedEmailId) {
      setEmailBody('');
      return;
    }
    setBodyLoading(true);
    fetch(`http://localhost:3001/api/gmail/message?user_id=${user.id}&message_id=${selectedEmailId}`)
      .then(res => res.json())
      .then(data => {
        setEmailBody(data.body || '');
        setBodyLoading(false);
      })
      .catch(() => {
        setEmailBody('Failed to load email body.');
        setBodyLoading(false);
      });
  }, [user, selectedEmailId]);

  const selectedEmail = emails.find(email => email.id === selectedEmailId);

  // Helper to get recipients for Reply All
  function getRecipients() {
    if (!selectedEmail) return [];
    // For demo, just use sender; in real app, parse To/Cc from email headers
    return [selectedEmail.sender];
  }

  useEffect(() => {
    if (!user?.id) return;
    const name = user.user_metadata?.name || user.name || null;
    const email = user.email || null;
    setFromName(name);
    setFromEmail(email);
    if (!name || !email) {
      fetch(`http://localhost:3001/api/gmail/is-connected`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id }),
      })
        .then(() =>
          fetch(`http://localhost:54321/rest/v1/gmail_tokens?user_id=eq.${user.id}`, {
            headers: { 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY }
          })
        )
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data) && data.length > 0) {
            setFromName(data[0].name || null);
            setFromEmail(data[0].email || null);
          }
        });
    }
  }, [user]);

  return (
    <div ref={cardRef} className="h-[80vh] rounded-lg shadow overflow-hidden border border-border flex relative">
      <ResizablePanelGroup direction="horizontal" className="flex w-full h-full">
        {/* Sidebar */}
        <ResizablePanel defaultSize={18} minSize={12} maxSize={28} className="flex flex-col bg-card">
          <aside className="h-full bg-card border-r border-gray-200 p-4 flex flex-col">
            <button
              className="w-full mb-4 rounded-lg bg-primary text-primary-foreground font-semibold py-2 shadow hover:bg-primary/90 transition-colors"
              onClick={() => setComposeOpen(true)}
            >
              Compose
            </button>
            <h2 className="text-lg font-semibold mb-4">Folders</h2>
            <nav className="flex-1 space-y-2">
              {FOLDER_LABELS.map((folder) => (
                <button
                  key={folder.label}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-colors border-l-4 ${
                    selectedFolder === folder.label
                      ? "bg-muted border-primary font-semibold text-primary"
                      : "border-transparent hover:bg-muted/70 text-muted-foreground"
                  }`}
                  onClick={() => setSelectedFolder(folder.label)}
                >
                  <span className="flex items-center">{folder.icon}{folder.name}</span>
                </button>
              ))}
            </nav>
          </aside>
        </ResizablePanel>
        <ResizableHandle withHandle />
        {/* Email List */}
        <ResizablePanel defaultSize={28} minSize={18} maxSize={40} className="flex flex-col bg-card">
          <section className="h-full border-r border-gray-200 overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h3 className="text-md font-semibold">
                {FOLDER_LABELS.find(f => f.label === selectedFolder)?.name || selectedFolder}
              </h3>
              <div className="flex bg-muted rounded-lg p-1">
                <button
                  className={`px-4 py-1 rounded-lg transition-colors ${
                    !showUnreadOnly ? 'bg-background font-semibold shadow text-primary' : 'text-muted-foreground'
                  }`}
                  onClick={() => setShowUnreadOnly(false)}
                >
                  All mail
                </button>
                <button
                  className={`px-4 py-1 rounded-lg transition-colors ${
                    showUnreadOnly ? 'bg-background font-semibold shadow text-primary' : 'text-muted-foreground'
                  }`}
                  onClick={() => setShowUnreadOnly(true)}
                >
                  Unread
                </button>
              </div>
            </div>
            <div className="p-4 border-b border-gray-100">
              <form
                onSubmit={e => {
                  e.preventDefault();
                  setSearch(searchInput);
                  saveRecentSearch(searchInput);
                  setShowSuggestions(false);
                  setHighlightedIndex(-1);
                }}
                className="mt-2 flex relative"
                autoComplete="off"
              >
                <input
                  type="text"
                  className="border rounded-l px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-primary bg-background text-foreground"
                  placeholder="Search mail…"
                  value={searchInput}
                  onChange={e => {
                    setSearchInput(e.target.value);
                    setShowSuggestions(true);
                    setHighlightedIndex(-1);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 100)}
                  onKeyDown={handleKeyDown}
                  ref={suggestionsRef}
                />
                <button
                  type="submit"
                  className="bg-primary text-primary-foreground px-4 py-2 rounded-r hover:bg-primary/90 transition-colors"
                >
                  Search
                </button>
                {showSuggestions && (suggestions.length > 0 || getRecentSearches().length > 0) && (
                  <div className="absolute left-0 top-full z-10 w-full bg-white border border-gray-200 rounded shadow mt-1 max-h-60 overflow-y-auto">
                    {suggestions.map((s, idx) => (
                      <div
                        key={s}
                        className={`px-3 py-2 cursor-pointer hover:bg-gray-100 ${highlightedIndex === idx ? 'bg-blue-100' : ''}`}
                        onMouseDown={() => {
                          setSearchInput(s);
                          setSearch(s);
                          saveRecentSearch(s);
                          setShowSuggestions(false);
                          setHighlightedIndex(-1);
                        }}
                      >
                        {s}
                      </div>
                    ))}
                    {getRecentSearches().length > 0 && (
                      <div className="flex justify-end border-t border-gray-100">
                        <button
                          type="button"
                          className="text-xs text-gray-500 px-3 py-2 hover:underline"
                          onMouseDown={e => {
                            e.preventDefault();
                            clearRecentSearches();
                            setShowSuggestions(false);
                            setHighlightedIndex(-1);
                            setSearchInput('');
                            setSearch('');
                          }}
                        >
                          Clear recent searches
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </form>
            </div>
            {loading && <div className="p-4 text-gray-400">Loading emails...</div>}
            {error && <div className="p-4 text-red-500">{error}</div>}
            <ul>
              {emails.length === 0 && !loading && !error && (
                <li className="p-4 text-muted-foreground">No emails in this folder.</li>
              )}
              {emails.map((email) => {
                const isUnread = email.labelIds?.includes('UNREAD');
                return (
                  <li
                    key={email.id}
                    className={`cursor-pointer px-4 py-3 border-b border-border transition-colors ${
                      selectedEmailId === email.id
                        ? 'bg-accent'
                        : 'hover:bg-accent'
                    }`}
                    onClick={async () => {
                      setSelectedEmailId(email.id);
                      if (isUnread && user) {
                        // Optimistically update UI
                        setEmails(prevEmails => prevEmails.map(e =>
                          e.id === email.id
                            ? { ...e, labelIds: (e.labelIds || []).filter(l => l !== 'UNREAD') }
                            : e
                        ));
                        // Call backend to mark as read
                        fetch('http://localhost:3001/api/gmail/mark-read', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ user_id: user.id, message_id: email.id })
                        });
                      }
                    }}
                  >
                    <div className="flex justify-between items-center">
                      <span className={`truncate max-w-[140px] flex items-center ${isUnread ? 'font-semibold' : 'font-light text-muted-foreground'}`}> 
                        {getSenderName(email.sender)}
                      </span>
                      <span className="text-xs text-muted-foreground">{formatEmailDate(email.date)}</span>
                    </div>
                    <div className={`text-sm truncate ${isUnread ? 'font-semibold text-foreground' : 'font-light text-muted-foreground'}`}>{email.subject}</div>
                  </li>
                );
              })}
            </ul>
          </section>
        </ResizablePanel>
        <ResizableHandle withHandle />
        {/* Email Detail */}
        <ResizablePanel minSize={32} className="flex flex-col bg-card">
          <main className="flex-1 p-6 overflow-y-auto">
            {selectedEmail ? (
              <div>
                {/* Action Row at Top */}
                <div className="flex items-center gap-4 mb-4">
                  {getRecipients().length > 1 && (
                    <button
                      className="p-2 rounded hover:bg-accent"
                      title="Reply all"
                      onClick={() => {
                        setReplyMode('replyAll');
                        setReplyOpen(true);
                        setReplyBody('');
                      }}
                    >
                      <ReplyAll className="w-5 h-5" />
                    </button>
                  )}
                  <div className="flex-1" />
                  <button
                    className="p-2 rounded hover:bg-accent"
                    title="Reply"
                    onClick={() => {
                      setReplyMode('reply');
                      setReplyOpen(true);
                      setReplyBody('');
                    }}
                  >
                    <Reply className="w-5 h-5" />
                  </button>
                  <button className="p-2 rounded hover:bg-accent" title="More actions">
                    <MoreVertical className="w-5 h-5" />
                  </button>
                </div>
                {/* Email Subject and Details */}
                <h4 className="text-xl font-semibold mb-2">{selectedEmail.subject}</h4>
                <div className="flex items-center text-sm text-gray-500 mb-4 justify-between">
                  <span>{selectedEmail.sender}</span>
                  <span>{formatEmailDetailDate(selectedEmail.date)}</span>
                </div>
                {bodyLoading ? (
                  <div>Loading...</div>
                ) : (
                  <div>
                    <div
                      className="text-gray-800 whitespace-pre-line mb-6"
                      dangerouslySetInnerHTML={{ __html: emailBody }}
                    />
                    {/* Action Row at Bottom */}
                    <div className="flex items-center gap-4 mt-4">
                      <button
                        className="p-2 rounded hover:bg-accent"
                        title="Reply"
                        onClick={() => {
                          setReplyMode('reply');
                          setReplyOpen(true);
                          setReplyBody('');
                        }}
                      >
                        <Reply className="w-5 h-5" />
                      </button>
                      <button
                        className="p-2 rounded hover:bg-accent"
                        title="Forward"
                        onClick={() => {
                          setReplyMode('forward');
                          setReplyOpen(true);
                          setReplyBody('');
                        }}
                      >
                        <Reply className="w-5 h-5 scale-x-[-1]" />
                      </button>
                    </div>
                    {/* Reply/Forward Form BELOW the email body */}
                    {replyOpen && (
                      <form
                        className="mt-6 rounded-lg border bg-background shadow space-y-0"
                        onSubmit={async e => {
                          e.preventDefault();
                          setReplySending(true);
                          setReplySuccess(false);
                          setReplyError(null);
                          try {
                            const res = await fetch('http://localhost:3001/api/gmail/send', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                user_id: user?.id,
                                to:
                                  replyMode === 'forward'
                                    ? ''
                                    : replyMode === 'replyAll'
                                    ? getRecipients().map(s => {
                                        const match = s.match(/^(.*?)\s*<(.+?)>$/);
                                        return match ? `${match[1]} <${match[2]}>` : s;
                                      }).join(', ')
                                    : (() => {
                                        const match = selectedEmail.sender.match(/^(.*?)\s*<(.+?)>$/);
                                        return match ? `${match[1]} <${match[2]}>` : selectedEmail.sender;
                                      })(),
                                subject:
                                  replyMode === 'forward'
                                    ? `Fwd: ${selectedEmail.subject}`
                                    : selectedEmail.subject.startsWith('Re:')
                                    ? selectedEmail.subject
                                    : `Re: ${selectedEmail.subject}`,
                                body: replyBody,
                                in_reply_to: replyMode === 'forward' ? undefined : selectedEmail.id,
                              }),
                            });
                            const json = await res.json();
                            if (!res.ok || json.error) throw new Error(json.error || 'Failed to send reply');
                            setReplySuccess(true);
                            setReplyBody('');
                            setTimeout(() => {
                              setReplySuccess(false);
                              setReplyOpen(false);
                              setReplyMode(null);
                            }, 1200);
                          } catch (err: unknown) {
                            setReplyError(err instanceof Error ? err.message : 'Failed to send reply');
                          } finally {
                            setReplySending(false);
                          }
                        }}
                      >
                        {/* Header row for To and Subject */}
                        <div className="flex flex-col md:flex-row gap-2 p-4 border-b bg-muted/60 rounded-t-lg">
                          <div className="flex-1 flex flex-col gap-1">
                            <label className="text-xs text-muted-foreground font-medium">To</label>
                            <input
                              className="rounded-lg border px-3 py-2 bg-background text-foreground font-medium focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
                              value={
                                replyMode === 'forward'
                                  ? ''
                                  : replyMode === 'replyAll'
                                  ? getRecipients().map(s => {
                                      const match = s.match(/^(.*?)\s*<(.+?)>$/);
                                      return match ? `${match[1]} <${match[2]}>` : s;
                                    }).join(', ')
                                  : (() => {
                                      const match = selectedEmail.sender.match(/^(.*?)\s*<(.+?)>$/);
                                      return match ? `${match[1]} <${match[2]}>` : selectedEmail.sender;
                                    })()
                              }
                              disabled={replyMode !== 'forward'}
                              placeholder={replyMode === 'forward' ? 'To' : ''}
                            />
                          </div>
                          <div className="flex-1 flex flex-col gap-1">
                            <label className="text-xs text-muted-foreground font-medium">Subject</label>
                            <input
                              className="rounded-lg border px-3 py-2 bg-background text-foreground font-medium focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
                              value={
                                replyMode === 'forward'
                                  ? `Fwd: ${selectedEmail.subject}`
                                  : selectedEmail.subject.startsWith('Re:')
                                  ? selectedEmail.subject
                                  : `Re: ${selectedEmail.subject}`
                              }
                              disabled
                            />
                          </div>
                        </div>
                        {/* Reply textarea */}
                        <div className="px-4 pb-2">
                          {fromName && fromEmail && (
                            <div className="mb-2 text-sm text-muted-foreground">
                              <span>From: <span className="font-medium text-foreground">{fromName}</span> (<span className="text-muted-foreground">{fromEmail}</span>)</span>
                            </div>
                          )}
                          <textarea
                            className="w-full rounded-lg border px-3 py-3 min-h-[100px] focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
                            style={{ backgroundColor: '#FFFFFF' }}
                            placeholder={
                              replyMode === 'forward'
                                ? 'Forward this message...'
                                : 'Write your reply...'
                            }
                            value={replyBody}
                            onChange={e => setReplyBody(e.target.value)}
                            disabled={replySending}
                          />
                        </div>
                        {/* Action buttons */}
                        <div className="flex justify-end gap-2 px-4 pb-4">
                          <button
                            type="button"
                            className="px-4 py-2 rounded bg-muted text-foreground hover:bg-accent transition"
                            onClick={() => {
                              setReplyOpen(false);
                              setReplyMode(null);
                            }}
                            disabled={replySending}
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className="px-4 py-2 rounded bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition"
                            disabled={replySending}
                          >
                            {replySending ? 'Sending...' : replyMode === 'forward' ? 'Send forward' : 'Send reply'}
                          </button>
                        </div>
                        {replySuccess && <div className="text-green-600 text-sm px-4 pb-2">Message sent!</div>}
                        {replyError && <div className="text-red-600 text-sm px-4 pb-2">{replyError}</div>}
                      </form>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-gray-400 flex items-center justify-center h-full">Select an email to view its content.</div>
            )}
          </main>
        </ResizablePanel>
      </ResizablePanelGroup>
      {/* Compose Email Modal/Popout */}
      {composeOpen && (
        <ComposeEmail open={composeOpen} onClose={() => setComposeOpen(false)} />
      )}
    </div>
  );
} 