import {
  Tenant,
  Student,
  Application,
  Enquiry,
  Profile,
  Campus,
  Invoice,
  Payment,
} from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import type { AuthContext } from '@vebgenix/auth';
import { Types } from 'mongoose';

type DashboardInput = {
  campusId?: string;
  academicYearId?: string;
  range?: {
    preset?: 'TODAY' | 'LAST_7_DAYS' | 'LAST_30_DAYS' | 'CUSTOM';
    fromDate?: string;
    toDate?: string;
  };
};

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function parseDashboardRange(input?: DashboardInput) {
  const today = startOfDay(new Date());
  const preset = input?.range?.preset ?? 'LAST_30_DAYS';

  if (preset === 'CUSTOM' && input?.range?.fromDate && input?.range?.toDate) {
    const from = startOfDay(new Date(input.range.fromDate));
    const to = addDays(startOfDay(new Date(input.range.toDate)), 1);
    return { from, to };
  }

  if (preset === 'TODAY') return { from: today, to: addDays(today, 1) };
  if (preset === 'LAST_7_DAYS') return { from: addDays(today, -6), to: addDays(today, 1) };
  return { from: addDays(today, -29), to: addDays(today, 1) };
}

function objectId(value?: string) {
  return value && Types.ObjectId.isValid(value) ? new Types.ObjectId(value) : undefined;
}

function campusFilter(campusId?: string) {
  const id = objectId(campusId);
  return id ? { campusId: id } : {};
}

function academicYearFilter(academicYearId?: string) {
  const id = objectId(academicYearId);
  return id ? { academicYearId: id } : {};
}

function countMap(rows: Array<{ _id: string | null; count: number }>) {
  return rows.map((row) => ({
    status: row._id ?? 'UNKNOWN',
    count: row.count,
  }));
}

function dateCountMap(rows: Array<{ _id: string; count: number }>) {
  return rows.map((row) => ({
    date: row._id,
    count: row.count,
  }));
}

function dateAmountMap(rows: Array<{ _id: string; amount: number }>) {
  return rows.map((row) => ({
    date: row._id,
    amount: row.amount,
  }));
}

