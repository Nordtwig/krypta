const os = require("os")
const path = require("path")

class operative {
    constructor() {
        this.platform = os.platform()
        this.homedir = os.homeDir() + path.sep
    }
}

module.exports = operative