/**
 * MongoDB connection — Lambda-safe singleton.
 *
 * Design rules for Lambda:
 *  1. Re-use the connection across warm invocations (module-level singleton).
 *  2. Never trust a boolean flag — check mongoose.connection.readyState.
 *  3. callbackWaitsForEmptyEventLoop = false is set by each handler, NOT here.
 *  4. Aggressive timeouts: Lambda has a hard deadline; don't let Mongoose hang.
 *  5. bufferCommands: false — fail fast if called before connect() finishes.
 */
import mongoose from 'mongoose';

/** readyState values: 0=disconnected 1=connected 2=connecting 3=disconnecting */
const READY     = 1;
const CONNECTING = 2;

/** Shared promise so concurrent cold-start calls don't open N connections. */
let connectingPromise: Promise<void> | null = null;

export async function connectDB(uri: string, dbName?: string): Promise<void> {
  const state = mongoose.connection.readyState;

  // Already connected — nothing to do
  if (state === READY) return;

  // Another call is already opening the connection — wait for it
  if (state === CONNECTING && connectingPromise) {
    return connectingPromise;
  }

  connectingPromise = mongoose
    .connect(uri, {
      // Only override dbName if explicitly provided — otherwise use the database
      // name from the MONGODB_URI (the segment after the last slash).
      ...(dbName ?? process.env.DB_NAME ? { dbName: dbName ?? process.env.DB_NAME } : {}),

      // ── Timeout settings (critical for Lambda) ────────────────────────────
      serverSelectionTimeoutMS: 5_000,  // give up if no server found in 5 s
      socketTimeoutMS:          30_000, // close idle socket after 30 s
      connectTimeoutMS:         10_000, // TCP connect timeout
      heartbeatFrequencyMS:     10_000, // how often driver checks server health

      // ── Connection pool (Lambda runs 1 request at a time per container) ───
      maxPoolSize:  5,    // max concurrent sockets per Lambda container
      minPoolSize:  1,    // keep at least 1 socket alive on warm container
      maxIdleTimeMS: 60_000, // close idle connections after 60 s (avoids Atlas timeout)

      // ── Reliability ────────────────────────────────────────────────────────
      bufferCommands: false, // throw immediately if no connection — don't queue
      retryWrites:    true,
      retryReads:     true,
    })
    .then(() => {
      console.log('[DB] MongoDB connected —', mongoose.connection.host);
      connectingPromise = null;

      // ── Connection event listeners ─────────────────────────────────────────
      mongoose.connection.on('disconnected', () => {
        console.warn('[DB] MongoDB disconnected');
      });
      mongoose.connection.on('error', (err) => {
        console.error('[DB] MongoDB connection error:', err.message);
      });
      mongoose.connection.on('reconnected', () => {
        console.log('[DB] MongoDB reconnected');
      });
    })
    .catch((err) => {
      connectingPromise = null;
      console.error('[DB] MongoDB connection failed:', err.message);
      throw err;
    });

  return connectingPromise;
}

/**
 * Graceful disconnect — used in tests and local scripts.
 * Lambda containers are killed by AWS; don't call this in handlers.
 */
export async function disconnectDB(): Promise<void> {
  if (mongoose.connection.readyState === 0) return;
  await mongoose.disconnect();
  console.log('[DB] MongoDB disconnected gracefully');
}

/** Direct access to the mongoose instance (for transactions, sessions, etc.) */
export { mongoose };
