# Result Only API Responses

Source Newman summary: E:\APPLICATION\vebgenix-backend-main\postman\reports\2026-05-08T21-01-50\summary.json

Each file in `responses/` contains only the API response body, like a Postman response. Request metadata and headers are removed. AWSJSON strings are parsed into real JSON where possible.

## Counts

- Executed responses: 187
- Pass by body validation: 110
- Fail by body validation: 77
- Responses with empty result fields: 72

## Useful Files

- `responses/` - result-only response bodies.
- `failures.json` - only responses containing HTTP errors, GraphQL errors, or null root data.
- `empty-results.json` - successful responses where the data field is empty, for example list APIs returning `[]`.
- `index.json` - all response files with status and issue summary.
