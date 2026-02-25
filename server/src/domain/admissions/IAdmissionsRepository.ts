import { Enquiry, Application, ApplicationStatus, EnquiryStatus, CreateApplicationDTO, CreateEnquiryDTO } from './types';

export interface AdmissionFilters {
  status?: string;
  campusScope?: string;
  search?: string; // Name, email, phone
  page?: number;
  limit?: number;
}

export interface IAdmissionsRepository {
  // Enquiries
  createEnquiry(data: CreateEnquiryDTO): Promise<Enquiry>;
  getEnquiries(filters: AdmissionFilters): Promise<{ data: Enquiry[]; total: number }>;
  getEnquiryById(id: string): Promise<Enquiry | null>;
  updateEnquiryStatus(id: string, status: EnquiryStatus, notes?: string): Promise<Enquiry>;

  // Applications
  createApplication(data: CreateApplicationDTO): Promise<Application>;
  getApplications(filters: AdmissionFilters): Promise<{ data: Application[]; total: number }>;
  getApplicationById(id: string): Promise<Application | null>;
  updateApplicationStatus(id: string, status: ApplicationStatus): Promise<Application>;
  
  // Complex Actions
  enrollStudent(applicationId: string, userId?: string): Promise<string>; // Returns Student ID
}
