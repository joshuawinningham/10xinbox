import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export default function EmailTracking() {
  const { user, loading: authLoading } = useAuth();
  // New state for sent emails and open events
  const [sentEmails, setSentEmails] = useState<any[]>([]);
  const [sentLoading, setSentLoading] = useState(true);
  const [sentError, setSentError] = useState<string | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<any>(null);
  const [openEvents, setOpenEvents] = useState<any[]>([]);
  const [openEventsLoading, setOpenEventsLoading] = useState(false);
  const [openEventsError, setOpenEventsError] = useState<string | null>(null);
  // Opened email_ids
  const [openedEmailIds, setOpenedEmailIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    async function fetchSentEmails() {
      setSentLoading(true);
      setSentError(null);
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/email-tracking/sent-emails`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: user.id }),
        });
        if (!res.ok) throw new Error('Failed to fetch sent emails');
        const data = await res.json();
        setSentEmails(data);
      } catch (err: any) {
        setSentError(err.message);
      } finally {
        setSentLoading(false);
      }
    }
    fetchSentEmails();
  }, [user]);

  // Fetch all opened email_ids for this user
  useEffect(() => {
    if (!user) return;
    async function fetchOpenedEmailIds() {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/email-tracking/analytics`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: user.id }),
        });
        if (!res.ok) return;
        const data = await res.json();
        // The analytics endpoint returns openRows2 (email_opens) as openCounts keys
        if (data && data.mostOpened !== undefined) {
          // But we want all opened email_ids
          // We'll use openRows2 if available, otherwise fallback to openCounts keys
          // But since we don't have openRows2, let's fetch open events for all sent emails
        }
        // Instead, fetch all open events for all sent emails
        const res2 = await fetch(`${import.meta.env.VITE_API_URL}/api/email-tracking/sent-emails`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: user.id }),
        });
        if (!res2.ok) return;
        const sent = await res2.json();
        const emailIds = sent.map((e: any) => e.email_id);
        // For performance, fetch all open events in one call (if you have such an endpoint), otherwise fetch individually
        // We'll fetch open events for each email and build a set
        const openedSet = new Set<string>();
        await Promise.all(emailIds.map(async (email_id: string) => {
          const res3 = await fetch(`${import.meta.env.VITE_API_URL}/api/email-tracking/open-events`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: user.id, email_id }),
          });
          if (!res3.ok) return;
          const events = await res3.json();
          if (Array.isArray(events) && events.length > 0) {
            openedSet.add(email_id);
          }
        }));
        setOpenedEmailIds(openedSet);
      } catch {}
    }
    fetchOpenedEmailIds();
  }, [user, sentEmails.length]);

  async function handleShowOpenEvents(email: any) {
    setSelectedEmail(email);
    setOpenEvents([]);
    setOpenEventsLoading(true);
    setOpenEventsError(null);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/email-tracking/open-events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, email_id: email.email_id }),
      });
      if (!res.ok) throw new Error('Failed to fetch open events');
      const data = await res.json();
      setOpenEvents(data);
    } catch (err: any) {
      setOpenEventsError(err.message);
    } finally {
      setOpenEventsLoading(false);
    }
  }

  function handleCloseOpenEvents() {
    setSelectedEmail(null);
    setOpenEvents([]);
    setOpenEventsError(null);
  }

  if (authLoading) return <div>Loading...</div>;
  if (!user) return <div>Please log in to view analytics.</div>;

  return (
    <div className="max-w-screen-lg mx-auto p-6 min-h-screen">
      <h1 className="text-3xl font-bold mb-8">Email Tracking Analytics</h1>
      {/* Removed analytics cards and chart above the table */}

      {/* Sent Emails Table */}
      <div className="mt-12">
        <h2 className="text-2xl font-bold mb-4">Sent Emails & Open Counts</h2>
        {sentLoading ? (
          <div>Loading sent emails...</div>
        ) : sentError ? (
          <div className="text-red-500">{sentError}</div>
        ) : sentEmails.length === 0 ? (
          <div className="text-muted-foreground">No sent emails found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border text-sm">
              <thead>
                <tr className="bg-muted">
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-left">Name</th>
                  <th className="px-4 py-2 text-left">Email</th>
                  <th className="px-4 py-2 text-left">Subject</th>
                  <th className="px-4 py-2 text-left">Sent At</th>
                  <th className="px-4 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sentEmails.map((email) => (
                  <tr key={email.email_id} className="border-b hover:bg-accent">
                    <td className="px-4 py-2">
                      {openedEmailIds.has(email.email_id) ? (
                        <span title="Opened">
                          <Eye className="inline w-5 h-5 text-green-600" />
                        </span>
                      ) : (
                        <span title="Not opened">
                          <EyeOff className="inline w-5 h-5 text-gray-400" />
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2">{email.to_name || '—'}</td>
                    <td className="px-4 py-2">{email.to_email || '—'}</td>
                    <td className="px-4 py-2">{email.subject}</td>
                    <td className="px-4 py-2">{email.sent_at ? new Date(email.sent_at).toLocaleString() : '--'}</td>
                    <td className="px-4 py-2">
                      <Button size="sm" variant="outline" onClick={() => handleShowOpenEvents(email)}>
                        View Open Events
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Open Events Modal/Drawer */}
      {selectedEmail && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg max-w-lg w-full p-6 relative">
            <button className="absolute top-2 right-2 text-gray-500 hover:text-black" onClick={handleCloseOpenEvents}>&times;</button>
            <h3 className="text-xl font-bold mb-2">Open Events for Email</h3>
            <div className="mb-2 text-muted-foreground text-xs">ID: {selectedEmail.email_id}</div>
            {openEventsLoading ? (
              <div>Loading open events...</div>
            ) : openEventsError ? (
              <div className="text-red-500">{openEventsError}</div>
            ) : openEvents.length === 0 ? (
              <div className="text-muted-foreground">No open events found.</div>
            ) : (
              <ul className="divide-y">
                {openEvents.map((ev, i) => (
                  <li key={i} className="py-2">
                    <div className="font-mono text-xs">{new Date(ev.opened_at).toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">{ev.user_agent}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
} 