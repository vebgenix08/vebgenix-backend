# Empty Data / Error Root Cause Notes

This folder intentionally contains result-only JSON bodies under `responses/`.

## Why some list APIs show empty arrays

- `List Staff` returns `{ "data": { "listStaff": [] } }` because `Invite Staff / Onboard Staff` failed before it. The request contains `campusIds`, but the resolver currently passes the whole GraphQL arguments object to `InviteStaff.execute` instead of `args.input`, so the service sees no `campusId`.
- `List Programs` returns `[]` because `createProgram` did not create a usable program. Several AWSJSON resolvers expect an object but receive the AWSJSON string from AppSync/Postman.
- Fee list APIs are empty when the create step failed, did not save the ID, or the follow-up lookup uses an empty ID.
- Exam, roll number, registration number, timetable, and promotion APIs show null/errors because the prerequisite class/section/student/exam records were not successfully created or the academics-service returned an internal error.

## Backend/API mismatches found

- `inviteStaff`: resolver should pass `args.input` into `InviteStaff.execute`; currently it behaves like required fields are missing.
- Program and several settings/finance APIs use `AWSJSON`; resolvers need to parse JSON strings or schema/Postman should move to typed input objects consistently.
- Several delete mutations are declared as `Boolean` but return an object, causing GraphQL serialization errors.
- Platform Postman folder is stale: some fields no longer exist or need typed selections/input.
- Platform dashboard resolvers return shapes that do not match schema fields.

## Files

- `responses/`: only response bodies, no headers/request metadata.
- `failures.json`: failed bodies only.
- `empty-results.json`: successful responses that returned empty arrays/null-like data.
