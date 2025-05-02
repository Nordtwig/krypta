const fs = require("fs");

module.exports = {
  getFilesByDirectory: function (dir, callback) {
    fs.readdir(dir, { withFileTypes: true }, function (error, rawFiles) {
      if (error) return console.log("Unable to scan directory: " + error);

      const files = rawFiles.filter((file) => !file.name.startsWith("."));

      files.sort((a, b) => a.name.localeCompare(b.name));

	  callback(files)
    });
  },

  getFileStatsByPath: function(filePath) {
	console.log(fs.statSync(filePath).isFile())
  },

  isFile: function(filePath) {
	return fs.statSync(filePath).isFile()
  }
};
