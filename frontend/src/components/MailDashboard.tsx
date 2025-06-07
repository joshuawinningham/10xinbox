import React, { useState, useEffect, useRef } from "react";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "./ui/resizable";
import { Inbox, Send, FileText, AlertTriangle, Trash2, Archive, Reply, ReplyAll, MoreVertical } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import DOMPurify from 'dompurify';
import { Card } from '@/components/ui/card';
import { RichTextEditor } from './RichTextEditor';
import type { Attachment } from './RichTextEditor';

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
  const cardRef = useRef<HTMLDivElement>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeMinimized, setComposeMinimized] = useState(false);
  const [composeTo, setComposeTo] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [composeSending, setComposeSending] = useState(false);
  const [composeSuccess, setComposeSuccess] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);
  const [composeToSuggestions, setComposeToSuggestions] = useState<string[]>([]);
  const [composeToShowSuggestions, setComposeToShowSuggestions] = useState(false);
  const [composeToHighlighted, setComposeToHighlighted] = useState(-1);
  const composeToInputRef = useRef<HTMLInputElement>(null);
  const [composeAttachments, setComposeAttachments] = useState<Attachment[]>([]);

  // Collect unique senders from emails for contact autocomplete
  const uniqueSenders = Array.from(
    new Set(
      emails
        .map((email) => email.sender)
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

  // Filter suggestions as user types in To field
  useEffect(() => {
    if (!composeToShowSuggestions) return;
    const input = composeTo.trim().toLowerCase();
    if (!input) {
      setComposeToSuggestions(uniqueSenders);
      return;
    }
    setComposeToSuggestions(
      uniqueSenders.filter(s => s.toLowerCase().includes(input))
    );
  }, [composeTo, composeToShowSuggestions, uniqueSenders]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    setError(null);
    setEmails([]);
    setSelectedEmailId(null);
    const url = new URL(`${import.meta.env.VITE_API_URL}/api/gmail/messages`);
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
    fetch(`${import.meta.env.VITE_API_URL}/api/gmail/message?user_id=${user.id}&message_id=${selectedEmailId}`)
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

  const handleAddAttachment = (files: File[]) => {
    const newAttachments = files.map(file => ({ id: Date.now() + Math.random(), file }));
    setComposeAttachments(prev => [...prev, ...newAttachments]);
  };

  const handleRemoveAttachment = (id: number) => {
    setComposeAttachments(prev => prev.filter(att => att.id !== id));
  };

  return (
    <Card ref={cardRef} className="h-[80vh] rounded-lg shadow overflow-hidden border border-border flex relative hover:shadow-lg transition-shadow">
      <ResizablePanelGroup direction="horizontal" className="flex w-full h-full">
        {/* Sidebar */}
        <ResizablePanel defaultSize={18} minSize={12} maxSize={28} className="flex flex-col bg-card">
          <aside className="h-full bg-card border-r border-gray-200 p-4 flex flex-col">
            <button
              className="w-full mb-4 rounded-lg bg-primary text-primary-foreground font-semibold py-2 shadow hover:bg-primary/90 transition-colors"
              onClick={() => {
                setComposeOpen(true);
                setComposeMinimized(false);
                setComposeTo('');
                setComposeSubject('');
                setComposeBody('');
                setComposeError(null);
                setComposeSuccess(false);
              }}
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
                        fetch(`${import.meta.env.VITE_API_URL}/api/gmail/mark-read`, {
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
                        setComposeOpen(true);
                        setComposeMinimized(false);
                        setComposeError(null);
                        setComposeSuccess(false);
                        if (selectedEmail) {
                          setComposeTo(getRecipients().join(', '));
                          setComposeSubject(selectedEmail.subject.startsWith('Re:') ? selectedEmail.subject : `Re: ${selectedEmail.subject}`);
                          setComposeBody('');
                        }
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
                      setComposeOpen(true);
                      setComposeMinimized(false);
                      setComposeError(null);
                      setComposeSuccess(false);
                      if (selectedEmail) {
                        setComposeTo(selectedEmail.sender);
                        setComposeSubject(selectedEmail.subject.startsWith('Re:') ? selectedEmail.subject : `Re: ${selectedEmail.subject}`);
                        setComposeBody('');
                      }
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
                      dangerouslySetInnerHTML={{
                        __html: DOMPurify.sanitize(emailBody, { FORBID_TAGS: ['style'] })
                      }}
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="text-gray-400 flex items-center justify-center h-full">
                Select an email to view its content.
              </div>
            )}
          </main>
        </ResizablePanel>
        <ResizableHandle withHandle />
      </ResizablePanelGroup>
      {/* Floating Compose Popup - Fullscreen Overlay */}
      {composeOpen && !composeMinimized && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-in fade-in">
          <div className="w-full max-w-2xl bg-white border rounded-lg shadow-lg flex flex-col relative animate-in fade-in zoom-in-95" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.18)' }}>
            <div className="flex items-center justify-between px-4 py-2 border-b bg-muted rounded-t-lg">
              <span className="font-semibold text-primary">New Message</span>
              <div className="flex items-center gap-2">
                <button
                  className="p-1 rounded hover:bg-accent"
                  title="Minimize"
                  onClick={() => setComposeMinimized(true)}
                >
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><rect x="4" y="9" width="12" height="2" rx="1" fill="currentColor" /></svg>
                </button>
                <button
                  className="p-1 rounded hover:bg-accent"
                  title="Close"
                  onClick={() => setComposeOpen(false)}
                >
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M6 6l8 8M6 14L14 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                </button>
              </div>
            </div>
            <form
              className="flex flex-col gap-2 p-6"
              onSubmit={async e => {
                e.preventDefault();
                setComposeSending(true);
                setComposeError(null);
                setComposeSuccess(false);
                try {
                  const formData = new FormData();
                  formData.append('user_id', user?.id || '');
                  formData.append('to', composeTo);
                  formData.append('subject', composeSubject);
                  formData.append('body', composeBody);
                  composeAttachments.forEach(att => {
                    formData.append('attachments', att.file, att.file.name);
                  });
                  const res = await fetch(`${import.meta.env.VITE_API_URL}/api/gmail/send`, {
                    method: 'POST',
                    body: formData,
                  });
                  const json = await res.json();
                  if (!res.ok || json.error) throw new Error(json.error || 'Failed to send email');
                  setComposeSuccess(true);
                  setTimeout(() => {
                    setComposeOpen(false);
                    setComposeSuccess(false);
                  }, 1200);
                } catch (err: unknown) {
                  setComposeError(err instanceof Error ? err.message : 'Failed to send email');
                } finally {
                  setComposeSending(false);
                }
              }}
            >
              <div className="relative">
                <input
                  ref={composeToInputRef}
                  className="rounded border px-3 py-2 bg-background text-foreground font-medium focus:outline-none focus:ring-2 focus:ring-primary/30 transition w-full"
                  placeholder="To"
                  value={composeTo}
                  onChange={e => {
                    setComposeTo(e.target.value);
                    setComposeToShowSuggestions(true);
                    setComposeToHighlighted(-1);
                  }}
                  onFocus={() => setComposeToShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setComposeToShowSuggestions(false), 100)}
                  onKeyDown={e => {
                    if (!composeToShowSuggestions || composeToSuggestions.length === 0) return;
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setComposeToHighlighted(prev => (prev + 1) % composeToSuggestions.length);
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setComposeToHighlighted(prev => (prev - 1 + composeToSuggestions.length) % composeToSuggestions.length);
                    } else if (e.key === 'Enter') {
                      if (composeToHighlighted >= 0 && composeToHighlighted < composeToSuggestions.length) {
                        setComposeTo(composeToSuggestions[composeToHighlighted]);
                        setComposeToShowSuggestions(false);
                        setComposeToHighlighted(-1);
                      }
                    } else if (e.key === 'Escape') {
                      setComposeToShowSuggestions(false);
                      setComposeToHighlighted(-1);
                    }
                  }}
                  required
                />
                {composeToShowSuggestions && composeToSuggestions.length > 0 && (
                  <div className="absolute left-0 top-full z-50 w-full bg-white border border-gray-200 rounded shadow mt-1 max-h-60 overflow-y-auto">
                    {composeToSuggestions.map((s, idx) => (
                      <div
                        key={s}
                        className={`px-3 py-2 cursor-pointer hover:bg-gray-100 ${composeToHighlighted === idx ? 'bg-blue-100' : ''}`}
                        onMouseDown={() => {
                          setComposeTo(s);
                          setComposeToShowSuggestions(false);
                          setComposeToHighlighted(-1);
                          composeToInputRef.current?.blur();
                        }}
                      >
                        {s}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <input
                className="rounded border px-3 py-2 bg-background text-foreground font-medium focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
                placeholder="Subject"
                value={composeSubject}
                onChange={e => setComposeSubject(e.target.value)}
              />
              <RichTextEditor
                value={composeBody}
                onChange={setComposeBody}
                className="min-h-[200px]"
                attachments={composeAttachments}
                onAddAttachment={handleAddAttachment}
                onRemoveAttachment={handleRemoveAttachment}
              />
              <div className="flex justify-end gap-2 mt-2">
                <button type="button" className="px-4 py-2 rounded bg-muted text-foreground hover:bg-accent" onClick={() => setComposeOpen(false)} disabled={composeSending}>Cancel</button>
                <button type="submit" className="px-4 py-2 rounded bg-primary text-primary-foreground font-semibold hover:bg-primary/90" disabled={composeSending}>{composeSending ? 'Sending...' : 'Send'}</button>
              </div>
              {composeSuccess && <div className="text-green-600 mt-2">Email sent!</div>}
              {composeError && <div className="text-red-600 mt-2">{composeError}</div>}
            </form>
          </div>
        </div>
      )}
      {/* Minimized Compose Window (not just a bar) */}
      {composeOpen && composeMinimized && (
        <div className="absolute bottom-4 right-4 z-40 w-[600px] h-[420px] bg-white border rounded-lg shadow-lg flex flex-col animate-in fade-in zoom-in-95" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.18)' }}>
          <div className="flex items-center justify-between px-3 py-2 border-b bg-muted rounded-t-lg">
            <span className="font-semibold text-primary text-sm">New Message</span>
            <div className="flex items-center gap-2">
              <button
                className="p-1 rounded hover:bg-accent"
                title="Maximize"
                onClick={() => setComposeMinimized(false)}
              >
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><rect x="3" y="3" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="2" /></svg>
              </button>
              <button
                className="p-1 rounded hover:bg-accent"
                title="Close"
                onClick={() => setComposeOpen(false)}
              >
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M6 6l8 8M6 14L14 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              </button>
            </div>
          </div>
          <form
            className="flex flex-col gap-2 p-4 flex-1"
            onSubmit={async e => {
              e.preventDefault();
              setComposeSending(true);
              setComposeError(null);
              setComposeSuccess(false);
              try {
                const formData = new FormData();
                formData.append('user_id', user?.id || '');
                formData.append('to', composeTo);
                formData.append('subject', composeSubject);
                formData.append('body', composeBody);
                composeAttachments.forEach(att => {
                  formData.append('attachments', att.file, att.file.name);
                });
                const res = await fetch(`${import.meta.env.VITE_API_URL}/api/gmail/send`, {
                  method: 'POST',
                  body: formData,
                });
                const json = await res.json();
                if (!res.ok || json.error) throw new Error(json.error || 'Failed to send email');
                setComposeSuccess(true);
                setTimeout(() => {
                  setComposeOpen(false);
                  setComposeSuccess(false);
                }, 1200);
              } catch (err: unknown) {
                setComposeError(err instanceof Error ? err.message : 'Failed to send email');
              } finally {
                setComposeSending(false);
              }
            }}
          >
            <div className="relative">
              <input
                className="rounded border px-2 py-1 bg-background text-foreground font-medium text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 transition w-full"
                placeholder="To"
                value={composeTo}
                onChange={e => setComposeTo(e.target.value)}
                required
              />
            </div>
            <input
              className="rounded border px-2 py-1 bg-background text-foreground font-medium text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
              placeholder="Subject"
              value={composeSubject}
              onChange={e => setComposeSubject(e.target.value)}
            />
            <RichTextEditor
              value={composeBody}
              onChange={setComposeBody}
              className="min-h-[220px] text-xs"
              attachments={composeAttachments}
              onAddAttachment={handleAddAttachment}
              onRemoveAttachment={handleRemoveAttachment}
            />
            <div className="flex justify-end gap-2 mt-2">
              <button type="button" className="px-3 py-1 rounded bg-muted text-foreground hover:bg-accent text-xs" onClick={() => setComposeOpen(false)} disabled={composeSending}>Cancel</button>
              <button type="submit" className="px-3 py-1 rounded bg-primary text-primary-foreground font-semibold hover:bg-primary/90 text-xs" disabled={composeSending}>{composeSending ? 'Sending...' : 'Send'}</button>
            </div>
            {composeSuccess && <div className="text-green-600 mt-2 text-xs">Email sent!</div>}
            {composeError && <div className="text-red-600 mt-2 text-xs">{composeError}</div>}
          </form>
        </div>
      )}
    </Card>
  );
} 