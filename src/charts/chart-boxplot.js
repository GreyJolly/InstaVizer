// ===========================
// BoxplotChart - Distribution comparison (box-and-whisker per X category)
// ===========================

// DATA CONTRACT (caller-supplied):
//   data = {
//     groups: [{ label, values:[y...], x0?, x1? }],  // already binned/grouped, non-empty
//     xLabel, yLabel,
//     modeLabel                                       // e.g. "Self" or "rel (A → B)"
//   }
//   options = { summaryContainer }


class BoxplotChart extends CartesianChart {
    _draw(data, options) {
        options = options || {};
        var summaryContainer = options.summaryContainer;
        if (summaryContainer) summaryContainer.innerHTML = '';

        var groups = data.groups;
        var nGroups = groups.length;
        var ctx = this.setupCategoryChart(nGroups);
        var groupWidth = ctx.groupWidth, groupPad = ctx.groupPad, barAreaWidth = ctx.barAreaWidth;

        var self = this;
        var boxData = groups.map(function(g) {
            return { label: g.label, stats: self._computeBoxStats(g.values), values: g.values };
        });

        var allY = [];
        boxData.forEach(function(b) {
            if (b.stats) { allY.push(b.stats.min); allY.push(b.stats.max); }
        });
        if (allY.length === 0) { this.showNoData('No data'); return; }

        var yMin = d3.min(allY), yMax = d3.max(allY);
        var yPad = (yMax - yMin) * 0.08 || 1;
        var y = d3.scaleLinear().domain([yMin - yPad, yMax + yPad]).nice().range([ctx.height, 0]);

        this.drawGrid(ctx, y);

        var xAxisG = ctx.g.append('g').attr('class', 'axis x-axis')
            .attr('transform', 'translate(0,' + ctx.height + ')');
        xAxisG.append('line').attr('x1', 0).attr('x2', ctx.width)
            .attr('y1', 0).attr('y2', 0).attr('stroke', 'var(--border-color)');

        var axisTooltip = d3.select('body').append('div').attr('class', 'axis-label-tooltip')
            .style('position', 'absolute').style('background', 'var(--bg-secondary)')
            .style('border', '1px solid var(--border-color)').style('border-radius', '6px')
            .style('padding', '6px 10px').style('font-size', '0.8rem').style('font-weight', '600')
            .style('pointer-events', 'none').style('z-index', '1002').style('box-shadow', 'var(--shadow-md)')
            .style('opacity', 0).style('white-space', 'nowrap');

        boxData.forEach(function(d, gi) {
            var groupX = gi * groupWidth + groupPad / 2;
            var labelX = groupX + barAreaWidth / 2;
            var MAX_CHARS = 12;
            var truncated = d.label.length > MAX_CHARS ? d.label.substring(0, MAX_CHARS) + '\u2026' : d.label;

            xAxisG.append('text')
                .attr('transform', 'translate(' + labelX + ', 10) rotate(-45)')
                .style('text-anchor', 'end').style('font-size', '11px').style('font-weight', '600')
                .style('cursor', 'default').attr('dx', '-0.5em').attr('dy', '0.5em')
                .style('fill', 'var(--text-secondary)')
                .text(truncated)
                .on('mouseover', function(event) {
                    axisTooltip.style('opacity', 1).text(d.label + ' (n=' + d.values.length + ')');
                    positionTooltip(axisTooltip, event, 8, -30);
                })
                .on('mousemove', function(event) { positionTooltip(axisTooltip, event, 8, -30); })
                .on('mouseout', function() { axisTooltip.style('opacity', 0); });
        });

        ctx.g.append('g').attr('class', 'axis y-axis')
            .call(d3.axisLeft(y).ticks(8))
            .selectAll('text').style('font-size', '12px');
        ctx.g.append('text')
            .attr('transform', 'rotate(-90)').attr('y', -65).attr('x', -ctx.height / 2)
            .attr('text-anchor', 'middle').style('fill', 'var(--text-secondary)')
            .style('font-size', '13px').style('font-weight', '500')
            .text(data.yLabel || 'Value');

        ctx.g.append('text')
            .attr('x', ctx.width / 2).attr('y', ctx.height + 140)
            .attr('text-anchor', 'middle').style('fill', 'var(--text-secondary)')
            .style('font-size', '13px').style('font-weight', '500')
            .text(data.xLabel || 'Category');

        var tooltip = d3.select('body').append('div').attr('class', 'chart-tooltip').style('opacity', 0);
        var BOX_COLOR = 'var(--accent-primary, #60a5fa)';
        var MEDIAN_COLOR = '#fbbf24';
        var MEAN_COLOR = '#f472b6';

        boxData.forEach(function(d, gi) {
            if (!d.stats) return;
            var s = d.stats;
            var groupX = gi * groupWidth + groupPad / 2;
            var cx = groupX + barAreaWidth / 2;
            var boxW = barAreaWidth * 0.7;
            var boxX = cx - boxW / 2;

            ctx.g.append('line').attr('class', 'boxplot-whisker')
                .attr('x1', cx).attr('x2', cx)
                .attr('y1', y(s.whiskerHigh)).attr('y2', y(s.whiskerLow))
                .attr('stroke', 'var(--text-secondary)').attr('stroke-width', 1.5);

            var capW = boxW * 0.5;
            ctx.g.append('line').attr('class', 'boxplot-cap')
                .attr('x1', cx - capW / 2).attr('x2', cx + capW / 2)
                .attr('y1', y(s.whiskerHigh)).attr('y2', y(s.whiskerHigh))
                .attr('stroke', 'var(--text-secondary)').attr('stroke-width', 1.5);
            ctx.g.append('line').attr('class', 'boxplot-cap')
                .attr('x1', cx - capW / 2).attr('x2', cx + capW / 2)
                .attr('y1', y(s.whiskerLow)).attr('y2', y(s.whiskerLow))
                .attr('stroke', 'var(--text-secondary)').attr('stroke-width', 1.5);

            ctx.g.append('rect').attr('class', 'boxplot-box')
                .attr('x', boxX).attr('y', y(s.q3))
                .attr('width', boxW)
                .attr('height', Math.max(0, y(s.q1) - y(s.q3)))
                .attr('fill', BOX_COLOR).attr('fill-opacity', 0.25)
                .attr('stroke', BOX_COLOR).attr('stroke-width', 2);

            ctx.g.append('line').attr('class', 'boxplot-median')
                .attr('x1', boxX).attr('x2', boxX + boxW)
                .attr('y1', y(s.median)).attr('y2', y(s.median))
                .attr('stroke', MEDIAN_COLOR).attr('stroke-width', 2.5);

            var my = y(s.mean);
            var dSize = 4;
            ctx.g.append('path').attr('class', 'boxplot-mean')
                .attr('d', 'M' + cx + ',' + (my - dSize) +
                    ' L' + (cx + dSize) + ',' + my +
                    ' L' + cx + ',' + (my + dSize) +
                    ' L' + (cx - dSize) + ',' + my + ' Z')
                .attr('fill', MEAN_COLOR).attr('stroke', MEAN_COLOR).attr('stroke-width', 1);

            s.outliers.forEach(function(ov) {
                ctx.g.append('circle').attr('class', 'boxplot-outlier')
                    .attr('cx', cx).attr('cy', y(ov)).attr('r', 3)
                    .attr('fill', 'none').attr('stroke', 'var(--text-muted)')
                    .attr('stroke-width', 1.2);
            });

            ctx.g.append('rect')
                .attr('x', groupX).attr('y', 0)
                .attr('width', barAreaWidth).attr('height', ctx.height)
                .attr('fill', 'transparent').style('cursor', 'pointer')
                .datum(d)
                .on('mouseover', function(event, dd) {
                    var ss = dd.stats;
                    tooltip.transition().duration(200).style('opacity', 1);
                    tooltip.html(
                        '<div class="tooltip-label" style="font-weight:700;margin-bottom:4px;">' + dd.label + '</div>' +
                        '<div class="tooltip-value">n = ' + ss.n + '</div>' +
                        '<div style="display:grid;grid-template-columns:auto auto;gap:2px 10px;margin-top:4px;">' +
                            '<span class="tooltip-label">Max:</span><span class="tooltip-value">' + ss.max.toFixed(2) + '</span>' +
                            '<span class="tooltip-label">Q3:</span><span class="tooltip-value">' + ss.q3.toFixed(2) + '</span>' +
                            '<span class="tooltip-label" style="color:' + MEDIAN_COLOR + ';">Median:</span><span class="tooltip-value">' + ss.median.toFixed(2) + '</span>' +
                            '<span class="tooltip-label" style="color:' + MEAN_COLOR + ';">Mean:</span><span class="tooltip-value">' + ss.mean.toFixed(2) + '</span>' +
                            '<span class="tooltip-label">Q1:</span><span class="tooltip-value">' + ss.q1.toFixed(2) + '</span>' +
                            '<span class="tooltip-label">Min:</span><span class="tooltip-value">' + ss.min.toFixed(2) + '</span>' +
                            '<span class="tooltip-label">IQR:</span><span class="tooltip-value">' + ss.iqr.toFixed(2) + '</span>' +
                            '<span class="tooltip-label">Outliers:</span><span class="tooltip-value">' + ss.outliers.length + '</span>' +
                        '</div>'
                    );
                    positionTooltip(tooltip, event);
                })
                .on('mousemove', function(event) { positionTooltip(tooltip, event); })
                .on('mouseout', function() { tooltip.transition().duration(300).style('opacity', 0); });
        });

        if (summaryContainer) {
            var totalN = boxData.reduce(function(s, b) { return s + (b.stats ? b.stats.n : 0); }, 0);
            var allValues = [];
            boxData.forEach(function(b) { if (b.values) allValues = allValues.concat(b.values); });
            var globalStats = this.computeStats(allValues);
            var globalMin = d3.min(allValues);
            var globalMax = d3.max(allValues);

            summaryContainer.innerHTML =
                '<div class="stats-summary"><div class="stats-row">' +
                    '<div class="summary-item summary-item-highlight"><span class="summary-label" style="color:rgba(255,255,255,0.8);">n:</span>' +
                        '<span class="summary-value" style="color:white;">' + totalN + '</span></div>' +
                    '<div class="summary-item"><span class="summary-label">Groups:</span>' +
                        '<span class="summary-value">' + boxData.length + '</span></div>' +
                    '<div class="summary-item"><span class="summary-label">Y range:</span>' +
                        '<span class="summary-value">' + globalMin.toFixed(2) + ' \u2013 ' + globalMax.toFixed(2) + '</span></div>' +
                    '<div class="summary-item"><div class="summary-dot" style="background:#fbbf24;"></div>' +
                        '<span class="summary-label">Median</span></div>' +
                    '<div class="summary-item"><div class="summary-dot" style="background:#f472b6;"></div>' +
                        '<span class="summary-label">Mean</span></div>' +
                    '<div class="summary-item"><span class="summary-label">\u03BC(Y):</span>' +
                        '<span class="summary-value">' + globalStats.mean.toFixed(2) + '</span></div>' +
                    '<div class="summary-item"><span class="summary-label">\u03C3(Y):</span>' +
                        '<span class="summary-value">' + globalStats.sigma.toFixed(2) + '</span></div>' +
                    '<div class="summary-item"><span class="summary-label">Mode:</span>' +
                        '<span class="summary-value">' + data.modeLabel + '</span></div>' +
                '</div></div>';
        }
    }

