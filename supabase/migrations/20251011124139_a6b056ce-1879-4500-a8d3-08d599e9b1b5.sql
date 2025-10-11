-- Step 1: Add new roles to app_role enum
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'sales_manager';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'sales_rep';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'dispatch_officer';