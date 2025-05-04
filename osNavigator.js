const os = require("os")
const path = require("path")

module.exports = {
    platform: os.platform(),
    homeDir: os.homedir() + path.sep,

    isRoot: function isRoot(currentDir) {
        return currentDir.split(path.sep)[1] === ""
    }
}