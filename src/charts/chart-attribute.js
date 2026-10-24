// ===========================
// AttributeChart - Attribute value distribution
// ===========================
// Three render modes, chosen by options.mode:
//   'enum'    : stacked bars per distinct enum (or bool) value
//   'numeric' : stacked histogram over computed bins
//   'compare' : diverging bars, one file's % distribution vs the rest
//
// DATA CONTRACT (caller-supplied):
//
//  mode 'enum':
//    data = {
//      sortedValues: [enumVal, ...],            // already sorted by total desc
//      totalByValue: { enumVal: total },
//      fileCounts:   { fileId: { enumVal: count } },
//      selectedFiles:[{ id, name, color }],     // stacking order
//      countStats:   { mean, sigma }            // over per-value totals
//    }
//
//  mode 'numeric':
//    data = {
//      bins:        [{ label, x0, x1 }],
//      filePerBin:  { fileId: [countPerBin...] },
//      totalPerBin: [total...],
//      selectedFiles:[{ id, name, color }],
//      valueStats:  { mean, sigma },            // over raw values (for V-lines)
//      allValuesMeta:{ n, min, max, dtype }
//    }
//
//  mode 'compare':
//    data = {
//      chartData:   [{ label, compPct, restPct, diff, compCount, restCount }],
//      compareFile: { name, color },
//      compTotal, restTotal, restFileCount
//    }
//
//  options = { summaryContainer }

class AttributeChart extends CartesianChart {
    _draw(data, options) {
        options = options || {};
        var summaryContainer = options.summaryContainer;
        if (summaryContainer) summaryContainer.innerHTML = '';

        if (data.mode === 'compare') {
            this._renderCompare(data, summaryContainer);
        } else if (data.mode === 'enum') {
            this._renderEnumCumulative(data, summaryContainer);
        } else {
            this._renderNumericCumulative(data, summaryContainer);
        }
    }

