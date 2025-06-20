import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';

// Utility to get a valid Gmail access token for a user (refresh if needed)
export async function getValidAccessToken(user_id: string): Promise<string> {
    // 1. Get tokens from Supabase
    const { data, error } = await supabase
      .from('gmail_tokens')
      .select('*')
      .eq('user_id', user_id)
      .single();
  
    if (error || !data) throw new Error('No tokens found for user');
  
    const { access_token, refresh_token, expires_at, email } = data;
  
    // 2. Check if access_token is expired
    if (new Date(expires_at) > new Date()) {
      // Not expired, return it
      return access_token;
    }
  
    // 3. Refresh the token using getAccessToken and credentials.expiry_date
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${BASE_URL}/api/auth/google/callback`
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
  
    return newAccessToken!;
} 