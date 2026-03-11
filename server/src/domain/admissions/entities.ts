export type ApplicationID = string;
export type EnquiryID = string;

export enum ApplicationStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  UNDER_REVIEW = 'UNDER_REVIEW',
  INTERVIEW_SCHEDULED = 'INTERVIEW_SCHEDULED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  OFFER_ISSUED = 'OFFER_ISSUED',
  ENROLLED = 'ENROLLED',
  WITHDRAWN = 'WITHDRAWN'
}

export interface Enquiry {
  id: EnquiryID;
  tenantId: string;
  studentName: string;
  parentName: string;
  phone: string;
  status: string;
}

export interface Application {
  id: ApplicationID;
  tenantId: string;
  status: ApplicationStatus;
  applicantName: string;
  // Dynamic form data would be here
}
