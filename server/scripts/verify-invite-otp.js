"use strict";

const base = process.env.API_BASE_URL || "http://localhost:5000";

async function post(path, body) {
  const url = new URL(path, base).toString();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, text };
}

async function main() {
  const [, , email, token, newPassword] = process.argv;
  if (!email || !token || !newPassword) {
    console.error(
      "Usage: node scripts/verify-invite-otp.js <email> <inviteCode> <newPassword>",
    );
    process.exitCode = 1;
    return;
  }

  const verify = await post("/api/auth/invite/verify", { email, token });
  console.log("verify", verify.status, verify.text);

  const accept = await post("/api/auth/invite/accept", {
    email,
    token,
    newPassword,
  });
  console.log("accept", accept.status, accept.text);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

