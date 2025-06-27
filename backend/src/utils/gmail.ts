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
      throw new Error(`No refresh token available for user ${user_id}. Please reconnect your Gmail account.`);
    }

    if (!access_token) {
      throw new Error(`No access token available for user ${user_id}. Please reconnect your Gmail account.`);
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
      
      // Check for specific error types
      if (refreshError.message?.includes('invalid_grant') || 
          refreshError.message?.includes('Invalid Credentials') ||
          refreshError.status === 400) {
        // Token is invalid, clear it from database
        await supabase
          .from('gmail_tokens')
          .update({
            access_token: null,
            refresh_token: null,
            expires_at: null
          })
          .eq('user_id', user_id);
        
        throw new Error(`Gmail authentication expired. Please reconnect your Gmail account.`);
      }
      
      throw new Error(`Token refresh failed for user ${user_id}: ${refreshError.message || 'Unknown refresh error'}`);
    }
} 

// Proactive token refresh function - can be called periodically to prevent expirations
export async function refreshTokenIfNeeded(user_id: string): Promise<boolean> {
  try {
    // 1. Get tokens from Supabase
    const { data, error } = await supabase
      .from('gmail_tokens')
      .select('*')
      .eq('user_id', user_id)
      .single();

    if (error || !data) {
      console.error(`No tokens found for user ${user_id}:`, error);
      return false;
    }

    const { access_token, refresh_token, expires_at } = data;
    
    if (!refresh_token || !access_token) {
      console.error(`Missing tokens for user ${user_id}`);
      return false;
    }

    // 2. Check if token will expire in the next 30 minutes
    const expiryTime = new Date(expires_at);
    const now = new Date();
    const refreshThreshold = new Date(now.getTime() + 30 * 60 * 1000); // 30 minutes from now
    
    if (expiryTime > refreshThreshold) {
      // Token is still valid for more than 30 minutes, no need to refresh
      return true;
    }

    // 3. Proactively refresh the token
    console.log(`Proactively refreshing token for user ${user_id} (expires in ${Math.round((expiryTime.getTime() - now.getTime()) / 60000)} minutes)`);
    
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
      console.error('Failed to update proactively refreshed token in database:', updateError);
      return false;
    }

    console.log(`Successfully refreshed token for user ${user_id}`);
    return true;
  } catch (refreshError: any) {
    console.error(`Failed to proactively refresh token for user ${user_id}:`, refreshError);
    
    // Check for specific error types
    if (refreshError.message?.includes('invalid_grant') || 
        refreshError.message?.includes('Invalid Credentials') ||
        refreshError.status === 400) {
      // Token is invalid, clear it from database
      await supabase
        .from('gmail_tokens')
        .update({
          access_token: null,
          refresh_token: null,
          expires_at: null
        })
        .eq('user_id', user_id);
    }
    
    return false;
  }
} 