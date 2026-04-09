'use strict';

const { getPrisma }       = require('lambda-shared/db');
const { extractIdentity } = require('lambda-shared/identity');
const crypto              = require('crypto');

const DOMAIN_SUFFIX = '.vebgenix.com';

/**
 * Available features — single source of truth.
 * Add new features here to expose them in the wizard.
 */
const AVAILABLE_FEATURES = [
  { key: 'ADMISSIONS',  name: 'Admissions',     description: 'Manage student applications and admissions process', defaultEnabled: true  },
  { key: 'STUDENTS',    name: 'Students',        description: 'Student profiles, academic records and documents',   defaultEnabled: true  },
  { key: 'ATTENDANCE',  name: 'Attendance',      description: 'Track student and staff daily attendance',           defaultEnabled: true  },
  { key: 'FINANCE',     name: 'Finance & Fees',  description: 'Fee structures, invoices and payment tracking',     defaultEnabled: false },
  { key: 'RESULTS',     name: 'Results & Exams', description: 'Exam results, grades and report card generation',   defaultEnabled: false },
  { key: 'TIMETABLE',   name: 'Timetable',       description: 'Class scheduling and timetable management',         defaultEnabled: false },
  { key: 'LIBRARY',     name: 'Library',         description: 'Library catalog and book issue management',         defaultEnabled: false },
  { key: 'TRANSPORT',   name: 'Transport',       description: 'School bus routes and transport management',        defaultEnabled: false },
];

/**
 * TenantsLambda — AppSync resolver for Tenant management
 * SUPER_ADMIN only
 */
