import prisma from '../prisma/client';
import { IAdmissionsRepository, AdmissionFilters } from '../../domain/admissions/IAdmissionsRepository';
import { Enquiry, Application, EnquiryStatus, ApplicationStatus, CreateApplicationDTO, CreateEnquiryDTO } from '../../domain/admissions/types';
import { 
  EnquiryStatus as PrismaEnquiryStatus, 
  ApplicationStatus as PrismaApplicationStatus, 
  CampusScope,
  CampusType,
  Gender
} from '@prisma/client';

export class SupabaseAdmissionsRepository implements IAdmissionsRepository {
  
  // --- Enquiries ---

  async createEnquiry(data: CreateEnquiryDTO): Promise<Enquiry> {
    const result = await prisma.enquiry.create({
      data: {
        tenantId: data.tenant_id,
        campusId: data.campus_id, // Required by schema
        fullName: data.studentName, // Map studentName -> fullName
        email: data.email,
        phone: data.phone,
        gradeApplied: data.classApplied, // Map classApplied -> gradeApplied
        status: (data.status as PrismaEnquiryStatus) || 'NEW',
        campusScope: data.campusType as CampusScope, // Map campusType -> campusScope
        notes: data.notes,
        studentDob: data.studentDob,
        previousSchool: data.previousSchool,
        parentName: data.parentName
      }
    });

    return this.mapEnquiry(result);
  }