    _renderEnumCumulative(data, summaryContainer) {
        var sortedValues = data.sortedValues;
        var totalByValue = data.totalByValue;
        var fileCounts = data.fileCounts;
        var selectedFiles = data.selectedFiles;
        var countStats = data.countStats;

        var ctx = this.setupCategoryChart(sortedValues.length);
        var nGroups = sortedValues.length;
        if (nGroups === 0) { this.showNoData('No data for this attribute'); return; }

        var groupWidth = ctx.groupWidth, groupPad = ctx.groupPad, barAreaWidth = ctx.barAreaWidth;

        var maxCount = d3.max(sortedValues, function(v) { return totalByValue[v]; }) || 1;
        var plusTwoSigma = countStats.mean + 2 * countStats.sigma;
        var yMax = Math.max(maxCount, plusTwoSigma) * 1.15;

        var y = d3.scaleLinear().domain([0, Math.max(1, yMax)]).nice().range([ctx.height, 0]);
        this.drawGrid(ctx, y);

        var xAxisG = ctx.g.append('g').attr('class', 'axis x-axis')
            .attr('transform', 'translate(0,' + ctx.height + ')');
        xAxisG.append('line').attr('x1', 0).attr('x2', ctx.width).attr('y1', 0).attr('y2', 0)
            .attr('stroke', 'var(--border-color)');

        var axisTooltip = this._makeAxisTooltip();

        sortedValues.forEach(function(v, gi) {
            var groupX = gi * groupWidth + groupPad / 2;
            var labelX = groupX + barAreaWidth / 2;
            var MAX_CHARS = 12;
            var truncated = v.length > MAX_CHARS ? v.substring(0, MAX_CHARS) + '\u2026' : v;

            xAxisG.append('text')
                .attr('transform', 'translate(' + labelX + ', 10) rotate(-45)')
                .style('text-anchor', 'end').style('font-size', '11px').style('font-weight', '600')
                .style('cursor', 'default').attr('dx', '-0.5em').attr('dy', '0.5em')
                .style('fill', 'var(--text-secondary)')
                .text(truncated)
                .on('mouseover', function(event) {
                    axisTooltip.style('opacity', 1).text(v + ' (total: ' + totalByValue[v] + ')');
                    positionTooltip(axisTooltip, event, 8, -30);
                })
                .on('mousemove', function(event) { positionTooltip(axisTooltip, event, 8, -30); })
                .on('mouseout', function() { axisTooltip.style('opacity', 0); });

            var cumY = 0;
            selectedFiles.forEach(function(file) {
                var count = fileCounts[file.id][v] || 0;
                if (count > 0) {
                    ctx.g.append('rect').attr('class', 'bar')
                        .attr('x', groupX).attr('y', y(cumY + count))
                        .attr('width', barAreaWidth)
                        .attr('height', Math.max(0, y(cumY) - y(cumY + count)))
                        .attr('fill', file.color).attr('opacity', 0.85)
                        .datum({ fileId: file.id, _color: file.color });
                    cumY += count;
                }
            });

            if (totalByValue[v] > 0) {
                ctx.g.append('text').attr('class', 'bar-label')
                    .attr('x', groupX + barAreaWidth / 2).attr('y', y(totalByValue[v]) - 6)
                    .attr('text-anchor', 'middle').style('fill', 'var(--text-primary)')
                    .style('font-size', '12px').style('font-weight', '600')
                    .text(totalByValue[v]);
            }
        });

        this.drawIntegerYAxis(ctx, y, 'Count (cumulative)');
        this.drawStatLines(ctx, y, countStats.mean, countStats.sigma);

        var tooltip = d3.select('body').append('div').attr('class', 'chart-tooltip').style('opacity', 0);
        sortedValues.forEach(function(v, gi) {
            var groupX = gi * groupWidth + groupPad / 2;
            var cumY = 0;
            selectedFiles.forEach(function(file) {
                var count = fileCounts[file.id][v] || 0;
                if (count > 0) {
                    var barY = y(cumY + count);
                    var barH = Math.max(0, y(cumY) - y(cumY + count));
                    ctx.g.append('rect').attr('class', 'attr-hover')
                        .attr('x', groupX).attr('y', barY)
                        .attr('width', barAreaWidth).attr('height', barH)
                        .attr('fill', 'transparent').style('cursor', 'pointer')
                        .datum({ value: v, file: file, count: count, total: totalByValue[v] })
                        .on('mouseover', function(event, d) {
                            tooltip.transition().duration(200).style('opacity', 1);
                            tooltip.html(
                                '<div class="tooltip-label" style="font-weight:700;margin-bottom:4px;">' + d.value + ' (total: ' + d.total + ')</div>' +
                                '<div style="display:flex;align-items:center;gap:6px;margin:2px 0;">' +
                                    '<span style="width:8px;height:8px;border-radius:2px;background:' + d.file.color + ';display:inline-block;"></span>' +
                                    '<span class="tooltip-label">' + (d.file.name.length > 20 ? d.file.name.substring(0, 20) + '\u2026' : d.file.name) + ':</span>' +
                                    '<span class="tooltip-value">' + d.count + '</span></div>'
                            );
                            positionTooltip(tooltip, event);
                        })
                        .on('mousemove', function(event) { positionTooltip(tooltip, event); })
                        .on('mouseout', function() { tooltip.transition().duration(300).style('opacity', 0); });
                    cumY += count;
                }
            });
        });

        if (summaryContainer) {
            var totalInstances = 0;
            for (var v in totalByValue) totalInstances += totalByValue[v];
            summaryContainer.innerHTML =
                '<div class="stats-summary"><div class="stats-row">' +
                    '<div class="summary-item summary-item-highlight"><span class="summary-label" style="color:rgba(255,255,255,0.8);">Total:</span>' +
                        '<span class="summary-value" style="color:white;">' + totalInstances + '</span></div>' +
                    '<div class="summary-item"><span class="summary-label">Distinct values:</span>' +
                        '<span class="summary-value">' + sortedValues.length + '</span></div>' +
                    this.attrStatSummaryItems(countStats) +
                    '<div class="summary-item"><span class="summary-label">Files:</span>' +
                        '<span class="summary-value">' + selectedFiles.length + '</span></div>' +
                '</div></div>';
        }
    }