    _computeBoxStats(values) {
        if (values.length === 0) return null;
        var sorted = values.slice().sort(function(a, b) { return a - b; });
        var n = sorted.length;

        function quantile(arr, q) {
            var pos = (arr.length - 1) * q;
            var lo = Math.floor(pos);
            var hi = Math.ceil(pos);
            if (lo === hi) return arr[lo];
            return arr[lo] * (hi - pos) + arr[hi] * (pos - lo);
        }

        var q1 = quantile(sorted, 0.25);
        var median = quantile(sorted, 0.5);
        var q3 = quantile(sorted, 0.75);
        var iqr = q3 - q1;
        var whiskerLow = q1 - 1.5 * iqr;
        var whiskerHigh = q3 + 1.5 * iqr;

        var actualLow = sorted[0];
        var actualHigh = sorted[n - 1];
        for (var i = 0; i < n; i++) {
            if (sorted[i] >= whiskerLow) { actualLow = sorted[i]; break; }
        }
        for (var j = n - 1; j >= 0; j--) {
            if (sorted[j] <= whiskerHigh) { actualHigh = sorted[j]; break; }
        }

        var outliers = [];
        for (var k = 0; k < n; k++) {
            if (sorted[k] < actualLow || sorted[k] > actualHigh) outliers.push(sorted[k]);
        }

        var mean = values.reduce(function(s, v) { return s + v; }, 0) / n;

        return {
            min: sorted[0], max: sorted[n - 1],
            q1: q1, median: median, q3: q3, iqr: iqr,
            whiskerLow: actualLow, whiskerHigh: actualHigh,
            outliers: outliers, mean: mean, n: n
        };
    }
}


