'use strict';

const { getPrisma } = require('lambda-shared/db');
const { withTenant } = require('lambda-shared/withTenant');
const { EventBridgeClient, PutEventsCommand } = require('@aws-sdk/client-eventbridge');

const ebClient = new EventBridgeClient({});

/**
 * AdmissionsLambda — AppSync resolver for the Admissions (Application) domain
 *
 * DB table: applications (+ enquiries relation)
 * All queries use withTenant() which activates RLS.
 * On APPROVED review: publishes AdmissionApproved to EventBridge → SQS → EmailWorker → SES
 */
exports.handler = async (event) => {
  const { fieldName, arguments: args, identity } = event;

  const tenantId = identity?.claims?.['custom:tenant_id'];
  const userId   = identity?.claims?.sub;

  console.log(JSON.stringify({ fieldName, tenantId, userId }));

  const prisma = await getPrisma();

  switch (fieldName) {
    // ── Query.listAdmissions ───────────────────────────────────────────────────
    case 'listAdmissions': {
      const { status, limit = 50, nextToken } = args ?? {};
      const cursor = nextToken ? { id: nextToken } : undefined;

      const apps = await withTenant(prisma, tenantId, userId, (tx) =>
        tx.application.findMany({
          where: { ...(status && { status }) },
          take: limit,
          skip: cursor ? 1 : 0,
          cursor,
          orderBy: { createdAt: 'desc' },
          select: applicationSelect,
        })
      );

      const nextCursor = apps.length === limit ? apps[apps.length - 1].id : null;
      return { items: apps.map(mapApplication), nextToken: nextCursor };
    }

    // ── Query.getAdmission ─────────────────────────────────────────────────────
    case 'getAdmission': {
      const { id } = args;
      const app = await withTenant(prisma, tenantId, userId, (tx) =>
        tx.application.findUniqueOrThrow({
          where: { id },
          select: applicationSelect,
        })
      );
      return mapApplication(app);
    }

    // ── Mutation.createAdmission ───────────────────────────────────────────────
    case 'createAdmission': {
      const { studentName, studentEmail, dateOfBirth, grade } = args.input;

      const app = await withTenant(prisma, tenantId, userId, async (tx) => {
        // Get the tenant's default campus (first active campus)
        const campus = await tx.campus.findFirstOrThrow({
          where: { isActive: true },
          select: { id: true, campusType: true },
        });

        return tx.application.create({
          data: {
            tenantId,
            fullName: studentName,
            email: studentEmail,
            dob: dateOfBirth ? new Date(dateOfBirth) : new Date(),
            phone: '',  // Required field — collected in later workflow step
            gradeApplyingFor: grade,
            academicYear: new Date().getFullYear().toString(),
            status: 'DRAFT',
            campusScope: campus.campusType === 'PU' ? 'PU' : 'SCHOOL',
            campusId: campus.id,
          },
          select: applicationSelect,
        });
      });
      return mapApplication(app);
    }

    // ── Mutation.updateAdmission ───────────────────────────────────────────────
    case 'updateAdmission': {
      const { id, input } = args;
      const app = await withTenant(prisma, tenantId, userId, (tx) =>
        tx.application.update({
          where: { id, status: { notIn: ['APPROVED', 'REJECTED'] } },
          data: {
            ...(input.studentName && { fullName: input.studentName }),
            ...(input.grade       && { gradeApplyingFor: input.grade }),
            ...(input.notes       && { notes: input.notes }),
          },
          select: applicationSelect,
        })
      );
      return mapApplication(app);
    }

    // ── Mutation.submitAdmission ───────────────────────────────────────────────
    case 'submitAdmission': {
      const { id } = args;
      const app = await withTenant(prisma, tenantId, userId, (tx) =>
        tx.application.update({
          where: { id, status: 'DRAFT' },
          data: {
            status: 'SUBMITTED',
            submittedAt: new Date(),
            stageHistory: {
              push: { stage: 'SUBMITTED', at: new Date().toISOString(), by: userId },
            },
          },
          select: applicationSelect,
        })
      );
      return mapApplication(app);
    }

    // ── Mutation.reviewAdmission ───────────────────────────────────────────────
    case 'reviewAdmission': {
      const { admissionId, decision, notes } = args.input;
      if (!['APPROVED', 'REJECTED'].includes(decision)) {
        throw new Error('reviewAdmission: decision must be APPROVED or REJECTED');
      }

      const app = await withTenant(prisma, tenantId, userId, async (tx) => {
        const updated = await tx.application.update({
          where: {
            id: admissionId,
            status: { in: ['SUBMITTED', 'UNDER_REVIEW'] },
          },
          data: {
            status: decision,
            approvedAt: decision === 'APPROVED' ? new Date() : undefined,
            stageHistory: {
              push: {
                stage: decision,
                at: new Date().toISOString(),
                by: userId,
                notes: notes ?? '',
              },
            },
          },
          select: applicationSelect,
        });

        // Create review record
        await tx.applicationReview.create({
          data: {
            applicationId: admissionId,
            reviewerId: userId,
            comments: notes,
            decision: decision === 'APPROVED' ? 'RECOMMEND' : 'NOT_RECOMMEND',
          },
        });

        return updated;
      });

      // Publish event AFTER successful DB commit (outside transaction)
      if (decision === 'APPROVED') {
        await ebClient.send(new PutEventsCommand({
          Entries: [{
            EventBusName: process.env.EVENT_BUS_NAME,
            Source: 'vebgenix.admissions',
            DetailType: 'AdmissionApproved',
            Detail: JSON.stringify({
              admissionId,
              tenantId,
              reviewedByUserId: userId,
              studentName: app.studentName,
              notes,
            }),
          }],
        }));
      }

      return mapApplication(app);
    }

    // ── Mutation.withdrawAdmission ─────────────────────────────────────────────
    case 'withdrawAdmission': {
      const { id } = args;
      const app = await withTenant(prisma, tenantId, userId, (tx) =>
        tx.application.update({
          where: { id, status: { notIn: ['APPROVED', 'REJECTED', 'WITHDRAWN'] } },
          data: { status: 'WITHDRAWN' },
          select: applicationSelect,
        })
      );
      return mapApplication(app);
    }

    default:
      throw new Error(`AdmissionsLambda: unknown field "${fieldName}"`);
  }
};

// Prisma field selection — maps to GraphQL Admission type
const applicationSelect = {
  id: true,
  tenantId: true,
  fullName: true,
  email: true,
  dob: true,
  gradeApplyingFor: true,
  status: true,
  approvedAt: true,
  createdAt: true,
  updatedAt: true,
};

// Map Prisma Application → GraphQL Admission
function mapApplication(a) {
  return {
    id:               a.id,
    tenantId:         a.tenantId,
    studentName:      a.fullName,
    studentEmail:     a.email ?? null,
    dateOfBirth:      a.dob ? a.dob.toISOString().split('T')[0] : null,
    grade:            a.gradeApplyingFor,
    status:           a.status,
    submittedAt:      null,
    reviewedAt:       a.approvedAt?.toISOString() ?? null,
    reviewedByUserId: null,
    notes:            null,
    createdAt:        a.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt:        a.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}
