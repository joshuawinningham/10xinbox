-- 10xinbox Supabase Database Schema
-- Run this SQL in the Supabase SQL Editor to set up all required tables

-- ============================================
-- 1. Gmail Tokens Table
-- Stores OAuth tokens for Gmail API access
-- ============================================
CREATE TABLE IF NOT EXISTS gmail_tokens (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    name TEXT,
    access_token TEXT,
    refresh_token TEXT,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Index for quick user lookups
CREATE INDEX IF NOT EXISTS idx_gmail_tokens_user_id ON gmail_tokens(user_id);

-- ============================================
-- 2. User Settings Table
-- Stores user preferences, timezone, working hours, theme, and signature
-- ============================================
CREATE TABLE IF NOT EXISTS user_settings (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    time_zone TEXT DEFAULT 'UTC',
    theme TEXT DEFAULT 'blue',
    signature TEXT,
    working_hours_start TIME DEFAULT '09:00:00',
    working_hours_end TIME DEFAULT '17:00:00',
    working_days INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5],
    inbox_zero_buffer_minutes INTEGER DEFAULT 30,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Index for quick user lookups
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);

-- ============================================
-- 3. Email Stats Table
-- Stores daily email sent/received counts
-- ============================================
CREATE TABLE IF NOT EXISTS email_stats (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    emails_sent INTEGER DEFAULT 0,
    emails_received INTEGER DEFAULT 0,
    new_threads INTEGER DEFAULT 0,
    replies INTEGER DEFAULT 0,
    current_inbox_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, date)
);

-- Index for quick date range queries
CREATE INDEX IF NOT EXISTS idx_email_stats_user_date ON email_stats(user_id, date);

-- ============================================
-- 4. Inbox Zero Days Table
-- Tracks daily inbox count at end of working hours
-- ============================================
CREATE TABLE IF NOT EXISTS inbox_zero_days (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    inbox_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, date)
);

-- Index for quick date range queries
CREATE INDEX IF NOT EXISTS idx_inbox_zero_days_user_date ON inbox_zero_days(user_id, date);

-- ============================================
-- 5. Sent Emails Table
-- Tracks sent emails for open tracking
-- ============================================
CREATE TABLE IF NOT EXISTS sent_emails (
    id SERIAL PRIMARY KEY,
    email_id UUID NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    to_email TEXT,
    to_name TEXT,
    subject TEXT,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_reply BOOLEAN DEFAULT FALSE,
    gmail_message_id TEXT,
    in_reply_to TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(email_id)
);

-- Indexes for quick lookups
CREATE INDEX IF NOT EXISTS idx_sent_emails_user_id ON sent_emails(user_id);
CREATE INDEX IF NOT EXISTS idx_sent_emails_email_id ON sent_emails(email_id);
CREATE INDEX IF NOT EXISTS idx_sent_emails_sent_at ON sent_emails(sent_at);