    _renderNumericCumulative(data, summaryContainer) {
        var bins = data.bins;
        var filePerBin = data.filePerBin;
        var totalPerBin = data.totalPerBin;
        var selectedFiles = data.selectedFiles;
        var valueStats = data.valueStats;
        var meta = data.allValuesMeta;

        var ctx = this.setupCategoryChart(bins.length);
        var groupWidth = ctx.groupWidth, groupPad = ctx.groupPad, barAreaWidth = ctx.barAreaWidth;

        var maxCount = d3.max(totalPerBin) || 1;
        var y = d3.scaleLinear().domain([0, Math.max(1, maxCount * 1.15)]).nice().range([ctx.height, 0]);
        this.drawGrid(ctx, y);

        var xAxisG = ctx.g.append('g').attr('class', 'axis x-axis')
            .attr('transform', 'translate(0,' + ctx.height + ')');
        xAxisG.append('line').attr('x1', 0).attr('x2', ctx.width).attr('y1', 0).attr('y2', 0)
            .attr('stroke', 'var(--border-color)');

        bins.forEach(function(bin, gi) {
            var groupX = gi * groupWidth + groupPad / 2;
            var labelX = groupX + barAreaWidth / 2;
            var lbl = bin.label;
            if (lbl.length > 12) lbl = lbl.substring(0, 12) + '\u2026';
            xAxisG.append('text')
                .attr('transform', 'translate(' + labelX + ', 10) rotate(-45)')
                .style('text-anchor', 'end').style('font-size', '11px').style('font-weight', '600')
                .attr('dx', '-0.5em').attr('dy', '0.5em')
                .style('fill', 'var(--text-secondary)')
                .text(lbl);

            var cumY = 0;
            selectedFiles.forEach(function(file) {
                var count = filePerBin[file.id] ? filePerBin[file.id][gi] : 0;
                if (count > 0) {
                    ctx.g.append('rect').attr('class', 'bar')
                        .attr('x', groupX).attr('y', y(cumY + count))
                        .attr('width', barAreaWidth)
                        .attr('height', Math.max(0, y(cumY) - y(cumY + count)))
                        .attr('fill', file.color).attr('opacity', 0.85)
                        .datum({ fileId: file.id, _color: file.color });
                    cumY += count;
                }
            });

            if (totalPerBin[gi] > 0) {
                ctx.g.append('text').attr('class', 'bar-label')
                    .attr('x', groupX + barAreaWidth / 2).attr('y', y(totalPerBin[gi]) - 6)
                    .attr('text-anchor', 'middle').style('fill', 'var(--text-primary)')
                    .style('font-size', '12px').style('font-weight', '600')
                    .text(totalPerBin[gi]);
            }
        });

        this.drawIntegerYAxis(ctx, y, 'Count (cumulative)');
        this.drawVStatLines(ctx, bins, groupWidth, groupPad, valueStats.mean, valueStats.sigma);

        var tooltip = d3.select('body').append('div').attr('class', 'chart-tooltip').style('opacity', 0);
        bins.forEach(function(bin, gi) {
            var groupX = gi * groupWidth + groupPad / 2;
            var cumY = 0;
            selectedFiles.forEach(function(file) {
                var count = filePerBin[file.id] ? filePerBin[file.id][gi] : 0;
                if (count > 0) {
                    var barY = y(cumY + count);
                    var barH = Math.max(0, y(cumY) - y(cumY + count));
                    ctx.g.append('rect').attr('class', 'attr-hover')
                        .attr('x', groupX).attr('y', barY)
                        .attr('width', barAreaWidth).attr('height', barH)
                        .attr('fill', 'transparent').style('cursor', 'pointer')
                        .datum({ bin: bin, file: file, count: count, total: totalPerBin[gi] })
                        .on('mouseover', function(event, d) {
                            tooltip.transition().duration(200).style('opacity', 1);
                            tooltip.html(
                                '<div class="tooltip-label" style="font-weight:700;margin-bottom:4px;">' + d.bin.label + ' (total: ' + d.total + ')</div>' +
                                '<div style="display:flex;align-items:center;gap:6px;margin:2px 0;">' +
                                    '<span style="width:8px;height:8px;border-radius:2px;background:' + d.file.color + ';display:inline-block;"></span>' +
                                    '<span class="tooltip-label">' + (d.file.name.length > 20 ? d.file.name.substring(0, 20) + '\u2026' : d.file.name) + ':</span>' +
                                    '<span class="tooltip-value">' + d.count + '</span></div>'
                            );
                            positionTooltip(tooltip, event);
                        })
                        .on('mousemove', function(event) { positionTooltip(tooltip, event); })
                        .on('mouseout', function() { tooltip.transition().duration(300).style('opacity', 0); });
                    cumY += count;
                }
            });
        });

        if (summaryContainer) {
            var dtype = meta.dtype;
            var minVal = meta.min, maxVal = meta.max;
            summaryContainer.innerHTML =
                '<div class="stats-summary"><div class="stats-row">' +
                    '<div class="summary-item summary-item-highlight"><span class="summary-label" style="color:rgba(255,255,255,0.8);">n:</span>' +
                        '<span class="summary-value" style="color:white;">' + meta.n + '</span></div>' +
                    '<div class="summary-item"><span class="summary-label">Min:</span><span class="summary-value">' + (dtype === 'float' ? minVal.toFixed(2) : minVal) + '</span></div>' +
                    '<div class="summary-item"><span class="summary-label">Max:</span><span class="summary-value">' + (dtype === 'float' ? maxVal.toFixed(2) : maxVal) + '</span></div>' +
                    this.attrStatSummaryItems(valueStats) +
                    '<div class="summary-item"><span class="summary-label">Bins:</span>' +
                        '<span class="summary-value">' + bins.length + '</span></div>' +
                '</div></div>';
        }
    }

