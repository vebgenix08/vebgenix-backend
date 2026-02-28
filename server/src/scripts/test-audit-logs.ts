/**
 * Run this script to test the Platform Audit Logs API end-to-end.
 * Usage: npx ts-node src/scripts/test-audit-logs.ts <GRAPHQL_ENDPOINT> <SUPER_ADMIN_TOKEN> <NON_ADMIN_TOKEN>
 */
import fetch from "node-fetch";

async function runTests() {
  const [, , endpoint, saToken, naToken] = process.argv;
  if (!endpoint || !saToken || !naToken) {
    console.error(
      "Usage: npx ts-node src/scripts/test-audit-logs.ts <ENDPOINT> <SUPER_ADMIN_TOKEN> <NON_ADMIN_TOKEN>",
    );
    process.exit(1);
  }

  const queryList = `
    query listPlatformAuditLogs($input: ListPlatformAuditLogsInput!) {
      listPlatformAuditLogs(input: $input) {
        edges {
          node {
            id
            at
            action
            metaSummary
          }
          cursor
        }
        pageInfo {
          hasNextPage
          nextCursor
        }
      }
    }
  `;

  const queryDetail = `
    query getPlatformAuditLog($id: ID!) {
      getPlatformAuditLog(id: $id) {
        id
        meta
      }
    }
  `;

  async function graphql(token: string, query: string, variables: any = {}) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query, variables }),
    });
    return res.json();
  }

  console.log("== 1. Assert non-super-admin gets Forbidden ==");
  const naRes = await graphql(naToken, queryList, { input: { limit: 5 } });
  if (!naRes.errors || !naRes.errors[0].message.includes("Unauthorized")) {
    throw new Error("❌ Non-admin should have failed with Unauthorized.");
  }
  console.log("✅ Non-admin correctly rejected.");

  console.log("== 2. Assert list returns <= limit and pagination ==");
  const listRes1 = await graphql(saToken, queryList, { input: { limit: 2 } });

  if (listRes1.errors) {
    throw new Error(`GraphQL Error: ${JSON.stringify(listRes1.errors)}`);
  }
  const edges1 = listRes1.data.listPlatformAuditLogs.edges;
  if (edges1.length > 2) throw new Error("❌ Returned more than limit.");

  // Assert meta is omitted
  if (edges1[0] && (edges1[0].node as any).meta !== undefined) {
    throw new Error("❌ 'meta' should NOT be present in list item!");
  }
  console.log(
    "✅ Basic list fetching and limits work. meta is omitted from list.",
  );

  if (
    listRes1.data.listPlatformAuditLogs.pageInfo.hasNextPage &&
    listRes1.data.listPlatformAuditLogs.pageInfo.nextCursor
  ) {
    console.log("== 3. Assert cursor pagination works ==");
    const listRes2 = await graphql(saToken, queryList, {
      input: {
        limit: 2,
        cursor: listRes1.data.listPlatformAuditLogs.pageInfo.nextCursor,
      },
    });
    if (!listRes2.data || listRes2.errors)
      throw new Error(
        "❌ Pagination failed: " + JSON.stringify(listRes2.errors),
      );
    console.log("✅ Next page fetched successfully.");
  }

  if (edges1.length > 0) {
    const logId = edges1[0].node.id;
    console.log("== 4. Assert detail query contains meta ==");
    const detailRes = await graphql(saToken, queryDetail, { id: logId });
    if (
      !detailRes.data.getPlatformAuditLog.meta &&
      detailRes.data.getPlatformAuditLog.meta !== null
    ) {
      throw new Error("❌ Detail query failed to return meta field");
    }
    console.log("✅ Detail query returned meta field.");
  } else {
    console.log("⚠️ DB is empty, skipped detail testing.");
  }

  console.log("🎉 All assertions passed!");
}

runTests().catch((e) => {
  console.error(e);
  process.exit(1);
});
