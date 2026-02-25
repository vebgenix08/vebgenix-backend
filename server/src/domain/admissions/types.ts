export type EnquiryStatus = 'NEW' | 'CONTACTED' | 'CONVERTED' | 'CLOSED';
export type ApplicationStatus = 'DRAFT' | 'SUBMITTED' | 'UNDER_REVIEW' | 'INTERVIEW_SCHEDULED' | 'APPROVED' | 'REJECTED' | 'MIGRATED';
export type CampusScope = 'SCHOOL' | 'PU';

export interface Enquiry {
  id: string; // Keep for DB compatibility
  enquiryId: string; // Mapped from id for Client
  fullName: string; // Keep for DB compatibility
  studentName: string; // Mapped from fullName for Client
  email?: string;
  phone: string;
  gradeApplied: string; // Keep for DB compatibility
  classApplied: string; // Mapped from gradeApplied for Client
  status: EnquiryStatus;
  campusScope: string; // Keep for DB
  campusType: string; // Mapped from campusScope for Client
  notes?: string;
  assignedTo?: string; // User ID
  
  // New Fields
  studentDob?: Date;
  previousSchool?: string;
  parentName?: string;
  academicYear: string; // Added
  source: string; // Added
  priority: string; // Added
  
  createdAt: Date;
  updatedAt: Date;
}

export interface Application {
  id: string;
  applicationId: string; // Mapped
  enquiryId?: string;
  
  // Nested Student Object
  student: {
    name: string;
    dob: Date;
    gender: string;
    classApplied: string;
    academicYear: string;
    nationality?: string;
    bloodGroup?: string;
    stream?: string;
    previousSchool?: string;
    previousGradePercentage?: number;
  };
  
  // Nested Parent Object
  parent: {
    name: string; // Maps to fatherName or motherName
    phone: string; // Maps to fatherPhone or motherPhone or generic phone
    email?: string;
    address?: any;
    fatherName?: string;
    fatherPhone?: string;
    motherName?: string;
    motherPhone?: string;
  };

  // Nested Documents Object
  documents: {
    birthCertificate: string;
    transferCertificate: string;
    photo: string;
    [key: string]: any;
  };

  status: ApplicationStatus;
  campusScope: string;
  campusType: string; // Mapped

  submittedAt?: Date; // Added
  
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateApplicationDTO {
  tenant_id: string;
  campus_id: string; // Required — maps to campusId on Application model
  enquiryId?: string;
  fullName: string; 
  dob: Date;
  gender: string; 
  email?: string;
  phone: string;
  address: any;
  gradeApplyingFor: string;
  academicYear: string;
  stream?: string;
  status?: ApplicationStatus;
  campusScope: string;
  
  nationality?: string;
  bloodGroup?: string;
  fatherName?: string;
  fatherPhone?: string;
  motherName?: string;
  motherPhone?: string;
  previousSchool?: string;
  previousGradePercentage?: number;
}

export interface CreateEnquiryDTO {
  tenant_id: string;
  campus_id: string; // Required — maps to campusId on Enquiry model
  studentName: string; // From Client
  phone: string;
  email?: string;
  classApplied: string; // From Client
  status?: EnquiryStatus;
  campusType: string; // From Client
  notes?: string;
  parentName: string;
  academicYear: string;
  source: string;
  priority: string;
  
  // Optional extras
  studentDob?: Date;
  previousSchool?: string;
}

export interface Student {
  id: string;
  registrationNumber: string;
  fullName: string;
  currentGrade: string;
  campusScope: string;
  status: 'ACTIVE' | 'ALUMNI' | 'WITHDRAWN' | 'SUSPENDED';
}
