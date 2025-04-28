const fs = require("fs");
const path = require("path");
const { shell } = require("electron");
const OsNavigator = require("./osNavigator");
const HtmlGenerator = require("./htmlGenerator")

fileName = document.getElementById("fileName");
fileContents = document.getElementById("fileContents");
explorer = document.getElementById("explorer");

const osNav = new OsNavigator
let currentDir = osNav.homeDir;

const html = new HtmlGenerator

const pathElement = document.getElementById("path");
pathElement.textContent = currentDir;

pathElement.addEventListener(
  "input",
  function (event) {
    console.log(event.data); 
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
  pathElement.textContent = currentDir;
  explorer.innerHTML = "";

  const headerRowElement = document.createElement("tr");
  const headerColumnValues = ["", "Name"];

  headerColumnValues.forEach((value) => {
    const columnElement = document.createElement("th");
    columnElement.textContent = value;
    headerRowElement.appendChild(columnElement);
  });

  explorer.appendChild(headerRowElement);
  const splitcurrentDir = currentDir.split(/[\\/]/);
  splitcurrentDir.pop();
  splitcurrentDir.pop();
  const backPath = splitcurrentDir.join(path.sep);
  const backRow = html.createExplorerRowItem("folder-icon", "..", backPath + path.sep);
  backRow.addEventListener("dblclick", () => {
    currentDir = backRow.id;
    refreshExplorer();
  });

  fs.readdir(currentDir, { withFileTypes: true }, function (error, files) {
    if (error) return console.log("Unable to scan directory: " + error);

    files.sort((a, b) => a.name.localeCompare(b.name));

    files.forEach(function (file) {
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
  });
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