exports.handler = async (event) => {
  // AppSync sends full $ctx as payload — fieldName is at info.fieldName
  const fieldName = event.info?.fieldName ?? event.fieldName;
  const args      = event.arguments ?? event.args ?? {};
  const identity  = event.identity;
  const { isSuperAdmin, userId, email: actorEmail } = extractIdentity(identity);

  if (!isSuperAdmin) {
    throw new Error('Unauthorized: SUPER_ADMIN access required');
  }

  console.log(JSON.stringify({ fieldName, userId }));

  const prisma = await getPrisma();

  switch (fieldName) {

    // ── Queries ──────────────────────────────────────────────────────────────

    case 'listTenants': {
      const tenants = await prisma.tenant.findMany({
        orderBy: { createdAt: 'desc' },
        take:    args?.limit ?? 100,
        include: { features: true },
      });
      return {
        items:     tenants.map(mapTenant),
        nextToken: null,
      };
    }

    case 'getTenant': {
      const tenant = await prisma.tenant.findUniqueOrThrow({
        where:   { id: args.id },
        include: { features: true },
      });
      return mapTenant(tenant);
    }

    case 'validateSubdomain': {
      const raw        = args.subdomain ?? '';
      const normalized = normalizeSubdomain(raw);

      if (!normalized) {
        return {
          available:  false,
          normalized: '',
          fullDomain: '',
          suggestion: null,
        };
      }

      const existing = await prisma.tenant.findUnique({
        where:  { slug: normalized },
        select: { id: true },
      });

      const available = !existing;
      let suggestion  = null;

      if (!available) {
        // Suggest a variant
        for (let i = 2; i <= 9; i++) {
          const variant = `${normalized}${i}`;
          const conflict = await prisma.tenant.findUnique({
            where:  { slug: variant },
            select: { id: true },
          });
          if (!conflict) { suggestion = variant; break; }
        }
      }

      return {
        available,
        normalized,
        fullDomain: `${normalized}${DOMAIN_SUFFIX}`,
        suggestion: suggestion ? `${suggestion}${DOMAIN_SUFFIX}` : null,
      };
    }

    case 'listAvailableFeatures': {
      return AVAILABLE_FEATURES;
    }

    // ── Mutations ─────────────────────────────────────────────────────────────

    case 'provisionTenant': {
      const { organizationName, subdomain, features, adminName, adminEmail } = args.input;

      // 1. Normalize and validate subdomain
      const slug = normalizeSubdomain(subdomain);
      if (!slug) throw new Error('Invalid subdomain: use lowercase letters, numbers and hyphens only');

      const conflict = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
      if (conflict) throw new Error(`Subdomain "${slug}${DOMAIN_SUFFIX}" is already taken`);

      // 2. Validate features
      const validKeys = new Set(AVAILABLE_FEATURES.map(f => f.key));
      const invalidFeatures = features.filter(f => !validKeys.has(f));
      if (invalidFeatures.length) throw new Error(`Invalid feature keys: ${invalidFeatures.join(', ')}`);

      // 3. Validate admin email
      const normalizedEmail = adminEmail.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        throw new Error('Invalid admin email address');
      }

      // 4. Create tenant + features in one transaction
      const tenant = await prisma.$transaction(async (tx) => {
        const t = await tx.tenant.create({
          data: {
            name:               organizationName.trim(),
            slug,
            isActive:           true,
            onboardingComplete: false,
            features: {
              create: features.map(key => ({ featureKey: key, enabled: true })),
            },
          },
          include: { features: true },
        });
        return t;
      });

      // 5. Create or find AuthUser for admin
      let authUser = await prisma.authUser.findUnique({
        where: { email: normalizedEmail },
      });

      if (!authUser) {
        authUser = await prisma.authUser.create({
          data: {
            email:  normalizedEmail,
            status: 'ACTIVE',
          },
        });
      }

      // 6. Create TenantMembership
      const membership = await prisma.tenantMembership.create({
        data: {
          userId:        authUser.id,
          tenantId:      tenant.id,
          role:          'TENANT_ADMIN',
          status:        'PENDING',
          isPrimaryAdmin: true,
          invitedAt:     new Date(),
        },
      });

      // 7. Create invite token (7 day expiry)
      const rawToken  = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      await prisma.passwordResetToken.create({
        data: {
          userId:       authUser.id,
          tokenHash,
          purpose:      'INVITE_SET_PASSWORD',
          tenantId:     tenant.id,
          membershipId: membership.id,
          expiresAt:    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      // 8. Log the provisioning action
      await prisma.platformAuditLog.create({
        data: {
          actorId:    userId,
          actorEmail: actorEmail ?? null,
          action:     'TENANT_PROVISIONED',
          category:   'TENANT',
          severity:   'INFO',
          targetType: 'Tenant',
          targetId:   tenant.id,
          targetName: tenant.name,
          meta: {
            slug,
            adminEmail: normalizedEmail,
            features,
          },
        },
      });

      // 9. Send invite email via SQS (non-blocking)
      try {
        const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
        const sqs      = new SQSClient({});
        const queueUrl = process.env.EMAIL_QUEUE_URL;

        if (queueUrl) {
          const inviteUrl = `${process.env.APP_URL ?? 'https://app.vebgenix.com'}/accept-invite?token=${rawToken}`;
          await sqs.send(new SendMessageCommand({
            QueueUrl:    queueUrl,
            MessageBody: JSON.stringify({
              'detail-type': 'TenantAdminInvite',
              detail: {
                adminEmail:    normalizedEmail,
                adminName,
                tenantName:    tenant.name,
                inviteUrl,
                expiresInDays: 7,
              },
            }),
          }));
        }
      } catch (emailErr) {
        console.warn('Failed to queue invite email (tenant still created):', emailErr.message);
      }

      return {
        tenant:     mapTenant(tenant),
        adminEmail: normalizedEmail,
        inviteSent: true,
      };
    }

    case 'updateTenant': {
      const { id, name, slug: newSlug, logoUrl } = args.input;
      const data = {};
      if (name)    data.name    = name.trim();
      if (newSlug) data.slug    = normalizeSubdomain(newSlug);
      if (logoUrl) data.logoUrl = logoUrl;

      const tenant = await prisma.tenant.update({
        where:   { id },
        data,
        include: { features: true },
      });

      await prisma.platformAuditLog.create({
        data: {
          actorId:    userId,
          actorEmail: actorEmail ?? null,
          action:     'TENANT_UPDATED',
          category:   'TENANT',
          severity:   'INFO',
          targetType: 'Tenant',
          targetId:   tenant.id,
          targetName: tenant.name,
          meta:       data,
        },
      });

      return mapTenant(tenant);
    }

    case 'deactivateTenant': {
      const tenant = await prisma.tenant.update({
        where:   { id: args.id },
        data:    { isActive: false },
        include: { features: true },
      });

      await prisma.platformAuditLog.create({
        data: {
          actorId:    userId,
          actorEmail: actorEmail ?? null,
          action:     'TENANT_DEACTIVATED',
          category:   'TENANT',
          severity:   'WARNING',
          targetType: 'Tenant',
          targetId:   tenant.id,
          targetName: tenant.name,
        },
      });

      return true;
    }

    // ── Step 1: Request deletion — send OTP to super admin ───────────────────
    case 'requestTenantDeletion': {
      const { tenantId } = args;

      // Guard: tenant must be suspended first
      const tenant = await prisma.tenant.findUnique({
        where:  { id: tenantId },
        select: { id: true, name: true, isActive: true },
      });
      if (!tenant) throw new Error('Tenant not found');
      if (tenant.isActive) throw new Error('Tenant must be suspended before deletion. Deactivate it first.');

      // Find super admin by EMAIL — Cognito sub != AuthUser.id in DB
      const authUser = await prisma.authUser.findUnique({
        where:  { email: actorEmail.toLowerCase() },
        select: { id: true, email: true },
      });
      if (!authUser) throw new Error('Actor AuthUser not found — ensure your account exists in the DB');

      // Invalidate any previous unused OTPs for this tenant+actor
      await prisma.passwordResetToken.updateMany({
        where: {
          userId:  authUser.id,   // DB UUID, not Cognito sub
          purpose: 'TENANT_DELETE_OTP',
          tenantId,
          usedAt:  null,
        },
        data: { usedAt: new Date() },
      });

      // Generate 6-digit OTP
      const otp      = String(Math.floor(100000 + Math.random() * 900000));
      const otpHash  = crypto.createHash('sha256').update(otp).digest('hex');
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

      await prisma.passwordResetToken.create({
        data: {
          userId:    authUser.id,   // DB UUID, not Cognito sub
          tokenHash: otpHash,
          purpose:   'TENANT_DELETE_OTP',
          tenantId,
          expiresAt,
        },
      });

      // Send OTP email via SQS
      try {
        const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
        const sqs      = new SQSClient({});
        const queueUrl = process.env.EMAIL_QUEUE_URL;
        if (queueUrl) {
          await sqs.send(new SendMessageCommand({
            QueueUrl:    queueUrl,
            MessageBody: JSON.stringify({
              'detail-type': 'TenantDeletionOtp',
              detail: {
                toEmail:    authUser.email,
                otp,
                tenantName: tenant.name,
                expiresIn:  5,
              },
            }),
          }));
        }
      } catch (emailErr) {
        console.warn('Failed to queue OTP email:', emailErr.message);
      }

      // Mask email for response: su***@vebgenix.com
      const [local, domain] = authUser.email.split('@');
      const masked = `${local.slice(0, 2)}***@${domain}`;

      return { sent: true, expiresIn: 300, maskedEmail: masked };
    }

    // ── Step 2: Confirm deletion — verify OTP then delete tenant ─────────────
    case 'confirmTenantDeletion': {
      const { tenantId, otp } = args;

      // Verify tenant exists and is suspended
      const tenant = await prisma.tenant.findUnique({
        where:  { id: tenantId },
        select: { id: true, name: true, isActive: true },
      });
      if (!tenant)     throw new Error('Tenant not found');
      if (tenant.isActive) throw new Error('Tenant is still active — suspend it first');

      // Find super admin by email — Cognito sub != AuthUser.id in DB
      const actorUser = await prisma.authUser.findUnique({
        where:  { email: actorEmail.toLowerCase() },
        select: { id: true },
      });
      if (!actorUser) throw new Error('Actor not found');

      const otpHash = crypto.createHash('sha256').update(otp.trim()).digest('hex');

      // Find valid OTP token using DB userId
      const token = await prisma.passwordResetToken.findFirst({
        where: {
          userId:    actorUser.id,   // DB UUID, not Cognito sub
          tokenHash: otpHash,
          purpose:   'TENANT_DELETE_OTP',
          tenantId,
          usedAt:    null,
          expiresAt: { gt: new Date() },
        },
      });

      if (!token) {
        // Increment attempt count on any matching unexpired token
        await prisma.passwordResetToken.updateMany({
          where: {
            userId:    actorUser.id,
            purpose:   'TENANT_DELETE_OTP',
            tenantId,
            usedAt:    null,
            expiresAt: { gt: new Date() },
          },
          data: {
            attemptCount:  { increment: 1 },
            lastAttemptAt: new Date(),
          },
        });
        throw new Error('Invalid or expired OTP. Please request a new one.');
      }

      // Mark OTP as used
      await prisma.passwordResetToken.update({
        where: { id: token.id },
        data:  { usedAt: new Date() },
      });

      // Log before deletion (after deletion we can't reference tenantId)
      await prisma.platformAuditLog.create({
        data: {
          actorId:    userId,
          actorEmail: actorEmail ?? null,
          action:     'TENANT_DELETED',
          category:   'TENANT',
          severity:   'CRITICAL',
          targetType: 'Tenant',
          targetId:   tenant.id,
          targetName: tenant.name,
          meta:       { confirmed: true, otpVerified: true },
        },
      });

      // Delete dependent records that lack DB-level cascade (safety net)
      await prisma.profile.deleteMany({ where: { tenantId } });

      // Delete tenant — cascade deletes all remaining related data
      await prisma.tenant.delete({ where: { id: tenantId } });

      console.log(`Tenant ${tenant.name} (${tenantId}) permanently deleted by ${userId}`);
      return true;
    }

    default:
      throw new Error(`TenantsLambda: unknown field "${fieldName}"`);
  }
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Normalize subdomain: lowercase, strip invalid chars, replace spaces with hyphens.
 * Valid: letters, numbers, hyphens. No leading/trailing hyphens.
 */
function normalizeSubdomain(raw) {
  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-+|-+$/g, '');

  if (!normalized || normalized.length < 2 || normalized.length > 63) return '';
  return normalized;
}

function mapTenant(t) {
  return {
    id:                 t.id,
    name:               t.name,
    slug:               t.slug ?? null,
    fullDomain:         t.slug ? `${t.slug}.vebgenix.com` : null,
    isActive:           t.isActive,
    onboardingComplete: t.onboardingComplete ?? false,
    features:           (t.features ?? []).map(f => ({ key: f.featureKey, enabled: f.enabled })),
    createdAt:          t.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}
