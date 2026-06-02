# How to Add a New API

## Steps
1. Add or update the GraphQL type, input, query, or mutation.
2. Add the AppSync resolver mapping.
3. Add the route case in the service `routes.ts`.
4. Add the use-case function in the correct `use-cases/*.ts` file.
5. Add a repository method if the API reads or writes MongoDB.
6. Add model fields or indexes if needed.
7. Add or update permissions.
8. Add an audit log for write APIs.
9. Add frontend usage if the UI needs it.
10. Run typecheck and build.
11. Verify manually.

## Example
Fake API: `createDemoNote`
- GraphQL mutation: `createDemoNote`
- AppSync mapping: resolver to the correct Lambda
- Route: `case 'createDemoNote'`
- Use-case: `createDemoNote(...)`
- Repository: `NotesRepo.createDemoNote`
- Model: `DemoNote`
- Permission: `notes.create`
- Audit: yes

## Editing Rule
Do not split one feature into many tiny action files unless the use-case file becomes too large.

