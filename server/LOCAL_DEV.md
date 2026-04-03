# Local Backend Development

This backend local path does not use the old AWS tunnel.

## Setup

1. Copy `.env.example` to `.env`
2. Fill the dev Cognito values:
   - `COGNITO_USER_POOL_ID`
   - `COGNITO_CLIENT_ID`
3. Fill the dev AWS bucket/event values if you want uploads and AWS-integrated flows to work locally

## Start local Postgres

```powershell
npm run db:local:up
```

## Apply schema

```powershell
npm run db:push
npm run db:generate
```

## Start backend

```powershell
npm run dev
```

Backend will run on:
- `http://localhost:5000`

Health check:
- `http://localhost:5000/api/health`

## Stop local Postgres

```powershell
npm run db:local:down
```

## Notes

- This local path is separate from the AWS dev deployment.
- Production is unaffected.
- If a feature depends on AWS services like S3, Cognito, or EventBridge, keep using the dev AWS resource values in `.env`.
