/**
 * Finance Service Lambda — thin router
 *
 * Handles: fee categories, fee heads, fee structures, fee assignments,
 *          fee schedules, installment plans, fee revisions, invoices,
 *          payments, Razorpay, receipts, day book report, financial analytics.
 *
 * Invoked by:
 *   - AppSync (Cognito User Pool authorizer)
 *   - API Gateway REST
 *   - API Gateway (public webhook) — Razorpay payment webhook, no auth
 */
import { bootstrapDB, ensureDB, FinanceRepo } from '@vebgenix/db';
import { resolveContext } from '@vebgenix/auth';
import { AppError, isAppError } from '@vebgenix/errors';
import { getTenantId } from '@vebgenix/tenant';
import { verifyRazorpaySignature } from './razorpay';
import { resolveFeeCategories } from './resolvers/feeCategories';
import { resolveFeeHeads } from './resolvers/feeHeads';
import { resolveFeeStructures } from './resolvers/feeStructures';
import { resolveFeeAssignments } from './resolvers/feeAssignments';
import { resolveFeeSchedules } from './resolvers/feeSchedules';
import { resolveInstallmentPlans } from './resolvers/installmentPlans';
import { resolveInvoices } from './resolvers/invoices';
import { resolvePayments } from './resolvers/payments';
import { resolveReports } from './resolvers/reports';
import { RecordPayment } from './use-cases/RecordPayment';

function parseEvent(event: Record<string, unknown>) {
  if (event.info) {
    const info = event.info as Record<string, string>;
    return { operation: info.fieldName, args: (event.arguments ?? {}) as Record<string, unknown> };
  }
  const method = event.httpMethod as string;
  const path   = event.path as string;
  const body   = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : (event.body ?? {}) as Record<string, unknown>;
  const params  = (event.pathParameters ?? {}) as Record<string, string>;
  const qs      = (event.queryStringParameters ?? {}) as Record<string, string>;
  return { operation: `${method}:${path}`, args: { ...body, ...params, ...qs } };
}

export const handler = async (event: Record<string, unknown>, context: Record<string, unknown>) => {
  bootstrapDB(context);
  try {
    await ensureDB();

    const { operation, args } = parseEvent(event);

    // ── Razorpay webhook (no auth) ───────────────────────────────────────────
    if (operation === 'POST:/api/webhook/razorpay' || operation === 'razorpayWebhook') {
      const signature     = (event.headers as Record<string, string>)?.['x-razorpay-signature'] ?? '';
      const rawBody       = event.body as string;
      const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET ?? '';
      const isValid       = verifyRazorpaySignature(rawBody, signature, webhookSecret);
      if (!isValid) return { statusCode: 400, body: 'Invalid signature' };
      const payload    = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody as Record<string, unknown>;
      const event_type = payload.event as string;
      if (event_type === 'payment.captured') {
        const payloadData   = payload.payload as Record<string, Record<string, unknown>> | undefined;
        const paymentEntity = payloadData?.payment?.entity as Record<string, unknown> | undefined;
        if (paymentEntity) {
          const orderId = paymentEntity.order_id as string;
          const payment = await FinanceRepo.findPaymentByRazorpayOrderId(orderId);
          if (payment) {
            await RecordPayment.applyOnlineSuccess(
              payment.tenantId.toString(),
              payment._id.toString(),
              paymentEntity.id as string,
              signature,
            );
          }
        }
      }
      return { statusCode: 200, body: 'OK' };
    }

    // ── All other routes require auth ────────────────────────────────────────
    const ctx      = await resolveContext(event);
    const tenantId = getTenantId(ctx);

    // Delegate to resolver groups (first non-undefined wins)
    let result: unknown;

    result = await resolveFeeCategories(operation, args, ctx, tenantId);
    if (result !== undefined) return result;

    result = await resolveFeeHeads(operation, args, ctx, tenantId);
    if (result !== undefined) return result;

    result = await resolveFeeStructures(operation, args, ctx, tenantId);
    if (result !== undefined) return result;

    result = await resolveFeeAssignments(operation, args, ctx, tenantId);
    if (result !== undefined) return result;

    result = await resolveFeeSchedules(operation, args, ctx, tenantId);
    if (result !== undefined) return result;

    result = await resolveInstallmentPlans(operation, args, ctx, tenantId);
    if (result !== undefined) return result;

    result = await resolveInvoices(operation, args, ctx, tenantId);
    if (result !== undefined) return result;

    result = await resolvePayments(operation, args, ctx, tenantId);
    if (result !== undefined) return result;

    result = await resolveReports(operation, args, ctx, tenantId);
    if (result !== undefined) return result;

    throw new AppError('NOT_FOUND', `Unknown operation: ${operation}`);
  } catch (err) {
    if (isAppError(err)) {
      throw err;
    }
    console.error('[finance-service] unhandled error:', err);
    throw new Error('Internal server error');
  }
};
