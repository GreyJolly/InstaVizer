// ===========================================================================
// Color actions — color-picker UI glue
// ===========================================================================
function openColorPicker(fileId) {
    var input = document.getElementById('color-input-' + fileId);
    if (input) input.click();
}

function changeFileColor(fileId, newColor) {
    if (!FileRegistry.setColorWithSwap(fileId, newColor)) return;

    renderFileList();

    if (nodes.length > 0) renderDiagram();
    if (ModalState.item) {
        renderFileList();
        updateChart();
    }
}
