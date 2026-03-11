const https = require("https");
const fs = require("fs");
const path = require("path");

const url =
  "https://binaries.prisma.sh/all_commits/605197351a3c8bdd595af2d2a9bc3025bca48ea2/rhel-openssl-3.0.x/libquery_engine.so.node.gz";
const dest = path.join(
  __dirname,
  "node_modules",
  ".prisma",
  "client",
  "libquery_engine-rhel-openssl-3.0.x.so.node.gz",
);
const extractedDest = path.join(
  __dirname,
  "node_modules",
  ".prisma",
  "client",
  "libquery_engine-rhel-openssl-3.0.x.so.node",
);

console.log("Downloading from", url);
const file = fs.createWriteStream(dest);
https
  .get(url, (response) => {
    if (response.statusCode !== 200) {
      console.error(
        "Failed to download:",
        response.statusCode,
        response.statusMessage,
      );
      process.exit(1);
    }
    response.pipe(file);
    file.on("finish", () => {
      file.close();
      console.log("Download saved to", dest);
      try {
        const zlib = require("zlib");
        const gzipped = fs.readFileSync(dest);
        const unzipped = zlib.gunzipSync(gzipped);
        fs.writeFileSync(extractedDest, unzipped);
        console.log("Extracted successfully to", extractedDest);
      } catch (err) {
        console.error("Failed to extract:", err);
        process.exit(1);
      }
    });
  })
  .on("error", (err) => {
    fs.unlink(dest, () => {});
    console.error("Download error:", err.message);
  });
