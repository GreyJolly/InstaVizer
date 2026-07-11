// ===========================
// InstancesChart - "Instances per file" bar chart
// ===========================
// Two modes, chosen by options.referenceFile:
//   - standard: one bar per file (count)
//   - compare:  diverging bars showing each file's count minus the reference
//
// DATA CONTRACT (caller-supplied):
//   data:    [{ fileName, fileId, count, color }]
//   options: {
//     summaryContainer,        // DOM element for the stats summary
//     sortType,                // 'name-asc' | 'count-desc' | ...
//     referenceFile,           // file object or null (null => standard mode)
//     refCount                 // reference file's count (compare mode only)
//   }

class InstancesChart extends CartesianChart {
    _draw(data, options) {
        options = options || {};
        var summaryContainer = options.summaryContainer;

        if (!data || data.length === 0) {
            this.showNoData('No files selected', 'Select files from the left panel to see data');
            if (summaryContainer) summaryContainer.innerHTML = '';
            return;
        }

        if (options.referenceFile || options.refIsMean) {
            this._renderCompare(data, options);
        } else {
            this._renderStandard(data, options);
        }
    }

    _renderStandard(data, options) {
        var summaryContainer = options.summaryContainer;
        var sortType = options.sortType;
        var sortedData = sortChartData(data, sortType, 'count');

        var stats = this.computeStats(sortedData.map(function(d) { return d.count; }));
        var plusTwoSigma = stats.mean + 2 * stats.sigma;

        var ctx = this.chartSetup();

        var maxCount = d3.max(sortedData, function(d) { return d.count; }) || 1;
        var yMax = Math.max(maxCount, plusTwoSigma) * 1.15;
        var y = d3.scaleLinear()
            .domain([0, Math.max(1, yMax)])
            .nice()
            .range([ctx.height, 0]);

        this.drawGrid(ctx, y);
        if (!ctx.isFloating) {
            this.drawXAxisLabels(ctx, sortedData.map(function(d) {
                return { label: d.fileName, color: d.color, fileId: d.fileId };
            }));
        }

        ctx.g.append('g').attr('class', 'axis y-axis')
            .call(d3.axisLeft(y).ticks(ctx.isFloating ? 4 : 8).tickFormat(d3.format('d')))
            .selectAll('text').style('font-size', ctx.isFloating ? '10px' : '12px');
        if (!ctx.isFloating) {
            ctx.g.append('text')
                .attr('transform', 'rotate(-90)')
                .attr('y', -60).attr('x', -ctx.height / 2)
                .attr('text-anchor', 'middle')
                .style('fill', 'var(--text-secondary)')
                .style('font-size', '13px').style('font-weight', '500')
                .text('Instance Count');
        }

        ctx.g.selectAll('.bar').data(sortedData).enter().append('rect')
            .attr('class', 'bar')
            .attr('x', function(d, i) { return ctx.xPos(i); })
            .attr('y', function(d) { return y(d.count); })
            .attr('width', ctx.barWidth)
            .attr('height', function(d) { return Math.max(0, ctx.height - y(d.count)); })
            .attr('fill', function(d) { return d.color; })
            .attr('opacity', 1);

        var labelFontPx = Math.max(8, Math.min(13, ctx.barWidth * 0.8));
        var labelGap = 4;
        ctx.g.selectAll('.bar-label').data(sortedData).enter().append('text')
            .attr('class', 'bar-label')
            .attr('x', function(d, i) { return ctx.xCenter(i); })
            .attr('y', function(d) { return y(d.count) - labelGap; })
            .attr('text-anchor', 'start')
            .attr('dominant-baseline', 'central')
            .attr('transform', function(d, i) {
                var cx = ctx.xCenter(i);
                var cy = y(d.count) - labelGap;
                return 'rotate(-90,' + cx + ',' + cy + ')';
            })
            .style('fill', 'var(--text-primary)')
            .style('font-size', labelFontPx + 'px').style('font-weight', '600')
            .style('opacity', function(d) { return d.count > 0 ? 1 : 0.5; })
            .text(function(d) { return d.count; });

        var statLines = this.drawStatLines(ctx, y, stats.mean, stats.sigma);

        var tooltip = d3.select('body').append('div')
            .attr('class', 'chart-tooltip').style('opacity', 0);

        ctx.g.selectAll('.bar-hover').data(sortedData).enter().append('rect')
            .attr('class', 'bar-hover')
            .attr('x', function(d, i) { return ctx.xPos(i); })
            .attr('y', 0).attr('width', ctx.barWidth).attr('height', ctx.height)
            .attr('fill', 'transparent').style('cursor', 'pointer')
            .on('mouseover', function(event, d) {
                tooltip.transition().duration(200).style('opacity', 1);
                var zScore = stats.sigma > 0 ? ((d.count - stats.mean) / stats.sigma).toFixed(2) : '0.00';
                tooltip.html(
                    '<div class="tooltip-label">' + d.fileName + '</div>' +
                    '<div class="tooltip-value">' + d.count + ' instance' + (d.count !== 1 ? 's' : '') + '</div>' +
                    '<div class="tooltip-zscore">z-score: ' + zScore + '</div>'
                );
                positionTooltip(tooltip, event);
                ctx.g.selectAll('.bar').filter(function(b) { return b.fileName === d.fileName; })
                    .transition().duration(150).attr('opacity', 0.8);
            })
            .on('mousemove', function(event) { positionTooltip(tooltip, event); })
            .on('mouseout', function() {
                tooltip.transition().duration(300).style('opacity', 0);
                ctx.g.selectAll('.bar').transition().duration(150).attr('opacity', 1);
            });

        if (summaryContainer) {
            var total = sortedData.reduce(function(s, d) { return s + d.count; }, 0);
            var filesWithData = sortedData.filter(function(d) { return d.count > 0; }).length;
            summaryContainer.innerHTML =
                '<div class="stats-summary"><div class="stats-row">' +
                    '<div class="summary-item summary-item-highlight">' +
                        '<span class="summary-label" style="color: rgba(255,255,255,0.8);">Total:</span>' +
                        '<span class="summary-value" style="color: white;">' + total + '</span>' +
                    '</div>' +
                    '<div class="summary-item"><div class="summary-dot" style="background: #fbbf24;"></div>' +
                        '<span class="summary-label">Mean (\u03BC):</span><span class="summary-value">' + stats.mean.toFixed(2) + '</span></div>' +
                    '<div class="summary-item"><span class="summary-label">Std Dev (\u03C3):</span>' +
                        '<span class="summary-value">' + stats.sigma.toFixed(2) + '</span></div>' +
                    '<div class="summary-item"><div class="summary-dot" style="background: #f472b6;"></div>' +
                        '<span class="summary-label">+2\u03C3:</span><span class="summary-value">' + statLines.plusTwoSigma.toFixed(2) + '</span></div>' +
                    '<div class="summary-item"><div class="summary-dot" style="background: #22d3ee;"></div>' +
                        '<span class="summary-label">-2\u03C3:</span><span class="summary-value">' + Math.max(0, statLines.minusTwoSigma).toFixed(2) + '</span></div>' +
                    '<div class="summary-item"><span class="summary-label">Files:</span>' +
                        '<span class="summary-value">' + filesWithData + '/' + sortedData.length + ' with data</span></div>' +
                    '<div class="summary-item"><span class="summary-label">Sort:</span>' +
                        '<span class="summary-value">' + getSortTypeLabel(sortType) + '</span></div>' +
                '</div></div>';
        }
    }

