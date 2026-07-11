// ===========================
// Mini Charts — rasterized canvas thumbnails for graph nodes
// ===========================

// ---- Cache ----
// Cache for rasterized mini-chart images: key = nodeId + ":" + enabledFileKey
var _miniChartCache = {};

// Multi-select state

function _getEnabledFileKey() {
    return FileRegistry.enabledIds().sort().join(',');
}

function invalidateMiniChartCache() {
    _miniChartCache = {};
}

// ---- Generic rasterize-and-cache ----
function _rasterizeMiniChart(cacheKey, pxSize, drawFn) {
    if (_miniChartCache[cacheKey]) return _miniChartCache[cacheKey];
    var SCALE = 2;
    var canvas = document.createElement('canvas');
    canvas.width = Math.ceil(pxSize * SCALE);
    canvas.height = Math.ceil(pxSize * SCALE);
    var ctx = canvas.getContext('2d');
    ctx.scale(SCALE, SCALE);
    drawFn(ctx, pxSize);
    var dataUrl = canvas.toDataURL('image/png');
    _miniChartCache[cacheKey] = dataUrl;
    return dataUrl;
}

// ===========================
// Mini Chart Data Builders
// ===========================
function getEntityKDEData(entityName) {
    var enabledFiles = FileRegistry.enabled();
    var countsByFile = DataStore.getEntityCountsByFile(entityName);
    var counts = enabledFiles.map(function(f) { return countsByFile[f.id] || 0; });
    counts.sort(function(a, b) { return b - a; });
    return counts;
}

function getRelationKDEData(relName, sourceEntity, targetEntity) {
    var enabledFiles = FileRegistry.enabled();
    var countsByFile = DataStore.getRelationCountsByFile(relName, sourceEntity, targetEntity);

    var fileCounts = enabledFiles.map(function(f) { return countsByFile[f.id] || 0; });
    fileCounts.sort(function(a, b) { return b - a; });

    var combinedDegrees = {};
    enabledFiles.forEach(function(f) {
        var dist = DataStore.getDegreeDistribution(f.id, relName, sourceEntity, targetEntity);
        if (!dist) return;
        for (var deg in dist.source) {
            combinedDegrees[deg] = (combinedDegrees[deg] || 0) + dist.source[deg];
        }
        for (var deg2 in dist.target) {
            combinedDegrees[deg2] = (combinedDegrees[deg2] || 0) + dist.target[deg2];
        }
    });

    var maxDeg = 0;
    for (var d in combinedDegrees) {
        var di = parseInt(d);
        if (di > maxDeg) maxDeg = di;
    }
    var degreeVector = [];
    for (var i = 0; i <= maxDeg; i++) {
        degreeVector.push(combinedDegrees[i] || 0);
    }

    return { fileCounts: fileCounts, degreeVector: degreeVector };
}


// ===========================
// Canvas-based Mini Chart Renderers (rasterized + cached)
// ===========================
function _resolveCSS(prop, fallback) {
    return getComputedStyle(document.documentElement).getPropertyValue(prop).trim() || fallback;
}

function _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function _hexToRgba(hex, alpha) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    var r = parseInt(hex.substring(0, 2), 16);
    var gv = parseInt(hex.substring(2, 4), 16);
    var b = parseInt(hex.substring(4, 6), 16);
    return 'rgba(' + r + ',' + gv + ',' + b + ',' + alpha + ')';
}

function renderEntityMiniChart(parentG, node) {
    var SIZE = node.width;
    var cacheKey = 'e:' + node.id + ':' + _getEnabledFileKey();

    // Data: per-file counts, descending (shared shape with the instances chart).
    var enabledFiles = FileRegistry.enabled();
    var countsByFile = DataStore.getEntityCountsByFile(node.name);
    var bars = enabledFiles.map(function(f) {
        return { count: countsByFile[f.id] || 0, color: f.color };
    });
    bars.sort(function(a, b) { return b.count - a.count; });

    // Draw: bars on canvas (framework handles canvas/scale/cache).
    var dataUrl = _rasterizeMiniChart(cacheKey, SIZE, function(ctx, sz) {
        _drawEntityBars(ctx, sz, bars);
    });
    _appendEntityImage(parentG, node, dataUrl, SIZE);
}