// ===========================
// Boxplot chart — data layer + modal glue
// ===========================
// Builds grouped distribution data and feeds it to the BoxplotChart above.
var _boxplotChart = null;
function _getBoxplotChart() {
    var c = document.getElementById('chart-container');
    if (!_boxplotChart || _boxplotChart.container !== c) _boxplotChart = new BoxplotChart(c);
    ModalState.activeChart = _boxplotChart;   // keep the polymorphic handle current
    return _boxplotChart;
}

// ===========================
// Generic data helpers
// ===========================


function _getBoxplotRelations() {
    var item = ModalState.item;
    if (!item) return [];
    if (item.type === 'entity') {
        return SchemaStore.getAllRelationsForEntity(item.name);
    } else if (item.type === 'relationship') {
        return [{
            relation: item.name,
            sourceEntity: item.sourceEntity,
            targetEntity: item.targetEntity,
            otherEntity: item.targetEntity
        }];
    }
    return [];
}


function populateBoxplotRelationDropdown() {
    var select = document.getElementById('boxplot-relation-select');
    select.innerHTML = '';
    var item = ModalState.item;

    if (item && item.type === 'entity') {
        var selfOpt = document.createElement('option');
        selfOpt.value = '__self__';
        selfOpt.textContent = item.name + ' (self)';
        select.appendChild(selfOpt);

        var rels = _getBoxplotRelations();
        rels.forEach(function(rel) {
            var opt = document.createElement('option');
            opt.value = rel.relation + ':' + rel.sourceEntity + ':' + rel.targetEntity;
            opt.textContent = rel.relation + ' \u2194 ' + rel.otherEntity;
            select.appendChild(opt);
        });

        var relation = ModalState.boxplot.relation;
        if (relation) {
            var key = relation.relation + ':' + relation.sourceEntity + ':' + relation.targetEntity;
            if (select.querySelector('option[value="' + key + '"]')) {
                select.value = key;
            } else {
                ModalState.boxplot.relation = null;
                select.value = '__self__';
            }
        } else {
            select.value = '__self__';
        }
    } else if (item && item.type === 'relationship') {
        var rel = {
            relation: item.name,
            sourceEntity: item.sourceEntity,
            targetEntity: item.targetEntity
        };
        var opt = document.createElement('option');
        var key2 = rel.relation + ':' + rel.sourceEntity + ':' + rel.targetEntity;
        opt.value = key2;
        opt.textContent = rel.sourceEntity + ' \u2194 ' + rel.targetEntity;
        select.appendChild(opt);
        select.value = key2;
        rel.otherEntity = rel.targetEntity;
        ModalState.boxplot.relation = rel;
    }
}


