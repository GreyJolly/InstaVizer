// ==================
// Color utilities
// ==================
function colorsMatch(color1, color2) {
    return normalizeColor(color1) === normalizeColor(color2);
}

function normalizeColor(color) {
    var ctx = document.createElement('canvas').getContext('2d');
    ctx.fillStyle = color;
    return ctx.fillStyle.toLowerCase();
}