// Pure canvas drawing for the entity thumbnail: descending per-file bars.
function _drawEntityBars(ctx, SIZE, bars) {
    // Background
    ctx.fillStyle = _resolveCSS('--bg-card', '#1e1e2e');
    _roundRect(ctx, 0, 0, SIZE, SIZE, 6);
    ctx.fill();

    var total = bars.reduce(function(s, b) { return s + b.count; }, 0);

    if (bars.length >= 1 && total > 0) {
        var pad = 8;
        var w = SIZE - pad * 2;
        var h = SIZE - pad * 2;
        var maxCount = bars[0].count; // already sorted desc
        if (maxCount === 0) maxCount = 1;

        var n = bars.length;
        var gap = Math.max(0.5, Math.min(2, w / n * 0.15));
        var barW = Math.max(1, (w - gap * (n - 1)) / n);

        for (var i = 0; i < n; i++) {
            var barH = (bars[i].count / maxCount) * h;
            if (bars[i].count > 0 && barH < 1) barH = 1;
            var bx = pad + i * (barW + gap);
            var by = pad + h - barH;
            ctx.fillStyle = bars[i].color;
            ctx.globalAlpha = 0.85;
            ctx.fillRect(bx, by, barW, barH);
        }
        ctx.globalAlpha = 1;
    } else {
        ctx.fillStyle = _resolveCSS('--text-muted', '#666');
        ctx.font = '11px "DM Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(bars.length === 0 ? 'no data' : 'Empty', SIZE / 2, SIZE / 2);
    }
}

function renderRelationMiniChart(parentG, node) {
    var SIZE = node.width;
    var cacheKey = 'r:' + node.id + ':' + _getEnabledFileKey();

    // Data: per-file relation counts + combined degree vector.
    var raw = getRelationKDEData(node.name, node.sourceEntity, node.targetEntity);

    // The relation thumbnail is drawn in the diamond's inscribed square.
    var INNER = SIZE / Math.SQRT2;

    var dataUrl = _rasterizeMiniChart(cacheKey, INNER, function(ctx, sz) {
        _drawRelationKde(ctx, sz, raw.fileCounts, raw.degreeVector);
    });
    _appendRelationImage(parentG, node, dataUrl, SIZE);
}

// Pure canvas drawing for the relation thumbnail
function _drawRelationKde(ctx, INNER, fileCounts, degreeVector) {
    var pad = 4;
    var gridSize = 100;

    // Background
    ctx.fillStyle = _resolveCSS('--bg-card', '#1e1e2e');
    _roundRect(ctx, 0, 0, INNER, INNER, 4);
    ctx.fill();

    var hasData = false;
    var fileTotal = fileCounts.reduce(function(s, v) { return s + v; }, 0);

    if (fileTotal > 0 && (fileCounts.length >= 1 || degreeVector.length >= 1)) {
        var pointsX = [];
        var pointsY = [];
        var maxLen = Math.max(fileCounts.length, degreeVector.length);
        for (var i = 0; i < maxLen; i++) {
            pointsX.push(i < fileCounts.length ? fileCounts[i] : 0);
            pointsY.push(i < degreeVector.length ? degreeVector[i] : 0);
        }

        if (pointsX.length >= 2) {
            hasData = true;
            var w = INNER - pad * 2;
            var h = INNER - pad * 2;
            var bwX = KDE.sheatherJonesBandwidth(pointsX);
            var bwY = KDE.sheatherJonesBandwidth(pointsY);

            var bandwidth_floor = 0.1;
            if (bwX < bandwidth_floor) bwX = bandwidth_floor;
            if (bwY < bandwidth_floor) bwY = bandwidth_floor;

            var result = KDE.vkde2D(pointsX, pointsY, gridSize, bwX, bwY);
            var grid = result.grid;
            var maxD = result.maxDensity;
            if (maxD === 0) maxD = 1;

            var colorScale = d3.scaleSequential(d3.interpolateInferno).domain([0, maxD]);
            var cellW = w / gridSize;
            var cellH = h / gridSize;

            ctx.save();
            _roundRect(ctx, pad, pad, w, h, 3);
            ctx.clip();

            for (var iy = 0; iy < gridSize; iy++) {
                for (var ix = 0; ix < gridSize; ix++) {
                    var val = grid[iy][ix];
                    if (val < maxD * 0.005) continue;
                    ctx.fillStyle = colorScale(val);
                    ctx.fillRect(pad + ix * cellW, pad + iy * cellH, cellW + 0.5, cellH + 0.5);
                }
            }
            ctx.restore();
        }
    }

    if (!hasData) {
        // Pre-rotate text +45deg so the outer -45deg rotation cancels out
        ctx.save();
        ctx.translate(INNER / 2, INNER / 2);
        ctx.rotate(45 * Math.PI / 180);
        ctx.fillStyle = _resolveCSS('--text-muted', '#666');
        ctx.font = '11px "DM Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        var label = fileCounts.length < 1 ? 'no data' : (fileTotal === 0 ? 'Empty' : 'n=1');
        ctx.fillText(label, 0, 0);
        ctx.restore();
    }
}


