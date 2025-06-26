import { createClient } from '@supabase/supabase-js';
import { google, gmail_v1 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { DateTime } from 'luxon';
import logger from './utils/logger';
import { GaxiosResponse } from 'gaxios';

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
    // Get all users from user_settings
    const { data: users, error: usersError } = await supabase
      .from('user_settings')
      .select('user_id, time_zone');

    if (usersError) {
      throw usersError;
    }

    for (const user of users) {
      try {
        // Get user's Gmail token
        const { data: tokenData, error: tokenError } = await supabase
          .from('gmail_tokens')
          .select('access_token, refresh_token, expires_at')
          .eq('user_id', user.user_id)
          .single();

        if (tokenError) {
          logger.error(`Failed to fetch Gmail token for user ${user.user_id}:`, tokenError);
          continue;
        }

        // Get user's working hours settings
        const { data: settingsData, error: settingsError } = await supabase
          .from('user_settings')
          .select('working_hours_start, working_hours_end, working_days, inbox_zero_buffer_minutes')
          .eq('user_id', user.user_id)
          .single();

        if (settingsError && settingsError.code !== 'PGRST116') { // PGRST116: No rows found
          logger.error(`Failed to fetch user settings for user ${user.user_id}:`, settingsError);
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
            .eq('user_id', user.user_id);

          tokenData.access_token = credentials.access_token;
        }

        // Set up Gmail API client
        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
        oauth2Client.setCredentials({ access_token: tokenData.access_token });

        // Get user's timezone
        const tz = user.time_zone || 'UTC';
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
          logger.info(`Skipping inbox zero update for user ${user.user_id} - not a working day`);
          continue;
        }

        // Calculate the cutoff time (end of working hours)
        const workingHoursEnd = settingsData?.working_hours_end || '17:00:00';
        const [endHour, endMinute] = workingHoursEnd.split(':').map(Number);
        const cutoffTime = now.set({ hour: endHour, minute: endMinute, second: 0, millisecond: 0 });

        // If it's before the cutoff time, skip updating (user still has time to clear inbox)
        if (now < cutoffTime) {
          logger.info(`Skipping inbox zero update for user ${user.user_id} - before end of working hours`);
          continue;
        }

        // Fetch unread messages in INBOX up to the cutoff time
        let inboxCount = 0;
        let nextPageToken: string | undefined = undefined;
        do {
          const response: GaxiosResponse<gmail_v1.Schema$ListMessagesResponse> = await gmail.users.messages.list({
            userId: 'me',
            q: `label:INBOX label:UNREAD after:${Math.floor(startOfDay.toSeconds())} before:${Math.floor(cutoffTime.toSeconds())}`,
            maxResults: 500,
            pageToken: nextPageToken
          });
          if (response.data.messages) {
            inboxCount += response.data.messages.length;
          }
          nextPageToken = response.data.nextPageToken ?? undefined;
        } while (nextPageToken);

        // Insert or update inbox zero data for today
        const { error: upsertError } = await supabase
          .from('inbox_zero_days')
          .upsert({
            user_id: user.user_id,
            date: now.toISODate(),
            inbox_count: inboxCount
          }, {
            onConflict: 'user_id,date'
          });

        if (upsertError) {
          logger.error(`Failed to upsert inbox zero data for user ${user.user_id}:`, upsertError);
        }

      } catch (error) {
        logger.error(`Error processing user ${user.user_id}:`, error);
      }
    }
  } catch (error) {
    logger.error('Failed to update inbox zero data:', error);
  }
}

// Run the update
updateInboxZeroData(); 