  async getEnquiries(filters: AdmissionFilters & { tenant_id?: string }): Promise<{ data: Enquiry[]; total: number }> {
    const where: any = {};
    if (filters.status) where.status = filters.status as PrismaEnquiryStatus;
    if (filters.campusScope) where.campusScope = filters.campusScope as CampusScope;
    if (filters.tenant_id) where.tenantId = filters.tenant_id;
    
    // Pagination
    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const skip = (page - 1) * limit;

    const [data, total] = await prisma.$transaction([
      prisma.enquiry.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { assignedTo: true }
      }),
      prisma.enquiry.count({ where })
    ]);

    return {
      data: data.map(this.mapEnquiry),
      total
    };
  }

  async getEnquiryById(id: string): Promise<Enquiry | null> {
    const result = await prisma.enquiry.findUnique({
      where: { id },
      include: { assignedTo: true }
    });
    
    if (!result) return null;
    return this.mapEnquiry(result);
  }

  async updateEnquiryStatus(id: string, status: EnquiryStatus, notes?: string): Promise<Enquiry> {
    const result = await prisma.enquiry.update({
      where: { id },
      data: { 
        status: status as PrismaEnquiryStatus,
        notes: notes ? notes : undefined
      }
    });
    return this.mapEnquiry(result);
  }

  // --- Applications ---

  async createApplication(data: CreateApplicationDTO): Promise<Application> {
    const result = await prisma.application.create({
      data: {
        tenantId: data.tenant_id,
        campusId: data.campus_id, // Required by schema
        enquiryId: data.enquiryId,
        fullName: data.fullName!,
        email: data.email,
        phone: data.phone!,
        gradeApplyingFor: data.gradeApplyingFor!,
        academicYear: data.academicYear!,
        campusScope: data.campusScope as CampusScope,
        address: data.address as any,
        dob: data.dob!,
        status: 'DRAFT',
        gender: data.gender as Gender,
        // Optional fields
        nationality: data.nationality,
        bloodGroup: data.bloodGroup,
        fatherName: data.fatherName,
        fatherPhone: data.fatherPhone,
        motherName: data.motherName,
        motherPhone: data.motherPhone,
        stream: data.stream,
        previousSchool: data.previousSchool,
        previousGradePercentage: data.previousGradePercentage
      }
    });

    return this.mapApplication(result);
  }

  async getApplications(filters: AdmissionFilters & { tenant_id?: string }): Promise<{ data: Application[]; total: number }> {
    const where: any = {};
    if (filters.status) where.status = filters.status as PrismaApplicationStatus;
    if (filters.campusScope) where.campusScope = filters.campusScope as CampusScope;
    if (filters.tenant_id) where.tenantId = filters.tenant_id;

    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const skip = (page - 1) * limit;

    const [data, total] = await prisma.$transaction([
      prisma.application.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.application.count({ where })
    ]);

    return {
      data: data.map(this.mapApplication),
      total
    };
  }

  async getApplicationById(id: string): Promise<Application | null> {
    const result = await prisma.application.findUnique({ where: { id } });
    if (!result) return null;
    return this.mapApplication(result);
  }

  async updateApplicationStatus(id: string, status: ApplicationStatus): Promise<Application> {
    const result = await prisma.application.update({
      where: { id },
      data: { status: status as PrismaApplicationStatus }
    });
    return this.mapApplication(result);
  }

  // --- Enrollment Transaction (HARDENING) ---
  async enrollStudent(applicationId: string, userId?: string): Promise<string> {
    // 1. Transaction to prevent double enrollment
    return await prisma.$transaction(async (tx) => {
      // a. Use raw SQL to get atomic Reg Number (reusing existing PG function if possible, or generating safely)
      // Since we can't reliably assume the function exists if migrations failed, let's generate via logic + locking 
      // OR better, trust the sequence if we can call raw SQL. 
      // Let's try calling the RPC via raw query since it was migrated in step 002 (which succeeded).
      const regNumResult = await tx.$queryRaw<[{ generate_reg_number: string }]>`SELECT generate_reg_number()`;
      const regNum = regNumResult[0]?.generate_reg_number;

      if (!regNum) throw new Error('Failed to generate registration number');

      // b. Verify Application & Lock (implicitly locked by update check... or simple check)
      const app = await tx.application.findUnique({ where: { id: applicationId } });
      if (!app) throw new Error('Application not found');
      
      // c. Hardening Checks
      if (app.status === 'APPROVED' || app.status === 'MIGRATED') {
         // Double submit check
         throw new Error('Application is already processed'); 
         // Realistically this should be a 409 Conflict, controller handles the mapping
      }

      // d. Create Student
      const student = await tx.student.create({
        data: {
          tenantId: app.tenantId, // Use application's tenantId
          campusId: app.campusId, // Required — use application's campusId
          applicationId: applicationId,
          portalAuthUserId: userId || null, // Optional link to auth user
          registrationNumber: regNum,
          fullName: app.fullName!,
          currentGrade: app.gradeApplyingFor!, // Using the grade they applied for
          campusType: (app.campusScope === 'ALL' ? 'SCHOOL' : app.campusScope) as CampusType, // CampusScope->CampusType (ALL not valid in CampusType, fallback to SCHOOL)
          status: 'ACTIVE',
          email: app.email,
          parentPhone: app.phone,
          dob: app.dob,
          // gender: app.gender // Student model doesn't have gender field yet
        }
      });

      // e. Update Application to APPROVED (or MIGRATED, let's stick to APPROVED per user request, or logic)
      // User said "Update application status to APPROVED" (Wait, Step 4 says "Update application status to APPROVED")
      // But also said "if status == APPROVED then approvedAt must be NOT NULL".
      await tx.application.update({
        where: { id: applicationId },
        data: { 
          status: 'APPROVED',
          approvedAt: new Date()
        }
      });

      // f. Audit Log (Hardening)
      await tx.auditLog.create({
        data: {
          tenantId: app.tenantId, // Required by schema
          action: 'APPROVE_APPLICATION',
          entityType: 'STUDENT',
          entityId: student.id,
          details: { applicationId, registrationNumber: regNum },
          userId: userId
        }
      });

      return student.id;
    });
  }

  // --- Mappers ---

  private mapEnquiry(raw: any): Enquiry {
    return {
      id: raw.id,
      enquiryId: raw.id, // Map ID to enquiryId
      fullName: raw.fullName,
      studentName: raw.fullName, // Map fullName to studentName
      email: raw.email,
      phone: raw.phone,
      gradeApplied: raw.gradeApplied,
      classApplied: raw.gradeApplied, // Map gradeApplied to classApplied
      status: raw.status as EnquiryStatus,
      campusScope: raw.campusScope as string,
      campusType: raw.campusScope as string, // Map campusScope to campusType
      academicYear: '2025-26', // Default or fetch if available
      source: 'WALK_IN', // Default
      priority: 'MEDIUM', // Default
      notes: raw.notes,
      assignedTo: raw.assignedToId, // Assuming just ID usage for now
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      // Optional mapping
      studentDob: raw.studentDob ? new Date(raw.studentDob) : undefined,
      previousSchool: raw.previousSchool,
      parentName: raw.parentName
    };
  }

  private mapApplication(raw: any): Application {
    return {
      id: raw.id,
      applicationId: raw.id,
      enquiryId: raw.enquiryId,
      campusScope: raw.campusScope as string,
      campusType: raw.campusScope as string,
      status: raw.status as ApplicationStatus,
      
      student: {
        name: raw.fullName,
        dob: raw.dob,
        gender: raw.gender as any,
        classApplied: raw.gradeApplyingFor,
        academicYear: raw.academicYear,
        nationality: raw.nationality,
        bloodGroup: raw.bloodGroup,
        stream: raw.stream,
        previousSchool: raw.previousSchool,
        previousGradePercentage: raw.previousGradePercentage ? Number(raw.previousGradePercentage) : undefined
      },
      
      parent: {
        name: raw.fatherName || raw.motherName || 'Unknown Parent',
        phone: raw.phone || raw.fatherPhone || raw.motherPhone || '',
        email: raw.email,
        address: raw.address,
        fatherName: raw.fatherName,
        fatherPhone: raw.fatherPhone,
        motherName: raw.motherName,
        motherPhone: raw.motherPhone
      },

      documents: {
         birthCertificate: 'MISSING', // Default
         transferCertificate: 'MISSING', // Default
         photo: 'MISSING' // Default
      },

      submittedAt: raw.updatedAt, // Approximation
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt
    };
  }
}
