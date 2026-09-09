// SYNTHETIC FIXTURE: a config plugin that writes a marker if Expo loads it. Classification must never require it.
const fs = require("node:fs");
const path = require("node:path");
module.exports = function syntheticPlugin(config) {
  fs.writeFileSync(path.join(__dirname, "PLUGIN_EXECUTED.marker"), "executed\n");
  return config;
};
