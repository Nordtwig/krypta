const fs = require("fs")
const path = require("path")

btnCreate = document.getElementById("btnCreate")
btnRead = document.getElementById("btnRead")
btnDelete = document.getElementById("btnDelete")

fileName = document.getElementById("fileName")
fileContents = document.getElementById("fileContents")

let pathName = path.join(__dirname, "/")
// let directoryPath = path.join("/development/bohus")


explorer = document.getElementById("explorer")

fs.readdir("/home/noah/development/bohus/", { withFileTypes: true }, function(error, files) {
    if (error)
        return console.log("Unable to scan directory: " + error);

    files.forEach(function(file) {
        // if (fs.statSync("/" + file).isFile())
        //     fs.readFile("/" + file, function(error, data) {
        //         console.log(data)
        //     })
        console.log(file)
        const newItem = document.createElement("li")
        newItem.textContent = file.name
        explorer.appendChild(newItem)
    })
})

btnCreate.addEventListener("click", function() {
    let file = path.join(pathName, fileName.value)
    let contents = fileContents.value
    fs.writeFile(file, contents, function() {
        if (error)
            return console.log(error)

        console.log("File created!")
    })
})

btnRead.addEventListener("click", function() {
    let file = path.join(pathName, fileName.value)
    fs.readFile(file, function(error, data) {
        if (error)
            return console.log(error)

        fileContents.value = data
        console.log("File read!")
    })
})

btnDelete.addEventListener("click", function() {
    let file = path.join(pathName, fileName.value)
    fs.unlink(file, function(error) {
        if (error)
            return console.log(error)

        fileName = ""
        fileContents = ""
        console.log("File deleted!");
    })
})