    _renderCompare(data, summaryContainer) {
        var chartData = data.chartData;
        var compareFile = data.compareFile;

        var ctx = this.setupCategoryChart(chartData.length);
        var groupWidth = ctx.groupWidth, groupPad = ctx.groupPad, barAreaWidth = ctx.barAreaWidth;

        var maxAbsDiff = d3.max(chartData, function(d) { return Math.abs(d.diff); }) || 1;
        var yExtent = maxAbsDiff * 1.3;

        var y = d3.scaleLinear().domain([-yExtent, yExtent]).nice().range([ctx.height, 0]);
        var zeroY = y(0);

        this.drawGrid(ctx, y, 10);

        ctx.g.append('line')
            .attr('x1', 0).attr('x2', ctx.width)
            .attr('y1', zeroY).attr('y2', zeroY)
            .attr('stroke', 'var(--text-secondary)').attr('stroke-width', 2).attr('opacity', 0.6);

        var xAxisG = ctx.g.append('g').attr('class', 'axis x-axis')
            .attr('transform', 'translate(0,' + ctx.height + ')');
        xAxisG.append('line').attr('x1', 0).attr('x2', ctx.width).attr('y1', 0).attr('y2', 0)
            .attr('stroke', 'var(--border-color)');

        chartData.forEach(function(d, gi) {
            var groupX = gi * groupWidth + groupPad / 2;
            var labelX = groupX + barAreaWidth / 2;
            var lbl = d.label.length > 12 ? d.label.substring(0, 12) + '\u2026' : d.label;
            xAxisG.append('text')
                .attr('transform', 'translate(' + labelX + ', 10) rotate(-45)')
                .style('text-anchor', 'end').style('font-size', '11px').style('font-weight', '600')
                .attr('dx', '-0.5em').attr('dy', '0.5em').style('fill', 'var(--text-secondary)')
                .text(lbl);

            var barY = d.diff >= 0 ? y(d.diff) : zeroY;
            var barH = Math.max(0, Math.abs(y(d.diff) - zeroY));
            var barColor = d.diff >= 0 ? compareFile.color : '#f87171';

            ctx.g.append('rect').attr('class', 'bar')
                .attr('x', groupX).attr('y', barY)
                .attr('width', barAreaWidth)
                .attr('height', barH)
                .attr('fill', barColor).attr('opacity', d.diff >= 0 ? 0.9 : 0.7);

            if (Math.abs(d.diff) > 0.1) {
                ctx.g.append('text').attr('class', 'bar-label')
                    .attr('x', groupX + barAreaWidth / 2)
                    .attr('y', d.diff >= 0 ? y(d.diff) - 6 : y(d.diff) + 14)
                    .attr('text-anchor', 'middle')
                    .style('fill', d.diff >= 0 ? '#34d399' : '#f87171')
                    .style('font-size', '11px').style('font-weight', '600')
                    .text((d.diff > 0 ? '+' : '') + d.diff.toFixed(1) + 'pp');
            }
        });

        ctx.g.append('g').attr('class', 'axis y-axis')
            .call(d3.axisLeft(y).ticks(10).tickFormat(function(d) { return (d > 0 ? '+' : '') + d.toFixed(0) + 'pp'; }))
            .selectAll('text').style('font-size', '12px');
        ctx.g.append('text').attr('transform', 'rotate(-90)')
            .attr('y', -65).attr('x', -ctx.height / 2).attr('text-anchor', 'middle')
            .style('fill', 'var(--text-secondary)').style('font-size', '13px').style('font-weight', '500')
            .text('% Difference (pp)');

        var tooltip = d3.select('body').append('div').attr('class', 'chart-tooltip').style('opacity', 0);
        chartData.forEach(function(d, gi) {
            var groupX = gi * groupWidth + groupPad / 2;
            ctx.g.append('rect')
                .attr('x', groupX).attr('y', 0).attr('width', barAreaWidth).attr('height', ctx.height)
                .attr('fill', 'transparent').style('cursor', 'pointer')
                .on('mouseover', function(event) {
                    tooltip.transition().duration(200).style('opacity', 1);
                    tooltip.html(
                        '<div class="tooltip-label" style="font-weight:700;margin-bottom:4px;">' + d.label + '</div>' +
                        '<div style="display:flex;align-items:center;gap:6px;margin:2px 0;">' +
                            '<span style="width:8px;height:8px;border-radius:2px;background:' + compareFile.color + ';display:inline-block;"></span>' +
                            '<span class="tooltip-label">' + (compareFile.name.length > 18 ? compareFile.name.substring(0, 18) + '\u2026' : compareFile.name) + ':</span>' +
                            '<span class="tooltip-value">' + d.compPct.toFixed(1) + '% (' + d.compCount + ')</span></div>' +
                        '<div style="display:flex;align-items:center;gap:6px;margin:2px 0;">' +
                            '<span style="width:8px;height:8px;border-radius:2px;background:var(--text-muted);display:inline-block;opacity:0.5;"></span>' +
                            '<span class="tooltip-label">Rest:</span>' +
                            '<span class="tooltip-value">' + d.restPct.toFixed(1) + '% (' + d.restCount + ')</span></div>' +
                        '<div style="margin-top:4px;font-weight:600;color:' + (d.diff >= 0 ? '#34d399' : '#f87171') + ';">' +
                            'Diff: ' + (d.diff > 0 ? '+' : '') + d.diff.toFixed(1) + ' pp</div>'
                    );
                    positionTooltip(tooltip, event);
                })
                .on('mousemove', function(event) { positionTooltip(tooltip, event); })
                .on('mouseout', function() { tooltip.transition().duration(300).style('opacity', 0); });
        });

        if (summaryContainer) {
            var compTotal = data.compTotal, restTotal = data.restTotal, restFileCount = data.restFileCount;
            var compNameShort = compareFile.name.length > 15 ? compareFile.name.substring(0, 15) + '\u2026' : compareFile.name;
            var maxDiffItem = chartData.reduce(function(max, d) { return Math.abs(d.diff) > Math.abs(max.diff) ? d : max; }, chartData[0]);
            summaryContainer.innerHTML =
                '<div class="stats-summary"><div class="stats-row">' +
                    '<div class="summary-item summary-item-highlight" title="' + compareFile.name + '">' +
                        '<span class="summary-label" style="color:rgba(255,255,255,0.8);">Compare:</span>' +
                        '<span class="summary-value" style="color:white;">' + compNameShort + ' (' + compTotal + ')</span></div>' +
                    '<div class="summary-item"><span class="summary-label">Rest:</span>' +
                        '<span class="summary-value">' + restFileCount + ' files (' + restTotal + ')</span></div>' +
                    '<div class="summary-item"><span class="summary-label">Categories:</span>' +
                        '<span class="summary-value">' + chartData.length + '</span></div>' +
                    '<div class="summary-item"><span class="summary-label">Max diff:</span>' +
                        '<span class="summary-value" style="color:' + (maxDiffItem.diff >= 0 ? '#34d399' : '#f87171') + ';">' +
                        (maxDiffItem.diff > 0 ? '+' : '') + maxDiffItem.diff.toFixed(1) + 'pp (' + maxDiffItem.label + ')</span></div>' +
                '</div></div>';
        }
    }

