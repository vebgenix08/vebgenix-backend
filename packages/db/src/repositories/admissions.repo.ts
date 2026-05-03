import { Types } from 'mongoose';
import { Enquiry, IEnquiry } from '../models/admissions/Enquiry.model';
import { Application, IApplication } from '../models/admissions/Application.model';

export const AdmissionsRepo = {
  // ── Enquiries ─────────────────────────────────────────────────────────────

  async listEnquiries(tenantId: string, filters: Record<string, unknown> = {}) {
    return Enquiry.find({ tenantId, ...filters }).sort({ createdAt: -1 });
  },

  async findEnquiryById(tenantId: string, id: string): Promise<IEnquiry | null> {
    return Enquiry.findOne({ tenantId, _id: new Types.ObjectId(id) });
  },

  async createEnquiry(tenantId: string, data: Partial<IEnquiry>) {
    return Enquiry.create({ ...data, tenantId });
  },

  async updateEnquiry(tenantId: string, id: string, update: Partial<IEnquiry>) {
    return Enquiry.findOneAndUpdate(
      { tenantId, _id: new Types.ObjectId(id) },
      { $set: update },
      { new: true },
    );
  },

  async deleteEnquiry(tenantId: string, id: string) {
    return Enquiry.findOneAndDelete({ tenantId, _id: new Types.ObjectId(id) });
  },

  async findDuplicateEnquiry(tenantId: string, phone: string, email?: string) {
    const orClauses: object[] = [{ phone }];
    if (email) orClauses.push({ email });
    return Enquiry.findOne({ tenantId, $or: orClauses });
  },

  // ── Applications ──────────────────────────────────────────────────────────

  async listApplications(tenantId: string, filters: Record<string, unknown> = {}) {
    return Application.find({ tenantId, ...filters }).sort({ createdAt: -1 });
  },

  async findApplicationById(tenantId: string, id: string): Promise<IApplication | null> {
    return Application.findOne({ tenantId, _id: new Types.ObjectId(id) });
  },

  async findApplicationByNumber(tenantId: string, applicationNumber: string) {
    return Application.findOne({ tenantId, applicationNumber });
  },

  async createApplication(tenantId: string, data: Partial<IApplication>) {
    return Application.create({ ...data, tenantId });
  },

  async updateApplication(tenantId: string, id: string, update: Partial<IApplication>) {
    return Application.findOneAndUpdate(
      { tenantId, _id: new Types.ObjectId(id) },
      { $set: update },
      { new: true },
    );
  },

  async addReview(tenantId: string, id: string, review: IApplication['reviews'][number]) {
    return Application.findOneAndUpdate(
      { tenantId, _id: new Types.ObjectId(id) },
      { $push: { reviews: review, stageHistory: { stage: review.decision, at: new Date() } } },
      { new: true },
    );
  },
};