// ===========================
// SVG Image Helpers
// ===========================
function _appendEntityImage(parentG, node, dataUrl, SIZE, strokeColor) {
    var imgG = parentG.append('g');

    // Hit-area
    imgG.append('rect')
        .attr('x', -SIZE / 2).attr('y', -SIZE / 2)
        .attr('width', SIZE).attr('height', SIZE)
        .attr('rx', 6).attr('ry', 6)
        .attr('fill', 'transparent')
        .attr('class', 'entity-rect')
        .style('cursor', 'pointer')
        .on('click', function(event) {
            event.stopPropagation();
            if (GraphSelection.isActive()) {
                toggleNodeSelection(node);
            } else {
                showNodePopup(event, node);
            }
        });

    imgG.append('image')
        .attr('href', dataUrl)
        .attr('x', -SIZE / 2).attr('y', -SIZE / 2)
        .attr('width', SIZE).attr('height', SIZE)
        .style('pointer-events', 'none');

    // Border
    imgG.append('rect')
        .attr('x', -SIZE / 2).attr('y', -SIZE / 2)
        .attr('width', SIZE).attr('height', SIZE)
        .attr('rx', 6).attr('ry', 6)
        .attr('fill', 'none')
        .attr('stroke', strokeColor || 'var(--accent-blue)')
        .attr('stroke-width', 2)
        .style('pointer-events', 'none')
        .style('filter', 'drop-shadow(0 4px 8px rgba(0,0,0,0.3))');
}

function _appendRelationImage(parentG, node, dataUrl, SIZE) {
    var INNER = SIZE / Math.SQRT2;

    var outerG = parentG.append('g')
        .attr('transform', 'rotate(-45)');

    // Hit-area
    outerG.append('rect')
        .attr('x', -INNER / 2).attr('y', -INNER / 2)
        .attr('width', INNER).attr('height', INNER)
        .attr('rx', 4).attr('ry', 4)
        .attr('fill', 'transparent')
        .attr('class', 'relationship-rect')
        .style('cursor', 'pointer')
        .on('click', function(event) {
            event.stopPropagation();
            if (GraphSelection.isActive()) {
                toggleNodeSelection(node);
            } else {
                showNodePopup(event, node);
            }
        });

    outerG.append('image')
        .attr('href', dataUrl)
        .attr('x', -INNER / 2).attr('y', -INNER / 2)
        .attr('width', INNER).attr('height', INNER)
        .style('pointer-events', 'none');

    // Border
    outerG.append('rect')
        .attr('x', -INNER / 2).attr('y', -INNER / 2)
        .attr('width', INNER).attr('height', INNER)
        .attr('rx', 4).attr('ry', 4)
        .attr('fill', 'none')
        .attr('stroke', 'var(--accent-cyan)')
        .attr('stroke-width', 2)
        .style('pointer-events', 'none')
        .style('filter', 'drop-shadow(0 4px 8px rgba(0,0,0,0.3))');
}