    // Shared body-level axis tooltip used by enum mode.
    _makeAxisTooltip() {
        return d3.select('body').append('div').attr('class', 'axis-label-tooltip')
            .style('position', 'absolute').style('background', 'var(--bg-secondary)')
            .style('border', '1px solid var(--border-color)').style('border-radius', '6px')
            .style('padding', '6px 10px').style('font-size', '0.8rem').style('font-weight', '600')
            .style('pointer-events', 'none').style('z-index', '1002').style('box-shadow', 'var(--shadow-md)')
            .style('opacity', 0).style('white-space', 'nowrap');
    }

    get supportsLassoSelection() {
        return !!this._lastData && this._lastData.mode !== 'compare';
    }

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
            selector: '.bar',          // visible per-file segments (carry fileId)
            clickSelector: '.attr-hover', // full-segment transparent hit rects
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
            .attr('opacity', selected ? 1 : 0.85);
    }
}


// ===========================
// Attribute chart — data layer + modal glue
// ===========================

var _attributeChart = null;
function _getAttributeChart() {
    var c = document.getElementById('chart-container');
    if (!_attributeChart || _attributeChart.container !== c) _attributeChart = new AttributeChart(c);
    ModalState.activeChart = _attributeChart;   // keep the polymorphic handle current
    return _attributeChart;
}

