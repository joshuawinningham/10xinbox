npm -- Create inbox_zero_days table
CREATE TABLE IF NOT EXISTS inbox_zero_days (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    inbox_count INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(user_id, date)
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS inbox_zero_days_user_id_idx ON inbox_zero_days(user_id);
CREATE INDEX IF NOT EXISTS inbox_zero_days_date_idx ON inbox_zero_days(date);
CREATE INDEX IF NOT EXISTS inbox_zero_days_user_date_idx ON inbox_zero_days(user_id, date);

-- Enable RLS
ALTER TABLE inbox_zero_days ENABLE ROW LEVEL SECURITY;

-- Policy to allow users to read their own inbox zero data
CREATE POLICY "Users can read their own inbox zero data"
    ON inbox_zero_days
    FOR SELECT
    USING (auth.uid() = user_id);

-- Policy to allow users to insert their own inbox zero data
CREATE POLICY "Users can insert their own inbox zero data"
    ON inbox_zero_days
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Policy to allow users to update their own inbox zero data
CREATE POLICY "Users can update their own inbox zero data"
    ON inbox_zero_days
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_inbox_zero_days_updated_at
    BEFORE UPDATE ON inbox_zero_days
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column(); 