function _parseRelationKey(key) {
    var parts = key.split(':');
    if (parts.length < 3) return null;
    return { relation: parts[0], sourceEntity: parts[1], targetEntity: parts[2] };
}


function _getBoxplotEntities() {
    var relation = ModalState.boxplot.relation;
    if (!relation) return [];
    var src = relation.sourceEntity;
    var tgt = relation.targetEntity;
    if (src === tgt) return [src];
    return [src, tgt];
}


function populateBoxplotEntitySwap() {
    var xLabel = document.getElementById('boxplot-x-entity-label');
    var yLabel = document.getElementById('boxplot-y-entity-label');
    var swapGroup = document.getElementById('boxplot-entity-swap-group');

    var isRelationMode = (ModalState.boxplot.relation !== null);
    swapGroup.style.display = isRelationMode ? 'flex' : 'none';
    if (!isRelationMode) return;

    var entities = _getBoxplotEntities();
    if (entities.length === 0) return;

    if (!ModalState.boxplot.xEntity || entities.indexOf(ModalState.boxplot.xEntity) === -1) {
        ModalState.boxplot.xEntity = entities[0];
    }
    if (!ModalState.boxplot.yEntity || entities.indexOf(ModalState.boxplot.yEntity) === -1) {
        ModalState.boxplot.yEntity = entities.length > 1 ? entities[1] : entities[0];
    }

    xLabel.textContent = ModalState.boxplot.xEntity;
    yLabel.textContent = ModalState.boxplot.yEntity;
}