    _renderCompare(data, options) {
        var summaryContainer = options.summaryContainer;
        var refFile = options.referenceFile;
        var refCount = options.refCount || 0;
        var isMean = !!options.refIsMean;

        // diffs may be fractional when comparing against the mean.
        var fmtDiff = function(v) { return (v > 0 ? '+' : '') + (Number.isInteger(v) ? v : v.toFixed(1)); };

        // Against a file reference, that file is excluded; against the mean,
        // every selected file is shown.
        var otherData = isMean ? data.slice()
                               : data.filter(function(d) { return d.fileId !== refFile.id; });
        if (otherData.length < (isMean ? 2 : 1)) {
            this.showNoData('Select at least 2 files to compare',
                isMean ? 'Each file is compared against the mean count'
                       : 'One file is the reference, others are compared against it');
            return;
        }

        otherData.forEach(function(d) { d.diff = d.count - refCount; });

        var sortType = options.sortType;
        var sortedData = sortChartData(otherData, sortType, 'count');

        var stats = this.computeStats(sortedData.map(function(d) { return d.diff; }));
        var ctx = this.chartSetup();

        var maxAbsDiff = d3.max(sortedData, function(d) { return Math.abs(d.diff); }) || 1;
        var yExtent = Math.max(maxAbsDiff, Math.abs(stats.mean + 2 * stats.sigma), Math.abs(stats.mean - 2 * stats.sigma)) * 1.2;

        var y = d3.scaleLinear().domain([-yExtent, yExtent]).nice().range([ctx.height, 0]);
        var zeroY = y(0);

        if (!ctx.isFloating) {
            this.drawXAxisLabels(ctx, sortedData.map(function(d) {
                return { label: d.fileName, color: d.color, fileId: d.fileId };
            }));
        }

        ctx.g.append('g').attr('class', 'axis y-axis')
            .call(d3.axisLeft(y).ticks(ctx.isFloating ? 4 : 10).tickFormat(function(d) { return (d > 0 ? '+' : '') + d3.format('d')(d); }))
            .selectAll('text').style('font-size', ctx.isFloating ? '10px' : '12px');
        if (!ctx.isFloating) {
            ctx.g.append('text')
                .attr('transform', 'rotate(-90)')
                .attr('y', -60).attr('x', -ctx.height / 2).attr('text-anchor', 'middle')
                .style('fill', 'var(--text-secondary)').style('font-size', '13px').style('font-weight', '500')
                .text(isMean ? 'Difference from Mean' : 'Difference from Reference');
        }
        ctx.g.selectAll('.comp-bar').data(sortedData).enter().append('rect')
            .attr('class', 'comp-bar')
            .attr('x', function(d, i) { return ctx.xPos(i); })
            .attr('y', function(d) { return d.diff >= 0 ? y(d.diff) : zeroY; })
            .attr('width', ctx.barWidth)
            .attr('height', function(d) { return Math.max(0, Math.abs(y(d.diff) - zeroY)); })
            .attr('fill', function(d) { return d.color; }).attr('opacity', 1);

        ctx.g.selectAll('.comp-bar-label').data(sortedData).enter().append('text')
            .attr('class', 'comp-bar-label')
            .attr('x', function(d, i) { return ctx.xCenter(i); })
            .attr('y', function(d) { return d.diff >= 0 ? y(d.diff) - 8 : y(d.diff) + 16; })
            .attr('text-anchor', 'middle')
            .style('fill', 'var(--text-primary)').style('font-size', '12px').style('font-weight', '600')
            .style('opacity', function(d) { return d.diff !== 0 ? 1 : 0.5; })
            .text(function(d) { return fmtDiff(d.diff); });

        this.drawStatLines(ctx, y, stats.mean, stats.sigma);

        var tooltip = d3.select('body').append('div').attr('class', 'chart-tooltip').style('opacity', 0);
        ctx.g.selectAll('.comp-bar-hover').data(sortedData).enter().append('rect')
            .attr('class', 'comp-bar-hover')
            .attr('x', function(d, i) { return ctx.xPos(i); })
            .attr('y', 0).attr('width', ctx.barWidth).attr('height', ctx.height)
            .attr('fill', 'transparent').style('cursor', 'pointer')
            .on('mouseover', function(event, d) {
                tooltip.transition().duration(200).style('opacity', 1);
                var zScore = stats.sigma > 0 ? ((d.diff - stats.mean) / stats.sigma).toFixed(2) : '0.00';
                tooltip.html(
                    '<div class="tooltip-label">' + d.fileName + '</div>' +
                    '<div class="tooltip-value">' + d.count + ' instance' + (d.count !== 1 ? 's' : '') + '</div>' +
                    '<div class="tooltip-diff" style="color:' + (d.diff >= 0 ? '#34d399' : '#f87171') + ';">' +
                        fmtDiff(d.diff) + ' vs ' + (isMean ? 'mean' : 'reference') + ' (' + (isMean ? refCount.toFixed(2) : refCount) + ')' +
                    '</div>' +
                    '<div class="tooltip-zscore">z-score: ' + zScore + '</div>'
                );
                positionTooltip(tooltip, event);
                ctx.g.selectAll('.comp-bar').filter(function(b) { return b.fileName === d.fileName; })
                    .transition().duration(150).attr('opacity', 0.8);
            })
            .on('mousemove', function(event) { positionTooltip(tooltip, event); })
            .on('mouseout', function() {
                tooltip.transition().duration(300).style('opacity', 0);
                ctx.g.selectAll('.comp-bar').transition().duration(150).attr('opacity', 1);
            });

        if (summaryContainer) {
            var aboveCount = sortedData.filter(function(d) { return d.diff > 0; }).length;
            var belowCount = sortedData.filter(function(d) { return d.diff < 0; }).length;
            var equalCount = sortedData.filter(function(d) { return d.diff === 0; }).length;
            var refTitle = isMean ? ('Mean of ' + sortedData.length + ' files') : refFile.name;
            var refNameTruncated = isMean ? 'Mean (\u03BC)'
                : (refFile.name.length > 20 ? refFile.name.substring(0, 20) + '\u2026' : refFile.name);
            var refCountDisplay = isMean ? refCount.toFixed(2) : refCount;

            summaryContainer.innerHTML =
                '<div class="stats-summary"><div class="stats-row">' +
                    '<div class="summary-item summary-item-highlight" title="' + refTitle + ' (' + refCountDisplay + ')">' +
                        '<span class="summary-label" style="color: rgba(255,255,255,0.8);">Reference:</span>' +
                        '<span class="summary-value" style="color: white;">' + refNameTruncated + ' (' + refCountDisplay + ')</span>' +
                    '</div>' +
                    '<div class="summary-item"><div class="summary-dot" style="background: #fbbf24;"></div>' +
                        '<span class="summary-label">Mean \u0394 (\u03BC):</span>' +
                        '<span class="summary-value">' + (stats.mean >= 0 ? '+' : '') + stats.mean.toFixed(2) + '</span></div>' +
                    '<div class="summary-item"><span class="summary-label">\u03C3:</span>' +
                        '<span class="summary-value">' + stats.sigma.toFixed(2) + '</span></div>' +
                    '<div class="summary-item"><span class="summary-label">Above:</span>' +
                        '<span class="summary-value" style="color: #34d399;">' + aboveCount + '</span></div>' +
                    '<div class="summary-item"><span class="summary-label">Below:</span>' +
                        '<span class="summary-value" style="color: #f87171;">' + belowCount + '</span></div>' +
                    '<div class="summary-item"><span class="summary-label">Equal:</span>' +
                        '<span class="summary-value">' + equalCount + '</span></div>' +
                '</div></div>';
        }
    }