function populateAttributeDropdown() {
    var select = document.getElementById('attribute-select');
    select.innerHTML = '';
    var item = ModalState.item;
    if (!item || item.type !== 'entity') return;

    var attrs = SchemaStore.getPlottableAttributes(item.name);
    if (attrs.length === 0) {
        var opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'No plottable attributes';
        select.appendChild(opt);
        return;
    }

    attrs.forEach(function(attr) {
        var opt = document.createElement('option');
        opt.value = attr.name;
        opt.textContent = attr.name + ' (' + attr.dtype + ')';
        select.appendChild(opt);
    });

    var prop = ModalState.attribute.prop;
    if (prop && attrs.find(function(a) { return a.name === prop.name; })) {
        select.value = prop.name;
    } else {
        ModalState.attribute.prop = attrs[0];
        select.value = attrs[0].name;
    }
}


function populateAttrCompareDropdown() {
    var select = document.getElementById('attr-compare-select');
    var selectedFiles = ModalState.selectedFileObjects();
    select.innerHTML = '<option value="">None (show all files)</option>';
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
    var cmpId = ModalState.attribute.compareFileId;
    if (cmpId && selectedFiles.find(function(f) { return f.id == cmpId; })) {
        select.value = cmpId;
    } else {
        select.value = '';
    }
}


