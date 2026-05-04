import { Schema, model, Document, Types } from 'mongoose';

export interface IAuditLog extends Document {
  tenantId: string;
  userId: Types.ObjectId;
  userEmail?: string;
  action: string;
  entityType: string;
  entityId?: string;
  entityName?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    tenantId:   { type: String, required: true },
    userId:     { type: Schema.Types.ObjectId, required: true, ref: 'Profile' },
    userEmail:  { type: String },
    action:     { type: String, required: true },
    entityType: { type: String, required: true },
    entityId:   { type: String },
    entityName: { type: String },
    before:     { type: Schema.Types.Mixed },
    after:      { type: Schema.Types.Mixed },
    ipAddress:  { type: String },
    userAgent:  { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AuditLogSchema.index({ tenantId: 1, createdAt: -1 });
AuditLogSchema.index({ tenantId: 1, entityType: 1, entityId: 1 });
AuditLogSchema.index({ tenantId: 1, userId: 1, createdAt: -1 });
AuditLogSchema.index({ tenantId: 1, action: 1 });

export const AuditLog = model<IAuditLog>('AuditLog', AuditLogSchema);
