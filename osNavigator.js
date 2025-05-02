const os = require("os")
const path = require("path")

module.exports = {
    platform: os.platform(),
    homeDir: os.homedir() + path.sep
}