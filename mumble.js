module.exports.mumble = (name) => require("./index.js").greet(name).replace(/[aeiou]/g, "m");
