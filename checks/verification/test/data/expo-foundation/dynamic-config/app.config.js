// SYNTHETIC FIXTURE: executing this dynamic Expo config writes a marker. Classification must never import it.
const fs = require("node:fs");
const path = require("node:path");
fs.writeFileSync(path.join(__dirname, "DYNAMIC_CONFIG_EXECUTED.marker"), "executed\n");
module.exports = {
  expo: {
    name: "trap",
    extra: { b2cNativeDirectoryOwnership: "generated-cng" },
  },
};
