import { createClient } from '@supabase/supabase-js';
import { google, gmail_v1 } from 'googleapis';
import dotenv from 'dotenv';
import { DateTime } from 'luxon';
import { getValidAccessToken } from './utils/gmail';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

function extractEmail(fromHeader: string): string | null {
    if (!fromHeader) return null;
    const match = fromHeader.match(/<([^>]+)>/);
    return match ? match[1] : fromHeader;
}

export async function calculateResponseTime(
    user_id: string,
    gmail: gmail_v1.Gmail,
    tz: string,
    day: 'today' | 'yesterday' = 'today'
  ) {
    const now = DateTime.now().setZone(tz);
    const startOfDay = (day === 'today' ? now : now.minus({ days: 1 })).startOf('day');
    const endOfDay = startOfDay.endOf('day');

    const gmailQuery = `from:me after:${Math.floor(startOfDay.toSeconds())} before:${Math.floor(endOfDay.toSeconds())}`;

    const { data: tokenData } = await supabase
        .from('gmail_tokens')
        .select('email')
        .eq('user_id', user_id)
        .single();
    const userEmail = tokenData?.email;
    if (!userEmail) {
        throw new Error(`Could not find email for user ${user_id}`);
    }
  
    const sentRes = await gmail.users.messages.list({
      userId: 'me',
      q: gmailQuery,
      maxResults: 100, // Limit to 100 sent messages to avoid huge loops
    });
  
    const sentMessages = sentRes.data.messages || [];
    if (sentMessages.length === 0) {
      return { average_response_time: null, count: 0 };
    }
  
    let totalResponseTime = 0;
    let responseCount = 0;
  
    for (const sentMsg of sentMessages) {
      if (!sentMsg.id || !sentMsg.threadId) continue;
  
      try {
          const msgRes = await gmail.users.messages.get({
              userId: 'me',
              id: sentMsg.id,
              format: 'metadata',
              metadataHeaders: ['In-Reply-To', 'References']
          });
  
          const headers = msgRes.data.payload?.headers;
          const hasInReplyTo = headers?.some(h => h.name?.toLowerCase() === 'in-reply-to');
          const hasReferences = headers?.some(h => h.name?.toLowerCase() === 'references');
  
          if (hasInReplyTo || hasReferences) {
              const inReplyToHeader = headers?.find(h => h.name?.toLowerCase() === 'in-reply-to')?.value;
              let originalMessageId = null;
              
              if (inReplyToHeader) {
                const match = inReplyToHeader.match(/<([^>]+)>/);
                if (match) {
                  originalMessageId = match[1];
                }
              }
              
              if (originalMessageId) {
                try {
                  const searchRes = await gmail.users.messages.list({
                    userId: 'me',
                    q: `rfc822msgid:${originalMessageId}`,
                    maxResults: 1
                  });
                  
                  if (searchRes.data.messages && searchRes.data.messages.length > 0) {
                    const originalMsgId = searchRes.data.messages[0].id;
                    
                    if (originalMsgId) {
                      const originalMsgRes = await gmail.users.messages.get({
                        userId: 'me',
                        id: originalMsgId,
                        format: 'metadata',
                        metadataHeaders: ['From']
                      });
                      
                      const originalFromHeader = originalMsgRes.data.payload?.headers?.find((h: any) => h.name?.toLowerCase() === 'from')?.value;
                      const originalFromEmail = originalFromHeader ? extractEmail(originalFromHeader) : null;
                      
                      if (originalFromEmail && originalFromEmail.toLowerCase() !== userEmail.toLowerCase()) {
                        const threadRes = await gmail.users.threads.get({
                          userId: 'me',
                          id: sentMsg.threadId,
                          format: 'full' 
                        });
                        const threadMessages = threadRes.data.messages || [];
                        const currentSentMessage = threadMessages.find(m => m.id === sentMsg.id);
                        
                        if (!currentSentMessage || !currentSentMessage.internalDate) {
                          continue;
                        }
                        
                        const sentTimestamp = parseInt(currentSentMessage.internalDate, 10);
                        const receivedTimestamp = parseInt(originalMsgRes.data.internalDate!, 10);
                        const diffSeconds = Math.round((sentTimestamp - receivedTimestamp) / 1000);
                        
                        if (diffSeconds >= 0) {
                          totalResponseTime += diffSeconds;
                          responseCount++;
                        }
                      }
                    }
                  } else {
                    const threadRes = await gmail.users.threads.get({
                      userId: 'me',
                      id: sentMsg.threadId,
                      format: 'full' 
                    });

                    const threadMessages = threadRes.data.messages || [];
                    
                    const currentSentMessage = threadMessages.find(m => m.id === sentMsg.id);
                    if (!currentSentMessage || !currentSentMessage.internalDate) {
                      continue;
                    }

                    const sentTimestamp = parseInt(currentSentMessage.internalDate, 10);

                    const originalMessage = threadMessages
                      .filter(m => {
                          if (m.id === sentMsg.id || !m.internalDate) {
                              return false;
                          }
                          return parseInt(m.internalDate, 10) < sentTimestamp;
                      })
                      .sort((a, b) => parseInt(b.internalDate!, 10) - parseInt(a.internalDate!, 10))[0];

                    if (originalMessage && originalMessage.internalDate) {
                        const fromHeader = originalMessage.payload?.headers?.find(h => h.name?.toLowerCase() === 'from')?.value;
                        const fromEmail = fromHeader ? extractEmail(fromHeader) : null;
                        if(fromEmail && fromEmail.toLowerCase() !== userEmail.toLowerCase()){
                          const receivedTimestamp = parseInt(originalMessage.internalDate, 10);
                          const diffSeconds = Math.round((sentTimestamp - receivedTimestamp) / 1000);
                          if (diffSeconds >= 0) {
                              totalResponseTime += diffSeconds;
                              responseCount++;
                          }
                        }
                    }
                  }
                } catch (error) {
                  const threadRes = await gmail.users.threads.get({
                    userId: 'me',
                    id: sentMsg.threadId,
                    format: 'full' 
                  });

                  const threadMessages = threadRes.data.messages || [];
                  
                  const currentSentMessage = threadMessages.find(m => m.id === sentMsg.id);
                  if (!currentSentMessage || !currentSentMessage.internalDate) {
                    continue;
                  }

                  const sentTimestamp = parseInt(currentSentMessage.internalDate, 10);

                  const originalMessage = threadMessages
                    .filter(m => {
                        if (m.id === sentMsg.id || !m.internalDate) {
                            return false;
                        }
                        return parseInt(m.internalDate, 10) < sentTimestamp;
                    })
                    .sort((a, b) => parseInt(b.internalDate!, 10) - parseInt(a.internalDate!, 10))[0];

                  if (originalMessage && originalMessage.internalDate) {
                      const fromHeader = originalMessage.payload?.headers?.find(h => h.name?.toLowerCase() === 'from')?.value;
                      const fromEmail = fromHeader ? extractEmail(fromHeader) : null;
                      if(fromEmail && fromEmail.toLowerCase() !== userEmail.toLowerCase()){
                        const receivedTimestamp = parseInt(originalMessage.internalDate, 10);
                        const diffSeconds = Math.round((sentTimestamp - receivedTimestamp) / 1000);
                        if (diffSeconds >= 0) {
                            totalResponseTime += diffSeconds;
                            responseCount++;
                        }
                      }
                  }
                }
              }
          }
      } catch(error) {
          console.error('Error processing message for response time:', {
              messageId: sentMsg.id,
              error: error instanceof Error ? error.message : String(error),
          });
          continue;
      }
    }
  
    return {
      average_response_time: responseCount > 0 ? Math.round(totalResponseTime / responseCount) : null,
      count: responseCount,
    };
}

async function main() {
    console.log('Starting response time cache update job...');
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

        const accessToken = await getValidAccessToken(user_id);
        const oauth2Client = new google.auth.OAuth2();
        oauth2Client.setCredentials({ access_token: accessToken });
        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

        const { average_response_time, count } = await calculateResponseTime(user_id, gmail, tz, 'today');
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
}
  
// Only run main() if this file is executed directly
if (require.main === module) {
    main();
} 