import crypto from "crypto";

export function generateInviteOtp(digits: number = 6): {
  code: string;
  tokenHash: string;
} {
  const max = 10 ** digits;
  const n = crypto.randomInt(0, max);
  const code = String(n).padStart(digits, "0");
  const tokenHash = crypto.createHash("sha256").update(code).digest("hex");
  return { code, tokenHash };
}

