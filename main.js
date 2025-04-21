const { log } = require("console")
const fs = require("fs")
const path = require("path")

btnCreate = document.getElementById("btnCreate")
btnRead = document.getElementById("btnRead")
btnDelete = document.getElementById("btnDelete")

fileName = document.getElementById("fileName")
fileContents = document.getElementById("fileContents")

let pathName = path.join(__dirname, "files")

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

btnDelte.addEventListener("click", function() {
    let file = path.join(pathName, fileName.value)
    fs.unlink(file, function(error) {
        if (error)
            return console.log(error)

        fileName = ""
        fileContents = ""
        console.log("File deleted!");
    })
})