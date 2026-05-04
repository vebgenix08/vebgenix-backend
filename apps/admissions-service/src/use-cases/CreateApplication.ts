import { AuthContext } from '@vebgenix/auth';
import { AdmissionsRepo } from '@vebgenix/db';
import { AuditLogger } from '@vebgenix/audit';
import { authorize } from '@vebgenix/permissions';
import { getTenantId } from '@vebgenix/tenant';
import { AppError } from '@vebgenix/errors';
import { Types } from 'mongoose';
import { generateApplicationNo } from '../academicNumbering';

export interface CreateApplicationInput {
  campusId:          string;
  academicYearId:    string;
  enquiryId?:        string;
  programId?:        string;
  // Auto-backfilled from enquiry if enquiryId is provided; caller fields take priority
  studentName?:      string;
  phone?:            string;
  email?:            string;
  dateOfBirth?:      string;
  gender?:           string;
  address?:          string;
  guardianName?:     string;
  guardianPhone?:    string;
  guardianRelation?: string;
  customFields?:     Record<string, unknown>;
}

export class CreateApplication {
  static async execute(ctx: AuthContext, input: CreateApplicationInput) {
    authorize(ctx, 'admissions.application.create');
    const tenantId = getTenantId(ctx);

    // ── Auto-backfill from enquiry when enquiryId is provided ─────────────────
    // Caller-supplied values always take priority; enquiry only fills gaps.
    let resolvedName  = input.studentName ?? '';
    let resolvedPhone = input.phone       ?? '';
    let resolvedEmail = input.email;

    if (input.enquiryId) {
      const enquiry = await AdmissionsRepo.findEnquiryById(tenantId, input.enquiryId);
      if (enquiry) {
        const eq = enquiry as unknown as Record<string, unknown>;
        resolvedName  = resolvedName  || (eq.studentName as string) || '';
        resolvedPhone = resolvedPhone || (eq.phone       as string) || '';
        resolvedEmail = resolvedEmail ?? (eq.email       as string | undefined);
      }
    }

    if (!resolvedName)  throw new AppError('BAD_REQUEST', 'studentName is required');
    if (!resolvedPhone) throw new AppError('BAD_REQUEST', 'phone is required');

    const applicationNumber = await generateApplicationNo(tenantId, input.academicYearId);

    const application = await AdmissionsRepo.createApplication(tenantId, {
      campusId:          new Types.ObjectId(input.campusId),
      academicYearId:    new Types.ObjectId(input.academicYearId),
      enquiryId:         input.enquiryId ? new Types.ObjectId(input.enquiryId) : undefined,
      programId:         input.programId ? new Types.ObjectId(input.programId) : undefined,
      applicationNumber,
      status:            'DRAFT',
      studentName:       resolvedName,
      phone:             resolvedPhone,
      email:             resolvedEmail,
      dateOfBirth:       input.dateOfBirth ? new Date(input.dateOfBirth) : undefined,
      gender:            input.gender,
      address:           input.address,
      guardianName:      input.guardianName,
      guardianPhone:     input.guardianPhone,
      guardianRelation:  input.guardianRelation,
      customFields:      input.customFields,
      documents:         [],
      reviews:           [],
      stageHistory:      [{ stage: 'DRAFT', at: new Date() }],
      createdBy:         new Types.ObjectId(ctx.membership!.profileId),
    });

    await AuditLogger.logTenantAction({
      ctx, action: 'APPLICATION_CREATED',
      entityType: 'Application', entityId: application._id.toString(), entityName: resolvedName,
    });

    return application;
  }
}
