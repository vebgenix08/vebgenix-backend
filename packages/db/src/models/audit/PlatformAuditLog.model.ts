import { Schema, model, Document, Types } from 'mongoose';

export interface IPlatformAuditLog extends Document {
  actorId: Types.ObjectId;
  actorEmail: string;
  action: string;
  entityType: string;
  entityId?: string;
  entityName?: string;
  meta?: Record<string, unknown>;
  ipAddress?: string;
  createdAt: Date;
}

const PlatformAuditLogSchema = new Schema<IPlatformAuditLog>(
  {
    actorId:    { type: Schema.Types.ObjectId, required: true, ref: 'AuthUser' },
    actorEmail: { type: String, required: true },
    action:     { type: String, required: true },
    entityType: { type: String, required: true },
    entityId:   { type: String },
    entityName: { type: String },
    meta:       { type: Schema.Types.Mixed },
    ipAddress:  { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

PlatformAuditLogSchema.index({ createdAt: -1 });
PlatformAuditLogSchema.index({ actorId: 1, createdAt: -1 });
PlatformAuditLogSchema.index({ entityType: 1, entityId: 1 });

export const PlatformAuditLog = model<IPlatformAuditLog>('PlatformAuditLog', PlatformAuditLogSchema);
