// ===========================
// Chart hierarchy — general base + Cartesian mid-layer
// ===========================

// ---------------------------------------------------------------------------
// Layer 1: general Chart (window + lifecycle only)
// ---------------------------------------------------------------------------

class Chart {
    constructor(container) {
        this.container = container;
        // Cached payload for resize-cheap redraws.
        this._lastData = null;
        this._lastOptions = null;
        this._resizeTimer = null;
    }

    // Charts that manage their own resize (own ResizeObserver + cheap repaint)
    // Default: the chart re-renders from its data layer.
    get handlesOwnResize() { return false; }


    // Whether this chart supports lasso/click file selection.
    get supportsLassoSelection() { return false; }

    // The SVG element the lasso should be drawn on / hit-tested within.
    getSelectionSvg() {
        return this.container ? this.container.querySelector('svg') : null;
    }

    // Describes the chart's selectable elements for the lasso
    getSelectableElements() {
        return null;
    }

    onSelectionModeEnter() {}
    onSelectionModeExit() {}

    setElementSelected(el, selected /*, d */) {
        var sel = d3.select(el);
        sel.attr('stroke', selected ? 'var(--accent-blue)' : null)
           .attr('stroke-width', selected ? 3 : null);
    }

    // ---- Lifecycle ----

    // Full (re)render from prepared data. Not overridden by classes. render() caches the payload then delegates to _draw().
    render(data, options) {
        this._lastData = data;
        this._lastOptions = options || {};
        this._draw(data, this._lastOptions);
    }

    // Subclasses implement the actual drawing here.
    _draw(data, options) {
        throw new Error('Chart._draw must be implemented by subclass');
    }

    // Resize-cheap repaint. Default: re-run the full draw from the cached payload.
    renderView() {
        if (this._lastData === null) return;
        this._draw(this._lastData, this._lastOptions || {});
    }

    // Debounced resize entry point
    onResize(delayMs) {
        var self = this;
        if (this._resizeTimer) clearTimeout(this._resizeTimer);
        this._resizeTimer = setTimeout(function() {
            self._resizeTimer = null;
            self.renderView();
        }, (delayMs === undefined ? 200 : delayMs));
    }

    // Header title for the modal
    headerTitle(item) {
        if (!item) return null;
        if (item.type === 'entity') return 'Entity: ' + item.name;
        if (item.type === 'relationship') return 'Relationship: ' + item.name;
        return null;
    }

    // Remove body-level tooltips this chart appended. Subclasses may extend.
    destroy() {
        if (this._resizeTimer) { clearTimeout(this._resizeTimer); this._resizeTimer = null; }
        d3.selectAll('.chart-tooltip').remove();
        d3.selectAll('.axis-label-tooltip').remove();
    }

    // ---- Stats helper ----
    computeStats(values) {
        return Chart.computeStats(values);
    }

    // ---- No-data placeholder ----
    // Recolor this chart's per-file marks to match the files' current colors.
    updateColors() {}

    showNoData(message, submessage) {
        this.container.innerHTML = '<div class="no-data-message">' +
            '<svg viewBox="0 0 48 48" fill="none">' +
            '<circle cx="24" cy="24" r="20" stroke="currentColor" stroke-width="2" stroke-dasharray="4 4"/>' +
            '<path d="M24 16v8M24 28v2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
            '</svg>' +
            '<p>' + message + '</p>' +
            (submessage ? '<p style="font-size: 0.8rem; margin-top: 8px; opacity: 0.7;">' + submessage + '</p>' : '') +
            '</div>';
    }
}

// Static stats helper, for callers that need mean/sigma without a chart instance
Chart.computeStats = function(values) {
    var n = values.length;
    if (n === 0) return { mean: 0, sigma: 0 };
    var mean = values.reduce(function(s, v) { return s + v; }, 0) / n;
    var variance = values.reduce(function(s, v) { return s + Math.pow(v - mean, 2); }, 0) / n;
    return { mean: mean, sigma: Math.sqrt(variance) };
};

// ---------------------------------------------------------------------------
// Mid-layer: CartesianChart (axis/bar machinery)
// ---------------------------------------------------------------------------

