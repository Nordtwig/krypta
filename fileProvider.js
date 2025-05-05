const { error } = require("console");
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

  getFileStatsByPath: function (filePath) {
    fs.readFileSync(filePath, (error, data) => {
      console.log("file read: ")
      console.log(data)
      callback(data)
    })
  },

  isFile: function (filePath) {
    return fs.statSync(filePath).isFile()
  },

  createObject: function createObject(filePath, fileName, callback) {
    if (fileName.indexOf(".") !== -1) {
      const splitFileName = fileName.split(".")
      const fileExtension = splitFileName[splitFileName.length - 1]
      fs.writeFile(filePath + fileName, "", (error) => {
        if (error) console.log(error)
        callback()
      })
    } else {
      fs.mkdir(filePath + fileName, (error) => {
        if (error) console.log(error)
        callback()
      })
    }
  }
};
