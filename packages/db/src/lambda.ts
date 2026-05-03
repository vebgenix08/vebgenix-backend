/**
 * Lambda DB bootstrap helper.
 *
 * Usage in every handler:
 *
 *   import { bootstrapDB } from '@vebgenix/db';
 *
 *   export const handler = async (event: unknown, context: AWSLambda.Context) => {
 *     bootstrapDB(context);           // sets callbackWaitsForEmptyEventLoop = false
 *     await ensureDB();               // no-op on warm containers
 *     ...
 *   };
 *
 * Two separate exports so handlers can call them at the right moment:
 *   - bootstrapDB(context)  — synchronous, must be first line of handler
 *   - ensureDB()            — async, awaited before first DB query
 */
import { connectDB } from './connection';

/** Call once at the top of every Lambda handler, before any await. */
export function bootstrapDB(context?: Record<string, unknown>): void {
  // Prevents Lambda from waiting for the MongoDB socket event-loop
  // to fully drain before returning — the #1 cause of Lambda DB timeouts.
  if (context) {
    (context as { callbackWaitsForEmptyEventLoop: boolean }).callbackWaitsForEmptyEventLoop = false;
  }
}

/** Idempotent DB connect — safe to call on every invocation. */
export async function ensureDB(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('[DB] MONGODB_URI environment variable is not set');
  await connectDB(uri);
}
