-- Add 'client' role to the existing app_role enum
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'client';