module.exports = require("./package.json").version;
module.exports.version = module.exports;
module.exports.greet = (name) => `Hello, ${name || "world"}!`;
module.exports.shout = (name) => module.exports.greet(name).toUpperCase();
module.exports.whisper = require("./whisper.js").whisper;
