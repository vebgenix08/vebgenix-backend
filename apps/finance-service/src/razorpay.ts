import Razorpay from 'razorpay';
import crypto from 'crypto';
import { AppError } from '@vebgenix/errors';

let instance: Razorpay | null = null;

export function getRazorpay(): Razorpay {
  if (!instance) {
    const keyId     = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) throw new AppError('INTERNAL', 'Razorpay credentials not configured');
    instance = new Razorpay({ key_id: keyId, key_secret: keySecret });
  }
  return instance;
}

/** Create a Razorpay order for checkout integration */
export async function createRazorpayOrder(params: {
  amount: number;      // in paise
  currency?: string;
  receipt: string;
  notes?: Record<string, string>;
}) {
  const rp = getRazorpay();
  return rp.orders.create({
    amount:   params.amount,
    currency: params.currency ?? 'INR',
    receipt:  params.receipt,
    notes:    params.notes,
  });
}

/** Create a Razorpay Payment Link (share URL via SMS/email) */
export async function createRazorpayPaymentLink(params: {
  amount:       number;        // in paise
  currency?:    string;
  description?: string;
  reference_id?: string;
  customer?: {
    name?:    string;
    email?:   string;
    contact?: string;
  };
  callback_url?: string;
  expire_by?:    number;       // unix timestamp
}) {
  const rp = getRazorpay();
  return (rp as unknown as Record<string, Record<string, Function>>).paymentLink.create({
    amount:       params.amount,
    currency:     params.currency ?? 'INR',
    description:  params.description,
    reference_id: params.reference_id,
    customer:     params.customer,
    callback_url: params.callback_url,
    callback_method: 'get',
    expire_by:    params.expire_by,
    notify:       { sms: true, email: true },
  });
}

/** Verify a Razorpay payment signature (checkout/webhook) */
export function verifyRazorpaySignature(
  data: string,       // either "orderId|paymentId" or raw webhook body
  signature: string,
  secret: string,
): boolean {
  const expected = crypto.createHmac('sha256', secret).update(data).digest('hex');
  return expected === signature;
}
