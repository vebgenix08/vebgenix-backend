# Environment Configuration

## Environment Variables

| Variable | Used by | Required in dev | Required in prod | Example value | Secret or non-secret | Where configured | Notes |
|---|---|---:|---:|---|---|---|---|
| `MONGODB_URI` | db layer | Yes | Yes | `REDACTED` | Secret | `.env`, deployment secrets | Primary Mongo connection |
| `COGNITO_USER_POOL_ID` | auth/identity/settings | Yes | Yes | `REDACTED` | Non-secret | `.env`, CDK/SSM | Cognito user pool |
| `COGNITO_REGION` | auth/identity/settings | Yes | Yes | `ap-south-1` | Non-secret | `.env` | Cognito region |
| `COGNITO_CLIENT_ID` | auth client flow | Yes | Yes | `REDACTED` | Secret | `.env`, CDK output | Cognito client id |
| `RAZORPAY_KEY_ID` | finance payment flow | Yes | Yes | `REDACTED` | Secret | `.env`, deployment secrets | Razorpay public key |
| `RAZORPAY_KEY_SECRET` | finance payment flow | Yes | Yes | `REDACTED` | Secret | `.env`, deployment secrets | Razorpay secret |
| `RAZORPAY_WEBHOOK_SECRET` | finance webhook | Yes | Yes | `REDACTED` | Secret | `.env`, deployment secrets | Webhook signature verification |
| `SMTP_HOST` | email worker / notifications | Optional | Yes | `smtp.example.com` | Secret-ish | `.env`, secrets manager | Email relay host |
| `SMTP_PORT` | email worker / notifications | Optional | Yes | `587` | Non-secret | `.env` | SMTP port |
| `SMTP_USER` | email worker / notifications | Optional | Yes | `REDACTED` | Secret | `.env`, secrets manager | SMTP user |
| `SMTP_PASSWORD` | email worker / notifications | Optional | Yes | `REDACTED` | Secret | `.env`, secrets manager | SMTP password |
| `SMTP_PASS` | email worker / notifications | Optional | Yes | `REDACTED` | Secret | `.env`, secrets manager | Alternate SMTP password key |
| `SMTP_FROM` | email worker / notifications | Optional | Yes | `noreply@example.com` | Non-secret | `.env` | From address |
| `APP_NAME` | app labels | Yes | Yes | `Vebgenix` | Non-secret | `.env` | App display name |
| `APP_BASE_URL` | frontend/back links | Yes | Yes | `https://app.example.com` | Non-secret | `.env`, CDK config | Base URL for links |
| `NODE_ENV` | runtime mode | Yes | Yes | `development` | Non-secret | shell, deployment | Standard Node env |

## Stage Selection
- Local and CDK stage selection is controlled by the `env` context in CDK.
- `dev` and `prod` are the supported deployment targets.

## Where Configuration Lives
- Root `.env`
- CDK config files in `aws-infrastructure/config/`
- CI/CD secrets and deployment environment settings

## Safe Addition Rule
Add a new variable in source, document it here, add it to the deployment environment, and verify no service reads it before the deployment pipeline injects it.

