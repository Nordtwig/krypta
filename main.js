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
let backElement
let draggingItem = null

const html = new HtmlGenerator();

const pathElement = document.getElementById("path");
pathElement.textContent = currentDir;

pathElement.addEventListener("focus", (event) => {
  isEditing = true
})

pathElement.addEventListener("blur", (event) => {
  isEditing = false
})

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

  backElement = null
  if (!osNavigator.isRoot(currentDir)) {
    const backPath = getParentFilePath();
    const backRow = html.createExplorerRowItem("folder-icon", "..", backPath)
    backElement = backRow
    backRow.addEventListener("dblclick", () => {
      currentDir = backRow.id;
      refreshExplorer();
    });
  }

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
          newRow.className += "sortable-item"
          newRow.draggable = true
          newRow.addEventListener("dblclick", () => {
            shell.openPath(newRow.id)
          })
        } else {
          const newRow = html.createExplorerRowItem(
            "folder-icon",
            file.name,
            filePath + path.sep
          )
          newRow.className += "sortable-item"
          newRow.draggable = true
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
  placeholderItem.parentNode.insertBefore(
    placeholderItem, 
    backElement ? backElement.nextElementSibling  : explorer.children[0].nextElementSibling
  )
  const placeholderText = placeholderItem.getElementsByTagName('p')[0]
  placeholderText.addEventListener("keydown", (event) => {
    if (event.code === "Enter") {
      event.preventDefault()
      placeholderText.blur()
      isEditing = false
      fileProvider.createObject(currentDir + path.sep, placeholderText.textContent, refreshExplorer)
    }
  });
  placeholderText.contentEditable = true
  placeholderText.focus()
}

explorer.addEventListener("dragstart", (event) => {
  draggingItem = event.target
  event.target.classList.add("dragging")
})

explorer.addEventListener("dragend", (event) => {
  draggingItem = null
  event.target.classList.add("dragging")
  const draggedFile = path.basename(event.target.id)
  const targetPath = getDragAfterElement(explorer, event.clientY).id
  fileProvider.moveObject(event.target.id, targetPath + draggedFile, refreshExplorer)
})

explorer.addEventListener("dragover", (event) => {
  event.preventDefault()
  const draggingOverItem = getDragAfterElement(explorer, event.clientY)

  if (draggingOverItem) {
    // explorer.insertBefore(draggingItem, draggingOverItem)
  } else {
    // explorer.appendChild(draggingItem)
  }
})

function getDragAfterElement(container, y) {
  const draggableElements = [...container.querySelectorAll(".sortable-item:not(.dragging")]

  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect()
    const offset = y - box.top - box.height / 2
    if (offset < 0  && offset > closest.offset) {
      return { offset: offset, element: child}
    } else {
      return closest
    }
  }, { offset: Number.NEGATIVE_INFINITY }).element
}

refreshExplorer();
