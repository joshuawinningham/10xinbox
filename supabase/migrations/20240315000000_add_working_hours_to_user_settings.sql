-- Add working hours settings to user_settings table
ALTER TABLE user_settings 
ADD COLUMN working_hours_start TIME DEFAULT '09:00:00',
ADD COLUMN working_hours_end TIME DEFAULT '17:00:00',
ADD COLUMN working_days INTEGER[] DEFAULT '{1,2,3,4,5}'; -- Monday=1, Tuesday=2, etc.

-- Add comment to explain working_days array
COMMENT ON COLUMN user_settings.working_days IS 'Array of working days where 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday, 7=Sunday'; 