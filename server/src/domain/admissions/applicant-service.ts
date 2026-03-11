import { getPrisma } from '../../infrastructure/prisma/client';
import { AuthContext } from '../identity/entities';

export class ApplicantService {
  static async findOrCreate(ctx: AuthContext, input: {
    fullName: string;
    phone: string;
    dob?: Date;
    email?: string;
  }) {
    const prisma = await getPrisma();
    const tenantId = ctx.membership!.tenantId;

    // Deduplication Logic
    // If DOB is missing, rely on Phone only? Risky for siblings sharing parent phone.
    // But for Enquiry stage, it's often parent phone.
    // Let's check Phone + DOB if DOB exists. 
    // If DOB missing, just check Phone? No, leads to merging siblings.
    // If DOB missing, create new? Or flag potential duplicate?
    
    // Strategy:
    // 1. If Email provided, match Email.
    // 2. If DOB provided, match Phone + DOB.
    // 3. Else, do not merge blindly. Create new? 
    // Let's create new if loose match to avoid data corruption.
    
    const criteria: any[] = [];
    if (input.email) criteria.push({ email: input.email });
    if (input.dob) criteria.push({ phone: input.phone, dob: input.dob });

    let applicant = null;
    
    if (criteria.length > 0) {
      applicant = await prisma.applicant.findFirst({
        where: {
          tenantId,
          OR: criteria
        }
      });
    }

    if (!applicant) {
      applicant = await prisma.applicant.create({
        data: {
          tenantId,
          fullName: input.fullName,
          phone: input.phone,
          dob: input.dob,
          email: input.email
        }
      });
    }

    return applicant;
  }
}
