import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../../../infrastructure/prisma/client';

// ─── Status Model ─────────────────────────────────────────────────────────────
//
// Status semantics (enforced throughout):
//   OK / EMPTY    — feature enabled, user authorized, query ran successfully
//   NOT_AVAILABLE — feature disabled OR user lacks permission OR module not yet implemented (WIP)
//   ERROR         — feature enabled + user authorized + query threw unexpectedly
//
type WidgetStatus = 'OK' | 'EMPTY' | 'NOT_AVAILABLE' | 'ERROR';

interface KpiWidget { value: number; status: WidgetStatus; }
interface ActivityItem { type: string; id: string; title: string; at: string; }
interface RecentSection { status: WidgetStatus; items: ActivityItem[]; }

// ─── Widget Helpers ────────────────────────────────────────────────────────────

function toKpi(value: number): KpiWidget {
  return { value, status: value === 0 ? 'EMPTY' : 'OK' };
}
/** Feature disabled, permission denied, or WIP module */
function na(): KpiWidget { return { value: 0, status: 'NOT_AVAILABLE' }; }
/** Query threw unexpectedly despite being enabled and authorized */
function err(): KpiWidget { return { value: 0, status: 'ERROR' }; }

// ─── Safe DB Helpers ($queryRaw — parameterized, no SQL injection possible) ───

async function safeCount(
  query: ReturnType<typeof Prisma.sql>,
  enabled: boolean,
): Promise<KpiWidget> {
  if (!enabled) return na();
  try {
    const rows = await prisma.$queryRaw<{ count: string }[]>(query);
    return toKpi(parseInt(rows[0]?.count ?? '0', 10));
  } catch {
    return err();
  }
}

async function rawCount(query: ReturnType<typeof Prisma.sql>): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: string }[]>(query);
  return parseInt(rows[0]?.count ?? '0', 10);
}

// ─── TTL Feature Cache ─────────────────────────────────────────────────────────
//
// Avoids hitting Supabase on every dashboard request.
// TTL: 120 s. On Supabase failure: fail-closed (all features disabled).
// Errors are logged only once per TTL window (no spam).

type FeatureCacheEntry = {
  fetchedAt: number;
  featureMap: Record<string, boolean>;
  fetchFailed: boolean;
};

const FEATURE_CACHE_TTL_MS = 120_000; // 2 minutes
const featureCache = new Map<string, FeatureCacheEntry>();

async function getTenantFeatureMap(tenantId: string): Promise<FeatureCacheEntry> {
  const now = Date.now();
  const cached = featureCache.get(tenantId);
  if (cached && (now - cached.fetchedAt) < FEATURE_CACHE_TTL_MS) return cached;

  try {
    const featureRows = await prisma.tenantFeature.findMany({
      where: { tenantId },
      select: { featureKey: true, enabled: true }
    });

    const featureMap: Record<string, boolean> = {};
    (featureRows ?? []).forEach((f) => { featureMap[f.featureKey] = f.enabled === true; });

    const entry: FeatureCacheEntry = { fetchedAt: now, featureMap, fetchFailed: false };
    featureCache.set(tenantId, entry);
    return entry;
  } catch (e) {
    const entry: FeatureCacheEntry = { fetchedAt: now, featureMap: {}, fetchFailed: true };
    featureCache.set(tenantId, entry);
    console.error('Feature flag fetch exception (cached):', e);
    return entry;
  }
}

// ─── Permission Helper ─────────────────────────────────────────────────────────
// Reads tenantWideKeys + campusKeys resolved by requireAuth (already in req.auth).

function hasPermission(req: Request, key: string): boolean {
  const auth: any = (req as any).auth;
  if (!auth) return false;
  const tenantWideKeys: Set<string> = auth.tenantWideKeys ?? new Set();
  const campusKeys: Map<string, Set<string>> = auth.campusKeys ?? new Map();
  const campusId: string | undefined = (req as any).campus?.campusId;
  if (tenantWideKeys.has(key)) return true;
  if (campusId && campusKeys.get(campusId)?.has(key)) return true;
  return false;
}

// ─── Controller: getSummary ────────────────────────────────────────────────────

