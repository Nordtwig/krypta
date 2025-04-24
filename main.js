const fs = require("fs");
const path = require("path");

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
    pathElement.blur();
    pathName = pathElement.textContent;
    refreshExplorer();
  }
});

function refreshExplorer() {
  pathElement.textContent = pathName;
  explorer.innerHTML = "";

  const headerRowElement = document.createElement("tr");
  const headerColumnValues = ["", "Name"];

  headerColumnValues.forEach((value) => {
    const columnElement = document.createElement("th");
    columnElement.textContent = value;
    headerRowElement.appendChild(columnElement);
  });

  explorer.appendChild(headerRowElement);

  fs.readdir(pathName, { withFileTypes: true }, function (error, files) {
    if (error) return console.log("Unable to scan directory: " + error);

    files.forEach(function (file) {
      const newItem = document.createElement("tr");
      const newText = document.createElement("p");
      const newIcon = document.createElement("img");

      if (fs.statSync(pathName + file.name).isFile()) {
        fs.readFile(pathName + file.name, function (error, data) {
          newIcon.className = "file-icon";
          newText.id = pathName + file.name;
        });
      } else {
        newIcon.className = "folder-icon";
        newText.id = pathName + file.name + "\\";
      }

      newItem.addEventListener("click", () => {
        pathName = newText.id;
        refreshExplorer();
      });

      newText.textContent = file.name;
      newItem.appendChild(tabifyElement(newIcon));
      newItem.appendChild(tabifyElement(newText));
      explorer.appendChild(newItem);
    });
  });
}

function tabifyElement(element) {
  const columnElement = document.createElement("td");
  columnElement.appendChild(element);
  return columnElement;
}

refreshExplorer();
