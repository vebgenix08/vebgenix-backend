import { handler } from "../aws-infrastructure/lib/lambdas/DashboardLambda/index";

async function testDashboard() {
  const mockTenantId = "00000000-0000-0000-0000-000000000000"; // Replace with a real standard UUID from your DB if you want valid DB execution

  console.log("== Testing Tenant Dashboard ==");
  try {
    const startTime = Date.now();
    const tenantResult = await handler({
      info: { fieldName: "dashboardOverview" },
      identity: {
        claims: {
          sub: "fba73489-0c36-4c46-950c-36bc0638531d",
          email: "test@example.com",
          "custom:tenant_id": mockTenantId,
        },
      },
      arguments: {
        input: { campusId: mockTenantId, range: { preset: "LAST_30_DAYS" } }, // Mock campus ID same as tenant
      },
    });
    const duration = Date.now() - startTime;
    const sizeBytes = Buffer.byteLength(JSON.stringify(tenantResult));

    console.log("Tenant Success:", JSON.stringify(tenantResult, null, 2));
    console.log(
      `\nMetrics -> Latency: ${duration}ms, Payload Size: ${sizeBytes} bytes`,
    );

    // Guard Assertions
    if (duration > 500)
      console.warn(`⚠️ Warning: Query took ${duration}ms (target < 500ms)`);
    if (sizeBytes > 50000)
      console.warn(`⚠️ Warning: Payload is ${sizeBytes} bytes (target < 50KB)`);
  } catch (err: any) {
    console.error("Tenant Error:", err.message);
  }

  // ==== 1a. Negative Test: Cross-Campus Authorization ====
  console.log("\n== Testing Negative Auth: Cross-Campus ==");
  try {
    const wrongCampusId = "11111111-1111-1111-1111-111111111111"; // Different campus
    await handler({
      info: { fieldName: "dashboardOverview" },
      identity: {
        claims: { sub: "test-user", "custom:tenant_id": mockTenantId },
      },
      arguments: {
        input: { campusId: wrongCampusId, range: { preset: "TODAY" } },
      },
    });
    console.error(
      "❌ FAILIURE: Should have thrown an AccessDenied/Not Found error for wrong campus.",
    );
  } catch (err: any) {
    console.log("✅ Expected Error Caught:", err.message);
  }

  console.log("\n== Testing Super Admin Dashboard ==");
  try {
    const adminResult = await handler({
      info: { fieldName: "superAdminOverview" },
      identity: {
        claims: {
          sub: "fba73489-0c36-4c46-950c-36bc0638531d",
          "cognito:groups": ["SUPER_ADMIN"],
        },
      },
      arguments: {
        input: { range: { preset: "TODAY" } },
      },
    });

    console.log("Admin Success:", JSON.stringify(adminResult, null, 2));
  } catch (err: any) {
    console.error("Admin Error:", err.message);
  }

  // ==== 2a. Negative Test: Super Admin Auth ====
  console.log("\n== Testing Negative Auth: Non-Super Admin ==");
  try {
    await handler({
      info: { fieldName: "superAdminOverview" },
      identity: { claims: { sub: "test-user", "cognito:groups": ["STAFF"] } }, // Not SUPER_ADMIN
      arguments: { input: { range: { preset: "TODAY" } } },
    });
    console.error("❌ FAILIURE: Should have thrown Unauthorized Error.");
  } catch (err: any) {
    console.log("✅ Expected Error Caught:", err.message);
  }
}

testDashboard()
  .then(() => console.log("\nDone test script."))
  .catch(console.error);
