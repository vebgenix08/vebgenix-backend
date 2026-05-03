import { Schema, model, Document } from 'mongoose';

export type LeaveType   = 'CASUAL' | 'SICK' | 'EARNED' | 'UNPAID' | 'MATERNITY' | 'PATERNITY';
export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface ILeaveRequest extends Document {
  tenantId:    string;
  profileId:   string;   // staff/teacher profileId
  type:        LeaveType;
  fromDate:    Date;
  toDate:      Date;
  days:        number;
  reason:      string;
  status:      LeaveStatus;
  approvedBy?: string;   // profileId of approver
  remarks?:    string;
  createdAt:   Date;
  updatedAt:   Date;
}

const LeaveRequestSchema = new Schema<ILeaveRequest>({
  tenantId:   { type: String, required: true },
  profileId:  { type: String, required: true },
  type:       { type: String, enum: ['CASUAL','SICK','EARNED','UNPAID','MATERNITY','PATERNITY'], required: true },
  fromDate:   { type: Date, required: true },
  toDate:     { type: Date, required: true },
  days:       { type: Number, required: true },
  reason:     { type: String, required: true },
  status:     { type: String, enum: ['PENDING','APPROVED','REJECTED','CANCELLED'], default: 'PENDING' },
  approvedBy: { type: String },
  remarks:    { type: String },
}, { timestamps: true });

LeaveRequestSchema.index({ tenantId: 1 });
LeaveRequestSchema.index({ tenantId: 1, createdAt: -1 });
LeaveRequestSchema.index({ tenantId: 1, profileId: 1 });
LeaveRequestSchema.index({ tenantId: 1, status: 1, createdAt: -1 });

export const LeaveRequest = model<ILeaveRequest>('LeaveRequest', LeaveRequestSchema);