function populateBoxplotDropdowns() {
    var xSelect = document.getElementById('boxplot-x-select');
    var ySelect = document.getElementById('boxplot-y-select');
    xSelect.innerHTML = '';
    ySelect.innerHTML = '';

    var item = ModalState.item;
    if (!item) return;

    var xEntityName, yEntityName;
    if (ModalState.boxplot.relation) {
        xEntityName = ModalState.boxplot.xEntity;
        yEntityName = ModalState.boxplot.yEntity;
    } else if (item.type === 'entity') {
        xEntityName = item.name;
        yEntityName = item.name;
    } else {
        return;
    }

    if (!xEntityName || !yEntityName) return;

    var xAttrs = SchemaStore.getPlottableAttributes(xEntityName);
    var yAttrs = SchemaStore.getNumericAttributes(yEntityName);

    if (xAttrs.length === 0) {
        var opt = document.createElement('option');
        opt.value = ''; opt.textContent = 'No plottable attributes (' + xEntityName + ')';
        xSelect.appendChild(opt);
    } else {
        xAttrs.forEach(function(attr) {
            var o = document.createElement('option');
            o.value = attr.name;
            o.textContent = attr.name + ' (' + attr.dtype + ')';
            xSelect.appendChild(o);
        });
    }

    if (yAttrs.length === 0) {
        var opt2 = document.createElement('option');
        opt2.value = ''; opt2.textContent = 'No numeric attributes (' + yEntityName + ')';
        ySelect.appendChild(opt2);
    } else {
        yAttrs.forEach(function(attr) {
            var o = document.createElement('option');
            o.value = attr.name;
            o.textContent = attr.name + ' (' + attr.dtype + ')';
            ySelect.appendChild(o);
        });
    }

    var xProp = ModalState.boxplot.xProp;
    if (xProp && xAttrs.find(function(a) { return a.name === xProp.name; })) {
        xSelect.value = xProp.name;
    } else {
        ModalState.boxplot.xProp = xAttrs.length > 0 ? xAttrs[0] : null;
        if (ModalState.boxplot.xProp) xSelect.value = ModalState.boxplot.xProp.name;
    }

    var yProp = ModalState.boxplot.yProp;
    if (yProp && yAttrs.find(function(a) { return a.name === yProp.name; })) {
        ySelect.value = yProp.name;
    } else {
        ModalState.boxplot.yProp = yAttrs.length > 0 ? yAttrs[0] : null;
        if (ModalState.boxplot.yProp) ySelect.value = ModalState.boxplot.yProp.name;
    }
}


