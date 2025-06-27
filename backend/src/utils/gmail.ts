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
  
    if (error || !data) {
      throw new Error(`No tokens found for user ${user_id}: ${error?.message || 'Unknown error'}`);
    }
  
    const { access_token, refresh_token, expires_at, email } = data;
    
    if (!refresh_token) {
      throw new Error(`No refresh token available for user ${user_id}`);
    }
  
    // 2. Check if access_token is expired (add 5 minute buffer)
    const expiryTime = new Date(expires_at);
    const now = new Date();
    const bufferTime = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes from now
    
    if (expiryTime > bufferTime) {
      // Not expired, return it
      return access_token;
    }
  
    // 3. Refresh the token
    try {
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        `${BASE_URL}/api/auth/google/callback`
      );
      oauth2Client.setCredentials({ refresh_token });
    
      const { credentials } = await oauth2Client.refreshAccessToken();
      
      if (!credentials.access_token || !credentials.expiry_date) {
        throw new Error('Failed to refresh token - no access_token or expiry_date returned');
      }
    
      // 4. Update the token in the database
      const { error: updateError } = await supabase
        .from('gmail_tokens')
        .update({
          access_token: credentials.access_token,
          expires_at: new Date(credentials.expiry_date).toISOString(),
        })
        .eq('user_id', user_id);
        
      if (updateError) {
        console.error('Failed to update refreshed token in database:', updateError);
        // Don't throw here, still return the token as it's valid
      }
    
      return credentials.access_token;
    } catch (refreshError: any) {
      console.error(`Failed to refresh token for user ${user_id}:`, refreshError);
      throw new Error(`Token refresh failed for user ${user_id}: ${refreshError.message || 'Unknown refresh error'}`);
    }
} 