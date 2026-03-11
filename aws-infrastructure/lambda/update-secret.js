const {
  SecretsManagerClient,
  PutSecretValueCommand,
} = require("@aws-sdk/client-secrets-manager");

async function main() {
  const sm = new SecretsManagerClient({ region: "ap-south-1" });

  const payload = {
    DATABASE_URL:
      "postgresql://postgres.wuzkqijtaltfeznexvkx:Asdfgh%401567ags@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true",
    username: "postgres",
    password: "dummy_password",
    dbname: "vebgenix",
  };

  const command = new PutSecretValueCommand({
    SecretId: "vebgenix/dev/db-master",
    SecretString: JSON.stringify(payload),
  });

  try {
    const response = await sm.send(command);
    console.log("Secret updated successfully:", response.ARN);
  } catch (err) {
    console.error("Failed to update secret:", err);
  }
}

main();