function renderAttributeChart() {
    var container = document.getElementById('chart-container');
    var summaryContainer = document.getElementById('chart-summary');
    var modalMain = document.querySelector('.modal-main');
    var chart = _getAttributeChart();

    document.getElementById('sort-controls').style.display = 'none';
    document.getElementById('attribute-controls').style.display = 'flex';
    summaryContainer.innerHTML = '';

    var item = ModalState.item;
    if (!item || item.type !== 'entity') {
        chart.showNoData('Attribute charts are only available for entities',
            'Click on an entity in the ER diagram to use this view');
        return;
    }

    _renderFilterPanel(modalMain, item.name);

    populateAttributeDropdown();
    populateAttrCompareDropdown();

    var prop = ModalState.attribute.prop;
    if (!prop) {
        chart.showNoData('No plottable attributes',
            'This entity has no enum, bool, int, or float properties');
        return;
    }

    // Show/hide bin size input based on dtype
    var binSizeGroup = document.getElementById('bin-size-group');
    binSizeGroup.style.display = (prop.dtype === 'float' || prop.dtype === 'int') ? 'flex' : 'none';

    var fileIds = ModalState.selectedFileIds();
    if (fileIds.length === 0) {
        chart.showNoData('No files selected', 'Select files from the left panel to see data');
        return;
    }
    var fileObjects = ModalState.selectedFileObjects();

    var data;
    if (ModalState.attribute.compareFileId) {
        data = _buildAttrCompareData(item.name, prop, fileIds, fileObjects);
    } else if (SchemaStore.isCategorical(prop)) {
        data = _buildEnumCumulativeData(item.name, prop, fileIds, fileObjects);
    } else {
        data = _buildNumericCumulativeData(item.name, prop, fileIds, fileObjects);
    }

    if (!data) return; // builder already rendered a no-data placeholder
    chart.render(data, { summaryContainer: summaryContainer });
}


function _buildEnumCumulativeData(entityName, prop, fileIds, fileObjects) {
    var propName = prop.name;
    var enumValues = SchemaStore.getCategoryValues(prop);

    var fileCounts = {};
    var totalByValue = {};
    enumValues.forEach(function(v) { totalByValue[v] = 0; });

    fileIds.forEach(function(fid) {
        var dist = FilterQuery.getFilteredAttributeDistribution(entityName, propName, fid);
        fileCounts[fid] = {};
        enumValues.forEach(function(v) {
            var c = dist[v] || 0;
            fileCounts[fid][v] = c;
            totalByValue[v] = (totalByValue[v] || 0) + c;
        });
    });

    // Bools keep a fixed true/false order so bars line up when switching attributes
    var sortedValues = prop.dtype === 'bool'
        ? enumValues
        : enumValues.slice().sort(function(a, b) { return totalByValue[b] - totalByValue[a]; });
    var countStats = Chart.computeStats(sortedValues.map(function(v) { return totalByValue[v]; }));

    return {
        mode: 'enum',
        sortedValues: sortedValues,
        totalByValue: totalByValue,
        fileCounts: fileCounts,
        selectedFiles: fileObjects,
        countStats: countStats
    };
}


