/**
 * Finance Service Lambda — thin router
 *
 * Handles: fee heads, fee structures, fee assignments,
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
import { handleFeeHead } from './operations/feeHead';
import { handleFeeSchedule } from './operations/feeSchedule';
import { handleFeeStructure } from './operations/feeStructure';
import { handleFeeStructureMapping } from './operations/feeStructureMapping';
import { handleFeeAssignment } from './operations/feeAssignment';
import { handleInstallmentPlan } from './operations/installmentPlan';
import { handleInvoice } from './operations/invoice';
import { handlePayment, applyOnlineSuccess } from './operations/payment';
import { handleStudentOrder } from './operations/studentOrder';
import { handleTransaction } from './operations/transaction';
import { handleManualCollection } from './operations/manualCollection';

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
            await applyOnlineSuccess(
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

    // Delegate to operation groups (first non-undefined wins)
    let result: unknown;

    result = await handleFeeHead(operation, args, ctx, tenantId);
    if (result !== undefined) return result;

    result = await handleFeeStructure(operation, args, ctx, tenantId);
    if (result !== undefined) return result;

    result = await handleFeeStructureMapping(operation, args, ctx, tenantId);
    if (result !== undefined) return result;

    result = await handleFeeAssignment(operation, args, ctx, tenantId);
    if (result !== undefined) return result;

    result = await handleFeeSchedule(operation, args, ctx, tenantId);
    if (result !== undefined) return result;

    result = await handleInstallmentPlan(operation, args, ctx, tenantId);
    if (result !== undefined) return result;

    result = await handleInvoice(operation, args, ctx, tenantId);
    if (result !== undefined) return result;

    result = await handlePayment(operation, args, ctx, tenantId);
    if (result !== undefined) return result;

    result = await handleStudentOrder(operation, args, ctx, tenantId);
    if (result !== undefined) return result;

    result = await handleTransaction(operation, args, ctx, tenantId);
    if (result !== undefined) return result;

    result = await handleManualCollection(operation, args, ctx, tenantId);
    if (result !== undefined) return result;

    throw new AppError('NOT_FOUND', `Unknown operation: ${operation}`);
  } catch (err) {
    if (isAppError(err)) {
      throw err;
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[finance-service] unhandled error:', msg, err instanceof Error ? err.stack : '');
    throw new Error(`Internal server error: ${msg}`);
  }
};
