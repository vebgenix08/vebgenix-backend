# Maintenance Checklist

## Before Adding an API
- Confirm module ownership
- Confirm GraphQL shape
- Confirm resolver mapping
- Confirm route mapping
- Confirm use-case file
- Confirm repository method
- Confirm permission
- Confirm audit rule

## Before Changing GraphQL
- Check schema consumers
- Check AppSync mapping
- Check frontend callers
- Check route handlers

## Before Changing Lambda
- Check the service pattern
- Check route dispatcher
- Check permissions and audit calls

## Before Changing DB Model
- Check repository methods
- Check existing APIs
- Check indexes and tenant fields

## Before Changing Permission
- Check the permission helper
- Check platform admin bypass
- Check tenant role assumptions

## Before Changing Tenant Logic
- Check feature flags
- Check tenant-scoped permissions
- Check onboarding and provisioning flows

## Before Deploying Dev
- Typecheck
- Build
- Verify environment values

## Before Deploying Prod
- Confirm release branch
- Confirm secrets
- Confirm stack diff

## Before Deleting Any API
- Remove GraphQL field
- Remove resolver
- Remove route
- Check frontend callers

## Before Touching Payment / Receipt / Numbering
- Verify receipt is generated on demand only
- Verify Razorpay behavior
- Verify sequence behavior

## Before Touching Cognito / User Flows
- Verify token flow
- Verify invite/resend behavior
- Verify user profile sync

