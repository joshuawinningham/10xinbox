import { createClient } from '@supabase/supabase-js';
import { google, gmail_v1 } from 'googleapis';
import { DateTime } from 'luxon';
import { getValidAccessToken } from './utils/gmail';
import { calculateResponseTime } from './updateResponseTimeCache';
import dotenv from 'dotenv';
import { GaxiosResponse } from 'gaxios';

dotenv.config();

console.log('SUPABASE_URL:', process.env.SUPABASE_URL);
console.log('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'loaded' : 'missing');

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkAndCreateTables() {
  console.log('Checking and creating necessary tables...');
  
  // Check if inbox_zero_days table exists and create if needed
  try {
    const { error: checkError } = await supabase
      .from('inbox_zero_days')
      .select('*')
      .limit(1);
    
    if (checkError && checkError.message.includes('relation "inbox_zero_days" does not exist')) {
      console.log('Creating inbox_zero_days table...');
      const { error: createError } = await supabase.rpc('exec_sql', {
        sql: `
          CREATE TABLE IF NOT EXISTS inbox_zero_days (
            id SERIAL PRIMARY KEY,
            user_id UUID NOT NULL,
            date DATE NOT NULL,
            inbox_count INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE(user_id, date)
          );
          
          CREATE INDEX IF NOT EXISTS idx_inbox_zero_days_user_date 
          ON inbox_zero_days(user_id, date);
        `
      });
      
      if (createError) {
        console.error('Failed to create inbox_zero_days table:', createError);
      } else {
        console.log('Successfully created inbox_zero_days table');
      }
    } else {
      console.log('inbox_zero_days table exists');
    }
  } catch (error) {
    console.error('Error checking inbox_zero_days table:', error);
  }

  // Check if response_time_cache table exists and create if needed
  try {
    const { error: checkError } = await supabase
      .from('response_time_cache')
      .select('*')
      .limit(1);
    
    if (checkError && checkError.message.includes('relation "response_time_cache" does not exist')) {
      console.log('Creating response_time_cache table...');
      const { error: createError } = await supabase.rpc('exec_sql', {
        sql: `
          CREATE TABLE IF NOT EXISTS response_time_cache (
            id SERIAL PRIMARY KEY,
            user_id UUID NOT NULL,
            date DATE NOT NULL,
            average_response_time INTEGER,
            reply_count INTEGER DEFAULT 0,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE(user_id, date)
          );
          
          CREATE INDEX IF NOT EXISTS idx_response_time_cache_user_date 
          ON response_time_cache(user_id, date);
        `
      });
      
      if (createError) {
        console.error('Failed to create response_time_cache table:', createError);
      } else {
        console.log('Successfully created response_time_cache table');
      }
    } else {
      console.log('response_time_cache table exists');
    }
  } catch (error) {
    console.error('Error checking response_time_cache table:', error);
  }
}

async function testInboxZeroCalculation(userId: string) {
  console.log(`\nTesting Inbox Zero calculation for user ${userId}...`);
  
  try {
    // Get user's timezone and working hours
    const { data: settings, error: settingsError } = await supabase
      .from('user_settings')
      .select('time_zone, working_hours_start, working_hours_end, working_days, inbox_zero_buffer_minutes')
      .eq('user_id', userId)
      .single();
    
    if (settingsError) {
      console.error('Failed to get user settings:', settingsError);
      return;
    }
    
    const tz = settings?.time_zone || 'UTC';
    const now = DateTime.now().setZone(tz);
    const today = now.toISODate();
    
    console.log('User settings:', {
      timezone: tz,
      working_hours_start: settings?.working_hours_start,
      working_hours_end: settings?.working_hours_end,
      working_days: settings?.working_days,
      buffer_minutes: settings?.inbox_zero_buffer_minutes
    });
    
    // Get Gmail access token
    const accessToken = await getValidAccessToken(userId);
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    
    // Calculate buffer cutoff time
    const bufferMinutes = settings?.inbox_zero_buffer_minutes || 30;
    const workingHoursEnd = settings?.working_hours_end || '17:00:00';
    const [endHour, endMinute] = workingHoursEnd.split(':').map(Number);
    const bufferCutoff = now.set({ hour: endHour, minute: endMinute }).minus({ minutes: bufferMinutes });
    
    const startOfDay = now.startOf('day');
    const queryEndTime = bufferCutoff;
    
    console.log('Query parameters:', {
      startOfDay: startOfDay.toISO(),
      bufferCutoff: bufferCutoff.toISO(),
      queryEndTime: queryEndTime.toISO()
    });
    
    // Query Gmail API
    const before = Math.floor(queryEndTime.toSeconds());
    
    // Use a more accurate method to count emails
    let inboxCount = 0;
    let nextPageToken: string | undefined = undefined;
    
    do {
      const res: GaxiosResponse<gmail_v1.Schema$ListMessagesResponse> = await gmail.users.messages.list({
        userId: 'me',
        q: `label:INBOX label:UNREAD after:${Math.floor(startOfDay.toSeconds())} before:${before}`,
        maxResults: 500,
        pageToken: nextPageToken
      });
      
      if (res.data.messages) {
        inboxCount += res.data.messages.length;
      }
      
      nextPageToken = res.data.nextPageToken ?? undefined;
    } while (nextPageToken);
    
    console.log(`Gmail API returned ${inboxCount} emails in inbox (accurate count)`);
    
    // Store in database
    const { error: upsertError } = await supabase
      .from('inbox_zero_days')
      .upsert({
        user_id: userId,
        date: today,
        inbox_count: inboxCount
      }, {
        onConflict: 'user_id,date'
      });
    
    if (upsertError) {
      console.error('Failed to store inbox zero data:', upsertError);
    } else {
      console.log(`Successfully stored inbox zero data: ${inboxCount} emails for ${today}`);
    }
    
  } catch (error) {
    console.error('Error testing inbox zero calculation:', error);
  }
}

async function testResponseTimeCalculation(userId: string) {
  console.log(`\nTesting Response Time calculation for user ${userId}...`);
  
  try {
    // Get user's timezone
    const { data: settings, error: settingsError } = await supabase
      .from('user_settings')
      .select('time_zone')
      .eq('user_id', userId)
      .single();
    
    if (settingsError) {
      console.error('Failed to get user settings:', settingsError);
      return;
    }
    
    const tz = settings?.time_zone || 'UTC';
    const today = DateTime.now().toISODate();
    
    // Get Gmail access token
    const accessToken = await getValidAccessToken(userId);
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    
    // Calculate response time
    const { average_response_time, count } = await calculateResponseTime(userId, gmail, tz, 'today');
    
    console.log('Response time calculation result:', {
      average_response_time,
      count,
      formatted: average_response_time ? `${Math.floor(average_response_time / 60)}m ${average_response_time % 60}s` : 'N/A'
    });
    
    // Store in database
    const { error: upsertError } = await supabase
      .from('response_time_cache')
      .upsert({
        user_id: userId,
        date: today,
        average_response_time,
        reply_count: count,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,date'
      });
    
    if (upsertError) {
      console.error('Failed to store response time data:', upsertError);
    } else {
      console.log(`Successfully stored response time data for ${today}`);
    }
    
  } catch (error) {
    console.error('Error testing response time calculation:', error);
  }
}

async function main() {
  console.log('Starting debug and fix for Inbox Zero and Response Time metrics...');
  
  // Check and create tables if needed
  await checkAndCreateTables();
  
  // Get all users with Gmail tokens
  const { data: users, error: usersError } = await supabase
    .from('gmail_tokens')
    .select('user_id, email')
    .not('email', 'is', null);
  
  if (usersError) {
    console.error('Failed to fetch users:', usersError);
    return;
  }
  
  console.log(`Found ${users.length} users to process`);
  
  for (const user of users) {
    console.log(`\nProcessing user: ${user.email} (${user.user_id})`);
    
    // Test inbox zero calculation
    await testInboxZeroCalculation(user.user_id);
    
    // Test response time calculation
    await testResponseTimeCalculation(user.user_id);
  }
  
  console.log('\nDebug and fix complete!');
}

if (require.main === module) {
  main().catch(console.error);
}

export { checkAndCreateTables, testInboxZeroCalculation, testResponseTimeCalculation }; 