class CartesianChart extends Chart {

    // ---- Fixed-slot setup ----
    chartSetup() {
        var container = this.container;
        container.innerHTML = '<svg id="bar-chart" style="width:100%;height:100%;display:block;"></svg>';
        d3.selectAll('.chart-tooltip').remove();
        d3.selectAll('.axis-label-tooltip').remove();

        var isFloating = !!container.closest('.floating-chart');
        var margin = isFloating
            ? { top: 30, right: 70, bottom: 30, left: 50 }
            : { top: 50, right: 60, bottom: 170, left: 80 };
        var containerWidth = container.clientWidth;
        var containerHeight = container.clientHeight;
        var width = Math.max(100, containerWidth - margin.left - margin.right);
        var height = Math.max(60, containerHeight - margin.top - margin.bottom);

        var svg = d3.select('#bar-chart')
            .attr('width', containerWidth)
            .attr('height', containerHeight);

        var g = svg.append('g')
            .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

        var FIXED_BAR_SLOTS = 100;
        var paddingRatio = 0.3;
        var slotWidth = width / FIXED_BAR_SLOTS;
        var barWidth = slotWidth * (1 - paddingRatio);
        var barPad = slotWidth * paddingRatio;

        return {
            g: g, width: width, height: height, isFloating: isFloating,
            slotWidth: slotWidth, barWidth: barWidth, barPad: barPad,
            xPos: function(i) { return i * slotWidth + barPad / 2; },
            xCenter: function(i) { return i * slotWidth + barPad / 2 + barWidth / 2; }
        };
    }

    // ---- Category setup with max-bar-width clamp ----
    // n evenly-spaced groups, bars capped at ATTR_MAX_BAR_WIDTH.
    setupCategoryChart(nCategories) {
        var container = this.container;
        container.innerHTML = '<svg id="bar-chart" style="width:100%;height:100%;display:block;"></svg>';
        d3.selectAll('.chart-tooltip').remove();
        d3.selectAll('.axis-label-tooltip').remove();

        var isFloating = !!container.closest('.floating-chart');
        var margin = isFloating
            ? { top: 30, right: 70, bottom: 30, left: 50 }
            : { top: 50, right: 60, bottom: 170, left: 80 };
        var containerWidth = container.clientWidth;
        var containerHeight = container.clientHeight;
        var width = Math.max(100, containerWidth - margin.left - margin.right);
        var height = Math.max(60, containerHeight - margin.top - margin.bottom);

        var svg = d3.select('#bar-chart')
            .attr('width', containerWidth).attr('height', containerHeight);

        var g = svg.append('g')
            .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

        var n = Math.max(nCategories, 1);
        var rawGroupWidth = width / n;
        var defaultPadRatio = 0.2;
        var rawBarWidth = rawGroupWidth * (1 - defaultPadRatio);

        var groupWidth, groupPad, barAreaWidth;
        if (rawBarWidth <= CartesianChart.ATTR_MAX_BAR_WIDTH) {
            groupWidth = rawGroupWidth;
            groupPad = rawGroupWidth * defaultPadRatio;
            barAreaWidth = rawGroupWidth - groupPad;
        } else {
            barAreaWidth = CartesianChart.ATTR_MAX_BAR_WIDTH;
            var padRatio = Math.max(CartesianChart.ATTR_MIN_PAD_RATIO, defaultPadRatio);
            groupWidth = Math.min(rawGroupWidth, barAreaWidth / (1 - padRatio));
            groupPad = groupWidth - barAreaWidth;
        }

        return {
            g: g, width: width, height: height, isFloating: isFloating,
            groupWidth: groupWidth, groupPad: groupPad, barAreaWidth: barAreaWidth
        };
    }

    // ---- Horizontal grid lines ----
    drawGrid(ctx, y, ticks) {
        ctx.g.append('g').attr('class', 'grid')
            .call(d3.axisLeft(y).ticks(ticks || 8).tickSize(-ctx.width).tickFormat(''))
            .selectAll('line')
            .style('stroke', 'var(--border-color)')
            .style('stroke-opacity', 0.3);
        ctx.g.selectAll('.grid .domain').remove();
    }

