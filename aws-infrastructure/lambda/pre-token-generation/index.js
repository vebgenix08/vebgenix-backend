'use strict';

/**
 * Cognito Pre-Token Generation trigger.
 *
 * Runs before Cognito issues every ID/Access token.
 * Reads the user's global roles and primary tenant membership from Neon DB,
 * then injects them as custom claims so every resolver Lambda can read
 * identity without an extra DB round-trip.
 *
 * Claims added:
 *   custom:global_roles  — JSON array e.g. ["PLATFORM_SUPER_ADMIN"]
 *   custom:tenant_id     — UUID of primary active tenant (empty for super admins)
 *   custom:role          — Tenant role e.g. "ADMIN", "TEACHER" (empty for super admins)
 */

const { getPrisma } = require('lambda-shared/db');

exports.handler = async (event) => {
  const email = event.request?.userAttributes?.email;
  if (!email) return event;

  try {
    const prisma = await getPrisma();

    const user = await prisma.authUser.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        globalRoles: true,
        memberships: {
          where: { status: 'ACTIVE' },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
    });

    if (!user) return event;

    const globalRoles = user.globalRoles.map((r) => r.role);
    const membership  = user.memberships[0] ?? null;

    event.response = {
      claimsOverrideDetails: {
        claimsToAddOrOverride: {
          'custom:global_roles': JSON.stringify(globalRoles),
          'custom:tenant_id':    membership?.tenantId ?? '',
          'custom:role':         membership?.role     ?? '',
        },
      },
    };
  } catch (err) {
    // Never block login on DB errors — log and proceed
    console.error('[pre-token-generation] DB error:', err.message);
  }

  return event;
};
