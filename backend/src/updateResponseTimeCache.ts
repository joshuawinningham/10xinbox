import { createClient } from '@supabase/supabase-js';
import { google, gmail_v1 } from 'googleapis';
import dotenv from 'dotenv';
import { DateTime } from 'luxon';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

async function getValidAccessToken(user_id: string) {
  const { data, error } = await supabase
    .from('gmail_tokens')
    .select('*')
    .eq('user_id', user_id)
    .single();
  if (error || !data) throw new Error('No tokens found for user');
  const { access_token, refresh_token, expires_at } = data;
  if (new Date(expires_at) > new Date()) return access_token;
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.BASE_URL}/api/auth/google/callback`
  );
  oauth2Client.setCredentials({ refresh_token });
  const { token: newAccessToken } = await oauth2Client.getAccessToken();
  const newExpiry = oauth2Client.credentials.expiry_date;
  await supabase
    .from('gmail_tokens')
    .update({
      access_token: newAccessToken,
      expires_at: new Date(newExpiry!).toISOString(),
    })
    .eq('user_id', user_id);
  return newAccessToken;
}

export async function calculateResponseTime(user_id: string, tz: string) {
  const accessToken = await getValidAccessToken(user_id);
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  const now = DateTime.now().setZone(tz);
  const start = now.startOf('day');
  const end = start.plus({ days: 1 });
  const after = Math.floor(start.toUTC().toSeconds());
  const before = Math.floor(end.toUTC().toSeconds());
  async function fetchAllMessages(q: string) {
    let messages: any[] = [];
    let nextPageToken: string | undefined = undefined;
    do {
      const res: { data: gmail_v1.Schema$ListMessagesResponse } = await gmail.users.messages.list({
        userId: 'me',
        q,
        pageToken: nextPageToken,
        maxResults: 500,
      });
      if (res.data.messages) messages = messages.concat(res.data.messages);
      nextPageToken = res.data.nextPageToken ?? undefined;
    } while (nextPageToken);
    return messages;
  }
  const receivedMessages = await fetchAllMessages(`after:${after} before:${before} label:INBOX -from:me`);
  if (receivedMessages.length === 0) return { average_response_time: null, count: 0 };
  let totalResponseTime = 0;
  let responseCount = 0;
  const usedReplyIds = new Set();
  for (const msg of receivedMessages) {
    try {
      const res = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'metadata' });
      const receivedInternalDate = Number(res.data.internalDate);
      const threadId = res.data.threadId;
      const headers = res.data.payload?.headers || [];
      const messageIdHeader = headers.find((h: any) => h.name?.toLowerCase() === 'message-id');
      const messageIdValue = messageIdHeader?.value;
      if (!threadId) continue;
      const threadRes = await gmail.users.threads.get({ userId: 'me', id: threadId });
      const threadMessages = threadRes.data.messages || [];
      // Try to find reply in thread (must not be used already, and must match In-Reply-To)
      const reply = threadMessages.find((m: any) => {
        if (m.id === msg.id) return false;
        if (usedReplyIds.has(m.id)) return false;
        if (m.labelIds && m.labelIds.includes('SENT')) {
          const sentDate = Number(m.internalDate);
          const replyHeaders = m.payload?.headers || [];
          const inReplyTo = replyHeaders.find((h: any) => h.name?.toLowerCase() === 'in-reply-to')?.value;
          const subject = replyHeaders.find((h: any) => h.name?.toLowerCase() === 'subject')?.value;
          if (!subject?.startsWith('Re:')) return false;
          if (messageIdValue && inReplyTo) {
            const cleanMessageId = messageIdValue.replace(/^<|>$/g, '');
            const cleanInReplyTo = inReplyTo.replace(/^<|>$/g, '');
            return sentDate > receivedInternalDate && cleanInReplyTo === cleanMessageId;
          }
          if (sentDate > receivedInternalDate) {
            const earlierReplies = threadMessages.filter((otherMsg: any) => {
              if (otherMsg.id === m.id || otherMsg.id === msg.id) return false;
              if (!otherMsg.labelIds?.includes('SENT')) return false;
              const otherSentDate = Number(otherMsg.internalDate);
              return otherSentDate > receivedInternalDate && otherSentDate < sentDate;
            });
            return earlierReplies.length === 0;
          }
        }
        return false;
      });
      if (reply) {
        usedReplyIds.add(reply.id);
        const replyDate = Number(reply.internalDate);
        const responseTime = replyDate - receivedInternalDate;
        totalResponseTime += responseTime;
        responseCount++;
      } else if (messageIdValue) {
        try {
          const searchQuery = `from:me after:${Math.floor(receivedInternalDate / 1000)} before:${Math.floor(receivedInternalDate / 1000) + 86400}`;
          const searchRes = await gmail.users.messages.list({
            userId: 'me',
            q: searchQuery,
            maxResults: 10
          });
          if (searchRes.data.messages) {
            for (const sentMsg of searchRes.data.messages) {
              if (usedReplyIds.has(sentMsg.id)) continue;
              const sentMsgRes = await gmail.users.messages.get({
                userId: 'me',
                id: sentMsg.id!,
                format: 'metadata',
                metadataHeaders: ['In-Reply-To', 'References', 'Subject']
              });
              const replyHeaders = sentMsgRes.data.payload?.headers || [];
              const inReplyTo = replyHeaders.find((h: any) => h.name?.toLowerCase() === 'in-reply-to')?.value;
              const subject = replyHeaders.find((h: any) => h.name?.toLowerCase() === 'subject')?.value;
              const sentDate = Number(sentMsgRes.data.internalDate);
              if (inReplyTo && subject?.startsWith('Re:') && sentDate > receivedInternalDate) {
                const cleanMessageId = messageIdValue.replace(/^<|>$/g, '');
                const cleanInReplyTo = inReplyTo.replace(/^<|>$/g, '');
                if (cleanInReplyTo === cleanMessageId) {
                  usedReplyIds.add(sentMsg.id!);
                  const responseTime = sentDate - receivedInternalDate;
                  totalResponseTime += responseTime;
                  responseCount++;
                  break;
                }
              }
            }
          }
        } catch {}
      }
    } catch {}
  }
  if (responseCount === 0) return { average_response_time: null, count: 0 };
  const avgSeconds = Math.round(totalResponseTime / responseCount / 1000);
  return { average_response_time: avgSeconds, count: responseCount };
}

async function main() {
  console.log('Starting response time cache update job...');
  // 1. Get all user IDs
  const { data: users, error: userError } = await supabase
    .from('user_settings')
    .select('user_id, time_zone');
  if (userError) {
    console.error('Failed to fetch users:', userError);
    process.exit(1);
  }
  const today = DateTime.now().toISODate();
  for (const user of users || []) {
    const user_id = user.user_id;
    const tz = user.time_zone || 'UTC';
    try {
      console.log(`Processing user ${user_id} (${tz})...`);
      const { average_response_time, count } = await calculateResponseTime(user_id, tz);
      await supabase.from('response_time_cache').upsert({
        user_id,
        date: today,
        average_response_time,
        reply_count: count,
        updated_at: new Date().toISOString(),
      });
      console.log(`User ${user_id}: avg=${average_response_time}, count=${count}`);
    } catch (err) {
      console.error(`Error processing user ${user_id}:`, err);
    }
  }
  console.log('Response time cache update job complete.');
  process.exit(0);
}

main(); 