    // ---- Rotated, truncating X-axis labels with hover tooltip ----
    // labels: [{ label, color?, fileId? }]
    drawXAxisLabels(ctx, labels) {
        var xAxisG = ctx.g.append('g').attr('class', 'axis x-axis')
            .attr('transform', 'translate(0,' + ctx.height + ')');
        xAxisG.append('line')
            .attr('x1', 0).attr('x2', ctx.width)
            .attr('y1', 0).attr('y2', 0)
            .attr('stroke', 'var(--border-color)');

        var axisTooltip = d3.select('body').append('div')
            .attr('class', 'axis-label-tooltip')
            .style('position', 'absolute')
            .style('background', 'var(--bg-secondary)')
            .style('border', '1px solid var(--border-color)')
            .style('border-radius', '6px')
            .style('padding', '6px 10px')
            .style('font-size', '0.8rem')
            .style('font-weight', '600')
            .style('pointer-events', 'none')
            .style('z-index', '1002')
            .style('box-shadow', 'var(--shadow-md)')
            .style('opacity', 0)
            .style('white-space', 'nowrap');

        var MAX_LABEL_CHARS = 10;
        labels.forEach(function(item, i) {
            var fullName = item.label;
            var color = item.color || 'var(--text-secondary)';
            var truncated = fullName.length > MAX_LABEL_CHARS
                ? fullName.substring(0, MAX_LABEL_CHARS) + '\u2026'
                : fullName;

            xAxisG.append('text')
                .attr('class', 'x-axis-label')
                .attr('transform', 'translate(' + ctx.xCenter(i) + ', 10) rotate(-45)')
                .style('text-anchor', 'end')
                .style('font-size', '11px')
                .style('font-weight', '600')
                .style('cursor', 'default')
                .attr('dx', '-0.5em').attr('dy', '0.5em')
                .style('fill', color)
                .datum(item.fileId !== undefined ? { fileId: item.fileId } : null)
                .text(truncated)
                .on('mouseover', function(event) {
                    axisTooltip.style('opacity', 1).style('color', color).text(fullName);
                    positionTooltip(axisTooltip, event, 8, -30);
                })
                .on('mousemove', function(event) {
                    positionTooltip(axisTooltip, event, 8, -30);
                })
                .on('mouseout', function() { axisTooltip.style('opacity', 0); });
        });
    }

    // ---- Horizontal stat lines: mean / ±2σ ----
    drawStatLines(ctx, y, mean, sigma) {
        var plusTwoSigma = mean + 2 * sigma;
        var minusTwoSigma = mean - 2 * sigma;
        var statsG = ctx.g.append('g').attr('class', 'stats-lines');

        function addLine(value, color, label) {
            var py = y(value);
            if (py < 0 || py > ctx.height) return;
            statsG.append('line')
                .attr('x1', 0).attr('x2', ctx.width)
                .attr('y1', py).attr('y2', py)
                .attr('stroke', color).attr('stroke-width', 3)
                .attr('stroke-dasharray', label === '\u03BC' ? '12 6' : '10 6')
                .attr('opacity', label === '\u03BC' ? 0.95 : 0.9);
            statsG.append('text')
                .attr('x', ctx.width + 26).attr('y', py)
                .attr('dy', '0.35em').attr('text-anchor', 'middle')
                .attr('font-size', '11px').attr('fill', color).attr('font-weight', '600')
                .text(label);
        }

        if (sigma > 0) addLine(plusTwoSigma, '#f472b6', '+2\u03C3');
        addLine(mean, '#fbbf24', '\u03BC');
        if (sigma > 0) {
            var domainMin = y.domain()[0];
            if (minusTwoSigma > domainMin) addLine(minusTwoSigma, '#22d3ee', '-2\u03C3');
        }
        return { plusTwoSigma: plusTwoSigma, minusTwoSigma: minusTwoSigma };
    }

