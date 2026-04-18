-- Migration: add STAFF_ONBOARDING to TemplateType enum
-- This is a non-destructive, additive change.

ALTER TYPE "TemplateType" ADD VALUE IF NOT EXISTS 'STAFF_ONBOARDING';
