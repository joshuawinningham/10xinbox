import { createClient } from '@supabase/supabase-js';
import { refreshTokenIfNeeded } from './utils/gmail';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

async function refreshAllTokens() {
  console.log('Starting token refresh job...');
  
  try {
    // Get all users with Gmail tokens
    const { data: users, error } = await supabase
      .from('gmail_tokens')
      .select('user_id, email')
      .not('refresh_token', 'is', null);

    if (error) {
      console.error('Failed to fetch users for token refresh:', error);
      process.exit(1);
    }

    if (!users || users.length === 0) {
      console.log('No users with Gmail tokens found');
      return;
    }

    console.log(`Found ${users.length} users with Gmail tokens`);

    let successCount = 0;
    let failureCount = 0;

    for (const user of users) {
      try {
        console.log(`Refreshing token for user ${user.user_id} (${user.email})...`);
        const success = await refreshTokenIfNeeded(user.user_id);
        
        if (success) {
          console.log(`✅ Successfully refreshed token for user ${user.user_id}`);
          successCount++;
        } else {
          console.log(`⚠️  Token refresh not needed for user ${user.user_id}`);
          successCount++; // Not a failure, just not needed
        }
      } catch (err) {
        console.error(`❌ Failed to refresh token for user ${user.user_id}:`, err);
        failureCount++;
      }
    }

    console.log(`\nToken refresh job complete:`);
    console.log(`- Success/Not needed: ${successCount}`);
    console.log(`- Failures: ${failureCount}`);
    console.log(`- Total users processed: ${users.length}`);

  } catch (error) {
    console.error('Token refresh job failed:', error);
    process.exit(1);
  }
}

// Run the job
refreshAllTokens(); 