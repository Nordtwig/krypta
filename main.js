const fs = require("fs");
const path = require("path");
const { shell } = require("electron");

fileName = document.getElementById("fileName");
fileContents = document.getElementById("fileContents");

let pathName = path.join(__dirname, "/");

explorer = document.getElementById("explorer");

const pathElement = document.getElementById("path");
pathElement.textContent = pathName;

pathElement.addEventListener(
  "input",
  function (event) {
    console.log(event.data);
    console.log(event.inputType);
  },
  false
);

pathElement.addEventListener("keydown", (event) => {
  if (event.code === "Enter") {
    event.preventDefault();
    updatePath();
  }
});

function refreshExplorer() {
  console.log(pathName);
  pathElement.textContent = pathName;
  explorer.innerHTML = "";

  console.log(pathName.split(/[\\/]/));
  const headerRowElement = document.createElement("tr");
  const headerColumnValues = ["", "Name"];

  headerColumnValues.forEach((value) => {
    const columnElement = document.createElement("th");
    columnElement.textContent = value;
    headerRowElement.appendChild(columnElement);
  });

  explorer.appendChild(headerRowElement);
  const splitPathName = pathName.split(/[\\/]/);
  splitPathName.pop();
  splitPathName.pop();
  const backPath = splitPathName.join("\\");
  const backRow = createExplorerRowItem("folder-icon", "..", backPath + "\\");
  backRow.addEventListener("dblclick", () => {
    pathName = backRow.id;
    refreshExplorer();
  });

  fs.readdir(pathName, { withFileTypes: true }, function (error, files) {
    if (error) return console.log("Unable to scan directory: " + error);

    files.sort((a, b) => a.name.localeCompare(b.name));

    files.forEach(function (file) {
      if (fs.statSync(pathName + file.name).isFile()) {
        fs.readFile(pathName + file.name, function (error, data) {
          if (error) return console.log(error);
          const newRow = createExplorerRowItem(
            "file-icon",
            file.name,
            pathName + file.name
          );
          newRow.addEventListener("dblclick", () => {
            shell.openPath(newRow.id);
          });
        });
      } else {
        const newRow = createExplorerRowItem(
          "folder-icon",
          file.name,
          pathName + file.name + "\\"
        );
        newRow.addEventListener("dblclick", () => {
          pathName = newRow.id;
          refreshExplorer();
        });
      }
    });
  });
}

function updatePath() {
  pathElement.blur();
  let newPath = pathElement.textContent;

  if (newPath.length == 0) newPath = pathName.split(/[\\/]/)[0];

  if (!newPath.endsWith("\\") || !newPath.endsWith("/")) {
    newPath += "\\";
  }
  pathName = newPath;
  refreshExplorer();
}

function createExplorerRowItem(
  icon = "",
  name = "placeholder",
  filepath = "/"
) {
  const newItem = document.createElement("tr");
  const newText = document.createElement("p");
  const newIcon = document.createElement("img");

  newIcon.className = icon;
  newText.textContent = name;
  newItem.id = filepath;

  newItem.appendChild(tabifyElement(newIcon));
  newItem.appendChild(tabifyElement(newText));
  explorer.appendChild(newItem);

  return newItem;
}

function tabifyElement(element) {
  const columnElement = document.createElement("td");
  columnElement.appendChild(element);
  return columnElement;
}

refreshExplorer();
