-- Add ip column to email_opens table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'email_opens' 
        AND column_name = 'ip'
    ) THEN
        ALTER TABLE email_opens ADD COLUMN ip TEXT;
    END IF;
END $$; 