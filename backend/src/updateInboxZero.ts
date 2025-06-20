import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { DateTime } from 'luxon';
import logger from './utils/logger';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

async function updateInboxZeroData() {
  try {
    // Get all users
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, timezone');

    if (usersError) {
      throw usersError;
    }

    for (const user of users) {
      try {
        // Get user's Gmail token
        const { data: tokenData, error: tokenError } = await supabase
          .from('gmail_tokens')
          .select('access_token, refresh_token, expires_at')
          .eq('user_id', user.id)
          .single();

        if (tokenError) {
          logger.error(`Failed to fetch Gmail token for user ${user.id}:`, tokenError);
          continue;
        }

        // Get user's working hours settings
        const { data: settingsData, error: settingsError } = await supabase
          .from('user_settings')
          .select('working_hours_start, working_hours_end, working_days, inbox_zero_buffer_minutes')
          .eq('user_id', user.id)
          .single();

        if (settingsError && settingsError.code !== 'PGRST116') { // PGRST116: No rows found
          logger.error(`Failed to fetch user settings for user ${user.id}:`, settingsError);
          continue;
        }

        // Check if token needs refresh
        if (tokenData.expires_at && new Date(tokenData.expires_at) <= new Date()) {
          oauth2Client.setCredentials({
            refresh_token: tokenData.refresh_token
          });

          const { credentials } = await oauth2Client.refreshAccessToken();
          
          // Update token in database
          await supabase
            .from('gmail_tokens')
            .update({
              access_token: credentials.access_token,
              expires_at: new Date(Date.now() + (credentials.expiry_date || 3600000))
            })
            .eq('user_id', user.id);

          tokenData.access_token = credentials.access_token;
        }

        // Set up Gmail API client
        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
        oauth2Client.setCredentials({ access_token: tokenData.access_token });

        // Get user's timezone
        const tz = user.timezone || 'UTC';
        const now = DateTime.now().setZone(tz);
        const startOfDay = now.startOf('day');
        const endOfDay = now.endOf('day');

        // Helper function to check if today is a working day
        const isWorkingDay = () => {
          if (!settingsData?.working_days) return true; // Default to all days if not set
          const dayOfWeek = now.weekday; // 1=Monday, 2=Tuesday, etc.
          return settingsData.working_days.includes(dayOfWeek);
        };

        // Only update inbox zero data if today is a working day
        if (!isWorkingDay()) {
          logger.info(`Skipping inbox zero update for user ${user.id} - not a working day`);
          continue;
        }

        // Calculate the buffer cutoff time
        const bufferMinutes = settingsData?.inbox_zero_buffer_minutes || 30;
        const workingHoursEnd = settingsData?.working_hours_end || '17:00:00';
        const [endHour, endMinute] = workingHoursEnd.split(':').map(Number);
        const bufferCutoff = now.set({ hour: endHour, minute: endMinute }).minus({ minutes: bufferMinutes });

        // If it's before the buffer cutoff time, count all emails for the day
        // If it's after the buffer cutoff time, only count emails received before the cutoff
        let queryEndTime;
        if (now < bufferCutoff) {
          // Before buffer cutoff - count all emails for the day
          queryEndTime = endOfDay;
        } else {
          // After buffer cutoff - only count emails before the cutoff
          queryEndTime = bufferCutoff;
        }

        // Fetch messages up to the calculated end time
        const response = await gmail.users.messages.list({
          userId: 'me',
          q: `after:${Math.floor(startOfDay.toSeconds())} before:${Math.floor(queryEndTime.toSeconds())}`,
          maxResults: 500
        });

        const messages = response.data.messages || [];
        const inboxCount = messages.length;

        // Insert or update inbox zero data for today
        const { error: upsertError } = await supabase
          .from('inbox_zero_days')
          .upsert({
            user_id: user.id,
            date: now.toISODate(),
            inbox_count: inboxCount
          }, {
            onConflict: 'user_id,date'
          });

        if (upsertError) {
          logger.error(`Failed to upsert inbox zero data for user ${user.id}:`, upsertError);
        }

      } catch (error) {
        logger.error(`Error processing user ${user.id}:`, error);
      }
    }
  } catch (error) {
    logger.error('Failed to update inbox zero data:', error);
  }
}

// Run the update
updateInboxZeroData(); 