import { Request, Response } from 'express';
import { SupabaseAdmissionsRepository } from '../../../infrastructure/repositories/SupabaseAdmissionsRepository';
import { EnquiryStatus, ApplicationStatus } from '../../../domain/admissions/types';

const repository = new SupabaseAdmissionsRepository();

// --- Enquiries ---

export const createEnquiry = async (req: Request, res: Response): Promise<void> => {
  try {
    // For public enquiries, tenant_id and campus_id must be provided in request body
    // For authenticated requests, inject from middleware
    const tenant = (req as any).tenant;
    const campus = (req as any).campus;
    
    const enquiryData = tenant && campus ? {
      ...req.body,
      tenant_id: tenant.tenantId,
      campus_id: campus.campusId,
    } : req.body;
    
    const enquiry = await repository.createEnquiry(enquiryData);
    res.status(201).json(enquiry);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const getEnquiries = async (req: Request, res: Response) => {
  try {
    const filters = {
      status: req.query.status as string,
      campusScope: req.query.campusScope as string,
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 10,
      tenant_id: (req as any).tenant?.tenantId, // Filter by tenant
      campus_id: (req as any).campus?.campusId, // Filter by campus
    };
    const result = await repository.getEnquiries(filters);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const updateEnquiryStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    
    if (!status) {
      res.status(400).json({ error: 'Status is required' });
      return;
    }

    const enquiry = await repository.updateEnquiryStatus(id, status as EnquiryStatus, notes);
    res.json(enquiry);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

// --- Applications ---

export const createApplication = async (req: Request, res: Response) => {
  try {
    // Inject tenant_id and campus_id from middleware
    const applicationData = {
      ...req.body,
      tenant_id: (req as any).tenant!.tenantId,
      campus_id: (req as any).campus!.campusId,
    };
    
    const application = await repository.createApplication(applicationData);
    res.status(201).json(application);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const getApplications = async (req: Request, res: Response) => {
  try {
    const filters = {
      status: req.query.status as string,
      campusScope: req.query.campusScope as string,
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 10,
      tenant_id: (req as any).tenant?.tenantId, // Filter by tenant
      campus_id: (req as any).campus?.campusId, // Filter by campus
    };
    const result = await repository.getApplications(filters);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const getApplicationById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const application = await repository.getApplicationById(id);
    if (!application) {
      res.status(404).json({ error: 'Application not found' });
      return;
    }
    res.json(application);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const updateApplicationStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      res.status(400).json({ error: 'Status is required' });
      return;
    }

    const application = await repository.updateApplicationStatus(id, status as ApplicationStatus);
    res.json(application);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const enrollStudent = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    // req.user.id is from the authenticated Token (Admissions Officer or Admin)
    // The second arg to enrollStudent is userId, but here we likely mean the student's *future* user ID.
    // For this mentorship phase, we will pass null for userId until we implement student account creation flow.
    
    const studentId = await repository.enrollStudent(id, undefined);
    res.status(200).json({ message: 'Student successfully enrolled', studentId });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};