-- ============================================
-- 6. Email Opens Table
-- Tracks when sent emails are opened/viewed
-- ============================================
CREATE TABLE IF NOT EXISTS email_opens (
    id SERIAL PRIMARY KEY,
    email_id UUID NOT NULL REFERENCES sent_emails(email_id) ON DELETE CASCADE,
    opened_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ip_address TEXT,
    user_agent TEXT,
    open_type TEXT DEFAULT 'unknown', -- 'human', 'gmail_proxy', 'email_client', 'bot'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for quick lookups
CREATE INDEX IF NOT EXISTS idx_email_opens_email_id ON email_opens(email_id);
CREATE INDEX IF NOT EXISTS idx_email_opens_opened_at ON email_opens(opened_at);

-- ============================================
-- 7. Response Time Cache Table
-- Caches calculated response times for performance
-- ============================================
CREATE TABLE IF NOT EXISTS response_time_cache (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    average_response_time INTEGER, -- in seconds
    reply_count INTEGER DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, date)
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_response_time_cache_user_date ON response_time_cache(user_id, date);

-- ============================================
-- 8. Reports Sent Table
-- Tracks sent daily report emails
-- ============================================
CREATE TABLE IF NOT EXISTS reports_sent (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    report_date DATE NOT NULL,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, report_date)
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_reports_sent_user_date ON reports_sent(user_id, report_date);

-- ============================================
-- Row Level Security (RLS) Policies
-- Enable RLS on all tables for data isolation
-- ============================================

-- Enable RLS
ALTER TABLE gmail_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbox_zero_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE sent_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_opens ENABLE ROW LEVEL SECURITY;
ALTER TABLE response_time_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports_sent ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for gmail_tokens
CREATE POLICY "Users can view their own gmail_tokens" ON gmail_tokens
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own gmail_tokens" ON gmail_tokens
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own gmail_tokens" ON gmail_tokens
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own gmail_tokens" ON gmail_tokens
    FOR DELETE USING (auth.uid() = user_id);

-- Create RLS policies for user_settings
CREATE POLICY "Users can view their own user_settings" ON user_settings
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own user_settings" ON user_settings
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own user_settings" ON user_settings
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own user_settings" ON user_settings
    FOR DELETE USING (auth.uid() = user_id);

-- Create RLS policies for email_stats
CREATE POLICY "Users can view their own email_stats" ON email_stats
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own email_stats" ON email_stats
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own email_stats" ON email_stats
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own email_stats" ON email_stats
    FOR DELETE USING (auth.uid() = user_id);

-- Create RLS policies for inbox_zero_days
CREATE POLICY "Users can view their own inbox_zero_days" ON inbox_zero_days
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own inbox_zero_days" ON inbox_zero_days
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own inbox_zero_days" ON inbox_zero_days
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own inbox_zero_days" ON inbox_zero_days
    FOR DELETE USING (auth.uid() = user_id);

-- Create RLS policies for sent_emails
CREATE POLICY "Users can view their own sent_emails" ON sent_emails
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own sent_emails" ON sent_emails
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own sent_emails" ON sent_emails
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own sent_emails" ON sent_emails
    FOR DELETE USING (auth.uid() = user_id);

-- Create RLS policies for email_opens
-- Users can view opens on their own sent emails
CREATE POLICY "Users can view email_opens on their sent emails" ON email_opens
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM sent_emails 
            WHERE sent_emails.email_id = email_opens.email_id 
            AND sent_emails.user_id = auth.uid()
        )
    );
CREATE POLICY "Anyone can insert email_opens" ON email_opens
    FOR INSERT WITH CHECK (TRUE);

-- Create RLS policies for response_time_cache
CREATE POLICY "Users can view their own response_time_cache" ON response_time_cache
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own response_time_cache" ON response_time_cache
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own response_time_cache" ON response_time_cache
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own response_time_cache" ON response_time_cache
    FOR DELETE USING (auth.uid() = user_id);

-- Create RLS policies for reports_sent
CREATE POLICY "Users can view their own reports_sent" ON reports_sent
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own reports_sent" ON reports_sent
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own reports_sent" ON reports_sent
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own reports_sent" ON reports_sent
    FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- Service Role Bypass Policies
-- Allow service role full access (for backend operations)
-- ============================================

-- Gmail tokens - service role access
CREATE POLICY "Service role has full access to gmail_tokens" ON gmail_tokens
    FOR ALL USING (auth.role() = 'service_role');

-- User settings - service role access
CREATE POLICY "Service role has full access to user_settings" ON user_settings
    FOR ALL USING (auth.role() = 'service_role');

-- Email stats - service role access
CREATE POLICY "Service role has full access to email_stats" ON email_stats
    FOR ALL USING (auth.role() = 'service_role');

-- Inbox zero days - service role access
CREATE POLICY "Service role has full access to inbox_zero_days" ON inbox_zero_days
    FOR ALL USING (auth.role() = 'service_role');

-- Sent emails - service role access
CREATE POLICY "Service role has full access to sent_emails" ON sent_emails
    FOR ALL USING (auth.role() = 'service_role');

-- Email opens - service role access
CREATE POLICY "Service role has full access to email_opens" ON email_opens
    FOR ALL USING (auth.role() = 'service_role');

-- Response time cache - service role access
CREATE POLICY "Service role has full access to response_time_cache" ON response_time_cache
    FOR ALL USING (auth.role() = 'service_role');

-- Reports sent - service role access
CREATE POLICY "Service role has full access to reports_sent" ON reports_sent
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- Helpful Comment
-- ============================================
-- After running this script, update your .env.local files with:
-- - SUPABASE_URL: Your new Supabase project URL
-- - SUPABASE_ANON_KEY: Your new anon/public key (for frontend)
-- - SUPABASE_SERVICE_KEY: Your new service role key (for backend)
-- - SUPABASE_SERVICE_ROLE_KEY: Same as SUPABASE_SERVICE_KEY
