const os = require("os")
const path = require("path")

class OsNavigator {
    constructor() {
        this.platform = os.platform()
        this.homeDir = os.homedir() + path.sep
    }
}

module.exports = OsNavigator