/**
 * GET /admin/dashboard/summary
 *
 * General dashboard: meta + activeStudents.
 * Admissions KPIs, funnel, and recentAdmissions are included ONLY when:
 *   (a) ADMISSIONS feature is enabled  AND
 *   (b) user holds dashboard.view.admissions OR admissions.enquiry.view
 * If either condition fails → admissions widgets return NOT_AVAILABLE.
 *
 * Finance keys are NOT in this response — see GET /admin/dashboard/finance-summary.
 * Frontend should gate widgets on widget.status, not on internal flags.
 */
export const getSummary = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenant?.tenantId as string | undefined;
    const campus   = (req as any).campus;

    if (!tenantId || !campus) {
      return res.status(400).json({
        error: { code: 'MISSING_CONTEXT', message: 'Tenant/campus context missing' }
      });
    }

    const campusId: string = campus.campusId;

    // ── 1. Feature flags (cached, TTL 2 min) ─────────────────────────────────
    const { featureMap, fetchFailed } = await getTenantFeatureMap(tenantId);
    const feat = (k: string) => !fetchFailed && featureMap[k] === true;

    const admissionsEnabled = feat('ADMISSIONS');
    const attendanceEnabled = feat('ATTENDANCE');

    const modules: Record<string, boolean> = fetchFailed
      ? { DASHBOARD: false, ADMISSIONS: false, FINANCE: false, ATTENDANCE: false, ACADEMICS: false, TIMETABLE: false }
      : {
          DASHBOARD:  feat('DASHBOARD'),
          ADMISSIONS: admissionsEnabled,
          FINANCE:    feat('FINANCE'),
          ATTENDANCE: attendanceEnabled,
          ACADEMICS:  feat('ACADEMICS'),
          TIMETABLE:  feat('TIMETABLE'),
        };

    // ── 2. Permission check for admissions widgets ────────────────────────────
    // NOT_AVAILABLE if feature disabled OR user lacks either admissions permission.
    const canAdmissions =
      admissionsEnabled &&
      (hasPermission(req, 'dashboard.view.admissions') ||
       hasPermission(req, 'admissions.enquiry.view'));

    // ── 3. KPI Queries (safe $queryRaw, fully campusId-scoped) ────────────────
    const tid = tenantId;
    const cid = campusId;

    const [
      activeStudents,
      admissionsToday,
      admissionsMTD,
      enquiriesToday,
      applicationsToday,
      approvalsPending,
      attendanceStudents,
    ] = await Promise.all([
      safeCount(
        Prisma.sql`SELECT count(*)::text as count FROM students
                   WHERE tenant_id = ${tid}::uuid AND campus_id = ${cid}::uuid AND status = 'ACTIVE'`,
        true, // always shown
      ),
      safeCount(
        Prisma.sql`SELECT count(*)::text as count FROM students
                   WHERE tenant_id = ${tid}::uuid AND campus_id = ${cid}::uuid
                     AND enrollment_date = (now() AT TIME ZONE 'Asia/Kolkata')::date`,
        canAdmissions,
      ),
      safeCount(
        Prisma.sql`SELECT count(*)::text as count FROM students
                   WHERE tenant_id = ${tid}::uuid AND campus_id = ${cid}::uuid
                     AND enrollment_date >= date_trunc('month', (now() AT TIME ZONE 'Asia/Kolkata'))::date
                     AND enrollment_date <= (now() AT TIME ZONE 'Asia/Kolkata')::date`,
        canAdmissions,
      ),
      safeCount(
        Prisma.sql`SELECT count(*)::text as count FROM enquiries
                   WHERE tenant_id = ${tid}::uuid AND campus_id = ${cid}::uuid
                     AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date`,
        canAdmissions,
      ),
      safeCount(
        Prisma.sql`SELECT count(*)::text as count FROM applications
                   WHERE tenant_id = ${tid}::uuid AND campus_id = ${cid}::uuid
                     AND status = 'SUBMITTED'
                     AND (updated_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date`,
        canAdmissions,
      ),
      safeCount(
        Prisma.sql`SELECT count(*)::text as count FROM applications
                   WHERE tenant_id = ${tid}::uuid AND campus_id = ${cid}::uuid
                     AND status IN ('UNDER_REVIEW','INTERVIEW_SCHEDULED')`,
        canAdmissions,
      ),
      safeCount(
        Prisma.sql`SELECT count(*)::text as count FROM students
                   WHERE tenant_id = ${tid}::uuid AND campus_id = ${cid}::uuid AND status = 'ACTIVE'`,
        attendanceEnabled,
      ),
    ]);

    // ── 4. Admissions Funnel ──────────────────────────────────────────────────
    type DashboardFunnel = {
      enquiriesNew:          KpiWidget;
      applicationsSubmitted: KpiWidget;
      applicationsInReview:  KpiWidget;
      applicationsApproved:  KpiWidget;
      studentsEnrolled:      KpiWidget;
    };
    let funnel: DashboardFunnel;

    if (!canAdmissions) {
      funnel = {
        enquiriesNew:          na(),
        applicationsSubmitted: na(),
        applicationsInReview:  na(),
        applicationsApproved:  na(),
        studentsEnrolled:      na(),
      };
    } else {
      try {
        const [enqNew, appSub, appRev, appApp, stuEnr] = await Promise.all([
          rawCount(Prisma.sql`SELECT count(*)::text as count FROM enquiries    WHERE tenant_id=${tid}::uuid AND campus_id=${cid}::uuid AND status='NEW'`),
          rawCount(Prisma.sql`SELECT count(*)::text as count FROM applications WHERE tenant_id=${tid}::uuid AND campus_id=${cid}::uuid AND status='SUBMITTED'`),
          rawCount(Prisma.sql`SELECT count(*)::text as count FROM applications WHERE tenant_id=${tid}::uuid AND campus_id=${cid}::uuid AND status IN ('UNDER_REVIEW','INTERVIEW_SCHEDULED')`),
          rawCount(Prisma.sql`SELECT count(*)::text as count FROM applications WHERE tenant_id=${tid}::uuid AND campus_id=${cid}::uuid AND status='APPROVED'`),
          rawCount(Prisma.sql`SELECT count(*)::text as count FROM students     WHERE tenant_id=${tid}::uuid AND campus_id=${cid}::uuid`),
        ]);
        funnel = {
          enquiriesNew:          toKpi(enqNew),
          applicationsSubmitted: toKpi(appSub),
          applicationsInReview:  toKpi(appRev),
          applicationsApproved:  toKpi(appApp),
          studentsEnrolled:      toKpi(stuEnr),
        };
      } catch {
        funnel = {
          enquiriesNew:          err(),
          applicationsSubmitted: err(),
          applicationsInReview:  err(),
          applicationsApproved:  err(),
          studentsEnrolled:      err(),
        };
      }
    }

    // ── 5. Recent Admissions Activity ─────────────────────────────────────────
    let recentAdmissions: RecentSection;

    if (!canAdmissions) {
      recentAdmissions = { status: 'NOT_AVAILABLE', items: [] };
    } else {
      try {
        type RawActivity = { id: string; type: string; title: string; at: Date };

        const rows = await prisma.$queryRaw<RawActivity[]>(Prisma.sql`
          SELECT * FROM (
            SELECT id, 'ENQUIRY_CREATED' as type,
                   'New enquiry: ' || full_name as title,
                   created_at as at
            FROM enquiries
            WHERE tenant_id = ${tid}::uuid AND campus_id = ${cid}::uuid
            ORDER BY created_at DESC LIMIT 5
          ) e
          UNION ALL
          SELECT * FROM (
            SELECT id,
                   'APPLICATION_' || status::text as type,
                   'Application ' || lower(status::text) || ': ' || full_name as title,
                   updated_at as at
            FROM applications
            WHERE tenant_id = ${tid}::uuid AND campus_id = ${cid}::uuid
              AND status IN ('SUBMITTED','APPROVED','REJECTED')
            ORDER BY updated_at DESC LIMIT 5
          ) a
          UNION ALL
          SELECT * FROM (
            SELECT id, 'STUDENT_ENROLLED' as type,
                   'Student enrolled: ' || full_name as title,
                   created_at as at
            FROM students
            WHERE tenant_id = ${tid}::uuid AND campus_id = ${cid}::uuid
            ORDER BY created_at DESC LIMIT 3
          ) s
          ORDER BY at DESC
          LIMIT 10
        `);

        const items: ActivityItem[] = rows.map(r => ({
          type:  r.type,
          id:    r.id,
          title: r.title,
          at:    r.at instanceof Date ? r.at.toISOString() : String(r.at),
        }));

        recentAdmissions = { status: items.length === 0 ? 'EMPTY' : 'OK', items };
      } catch (e: any) {
        console.error('Recent admissions query failed:', e?.message || e);
        recentAdmissions = { status: 'ERROR', items: [] };
      }
    }

    // ── 6. Payload — no finance keys, no internal flags ───────────────────────
    return res.json({
      meta: {
        tenantId,
        campusId,
        campusName:  campus.name,
        campusType:  campus.campusType,
        generatedAt: new Date().toISOString(),
      },
      kpis: {
        activeStudents,
        admissionsToday,
        admissionsMTD,
        enquiriesToday,
        applicationsSubmittedToday: applicationsToday,
        approvalsPending,
        attendanceStudents,
        // Finance KPIs — stub as NOT_AVAILABLE (real data from /finance-summary).
        // Frontend expects these keys to exist so it can read widget.status.
        feeCollectedToday: na(),
        pendingDues:       na(),
        scholarshipsFY:    na(),
        refundsThisMonth:  na(),
      },
      funnel,
      recent: {
        admissions: recentAdmissions,
        finance:    { status: 'NOT_AVAILABLE' as WidgetStatus, items: [] },
      },
      modules,
      featureFetchFailed: fetchFailed,
    });

  } catch (error) {
    console.error('Dashboard getSummary error:', error);
    return res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to load dashboard summary' }
    });
  }
};

