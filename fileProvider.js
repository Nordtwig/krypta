const fs = require("fs");

class FileProvider {
  constructor() {
  }

  getFilesByDirectory(directory) {
	const bufferFiles = []
    fs.readdir(directory, { withFileTypes: true }, function (error, rawFiles) {
      if (error) return console.log("Unable to scan directory: " + error);

      const files = rawFiles.filter((file) => !file.name.startsWith("."));

      files.sort((a, b) => a.name.localeCompare(b.name));
	
	  bufferFiles.push(...files)
    });

	return bufferFiles
  }
}

module.exports = FileProvider;
