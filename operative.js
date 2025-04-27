const os = require("os")

class operative {
    constructor() {
        this.platform = os.platform()
        this.homedir = os.homedir()
    }
}

module.exports = operative