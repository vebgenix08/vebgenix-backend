# How to Update GraphQL

## Where the Schema Lives
[`graphql/schema.graphql`](E:/APPLICATION/vebgenix-backend-main/graphql/schema.graphql)

## How AppSync Uses the Schema
CDK deploys the schema and connects the resolvers to Lambda data sources.

## How to Add a Type/Input/Query/Mutation
1. Update the schema.
2. Update AppSync resolver mapping.
3. Update the Lambda route.
4. Update the use-case.
5. Update frontend callers if applicable.

## How to Remove an API Safely
1. Remove the GraphQL field.
2. Remove the AppSync resolver.
3. Remove the route case.
4. Remove the use-case only after checking call sites.

## Broken Mapping Check
If schema and route disagree, treat it as a mismatch and verify before deploying.

