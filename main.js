const fs = require("fs")
const path = require("path")

fileName = document.getElementById("fileName")
fileContents = document.getElementById("fileContents")

let pathName = path.join(__dirname, "/")

explorer = document.getElementById("explorer")

const pathElement = document.getElementById("path")
pathElement.textContent = pathName

fs.readdir(pathName, { withFileTypes: true }, function(error, files) {
    if (error)
        return console.log("Unable to scan directory: " + error);

    files.forEach(function(file) {
        const newItem = document.createElement("li")
        const newAnchor = document.createElement("a")
        const newIcon = document.createElement("img")

        if (fs.statSync(pathName + file.name).isFile()) {
            fs.readFile(pathName + file.name, function(error, data) {
                newIcon.className = "file-icon"
            })
        } else {
            newIcon.className = "folder-icon"
        }
        
        newAnchor.text = file.name
        newItem.appendChild(newIcon)
        newItem.appendChild(newAnchor)
        explorer.appendChild(newItem)
    })
})
