const { download } = require("@prisma/fetch-engine");
const path = require("path");

async function main() {
  const pkg = require("@prisma/client/package.json");
  // 5.22.0 has enginesVersion in dependencies or devDependencies
  const version =
    (pkg.devDependencies && pkg.devDependencies["@prisma/engines-version"]) ||
    (pkg.devDependencies && pkg.devDependencies["@prisma/engines"]) ||
    "5.22.0-44.605197351a3c8bc5ceea2595af2d2a9bc3025bca48e"; // Fallback to 5.22.0 exact hash

  const hash = version.includes("-") ? version.split("-")[1] : version;

  console.log(`Fetching Prisma Linux Engine for version hash ${hash}...`);
  const outdir = path.join(__dirname, "node_modules/.prisma/client");

  await download({
    binaries: {
      "libquery-engine": outdir,
    },
    binaryTargets: ["rhel-openssl-3.0.x"],
    showProgress: true,
    version: hash,
  });
  console.log("Done!");
}

main().catch(console.error);
