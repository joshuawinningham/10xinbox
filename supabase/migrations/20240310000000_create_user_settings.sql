-- Create user_settings table
CREATE TABLE IF NOT EXISTS user_settings (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    theme TEXT DEFAULT 'blue' NOT NULL,
    time_zone TEXT DEFAULT 'UTC' NOT NULL,
    signature TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Add RLS policies
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- Policy to allow users to read their own settings
CREATE POLICY "Users can read their own settings"
    ON user_settings
    FOR SELECT
    USING (auth.uid() = user_id);

-- Policy to allow users to insert their own settings
CREATE POLICY "Users can insert their own settings"
    ON user_settings
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Policy to allow users to update their own settings
CREATE POLICY "Users can update their own settings"
    ON user_settings
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_user_settings_updated_at
    BEFORE UPDATE ON user_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column(); 