import { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import PageHeading from '@/components/PageHeading';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';

export default function EmailTracking() {
  const { user, loading: authLoading } = useAuth();
  // New state for sent emails and open events
  const [sentEmails, setSentEmails] = useState<any[]>([]);
  const [sentLoading, setSentLoading] = useState(true);
  const [sentError, setSentError] = useState<string | null>(null);
  const [openEvents, setOpenEvents] = useState<any[]>([]);
  const [openEventsLoading, setOpenEventsLoading] = useState(false);
  const [openEventsError, setOpenEventsError] = useState<string | null>(null);
  // Opened email_ids
  const [openedEmailIds, setOpenedEmailIds] = useState<Set<string>>(new Set());
  // Map of email_id to open count
  const [openCounts, setOpenCounts] = useState<Record<string, number>>({});
  const [popoverEmailId, setPopoverEmailId] = useState<string | null>(null);
  const [popoverType, setPopoverType] = useState<string>('');

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
    async function fetchOpenedEmailIdsAndCounts() {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/email-tracking/sent-emails`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: user.id }),
        });
        if (!res.ok) return;
        const sent = await res.json();
        const emailIds = sent.map((e: any) => e.email_id);
        const openedSet = new Set<string>();
        const counts: Record<string, number> = {};
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
            counts[email_id] = events.length;
          } else {
            counts[email_id] = 0;
          }
        }));
        setOpenedEmailIds(openedSet);
        setOpenCounts(counts);
      } catch {}
    }
    fetchOpenedEmailIdsAndCounts();
  }, [user, sentEmails.length]);

  async function handleShowOpenEvents(email: any, type: string = '') {
    setPopoverEmailId(email.email_id);
    setPopoverType(type);
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
    setPopoverEmailId(null);
    setPopoverType('');
    setOpenEvents([]);
    setOpenEventsError(null);
  }

  if (authLoading) return <div>Loading...</div>;
  if (!user) return <div>Please log in to view analytics.</div>;

  return (
    <div className="max-w-screen-2xl mx-auto p-0 pt-0 mt-0 min-h-screen">
      <PageHeading>Sent Emails & View Counts</PageHeading>
      <Card className="hover:shadow-lg transition-shadow mt-8 w-full">
        <CardHeader>
          <CardTitle>Sent Emails</CardTitle>
        </CardHeader>
        <CardContent>
          {sentLoading ? (
            <div>Loading sent emails...</div>
          ) : sentError ? (
            <div className="text-destructive mb-4">{sentError}</div>
          ) : sentEmails.length === 0 ? (
            <div className="text-muted-foreground">No sent emails found.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Sent At</TableHead>
                  <TableHead>Views</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sentEmails.map((email) => (
                  <TableRow key={email.email_id}>
                    <TableCell>
                      <span title={openedEmailIds.has(email.email_id) ? "Viewed" : "Not viewed"} className="flex items-center gap-1">
                        {openedEmailIds.has(email.email_id) ? (
                          <Eye className="inline w-5 h-5 text-green-600" />
                        ) : (
                          <EyeOff className="inline w-5 h-5 text-gray-400" />
                        )}
                        <Popover open={popoverEmailId === email.email_id && popoverType === ''} onOpenChange={(open) => { if (!open) handleCloseOpenEvents(); }}>
                          <PopoverTrigger asChild>
                            <span
                              className="ml-1 text-xs bg-gray-200 rounded px-1 font-mono hover:bg-gray-300 focus:outline-none cursor-pointer"
                              onMouseEnter={() => handleShowOpenEvents(email, '')}
                              onFocus={() => handleShowOpenEvents(email, '')}
                              title="View count"
                        >
                          {openCounts[email.email_id] ?? 0}
                            </span>
                          </PopoverTrigger>
                          <PopoverContent side="right" align="start" className="w-64" onMouseLeave={handleCloseOpenEvents}>
                            {openEventsLoading ? (
                              <div>Loading view events...</div>
                            ) : openEventsError ? (
                              <div className="text-destructive mb-4">{openEventsError.replace(/open/gi, 'view')}</div>
                            ) : (
                              <>
                                <div className="font-semibold mb-2">
                                  Email viewed {openEvents.length} {openEvents.length === 1 ? 'time' : 'times'}
                                </div>
                                {openEvents.length === 0 ? (
                                  <div className="text-muted-foreground">No view events found.</div>
                                ) : (
                                  <ul className="divide-y">
                                    {openEvents.map((ev, i) => (
                                      <li key={i} className="py-2">
                                        <div className="font-mono text-xs">{new Date(ev.opened_at).toLocaleString()}</div>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </>
                            )}
                          </PopoverContent>
                        </Popover>
                      </span>
                    </TableCell>
                    <TableCell>{email.to_name || email.to_email || '—'}</TableCell>
                    <TableCell>{email.to_email || '—'}</TableCell>
                    <TableCell>{email.subject}</TableCell>
                    <TableCell>{email.sent_at ? new Date(email.sent_at).toLocaleString() : '--'}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <span className="font-mono">{openCounts[email.email_id] ?? 0}</span>
                        <Popover open={popoverEmailId === email.email_id && popoverType === 'details'} onOpenChange={(open) => { if (!open) handleCloseOpenEvents(); }}>
                          <PopoverTrigger asChild>
                            <span
                              className="text-xs px-2 py-1 rounded bg-accent hover:bg-accent/80 border border-border text-foreground cursor-pointer"
                              onMouseEnter={() => { handleShowOpenEvents(email, 'details'); }}
                              onFocus={() => { handleShowOpenEvents(email, 'details'); }}
                              title="View details"
                            >
                              View Details
                            </span>
                          </PopoverTrigger>
                          <PopoverContent side="right" align="start" className="w-64" onMouseLeave={handleCloseOpenEvents}>
                            {openEventsLoading ? (
                              <div>Loading view events...</div>
                            ) : openEventsError ? (
                              <div className="text-destructive mb-4">{openEventsError.replace(/open/gi, 'view')}</div>
                            ) : (
                              <>
                                <div className="font-semibold mb-2">
                                  Email viewed {openEvents.length} {openEvents.length === 1 ? 'time' : 'times'}
                                </div>
                                {openEvents.length === 0 ? (
                                  <div className="text-muted-foreground">No view events found.</div>
                                ) : (
                                  <ul className="divide-y">
                                    {openEvents.map((ev, i) => (
                                      <li key={i} className="py-2">
                                        <div className="font-mono text-xs">{new Date(ev.opened_at).toLocaleString()}</div>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </>
                            )}
                          </PopoverContent>
                        </Popover>
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
} 