const fs = require("fs")
const path = require("path")

fileName = document.getElementById("fileName")
fileContents = document.getElementById("fileContents")

let pathName = path.join(__dirname, "/")
// let directoryPath = path.join("/development/bohus")

explorer = document.getElementById("explorer")

fs.readdir("/home/noah/development/krypta/", { withFileTypes: true }, function(error, files) {
    if (error)
        return console.log("Unable to scan directory: " + error);

    files.forEach(function(file) {
        const newItem = document.createElement("li")
        const newAnchor = document.createElement("a")
        const newIcon = document.createElement("i")

        if (fs.statSync("/home/noah/development/krypta/" + file.name).isFile()) {
            fs.readFile("/home/noah/development/krypta/" + file.name, function(error, data) {
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
