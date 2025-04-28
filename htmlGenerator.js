class HtmlGenerator {
  constructor(separator = "/") {
	this.separator
  }

  createExplorerRowItem(icon = "", name = "placeholder", filepath = separator) {
    const newItem = document.createElement("tr");
    const newText = document.createElement("p");
    const newIcon = document.createElement("img");

    newIcon.className = icon;
    newText.textContent = name;
    newItem.id = filepath;

    newItem.appendChild(this.tabifyElement(newIcon));
    newItem.appendChild(this.tabifyElement(newText));
    explorer.appendChild(newItem);

    return newItem;
  }

  tabifyElement(element) {
    const columnElement = document.createElement("td");
    columnElement.appendChild(element);
    return columnElement;
  }
}

module.exports = HtmlGenerator;
 