const path = require("path");
const { shell } = require("electron")
const HtmlGenerator = require("./htmlGenerator");
const fileProvider = require("./fileProvider");
const osNavigator = require("./osNavigator");

fileName = document.getElementById("fileName");
fileContents = document.getElementById("fileContents");
explorer = document.getElementById("explorer");

let currentDir = osNavigator.homeDir;

const html = new HtmlGenerator();

const pathElement = document.getElementById("path");
pathElement.textContent = currentDir;

pathElement.addEventListener("keydown", (event) => {
  if (event.code === "Enter") {
    event.preventDefault();
    updatePath();
  }
});

function refreshExplorer() {
  pathElement.textContent = currentDir;
  explorer.innerHTML = "";

  html.createExplorerHeadItem(["", "Name"]);

  const backPath = getParentFilePath();
  const backRow = html.createExplorerRowItem("folder-icon", "..", backPath);
  backRow.addEventListener("dblclick", () => {
    currentDir = backRow.id;
    refreshExplorer();
  });

  try {
    fileProvider.getFilesByDirectory(currentDir, (files) => {
      for (const file of files) {
        const filePath = currentDir + file.name
        if (fileProvider.isFile(filePath)) {
          const newRow = html.createExplorerRowItem(
            "file-icon", 
            file.name,
            filePath
          )
          newRow.addEventListener("dblclick", () => {
            shell.openPath(newRow.id)
          })
        } else {
          const newRow = html.createExplorerRowItem(
            "folder-icon",
            file.name,
            filePath + path.sep
          )
          newRow.addEventListener("dblclick", () => {
            currentDir = newRow.id
            refreshExplorer()
          })
        }
      }
    });
  } catch (error) {
    console.log("failed to get files cause: " + error);
  }
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
