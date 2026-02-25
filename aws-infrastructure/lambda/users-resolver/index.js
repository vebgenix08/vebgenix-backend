'use strict';

const { getPrisma } = require('../shared/db');
const { withTenant } = require('../shared/withTenant');

/**
 * UsersLambda — AppSync resolver for User (Profile) domain
 *
 * DB table: profiles
 * All queries use withTenant() which enables RLS via SET LOCAL app.tenant_id
 */
exports.handler = async (event) => {
  const { fieldName, arguments: args, identity } = event;

  // Extract Cognito context
  const tenantId = identity?.claims?.['custom:tenant_id'];
  const userId   = identity?.claims?.sub;
  const groups   = identity?.claims?.['cognito:groups'] ?? [];
  const email    = identity?.claims?.email;

  console.log(JSON.stringify({ fieldName, tenantId, userId }));

  const prisma = await getPrisma();

  switch (fieldName) {
    // ── Query.me ──────────────────────────────────────────────────────────────
    case 'me': {
      const profile = await withTenant(prisma, tenantId, userId, (tx) =>
        tx.profile.findUnique({
          where: { id: userId },
          select: {
            id: true, email: true, fullName: true,
            role: true, personaRole: true, isActive: true,
            tenantId: true, createdAt: true,
          },
        })
      );
      if (!profile) {
        // First login — profile may not exist yet, return Cognito data
        return {
          id: userId,
          email,
          fullName: identity?.claims?.name ?? '',
          role: groups[0] ?? 'STAFF',
          tenantId,
          active: true,
          createdAt: new Date().toISOString(),
        };
      }
      return mapProfile(profile);
    }

    // ── Query.listUsers ────────────────────────────────────────────────────────
    case 'listUsers': {
      const { limit = 50, nextToken } = args ?? {};
      const cursor = nextToken ? { id: nextToken } : undefined;

      const profiles = await withTenant(prisma, tenantId, userId, (tx) =>
        tx.profile.findMany({
          where: { isActive: true },
          take: limit,
          skip: cursor ? 1 : 0,
          cursor,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true, email: true, fullName: true,
            role: true, personaRole: true, isActive: true,
            tenantId: true, createdAt: true,
          },
        })
      );

      const nextCursor = profiles.length === limit ? profiles[profiles.length - 1].id : null;
      return { items: profiles.map(mapProfile), nextToken: nextCursor };
    }

    // ── Query.getUser ──────────────────────────────────────────────────────────
    case 'getUser': {
      const { id } = args;
      const profile = await withTenant(prisma, tenantId, userId, (tx) =>
        tx.profile.findUniqueOrThrow({
          where: { id },
          select: {
            id: true, email: true, fullName: true,
            role: true, personaRole: true, isActive: true,
            tenantId: true, createdAt: true,
          },
        })
      );

      // 3. Publish UserWelcome -> EmailWorker sends welcome email
      const { EventBridgeClient: EbClient, PutEventsCommand: PeCmd } = require('@aws-sdk/client-eventbridge');
      await new EbClient({}).send(new PeCmd({
        Entries: [{
          EventBusName: process.env.EVENT_BUS_NAME,
          Source: 'vebgenix.users',
          DetailType: 'UserWelcome',
          Detail: JSON.stringify({ fullName, email, role, tenantId }),
        }],
      }));

      return mapProfile(profile);
    }

    // ── Mutation.createUser ────────────────────────────────────────────────────
    case 'createUser': {
      const { email, fullName, role, temporaryPassword } = args.input;

      // 1. Create Cognito user (provisioned, not self-signed-up)
      const { CognitoIdentityProviderClient, AdminCreateUserCommand } = require('@aws-sdk/client-cognito-identity-provider');
      const cognitoClient = new CognitoIdentityProviderClient({});
      const userPoolId = process.env.USER_POOL_ID;
      if (!userPoolId) throw new Error('USER_POOL_ID env var not set');

      const cognitoRes = await cognitoClient.send(new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: email,
        TemporaryPassword: temporaryPassword,
        UserAttributes: [
          { Name: 'email', Value: email },
          { Name: 'email_verified', Value: 'true' },
          { Name: 'name', Value: fullName },
          { Name: 'custom:tenant_id', Value: tenantId },
          { Name: 'custom:role', Value: role },
        ],
        DesiredDeliveryMediums: ['EMAIL'],
      }));

      const sub = cognitoRes.User.Attributes.find(a => a.Name === 'sub')?.Value;
      if (!sub) throw new Error('Cognito did not return sub for new user');

      // 2. Create DB profile
      const profile = await withTenant(prisma, tenantId, userId, (tx) =>
        tx.profile.create({
          data: {
            id: sub,
            email,
            fullName,
            role,
            tenantId,
            isActive: true,
          },
          select: {
            id: true, email: true, fullName: true,
            role: true, isActive: true, tenantId: true, createdAt: true,
          },
        })
      );

      // 3. Publish UserWelcome -> EmailWorker sends welcome email
      const { EventBridgeClient: EbClient, PutEventsCommand: PeCmd } = require('@aws-sdk/client-eventbridge');
      await new EbClient({}).send(new PeCmd({
        Entries: [{
          EventBusName: process.env.EVENT_BUS_NAME,
          Source: 'vebgenix.users',
          DetailType: 'UserWelcome',
          Detail: JSON.stringify({ fullName, email, role, tenantId }),
        }],
      }));

      return mapProfile(profile);
    }

    // ── Mutation.updateUser ────────────────────────────────────────────────────
    case 'updateUser': {
      const { id, input } = args;
      const profile = await withTenant(prisma, tenantId, userId, (tx) =>
        tx.profile.update({
          where: { id },
          data: {
            ...(input.fullName !== undefined && { fullName: input.fullName }),
            ...(input.role     !== undefined && { role: input.role }),
            ...(input.active   !== undefined && { isActive: input.active }),
          },
          select: {
            id: true, email: true, fullName: true,
            role: true, isActive: true, tenantId: true, createdAt: true,
          },
        })
      );

      // 3. Publish UserWelcome -> EmailWorker sends welcome email
      const { EventBridgeClient: EbClient, PutEventsCommand: PeCmd } = require('@aws-sdk/client-eventbridge');
      await new EbClient({}).send(new PeCmd({
        Entries: [{
          EventBusName: process.env.EVENT_BUS_NAME,
          Source: 'vebgenix.users',
          DetailType: 'UserWelcome',
          Detail: JSON.stringify({ fullName, email, role, tenantId }),
        }],
      }));

      return mapProfile(profile);
    }

    // ── Mutation.deactivateUser ────────────────────────────────────────────────
    case 'deactivateUser': {
      const { id } = args;
      const profile = await withTenant(prisma, tenantId, userId, (tx) =>
        tx.profile.update({
          where: { id },
          data: { isActive: false },
          select: {
            id: true, email: true, fullName: true,
            role: true, isActive: true, tenantId: true, createdAt: true,
          },
        })
      );

      // 3. Publish UserWelcome -> EmailWorker sends welcome email
      const { EventBridgeClient: EbClient, PutEventsCommand: PeCmd } = require('@aws-sdk/client-eventbridge');
      await new EbClient({}).send(new PeCmd({
        Entries: [{
          EventBusName: process.env.EVENT_BUS_NAME,
          Source: 'vebgenix.users',
          DetailType: 'UserWelcome',
          Detail: JSON.stringify({ fullName, email, role, tenantId }),
        }],
      }));

      return mapProfile(profile);
    }

    default:
      throw new Error(`UsersLambda: unknown field "${fieldName}"`);
  }
};

// Map Prisma Profile → GraphQL User shape
function mapProfile(p) {
  return {
    id:        p.id,
    email:     p.email,
    fullName:  p.fullName ?? '',
    role:      p.role,
    tenantId:  p.tenantId,
    active:    p.isActive,
    createdAt: p.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}