// ─── Controller: getFinanceSummary ─────────────────────────────────────────────

/**
 * GET /admin/dashboard/finance-summary
 *
 * Finance-only payload. Route is already gated with requirePermission('dashboard.view.finance').
 *
 * Status semantics for WIP modules:
 *   - FINANCE feature disabled → NOT_AVAILABLE (user/feature gate)
 *   - FINANCE feature enabled but not yet implemented → NOT_AVAILABLE + meta.wipModules ['FINANCE']
 *   - Never use ERROR for unimplemented; ERROR is reserved for unexpected query failures.
 *
 * When Finance module ships, replace na() calls in this handler with real safeCount() queries.
 */
export const getFinanceSummary = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenant?.tenantId as string | undefined;
    const campus   = (req as any).campus;

    if (!tenantId || !campus) {
      return res.status(400).json({
        error: { code: 'MISSING_CONTEXT', message: 'Tenant/campus context missing' }
      });
    }

    const campusId: string = campus.campusId;

    // ── 1. Feature flags (cached) ─────────────────────────────────────────────
    const { featureMap, fetchFailed } = await getTenantFeatureMap(tenantId);
    const feat = (k: string) => !fetchFailed && featureMap[k] === true;
    const financeEnabled = feat('FINANCE');

    const modules: Record<string, boolean> = fetchFailed
      ? { DASHBOARD: false, ADMISSIONS: false, FINANCE: false, ATTENDANCE: false, ACADEMICS: false, TIMETABLE: false }
      : {
          DASHBOARD:  feat('DASHBOARD'),
          ADMISSIONS: feat('ADMISSIONS'),
          FINANCE:    financeEnabled,
          ATTENDANCE: feat('ATTENDANCE'),
          ACADEMICS:  feat('ACADEMICS'),
          TIMETABLE:  feat('TIMETABLE'),
        };

    // ── 2. Finance KPIs ───────────────────────────────────────────────────────
    // Finance module not yet built.
    // NOT_AVAILABLE is correct here — WIP is equivalent to "not available" from consumer's view.
    // Only switch to real safeCount() queries when Finance module ships.
    const feeCollectedToday: KpiWidget = na(); // WIP: replace with safeCount when Finance ships
    const pendingDues:        KpiWidget = na();
    const scholarshipsFY:     KpiWidget = na();
    const refundsThisMonth:   KpiWidget = na();

    // ── 3. Recent Finance ─────────────────────────────────────────────────────
    const recentFinance: RecentSection = { status: 'NOT_AVAILABLE', items: [] };

    // ── 4. Payload ────────────────────────────────────────────────────────────
    return res.json({
      meta: {
        tenantId,
        campusId,
        campusName:  campus.name,
        campusType:  campus.campusType,
        generatedAt: new Date().toISOString(),
        // Signals to consumers that this module's data is intentionally NOT_AVAILABLE (WIP),
        // not an error condition. Remove entry when Finance module ships.
        wipModules: ['FINANCE'],
      },
      kpis: {
        feeCollectedToday,
        pendingDues,
        scholarshipsFY,
        refundsThisMonth,
      },
      recent: {
        finance: recentFinance,
      },
      modules,
      featureFetchFailed: fetchFailed,
    });

  } catch (error) {
    console.error('Dashboard getFinanceSummary error:', error);
    return res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to load finance summary' }
    });
  }
};
