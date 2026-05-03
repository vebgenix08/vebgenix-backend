import { AuthContext } from '@vebgenix/auth';
import { AdmissionsRepo } from '@vebgenix/db';
import { AuditLogger } from '@vebgenix/audit';
import { authorize } from '@vebgenix/permissions';
import { getTenantId } from '@vebgenix/tenant';
import { Types } from 'mongoose';

export interface CreateEnquiryInput {
  campusId: string;
  academicYearId?: string;
  studentName: string;
  phone: string;
  email?: string;
  programId?: string;
  programName?: string;
  source?: string;
  notes?: string;
}

export class CreateEnquiry {
  static async execute(ctx: AuthContext, input: CreateEnquiryInput) {
    authorize(ctx, 'admissions.enquiry.create');
    const tenantId = getTenantId(ctx);

    const enquiry = await AdmissionsRepo.createEnquiry(tenantId, {
      campusId:       new Types.ObjectId(input.campusId),
      academicYearId: input.academicYearId ? new Types.ObjectId(input.academicYearId) : undefined,
      studentName:    input.studentName,
      phone:          input.phone,
      email:          input.email,
      programId:      input.programId ? new Types.ObjectId(input.programId) : undefined,
      programName:    input.programName,
      source:         input.source,
      notes:          input.notes,
      status:         'NEW',
      createdBy:      new Types.ObjectId(ctx.membership!.profileId),
    });

    await AuditLogger.logTenantAction({
      ctx, action: 'ENQUIRY_CREATED',
      entityType: 'Enquiry', entityId: enquiry._id.toString(), entityName: input.studentName,
      after: input as unknown as Record<string, unknown>,
    });

    return enquiry;
  }
}
