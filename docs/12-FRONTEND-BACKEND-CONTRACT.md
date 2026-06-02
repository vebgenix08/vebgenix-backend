# Frontend / Backend Contract

## Frontend API Location
Frontend GraphQL and REST callers live outside this backend repo if present.

## API Client Location
If the frontend is in the same workspace, inspect its API client and GraphQL helpers. If not present, mark usage as needs verification.

## Auth Token Flow
Cognito issues tokens, frontend sends them to AppSync and REST APIs, backend derives auth context from the token.

## Tenant Context Flow
Tenant context is derived from the authenticated membership and permissions.

## Feature Toggle Flow
Settings stores tenant feature flags and backend checks them before use-case execution.

## Finance Razorpay Status
Backend Razorpay code exists. Full frontend checkout is not completed. Payment link usage exists.

## Receipt Status
Receipt PDF is generated on demand only and is not stored.

## Upload Flow
Frontend requests a signed URL, uploads directly, then updates metadata if needed.

## When Frontend Breaks
Check:
- schema field names
- resolver mapping
- route mapping
- auth token
- tenant context
- feature flag