    // ---- Vertical stat lines on a binned chart ----
    drawVStatLines(ctx, bins, groupWidth, groupPad, mean, sigma) {
        var statsG = ctx.g.append('g').attr('class', 'stats-lines');

        function binXPos(value) {
            for (var b = 0; b < bins.length; b++) {
                if (value >= bins[b].x0 && value <= bins[b].x1) {
                    var frac = (bins[b].x1 - bins[b].x0) > 0
                        ? (value - bins[b].x0) / (bins[b].x1 - bins[b].x0)
                        : 0.5;
                    return b * groupWidth + groupPad / 2 + frac * (groupWidth - groupPad);
                }
            }
            if (bins.length > 0 && value < bins[0].x0) return groupPad / 2;
            if (bins.length > 0 && value > bins[bins.length - 1].x1) return bins.length * groupWidth - groupPad / 2;
            return 0;
        }

        function addVLine(value, color, label) {
            var px = binXPos(value);
            if (px < 0 || px > ctx.width) return;
            statsG.append('line')
                .attr('x1', px).attr('x2', px)
                .attr('y1', 0).attr('y2', ctx.height)
                .attr('stroke', color).attr('stroke-width', 2.5)
                .attr('stroke-dasharray', label === '\u03BC' ? '12 6' : '10 6')
                .attr('opacity', label === '\u03BC' ? 0.95 : 0.85);
            statsG.append('text')
                .attr('x', px).attr('y', -8)
                .attr('text-anchor', 'middle')
                .attr('font-size', '10px').attr('fill', color).attr('font-weight', '600')
                .text(label);
        }

        addVLine(mean, '#fbbf24', '\u03BC');
        if (sigma > 0) {
            addVLine(mean + 2 * sigma, '#f472b6', '+2\u03C3');
            addVLine(mean - 2 * sigma, '#22d3ee', '-2\u03C3');
        }
    }

    // ---- Y axis with integer-only ticks ----
    drawIntegerYAxis(ctx, y, label) {
        var domain = y.domain();
        var maxVal = domain[1];
        var nTicks = Math.min(8, Math.max(2, Math.ceil(maxVal)));
        ctx.g.append('g').attr('class', 'axis y-axis')
            .call(d3.axisLeft(y)
                .ticks(nTicks)
                .tickValues(d3.range(0, Math.floor(y.domain()[1]) + 1)
                    .filter(function(v) {
                        var step = Math.max(1, Math.ceil((Math.floor(y.domain()[1]) + 1) / 8));
                        return v % step === 0;
                    }))
                .tickFormat(d3.format('d')))
            .selectAll('text').style('font-size', '12px');
        ctx.g.append('text')
            .attr('transform', 'rotate(-90)').attr('y', -60).attr('x', -ctx.height / 2)
            .attr('text-anchor', 'middle').style('fill', 'var(--text-secondary)')
            .style('font-size', '13px').style('font-weight', '500')
            .text(label || 'Count');
    }

    // ---- Attribute stat summary fragment ----
    attrStatSummaryItems(stats) {
        return '<div class="summary-item"><div class="summary-dot" style="background:#fbbf24;"></div>' +
            '<span class="summary-label">\u03BC:</span><span class="summary-value">' + stats.mean.toFixed(2) + '</span></div>' +
            '<div class="summary-item"><span class="summary-label">\u03C3:</span>' +
            '<span class="summary-value">' + stats.sigma.toFixed(2) + '</span></div>' +
            '<div class="summary-item"><div class="summary-dot" style="background:#f472b6;"></div>' +
            '<span class="summary-label">+2\u03C3:</span><span class="summary-value">' + (stats.mean + 2 * stats.sigma).toFixed(2) + '</span></div>' +
            '<div class="summary-item"><div class="summary-dot" style="background:#22d3ee;"></div>' +
            '<span class="summary-label">-2\u03C3:</span><span class="summary-value">' + Math.max(0, stats.mean - 2 * stats.sigma).toFixed(2) + '</span></div>';
    }