export async function resolveDashboard(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {

    case 'dashboardOverview':
    case 'GET:/api/admin/dashboard': {
      const input = ((args.input ?? args) as DashboardInput) ?? {};
      const { from, to } = parseDashboardRange(input);
      const today = startOfDay(new Date());
      const tomorrow = addDays(today, 1);
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const selectedCampusId = input.campusId ?? (args.campusId as string | undefined);
      const selectedAcademicYearId =
        input.academicYearId ?? (args.academicYearId as string | undefined);
      const scopedCampusFilter = campusFilter(selectedCampusId);
      const scopedAcademicYearFilter = academicYearFilter(selectedAcademicYearId);
      const campusObjectId = objectId(selectedCampusId);
      const profileCampusFilter = campusObjectId
        ? {
            $or: [
              { isAllCampuses: true },
              { 'campusAccess.campusId': campusObjectId },
            ],
          }
        : {};

      const [
        campus,
        activeStudents,
        staff,
        applicationsToday,
        admissionsMTD,
        enquiriesToday,
        approvalsPending,
        applicationStatusRows,
        enquiryStatusRows,
        dailySubmissionRows,
        recentAdmissions,
        collectedDailyRows,
        collectedThisMonthRows,
        collectedTodayRows,
        dueRows,
      ] = await Promise.all([
        campusObjectId ? Campus.findOne({ tenantId, _id: campusObjectId }).lean() : null,
        Student.countDocuments({
          tenantId,
          status: 'ACTIVE',
          ...scopedCampusFilter,
          ...scopedAcademicYearFilter,
        }),
        Profile.countDocuments({
          tenantId,
          personaRole: { $in: ['STAFF', 'TENANT_ADMIN'] },
          isActive: true,
          ...profileCampusFilter,
        }),
        Application.countDocuments({
          tenantId,
          ...scopedCampusFilter,
          ...scopedAcademicYearFilter,
          createdAt: { $gte: today, $lt: tomorrow },
        }),
        Application.countDocuments({
          tenantId,
          ...scopedCampusFilter,
          ...scopedAcademicYearFilter,
          status: { $in: ['APPROVED', 'ENROLLED'] },
          updatedAt: { $gte: monthStart, $lt: tomorrow },
        }),
        Enquiry.countDocuments({
          tenantId,
          ...scopedCampusFilter,
          ...scopedAcademicYearFilter,
          createdAt: { $gte: today, $lt: tomorrow },
        }),
        Application.countDocuments({
          tenantId,
          ...scopedCampusFilter,
          ...scopedAcademicYearFilter,
          status: { $in: ['SUBMITTED', 'UNDER_REVIEW'] },
        }),
        Application.aggregate([
          { $match: { tenantId, ...scopedCampusFilter, ...scopedAcademicYearFilter } },
          { $group: { _id: '$status', count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ]),
        Enquiry.aggregate([
          { $match: { tenantId, ...scopedCampusFilter, ...scopedAcademicYearFilter } },
          { $group: { _id: '$status', count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ]),
        Application.aggregate([
          {
            $match: {
              tenantId,
              ...scopedCampusFilter,
              ...scopedAcademicYearFilter,
              createdAt: { $gte: from, $lt: to },
            },
          },
          { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ]),
        Application.find({ tenantId, ...scopedCampusFilter, ...scopedAcademicYearFilter })
          .sort({ createdAt: -1 })
          .limit(8)
          .select({ _id: 1, studentName: 1, status: 1, createdAt: 1 })
          .lean(),
        Payment.aggregate([
          {
            $match: {
              tenantId,
              ...scopedCampusFilter,
              ...scopedAcademicYearFilter,
              status: 'SUCCESS',
              paidAt: { $gte: from, $lt: to },
            },
          },
          { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$paidAt' } }, amount: { $sum: '$amount' } } },
          { $sort: { _id: 1 } },
        ]),
        Payment.aggregate([
          {
            $match: {
              tenantId,
              ...scopedCampusFilter,
              ...scopedAcademicYearFilter,
              status: 'SUCCESS',
              paidAt: { $gte: monthStart, $lt: tomorrow },
            },
          },
          { $group: { _id: null, amount: { $sum: '$amount' } } },
        ]),
        Payment.aggregate([
          {
            $match: {
              tenantId,
              ...scopedCampusFilter,
              ...scopedAcademicYearFilter,
              status: 'SUCCESS',
              paidAt: { $gte: today, $lt: tomorrow },
            },
          },
          { $group: { _id: null, amount: { $sum: '$amount' } } },
        ]),
        Invoice.aggregate([
          {
            $match: {
              tenantId,
              ...scopedCampusFilter,
              ...scopedAcademicYearFilter,
              status: { $nin: ['PAID', 'CANCELLED'] },
            },
          },
          { $group: { _id: null, amount: { $sum: '$dueAmount' } } },
        ]),
      ]);

      const byStatus = [
        ...countMap(enquiryStatusRows).map((row) => ({ status: `ENQUIRY_${row.status}`, count: row.count })),
        ...countMap(applicationStatusRows),
      ];

      return {
        generatedAt: new Date().toISOString(),
        campusName: (campus as any)?.name ?? null,
        campusType: (campus as any)?.type ?? null,
        totals: {
          activeStudents,
          staff,
          admissionsToday: applicationsToday,
          admissionsMTD,
          enquiriesToday,
          applicationsToday,
          approvalsPending,
          attendanceToday: null,
        },
        admissions: {
          byStatus,
          dailySubmissions: dateCountMap(dailySubmissionRows),
          funnel: byStatus,
        },
        students: { activeCount: activeStudents },
        fees: {
          collectedDaily: dateAmountMap(collectedDailyRows),
          collectedThisMonth: collectedThisMonthRows[0]?.amount ?? 0,
          collectedToday: collectedTodayRows[0]?.amount ?? 0,
          dueTotal: dueRows[0]?.amount ?? 0,
          isReady: true,
        },
        recentAdmissions: recentAdmissions.map((item: any) => ({
          id: String(item._id),
          studentName: item.studentName ?? null,
          status: item.status,
          createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : String(item.createdAt),
        })),
      };
    }

    case 'superAdminOverview':
    case 'GET:/api/platform/dashboard': {
      if (!ctx.isPlatformAdmin) throw new AppError('FORBIDDEN', 'Platform admin only');
      const [tenants, students, activeTenants, users, staff, admins] = await Promise.all([
        Tenant.countDocuments({}),
        Student.countDocuments({ status: 'ACTIVE' }),
        Tenant.countDocuments({ isActive: true }),
        Profile.countDocuments({ isActive: true }),
        Profile.countDocuments({ personaRole: 'STAFF', isActive: true }),
        Profile.countDocuments({ personaRole: { $in: ['SUPER_ADMIN', 'TENANT_ADMIN'] }, isActive: true }),
      ]);
      return {
        totals: {
          tenants: activeTenants || tenants,
          users,
          students,
          staff,
          admins,
        },
      };
    }

    case 'platformStats':
    case 'GET:/api/platform/stats': {
      if (!ctx.isPlatformAdmin) throw new AppError('FORBIDDEN', 'Platform admin only');
      const [tenants, students, activeProfiles] = await Promise.all([
        Tenant.countDocuments({}),
        Student.countDocuments({}),
        Profile.countDocuments({ isActive: true }),
      ]);
      return { tenants, students, activeProfiles };
    }

    default:
      return undefined;
  }
}