    // ---- Lasso selection contract ----

    get supportsLassoSelection() { return true; }

    getSelectionSvg() {
        return document.getElementById('bar-chart');
    }

    getSelectableElements() {
        var svg = this.getSelectionSvg();
        var tx = 0, ty = 0;
        if (svg) {
            var plotG = svg.querySelector('g');
            if (plotG) {
                var m = (plotG.getAttribute('transform') || '')
                    .match(/translate\(\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/);
                if (m) { tx = parseFloat(m[1]); ty = parseFloat(m[2]); }
            }
        }
        return {
            selector: '.bar',
            clickSelector: '.bar-hover',
            hitTest: function(el, d) {
                if (!d || d.fileId == null) return null;
                var rect = el.getBBox ? el.getBBox() : { x: 0, y: 0, width: 0, height: 0 };
                return {
                    x: rect.x + rect.width / 2 + tx,
                    y1: rect.y + ty,
                    y2: rect.y + rect.height + ty,
                    fileId: d.fileId
                };
            }
        };
    }

    setElementSelected(el, selected /*, d */) {
        d3.select(el)
            .attr('stroke', selected ? 'var(--accent-blue)' : 'none')
            .attr('stroke-width', selected ? 3 : 0)
            .attr('opacity', selected ? 1 : 0.7);
    }
}


// ===========================
// Instances chart — data layer + modal glue
// ===========================
// Builds the per-file instance-count data and feeds it to the InstancesChart above
var _instancesChart = null;
function _getInstancesChart() {
    var c = document.getElementById('chart-container');
    if (!_instancesChart || _instancesChart.container !== c) _instancesChart = new InstancesChart(c);
    ModalState.activeChart = _instancesChart;   // keep the polymorphic handle current
    return _instancesChart;
}

function buildChartData(countsByFile, fileObjects) {
    return fileObjects.map(function(file) {
        return {
            fileName: file.name,
            fileId: file.id,
            count: countsByFile[file.id] || 0,
            color: file.color
        };
    });
}

// ===========================
// Instances per file chart
// ===========================


function updateEntityChart(entityName) {
    var fileObjects = ModalState.selectedFileObjects();
    var countsByFile = FilterQuery.getFilteredEntityCountsByFile(entityName);
    renderInstancesChart(buildChartData(countsByFile, fileObjects), entityName, fileObjects);
}


function updateRelationshipBarChart(relName, sourceEntity, targetEntity) {
    var fileObjects = ModalState.selectedFileObjects();
    var countsByFile = DataStore.getRelationCountsByFile(relName, sourceEntity, targetEntity);
    renderInstancesChart(buildChartData(countsByFile, fileObjects), null, fileObjects);
}


function renderInstancesChart(data, entityName, fileObjects) {
    var summaryContainer = document.getElementById('chart-summary');
    var sortControls = document.getElementById('sort-controls');
    var modalMain = document.querySelector('.modal-main');

    sortControls.style.display = 'flex';
    document.getElementById('attribute-controls').style.display = 'none';
    summaryContainer.innerHTML = '';

    _renderFilterPanel(modalMain, entityName);

    if (data.length === 0) {
        _getInstancesChart().render([], { summaryContainer: summaryContainer });
        sortControls.style.display = 'none';
        return;
    }

    // Resolve the reference (compare mode) from state
    var refFile = null;
    var refCount = 0;
    var refIsMean = false;
    var refId = ModalState.instances.referenceFileId;
    if (refId === '__MEAN__') {
        refIsMean = true;
        refCount = Chart.computeStats(data.map(function(d) { return d.count; })).mean;
    } else if (refId) {
        refFile = fileObjects.find(function(f) { return f.id === refId; }) || null;
        if (!refFile) {
            // Stale reference: clear and fall back to standard.
            ModalState.instances.referenceFileId = null;
            document.getElementById('reference-file-select').value = '';
        } else {
            var refItem = data.find(function(d) { return d.fileId === refFile.id; });
            if (refItem) refCount = refItem.count;
        }
    }

    _getInstancesChart().render(data, {
        summaryContainer: summaryContainer,
        sortType: document.getElementById('sort-type').value,
        referenceFile: refFile,
        refCount: refCount,
        refIsMean: refIsMean
    });
}

// ===========================
// Reference file dropdown (shared)
// ===========================


function populateReferenceDropdown(selectedFiles, selectId) {
    var select = document.getElementById(selectId || 'reference-file-select');
    var currentVal = ModalState.instances.referenceFileId;
    select.innerHTML = '<option value="">None (no comparison)</option>' +
        '<option value="__MEAN__">Mean (\u03BC)</option>';
    var MAX_OPT_CHARS = 25;
    selectedFiles.forEach(function(file) {
        var opt = document.createElement('option');
        opt.value = file.id;
        var truncated = file.name.length > MAX_OPT_CHARS
            ? file.name.substring(0, MAX_OPT_CHARS) + '\u2026'
            : file.name;
        opt.textContent = truncated;
        opt.title = file.name;
        opt.style.color = file.color;
        select.appendChild(opt);
    });
    if (currentVal === '__MEAN__') {
        select.value = '__MEAN__';
    } else if (currentVal && selectedFiles.find(function(f) { return f.id == currentVal; })) {
        select.value = currentVal;
    } else {
        select.value = '';
    }
}
