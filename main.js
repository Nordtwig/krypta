const fs = require("fs");
const path = require("path");
const { shell } = require("electron");
const OsNavigator = require("./osNavigator");
const HtmlGenerator = require("./htmlGenerator");
const FileProvider = require("./fileProvider");

fileName = document.getElementById("fileName");
fileContents = document.getElementById("fileContents");
explorer = document.getElementById("explorer");

const osNav = new OsNavigator();
let currentDir = osNav.homeDir;

const fp = new FileProvider();
const html = new HtmlGenerator();

const pathElement = document.getElementById("path");
pathElement.textContent = currentDir;

pathElement.addEventListener("keydown", (event) => {
  if (event.code === "Enter") {
    event.preventDefault();
    updatePath();
  }
});

async function refreshExplorer() {
  pathElement.textContent = currentDir;
  explorer.innerHTML = "";

  html.createExplorerHeadItem(["", "Name"]);

  const backPath = getParentFilePath();
  const backRow = html.createExplorerRowItem("folder-icon", "..", backPath);
  backRow.addEventListener("dblclick", () => {
    currentDir = backRow.id;
    refreshExplorer();
  });

  const files = await fp.getFilesByDirectory(currentDir);
  console.log(files)
  files.forEach(() => {
    console.log("file logged");
    
  })

  files.forEach(function (file) {
    console.log(file)
    if (fs.statSync(currentDir + file.name).isFile()) {
      fs.readFile(currentDir + file.name, function (error, data) {
        if (error) return console.log(error);
        const newRow = html.createExplorerRowItem(
          "file-icon",
          file.name,
          currentDir + file.name
        );
        newRow.addEventListener("dblclick", () => {
          shell.openPath(newRow.id);
        });
      });
    } else {
      const newRow = html.createExplorerRowItem(
        "folder-icon",
        file.name,
        currentDir + file.name + path.sep
      );
      newRow.addEventListener("dblclick", () => {
        currentDir = newRow.id;
        refreshExplorer();
      });
    }
  });
}

function getParentFilePath() {
  const splitcurrentDir = currentDir.split(/[\\/]/);
  splitcurrentDir.pop();
  splitcurrentDir.pop();
  return splitcurrentDir.join(path.sep) + path.sep;
}

function updatePath() {
  pathElement.blur();
  let newPath = pathElement.textContent;

  if (newPath.length == 0) newPath = currentDir.split(/[\\/]/)[0];

  if (!newPath.endsWith("\\") || !newPath.endsWith("/")) {
    newPath += path.sep;
  }
  currentDir = newPath;
  refreshExplorer();
}

refreshExplorer();
