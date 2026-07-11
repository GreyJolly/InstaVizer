// ================
// DOM utilities
// ================

function readFile(file) {
    return new Promise(function(resolve, reject) {
        var reader = new FileReader();
        reader.onload = function(e) { resolve(e.target.result); };
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

function getTextWidth(text, fontSize) {
    fontSize = fontSize || 14;
    var canvas = document.createElement('canvas');
    var context = canvas.getContext('2d');
    context.font = fontSize + 'px "DM Sans"';
    return context.measureText(text).width;
}

function positionTooltip(tooltip, event, offsetX, offsetY) {
    offsetX = offsetX || 12;
    offsetY = offsetY || -12;

    // Get tooltip dimensions
    var node = tooltip.node ? tooltip.node() : tooltip;
    var rect = node.getBoundingClientRect();
    var tw = rect.width || 160;
    var th = rect.height || 60;

    var px = event.pageX;
    var py = event.pageY;
    var vw = window.innerWidth;
    var vh = window.innerHeight;

    // Horizontal: prefer right of cursor, flip left if it would overflow
    var left;
    if (px + offsetX + tw + 8 > vw) {
        left = px - tw - Math.abs(offsetX);
    } else {
        left = px + offsetX;
    }
    // Clamp to viewport
    left = Math.max(8, Math.min(left, vw - tw - 8));

    // Vertical: prefer above cursor, flip below if it would overflow
    var top;
    if (py + offsetY - th < 0) {
        top = py + Math.abs(offsetY);
    } else {
        top = py + offsetY;
    }
    top = Math.max(8, Math.min(top, vh - th - 8));

    if (tooltip.style && typeof tooltip.style === 'function') {
        // d3 selection
        tooltip.style('left', left + 'px').style('top', top + 'px');
    } else {
        // DOM element
        node.style.left = left + 'px';
        node.style.top = top + 'px';
    }
}