    // Recolor file-colored bars + axis labels to match current file colors.
    updateColors() {
        var barSvg = this.container ? this.container.querySelector('#bar-chart') : null;
        if (!barSvg) return;
        var fileMap = {};
        FileRegistry.all().forEach(function(f) { fileMap[f.id] = f; });

        d3.select(barSvg).selectAll('.bar, .comp-bar')
            .transition().duration(200)
            .attr('fill', function(d) {
                if (!d || d.fileId == null) return null;
                var f = fileMap[d.fileId];
                return f ? f.color : null;
            });

        d3.select(barSvg).selectAll('.x-axis-label')
            .style('fill', function(d) {
                if (!d || d.fileId == null) return null;
                var f = fileMap[d.fileId];
                return f ? f.color : null;
            });
    }
}

// Bar constraints
CartesianChart.ATTR_MAX_BAR_WIDTH = 60;
CartesianChart.ATTR_MIN_PAD_RATIO = 0.08;

// ---- Shared sort helpers (free functions; caller + bar chart both use them) ----
function sortChartData(data, sortType, valueKey) {
    var sorted = data.slice();
    switch (sortType) {
        case 'name-asc':  sorted.sort(function(a, b) { return a.fileName.localeCompare(b.fileName); }); break;
        case 'name-desc': sorted.sort(function(a, b) { return b.fileName.localeCompare(a.fileName); }); break;
        case 'count-asc': sorted.sort(function(a, b) { return a[valueKey] - b[valueKey]; }); break;
        case 'count-desc': sorted.sort(function(a, b) { return b[valueKey] - a[valueKey]; }); break;
    }
    return sorted;
}

function getSortTypeLabel(sortType) {
    switch (sortType) {
        case 'name-asc':   return 'Name (A\u2192Z)';
        case 'name-desc':  return 'Name (Z\u2192A)';
        case 'count-asc':  return 'Count (Low\u2192High)';
        case 'count-desc': return 'Count (High\u2192Low)';
        default: return 'Default';
    }
}

// ===========================
// Filter panel integration
// ===========================

function _renderFilterPanel(modalMain, entityName) {
    var item = ModalState.item;
    if (!entityName || !item || item.type !== 'entity') {
        FilterPanel.destroy();
        return;
    }

    var fileIds = ModalState.selectedFileIds();
    var attrs = FilterQuery.getAttributeMeta(entityName, fileIds);
    if (attrs.length === 0) {
        FilterPanel.destroy();
        return;
    }

    var existing = modalMain.querySelector('.filter-panel');
    if (existing && existing.dataset.entityName === entityName) {
        return;
    }

    FilterPanel.render({
        entityType: entityName,
        fileIds: fileIds,
        container: modalMain,
        onFilterChange: function() { updateChart(); }
    });

    var panel = modalMain.querySelector('.filter-panel');
    if (panel) panel.dataset.entityName = entityName;
}

// ===========================
// Floating window bar-label visibility
// ===========================

// Hide overlapping value labels when a chart is shown in the floating/minimized preview.
function declutterFloatingChartLabels() {
    var previewBody = document.getElementById('chart-preview-body');
    if (!previewBody) return;
    var chartContainer = previewBody.querySelector('#chart-container');
    if (!chartContainer) return;

    var svgEl = chartContainer.querySelector('#bar-chart');
    if (!svgEl) { previewBody.classList.add('hide-bar-labels'); return; }

    previewBody.classList.remove('hide-bar-labels');

    var labels = svgEl.querySelectorAll('.bar-label, .comp-bar-label');
    if (labels.length === 0) return;

    var containerH = chartContainer.clientHeight;
    if (containerH < 120) { previewBody.classList.add('hide-bar-labels'); return; }

    var overlap = false;
    var bboxes = [];
    for (var i = 0; i < labels.length; i++) {
        try { bboxes.push(labels[i].getBBox()); }
        catch (e) { overlap = true; break; }
    }
    if (!overlap) {
        for (var j = 1; j < bboxes.length; j++) {
            var prev = bboxes[j - 1];
            var cur = bboxes[j];
            if (prev.x + prev.width + 2 > cur.x) { overlap = true; break; }
        }
    }

    if (overlap) previewBody.classList.add('hide-bar-labels');
}