function _buildNumericCumulativeData(entityName, prop, fileIds, fileObjects) {
    var propName = prop.name;
    var dtype = prop.dtype;

    var allValues = FilterQuery.getFilteredNumericValues(entityName, propName, fileIds);
    if (allValues.length === 0) {
        _getAttributeChart().showNoData('No numeric data for "' + propName + '"');
        return null;
    }

    var bins = BinningHelpers.computeNumericBins(allValues, dtype, ModalState.attribute.binSize);

    var filePerBin = {};
    fileIds.forEach(function(fid) {
        var values = FilterQuery.getFilteredNumericValuesForFile(entityName, propName, fid);
        filePerBin[fid] = BinningHelpers.binValues(values, bins);
    });

    var totalPerBin = new Array(bins.length).fill(0);
    bins.forEach(function(bin, bi) {
        fileObjects.forEach(function(f) {
            totalPerBin[bi] += (filePerBin[f.id] ? filePerBin[f.id][bi] : 0);
        });
    });

    var valueStats = Chart.computeStats(allValues);

    return {
        mode: 'numeric',
        bins: bins,
        filePerBin: filePerBin,
        totalPerBin: totalPerBin,
        selectedFiles: fileObjects,
        valueStats: valueStats,
        allValuesMeta: {
            n: allValues.length,
            min: d3.min(allValues),
            max: d3.max(allValues),
            dtype: dtype
        }
    };
}


function _buildAttrCompareData(entityName, prop, fileIds, fileObjects) {
    var propName = prop.name;
    var dtype = prop.dtype;
    var isCategorical = SchemaStore.isCategorical(prop);
    var compareId = ModalState.attribute.compareFileId;

    var compareFile = fileObjects.find(function(f) { return f.id == compareId; });
    if (!compareFile) {
        ModalState.attribute.compareFileId = null;
        document.getElementById('attr-compare-select').value = '';
        renderAttributeChart();
        return null;
    }

    var otherFileIds = fileIds.filter(function(fid) { return fid != compareId; });

    var categories;
    if (isCategorical) {
        categories = SchemaStore.getCategoryValues(prop);
    } else {
        var allValues = FilterQuery.getFilteredNumericValues(entityName, propName, fileIds);
        if (allValues.length === 0) {
            _getAttributeChart().showNoData('No numeric data for "' + propName + '"');
            return null;
        }
        categories = BinningHelpers.computeNumericBins(allValues, dtype, ModalState.attribute.binSize);
    }

    var compCounts, restCounts, compTotal = 0, restTotal = 0;

    if (isCategorical) {
        compCounts = {};
        restCounts = {};
        categories.forEach(function(v) { compCounts[v] = 0; restCounts[v] = 0; });
        var compDist = FilterQuery.getFilteredAttributeDistribution(entityName, propName, compareId);
        categories.forEach(function(v) { compCounts[v] = compDist[v] || 0; compTotal += compCounts[v]; });
        otherFileIds.forEach(function(fid) {
            var dist = FilterQuery.getFilteredAttributeDistribution(entityName, propName, fid);
            categories.forEach(function(v) { var c = dist[v] || 0; restCounts[v] += c; restTotal += c; });
        });
    } else {
        var compVals = FilterQuery.getFilteredNumericValuesForFile(entityName, propName, compareId);
        compCounts = BinningHelpers.binValues(compVals, categories);
        compTotal = compVals.length;
        restCounts = new Array(categories.length).fill(0);
        otherFileIds.forEach(function(fid) {
            var vals = FilterQuery.getFilteredNumericValuesForFile(entityName, propName, fid);
            var binned = BinningHelpers.binValues(vals, categories);
            for (var b = 0; b < categories.length; b++) {
                restCounts[b] += binned[b];
                restTotal += binned[b];
            }
        });
    }

    var chartData = [];
    var catLabels = isCategorical ? categories : categories.map(function(c) { return c.label; });
    catLabels.forEach(function(label, i) {
        var compC = isCategorical ? compCounts[label] : compCounts[i];
        var restC = isCategorical ? restCounts[label] : restCounts[i];
        var compPct = compTotal > 0 ? (compC / compTotal * 100) : 0;
        var restPct = restTotal > 0 ? (restC / restTotal * 100) : 0;
        chartData.push({
            label: typeof label === 'object' ? label.label : label,
            compPct: compPct,
            restPct: restPct,
            diff: compPct - restPct,
            compCount: compC,
            restCount: restC
        });
    });

    return {
        mode: 'compare',
        chartData: chartData,
        compareFile: compareFile,
        compTotal: compTotal,
        restTotal: restTotal,
        restFileCount: otherFileIds.length
    };
}
