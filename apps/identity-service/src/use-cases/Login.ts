/**
 * Login is handled entirely by AWS Cognito.
 *
 * The frontend calls Cognito's hosted UI or uses the Amplify SDK / Cognito REST API directly:
 *   - Sign in:        POST https://cognito-idp.<region>.amazonaws.com/ (InitiateAuth)
 *   - Refresh token:  POST https://cognito-idp.<region>.amazonaws.com/ (InitiateAuth with REFRESH_TOKEN)
 *   - Sign out:       POST https://cognito-idp.<region>.amazonaws.com/ (RevokeToken)
 *   - Forgot password: POST https://cognito-idp.<region>.amazonaws.com/ (ForgotPassword)
 *
 * Cognito returns a Cognito Access Token (JWT, RS256) which the frontend attaches to every
 * request as:  Authorization: Bearer <access_token>
 *
 * This Lambda never sees passwords. There is no JWT_SECRET. Do not add one.
 *
 * This file is intentionally empty — it exists only as documentation.
 */

export {};