function renderBoxplotChart() {
    var summaryContainer = document.getElementById('chart-summary');
    var modalMain = document.querySelector('.modal-main');
    var chart = _getBoxplotChart();
    var item = ModalState.item;

    document.getElementById('sort-controls').style.display = 'none';
    document.getElementById('attribute-controls').style.display = 'none';
    document.getElementById('boxplot-controls').style.display = 'flex';
    summaryContainer.innerHTML = '';

    if (!item) {
        chart.showNoData('No item selected');
        return;
    }

    var filterEntity = null;
    if (item.type === 'entity' && !ModalState.boxplot.relation) {
        filterEntity = item.name;
    }
    _renderFilterPanel(modalMain, filterEntity);

    populateBoxplotRelationDropdown();
    populateBoxplotEntitySwap();
    populateBoxplotDropdowns();

    var xProp = ModalState.boxplot.xProp;
    var yProp = ModalState.boxplot.yProp;
    if (!xProp || !yProp) {
        chart.showNoData('Need at least one X attribute and one numeric Y attribute',
            'The selected entities lack the required properties');
        return;
    }

    var binSizeGroup = document.getElementById('boxplot-bin-size-group');
    binSizeGroup.style.display = (xProp.dtype === 'float' || xProp.dtype === 'int') ? 'flex' : 'none';

    var fileIds = ModalState.selectedFileIds();
    if (fileIds.length === 0) {
        chart.showNoData('No files selected', 'Select files from the left panel to see data');
        return;
    }

    var relation = ModalState.boxplot.relation;

    // Gather paired (x, y) values.
    var pairs;
    if (relation) {
        var xSide = (ModalState.boxplot.xEntity === relation.sourceEntity) ? 'source' : 'target';
        pairs = FilterQuery.getRelationPairedValues(
            relation.relation, relation.sourceEntity, relation.targetEntity,
            xSide, xProp.name, yProp.name, fileIds
        );
    } else {
        pairs = FilterQuery.getFilteredPairedValues(item.name, xProp.name, yProp.name, fileIds);
    }

    if (pairs.length === 0) {
        chart.showNoData('No data for these attribute combinations',
            relation ? 'No connected entities have both attributes'
                     : 'No entities have both attributes');
        return;
    }

    var groups = _buildBoxplotGroups(pairs, xProp).filter(function(g) { return g.values.length > 0; });
    if (groups.length === 0) {
        chart.showNoData('No data for these attribute combinations');
        return;
    }

    var xLabel = xProp.name;
    var yLabel = yProp.name;
    if (relation) {
        xLabel = ModalState.boxplot.xEntity + '.' + xLabel;
        yLabel = ModalState.boxplot.yEntity + '.' + yLabel;
    }

    var modeLabel = relation
        ? relation.relation + ' (' + ModalState.boxplot.xEntity + ' \u2192 ' + ModalState.boxplot.yEntity + ')'
        : 'Self';

    chart.render(
        { groups: groups, xLabel: xLabel, yLabel: yLabel, modeLabel: modeLabel },
        { summaryContainer: summaryContainer }
    );
}


function _buildBoxplotGroups(pairs, xProp) {
    if (xProp.dtype === 'enum') {
        var enumValues = xProp.values || [];
        var byEnum = {};
        enumValues.forEach(function(v) { byEnum[v] = []; });
        pairs.forEach(function(p) {
            if (byEnum[p.x] !== undefined) byEnum[p.x].push(p.y);
        });
        var groups = enumValues.map(function(v) { return { label: v, values: byEnum[v] }; });
        groups.sort(function(a, b) { return b.values.length - a.values.length; });
        return groups;
    } else {
        var allXValues = pairs.map(function(p) { return typeof p.x === 'number' ? p.x : parseFloat(p.x); });
        var bins = BinningHelpers.computeNumericBins(allXValues, xProp.dtype, ModalState.boxplot.binSize);

        var groups = bins.map(function(bin) { return { label: bin.label, x0: bin.x0, x1: bin.x1, values: [] }; });
        pairs.forEach(function(p) {
            var xNum = typeof p.x === 'number' ? p.x : parseFloat(p.x);
            for (var b = 0; b < bins.length; b++) {
                if (xNum >= bins[b].x0 && (xNum < bins[b].x1 || (b === bins.length - 1 && xNum <= bins[b].x1))) {
                    groups[b].values.push(p.y);
                    break;
                }
            }
        });
        return groups;
    }
}
