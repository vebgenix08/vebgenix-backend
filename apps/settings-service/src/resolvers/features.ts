import { TenantFeature } from '@vebgenix/db';
import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';

/** Convert a Mongoose document or lean POJO to a plain GQL-safe object with `id`. */
function toGql(doc: unknown): Record<string, unknown> | null {
  if (!doc) return null;
  const plain = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
  const { _id, __v, ...rest } = plain;
  return _id !== undefined ? { id: String(_id), ...rest } : rest;
}

/** All platform features that can be toggled per-tenant. */
const AVAILABLE_FEATURES = [
  {
    key:            'admissions',
    name:           'Admissions',
    description:    'Enquiry management, application workflow, document uploads',
    defaultEnabled: true,
  },
  {
    key:            'finance',
    name:           'Finance',
    description:    'Fee heads, structures, invoices, payments, Razorpay integration',
    defaultEnabled: true,
  },
  {
    key:            'academics',
    name:           'Academics',
    description:    'Classes, sections, subjects, exams, marks, results',
    defaultEnabled: true,
  },
  {
    key:            'attendance',
    name:           'Attendance',
    description:    'Daily attendance marking, summaries and reports',
    defaultEnabled: true,
  },
  {
    key:            'timetable',
    name:           'Timetable',
    description:    'Section timetables, teacher workload management',
    defaultEnabled: true,
  },
  {
    key:            'comms',
    name:           'Communications',
    description:    'Announcements, events calendar, leave requests',
    defaultEnabled: true,
  },
  {
    key:            'student_portal',
    name:           'Student Portal',
    description:    'Student self-service access to results, attendance, fee dues',
    defaultEnabled: false,
  },
  {
    key:            'guardian_portal',
    name:           'Guardian Portal',
    description:    'Parent/guardian access to student information',
    defaultEnabled: false,
  },
  {
    key:            'certificates',
    name:           'Certificates',
    description:    'Bonafide, TC, and custom certificate generation',
    defaultEnabled: false,
  },
  {
    key:            'results_public',
    name:           'Public Results',
    description:    'Shareable public result links for students',
    defaultEnabled: false,
  },
];

export async function resolveFeatures(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {

    case 'listAvailableFeatures':
    case 'GET:/api/platform/features':
      // Platform-level: return the master list of all toggleable features
      return AVAILABLE_FEATURES;

    case 'getTenantFeatures':
    case 'GET:/api/admin/settings/features': {
      const doc = await TenantFeature.findOne({ tenantId }).lean();
      const raw = (toGql(doc) ?? { tenantId, features: {} }) as Record<string, unknown>;
      const featuresObj = (raw.features ?? {}) as Record<string, boolean>;
      const features = Object.entries(featuresObj).map(([key, enabled]) => ({ key, enabled: Boolean(enabled) }));
      return { tenantId: (raw.tenantId as string) ?? tenantId, features };
    }

    case 'updateTenantFeatures':
    case 'PATCH:/api/admin/settings/features':
    case 'PATCH:/api/platform/tenants/:id/features': {
      const tid = (args.id as string) ?? tenantId;
      if (!ctx.isPlatformAdmin) authorize(ctx, 'tenant.settings.update');
      // Accept both new typed input { features: [{key, enabled}] } and legacy object { key: bool }
      const inputArr = (args.input as { features?: Array<{ key: string; enabled: boolean }> } | undefined)?.features;
      const featuresObj: Record<string, boolean> = {};
      if (Array.isArray(inputArr)) {
        for (const item of inputArr) {
          featuresObj[item.key] = item.enabled;
        }
      } else {
        // Fallback: REST or direct boolean map
        const legacyMap = (args.features as Record<string, boolean>) ?? {};
        Object.assign(featuresObj, legacyMap);
      }
      const saved = toGql(await TenantFeature.findOneAndUpdate(
        { tenantId: tid },
        { $set: { features: featuresObj, updatedBy: ctx.membership?.profileId ?? ctx.userId } },
        { upsert: true, new: true },
      ).lean());
      const savedFeaturesObj = ((saved?.features ?? {}) as Record<string, boolean>);
      const features = Object.entries(savedFeaturesObj).map(([key, enabled]) => ({ key, enabled: Boolean(enabled) }));
      return { tenantId: tid, features };
    }

    default:
      return undefined;
  }
}
