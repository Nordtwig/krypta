const path = require("path");
const { shell } = require("electron")
const HtmlGenerator = require("./htmlGenerator");
const fileProvider = require("./fileProvider");
const osNavigator = require("./osNavigator");

fileName = document.getElementById("fileName");
fileContents = document.getElementById("fileContents");
explorer = document.getElementById("explorer");

let currentDir = osNavigator.homeDir;
let isEditing = false

const html = new HtmlGenerator();

const pathElement = document.getElementById("path");
pathElement.textContent = currentDir;

pathElement.addEventListener("keydown", (event) => {
  if (event.code === "Enter") {
    event.preventDefault();
    updatePath();
  }
});

document.addEventListener("keyup", (event) => {
  if (event.code === "KeyA" && !isEditing) {
    event.preventDefault()
    createFile()
    isEditing = true
  }
})

const topbarCloseButton = document.getElementById("topbar-close")
topbarCloseButton.addEventListener("click", (event) => {
  function closeApp() {
    const { ipcRenderer } = require("electron")
    const ipc = ipcRenderer
    ipc.send("close")
  }
  closeApp()
})

function refreshExplorer() {
  pathElement.textContent = currentDir;
  explorer.innerHTML = "";

  html.createExplorerHeadItem(["", "Name"]);

  const backPath = getParentFilePath();
  const backRow = html.createExplorerRowItem("folder-icon", "..", backPath)
  backRow.className += "back-item"
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

function createFile() {
  const placeholderItem = html.createExplorerRowItem("file-icon", "", "")
  placeholderItem.parentNode.insertBefore(placeholderItem, placeholderItem.parentNode.firstElementChild.nextElementSibling.nextElementSibling)
  const placeholderText = placeholderItem.getElementsByTagName('p')[0]
  placeholderText.addEventListener("keydown", (event) => {
  if (event.code === "Enter") {
    event.preventDefault()
    placeholderText.blur()
    isEditing = false
  }
  });
  placeholderText.contentEditable = true
  placeholderText.focus()
}

refreshExplorer();
