module.exports = require("./package.json").version;
module.exports.version = module.exports;
module.exports.greet = (name) => `Hello, ${name || "world"}!`;
