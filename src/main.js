// ===========================
// Global State
// ===========================
let svg, g, zoom;
let nodes = [];
let links = [];
let simulation;

// ===========================
// Initialization
// ===========================
document.addEventListener('DOMContentLoaded', () => {
    initSVG();
    initDropZone();
    initButtons();
    initFileSidebar();
    initModal();
    ScatterplotScreen.init();
});

document.getElementById('legend-help-btn').addEventListener('click', function(e) {
    e.stopPropagation();
    var tooltip = document.getElementById('legend-tooltip');
    tooltip.classList.toggle('visible');
});

document.addEventListener('click', function() {
    document.getElementById('legend-tooltip').classList.remove('visible');
});

// ===========================
// Window Resize
// ===========================
window.addEventListener('resize', () => {
    if (nodes.length > 0) {
        const container = document.querySelector('.canvas-container');
        svg.attr('width', container.clientWidth)
           .attr('height', container.clientHeight);
    }
    scheduleChartResize();
});
