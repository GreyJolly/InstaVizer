// ===========================
// ParallelCoordinatesChart — entity-connection visualization
// ===========================
// Renders a parallel-coordinates view of a relation chain: one vertical axis
// per entity type in the chain, entity instances as dots grouped by file, and
// relationship instances as connecting lines.

// DATA CONTRACT (caller-supplied):
//   data = { orderedAxes, connectionData, chain, selectedFiles }
//   options = { summaryContainer }

class ParallelCoordinatesChart extends Chart {

    _draw(data, options) {
        options = options || {};
        var summaryContainer = options.summaryContainer;

        var container = this.container;
        container.innerHTML = '<svg id="parallel-chart" style="width:100%;height:100%;display:block;"></svg>';
        if (summaryContainer) summaryContainer.innerHTML = '';
        d3.selectAll('.chart-tooltip').remove();

        var selectedFiles = data.selectedFiles || [];
        if (selectedFiles.length === 0) {
            container.innerHTML = '<div class="no-parallel-data">' +
                '<p>No files selected</p>' +
                '<p style="font-size: 0.8rem; opacity: 0.7;">Select files from the left panel to see data</p>' +
                '</div>';
            return;
        }

        var connectionData = data.connectionData || [];
        if (connectionData.length === 0) {
            container.innerHTML = '<div class="no-parallel-data">' +
                '<p>No relationship instances found in selected files</p>' +
                '</div>';
            return;
        }

        this._renderChart(data.orderedAxes, connectionData, data.chain, selectedFiles);
        if (summaryContainer) {
            this._renderSummary(data.orderedAxes, connectionData, data.chain, summaryContainer);
        }
    }

    _renderChart(orderedAxes, connectionData, chain, selectedFiles) {
        var self = this;
        var container = this.container;
        var margin = { top: 70, right: 100, bottom: 60, left: 100 };
        var containerWidth = container.clientWidth;
        var containerHeight = container.clientHeight;
        var width = Math.max(200, containerWidth - margin.left - margin.right);
        var height = Math.max(200, containerHeight - margin.top - margin.bottom);

        var svg = d3.select('#parallel-chart')
            .attr('width', containerWidth)
            .attr('height', containerHeight);

        var g = svg.append('g')
            .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

        var numAxes = orderedAxes.length;
        var axisSpacing = numAxes > 1 ? width / (numAxes - 1) : width / 2;

        var positionMap = {};

        orderedAxes.forEach(function(axis, axisIndex) {
            var entities = axis.orderedEntries || [];
            var xPos = numAxes > 1 ? axisIndex * axisSpacing : width / 2;

            var fileGroups = {};
            selectedFiles.forEach(function(file) { fileGroups[file.id] = []; });
            entities.forEach(function(entity) {
                if (fileGroups[entity.fileId]) {
                    fileGroups[entity.fileId].push(entity);
                }
            });

            var totalEntities = entities.length;
            if (totalEntities > 0) {
                var idx = 0;
                selectedFiles.forEach(function(file) {
                    var fileEntities = fileGroups[file.id] || [];
                    var startIdx = idx;
                    fileEntities.forEach(function(entity) {
                        var yVal = (idx + 0.5) * (height / totalEntities);
                        positionMap[entity.compositeId] = { x: xPos, y: yVal, color: entity.fileColor };
                        idx++;
                    });

                    if (fileEntities.length > 0) {
                        var startY = (startIdx + 0.5) * (height / totalEntities);
                        var endY = (idx - 0.5) * (height / totalEntities);
                        g.append('line')
                            .attr('x1', xPos - 18).attr('y1', startY)
                            .attr('x2', xPos - 18).attr('y2', endY)
                            .attr('stroke', file.color)
                            .attr('stroke-width', 3)
                            .attr('stroke-linecap', 'round');
                    }
                });
            }

            g.append('line')
                .attr('class', 'parallel-axis')
                .attr('x1', xPos).attr('y1', 0)
                .attr('x2', xPos).attr('y2', height)
                .attr('stroke', 'var(--border-color)')
                .attr('stroke-width', 2);

            var label = axis.entityType;
            var sameTypeCount = 0;
            var sameTypeBefore = 0;
            for (var ai = 0; ai < orderedAxes.length; ai++) {
                if (orderedAxes[ai].entityType === axis.entityType) sameTypeCount++;
                if (ai < axisIndex && orderedAxes[ai].entityType === axis.entityType) sameTypeBefore++;
            }
            if (sameTypeCount > 1) {
                label += ' (' + (sameTypeBefore + 1) + ')';
            }

            g.append('text')
                .attr('class', 'parallel-axis-label')
                .attr('x', xPos).attr('y', -25)
                .attr('text-anchor', 'middle')
                .attr('fill', 'var(--text-primary)')
                .attr('font-size', '14px')
                .attr('font-weight', '600')
                .text(label);

            entities.forEach(function(entity) {
                var pos = positionMap[entity.compositeId];
                if (pos) {
                    g.append('circle')
                        .attr('class', 'parallel-entity-dot')
                        .attr('cx', pos.x).attr('cy', pos.y)
                        .attr('r', 5)
                        .attr('fill', pos.color)
                        .attr('stroke', 'var(--bg-primary)')
                        .attr('stroke-width', 1.5)
                        .style('cursor', 'pointer')
                        .datum({ fileId: entity.fileId, _color: pos.color })
                        .on('mouseover', function(event) {
                            self._showTooltip(event, entity.id, entity.fileName);
                            self._highlightConnections(entity.compositeId, g);
                        })
                        .on('mouseout', function() {
                            self._hideTooltip();
                            self._resetConnectionHighlights(g);
                        });
                }
            });
        });

        var connectionsGroup = g.insert('g', ':first-child').attr('class', 'connections-group');

        connectionData.forEach(function(conn) {
            var sourcePos = positionMap[conn.sourceKey];
            var targetPos = positionMap[conn.targetKey];

            if (sourcePos && targetPos) {
                connectionsGroup.append('path')
                    .attr('class', 'parallel-connection')
                    .attr('d', 'M' + sourcePos.x + ',' + sourcePos.y +
                        ' L' + targetPos.x + ',' + targetPos.y)
                    .attr('stroke', conn.fileColor)
                    .attr('fill', 'none')
                    .attr('stroke-width', 1.5)
                    .attr('opacity', 0.4)
                    .attr('data-source', conn.sourceKey)
                    .attr('data-target', conn.targetKey)
                    .on('mouseover', function(event) {
                        d3.select(this).attr('opacity', 1).attr('stroke-width', 3);
                        self._showTooltip(event,
                            conn.sourceId.substring(0, 10) + ' \u2192 ' + conn.targetId.substring(0, 10),
                            conn.fileName);
                    })
                    .on('mouseout', function() {
                        d3.select(this).attr('opacity', 0.4).attr('stroke-width', 1.5);
                        self._hideTooltip();
                    });
            }
        });
    }

    // ---- Interactions ----

    _highlightConnections(compositeId, g) {
        var hoveredNodeId = compositeId.split(':')[1];
        g.selectAll('.parallel-connection')
            .attr('opacity', function() {
                var source = d3.select(this).attr('data-source');
                var target = d3.select(this).attr('data-target');
                var sourceNodeId = source.split(':')[1];
                var targetNodeId = target.split(':')[1];
                if (source === compositeId || target === compositeId ||
                    sourceNodeId === hoveredNodeId || targetNodeId === hoveredNodeId) {
                    d3.select(this).attr('stroke-width', 3);
                    return 1;
                }
                return 0.08;
            });
    }

    _resetConnectionHighlights(g) {
        g.selectAll('.parallel-connection')
            .attr('opacity', 0.4)
            .attr('stroke-width', 1.5);
    }

    // ---- Tooltips ----

    _showTooltip(event, label, fileName) {
        d3.selectAll('.chart-tooltip').remove();
        var tooltip = d3.select('body').append('div')
            .attr('class', 'chart-tooltip')
            .style('opacity', 0);

        tooltip.transition().duration(200).style('opacity', 1);
        tooltip.html(
            '<div class="tooltip-label">' + label + '</div>' +
            '<div class="tooltip-value">File: ' + fileName + '</div>'
        );
        positionTooltip(tooltip, event);
    }

    _hideTooltip() {
        d3.selectAll('.chart-tooltip').remove();
    }

    // ---- Summary ----

    _renderSummary(orderedAxes, connectionData, chain, container) {
        var totalConnections = connectionData.length;
        var entityCountsHtml = orderedAxes.map(function(axis, i) {
            var count = axis.orderedEntries ? axis.orderedEntries.length : Object.keys(axis.entries || {}).length;
            var label = axis.entityType;
            var sameTypeCount = 0;
            var sameTypeBefore = 0;
            for (var ai = 0; ai < orderedAxes.length; ai++) {
                if (orderedAxes[ai].entityType === axis.entityType) sameTypeCount++;
                if (ai < i && orderedAxes[ai].entityType === axis.entityType) sameTypeBefore++;
            }
            if (sameTypeCount > 1) {
                label += ' (' + (sameTypeBefore + 1) + ')';
            }
            return '<div class="summary-item">' +
                '<span class="summary-label">' + label + ':</span>' +
                '<span class="summary-value">' + count + ' instances</span>' +
                '</div>';
        }).join('');

        container.innerHTML =
            '<div class="stats-summary"><div class="stats-row">' +
            '<div class="summary-item summary-item-highlight">' +
            '<span class="summary-label" style="color: rgba(255,255,255,0.8);">Connections:</span>' +
            '<span class="summary-value" style="color: white;">' + totalConnections + '</span>' +
            '</div>' +
            entityCountsHtml +
            '<div class="summary-item">' +
            '<span class="summary-label">Chain length:</span>' +
            '<span class="summary-value">' + chain.length + ' relation' + (chain.length > 1 ? 's' : '') + '</span>' +
            '</div>' +
            '</div></div>';
    }

    // ---- Lasso selection contract ----
    get supportsLassoSelection() { return true; }

    getSelectionSvg() {
        return document.getElementById('parallel-chart');
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
            selector: '.parallel-entity-dot',
            hitTest: function(el, d) {
                if (!d || d.fileId == null) return null;
                var cx = +d3.select(el).attr('cx') + tx;
                var cy = +d3.select(el).attr('cy') + ty;
                return { x: cx, y1: cy, y2: cy, fileId: d.fileId };
            }
        };
    }

    setElementSelected(el, selected, d) {
        d3.select(el)
            .attr('stroke', selected ? 'var(--accent-blue)' : 'var(--bg-primary)')
            .attr('stroke-width', selected ? 3 : 1.5);
    }

    // Recolor the per-file dots to match current file colors.
    updateColors() {
        var svg = this.getSelectionSvg();
        if (!svg) return;
        var fileMap = {};
        FileRegistry.all().forEach(function(f) { fileMap[f.id] = f; });
        d3.select(svg).selectAll('.parallel-entity-dot')
            .transition().duration(200)
            .attr('fill', function(d) {
                if (!d || d.fileId == null) return null;
                var f = fileMap[d.fileId];
                return f ? f.color : null;
            });
    }
}


// ===========================
// Parallel coordinates — data layer
// ===========================
// Builds the relation chain, collects connection data, and applies the ordering algorithm, then hands the prepared data to the ParallelCoordinatesChart above

var _parallelChart = null;
function _getParallelChart() {
    var c = document.getElementById('chart-container');
    if (!_parallelChart || _parallelChart.container !== c) {
        _parallelChart = new ParallelCoordinatesChart(c);
    }
    ModalState.activeChart = _parallelChart;   // keep the polymorphic handle current
    return _parallelChart;
}

function renderParallelCoordinates() {
    var summaryContainer = document.getElementById('chart-summary');

    // Hide sort controls for parallel view
    document.getElementById('sort-controls').style.display = 'none';

    var selectedFiles = FileRegistry.all().filter(function(f) { return ModalState.selectedFiles.has(f.id); });

    // Empty-selection + no-data states are handled by the chart's _draw from the prepared data
    var data;
    if (selectedFiles.length === 0) {
        data = { orderedAxes: [], connectionData: [], chain: [], selectedFiles: [] };
    } else {
        var chain = buildRelationChain();
        var collected = collectParallelData(chain, selectedFiles);
        var algorithm = document.getElementById('ordering-algorithm').value;
        var orderedAxes = applyOrderingAlgorithm(collected.axes, collected.connectionData, algorithm, selectedFiles);
        data = {
            orderedAxes: orderedAxes,
            connectionData: collected.connectionData,
            chain: chain,
            selectedFiles: selectedFiles
        };
    }

    _getParallelChart().render(data, { summaryContainer: summaryContainer });
}

function buildRelationChain() {
    var chain = [{
        relation: ModalState.item.name,
        sourceEntity: ModalState.item.sourceEntity,
        targetEntity: ModalState.item.targetEntity
    }];

    ModalState.relationChain.forEach(function(rel) {
        chain.push(rel);
    });

    return chain;
}

function collectParallelData(chain, selectedFiles) {
    var axes = [];       // array of { axisIndex, entityType, entries: { compositeId: entry } }
    var connectionData = [];
    var fileIds = selectedFiles.map(function(f) { return f.id; });
    var fileMap = {};
    selectedFiles.forEach(function(f) { fileMap[f.id] = f; });

    // Build axis list: one per position in the chain
    // axis 0 = source of first relation
    // axis i+1 = target of chain[i]
    var axisEntityTypes = [chain[0].sourceEntity];
    for (var i = 0; i < chain.length; i++) {
        axisEntityTypes.push(chain[i].targetEntity);
    }

    // Create axes with per-axis entity entries
    for (var a = 0; a < axisEntityTypes.length; a++) {
        axes.push({
            axisIndex: a,
            entityType: axisEntityTypes[a],
            entries: {}
        });
    }

    // Populate axes with nodes and build connections per chain link
    for (var ci = 0; ci < chain.length; ci++) {
        var rel = chain[ci];
        var sourceAxisIdx = ci;
        var targetAxisIdx = ci + 1;

        var edges = DataStore.getEdges(fileIds, rel.relation, rel.sourceEntity, rel.targetEntity);
        edges.forEach(function(edge) {
            var file = fileMap[edge.fileId];

            // Add source node to source axis
            var srcKey = sourceAxisIdx + ':' + edge.sourceId;
            if (!axes[sourceAxisIdx].entries[srcKey]) {
                axes[sourceAxisIdx].entries[srcKey] = {
                    compositeId: srcKey,
                    id: edge.sourceId,
                    axisIndex: sourceAxisIdx,
                    name: edge.sourceId.length > 12 ? edge.sourceId.substring(0, 12) : edge.sourceId,
                      fileId: edge.fileId,
                      fileColor: file.color,
                      fileName: file.name
                };
            }

            // Add target node to target axis
            var tgtKey = targetAxisIdx + ':' + edge.targetId;
            if (!axes[targetAxisIdx].entries[tgtKey]) {
                axes[targetAxisIdx].entries[tgtKey] = {
                    compositeId: tgtKey,
                    id: edge.targetId,
                    axisIndex: targetAxisIdx,
                    name: edge.targetId.length > 12 ? edge.targetId.substring(0, 12) : edge.targetId,
                      fileId: edge.fileId,
                      fileColor: file.color,
                      fileName: file.name
                };
            }

            connectionData.push({
                sourceKey: srcKey,
                targetKey: tgtKey,
                sourceId: edge.sourceId,
                targetId: edge.targetId,
                relationIndex: ci,
                fileId: edge.fileId,
                fileColor: file.color,
                fileName: file.name
            });
        });
    }

    return { axes: axes, connectionData: connectionData };
}

// ===========================
// Ordering Algorithms
// ===========================
function applyOrderingAlgorithm(axes, connectionData, algorithm, selectedFiles) {
    var orderedAxes = [];

    for (var a = 0; a < axes.length; a++) {
        var axis = axes[a];
        var entities = Object.values(axis.entries);

        var ordered;
        switch (algorithm) {
            case 'minimize-crossings':
                ordered = orderByBarycenter(entities, connectionData);
                break;
            case 'by-degree':
                ordered = orderByDegree(entities, connectionData);
                break;
            case 'alphabetical':
                ordered = entities.slice().sort(function(a, b) { return a.id.localeCompare(b.id); });
                break;
            default:
                ordered = orderByDegree(entities, connectionData);
        }

        orderedAxes.push({
            axisIndex: axis.axisIndex,
            entityType: axis.entityType,
            orderedEntries: ordered
        });
    }

    return orderedAxes;
}

function orderByBarycenter(entities, connectionData) {
    var entityPositions = {};
    entities.forEach(function(entity, i) { entityPositions[entity.compositeId] = i; });

    for (var iter = 0; iter < 5; iter++) {
        var newPositions = {};
        entities.forEach(function(entity) {
            var connected = [];
            connectionData.forEach(function(conn) {
                if (conn.sourceKey === entity.compositeId && entityPositions[conn.targetKey] !== undefined) {
                    connected.push(entityPositions[conn.targetKey]);
                } else if (conn.targetKey === entity.compositeId && entityPositions[conn.sourceKey] !== undefined) {
                    connected.push(entityPositions[conn.sourceKey]);
                }
            });
            if (connected.length > 0) {
                newPositions[entity.compositeId] = connected.reduce(function(a, b) { return a + b; }, 0) / connected.length;
            } else {
                newPositions[entity.compositeId] = entityPositions[entity.compositeId];
            }
        });
        Object.assign(entityPositions, newPositions);
    }

    return entities.slice().sort(function(a, b) { return entityPositions[a.compositeId] - entityPositions[b.compositeId]; });
}

function orderByDegree(entities, connectionData) {
    var degrees = {};
    entities.forEach(function(e) { degrees[e.compositeId] = 0; });
    connectionData.forEach(function(conn) {
        if (degrees[conn.sourceKey] !== undefined) degrees[conn.sourceKey]++;
        if (degrees[conn.targetKey] !== undefined) degrees[conn.targetKey]++;
    });
        return entities.slice().sort(function(a, b) { return degrees[b.compositeId] - degrees[a.compositeId]; });
}

function orderByFile(entities, selectedFiles) {
    var fileOrder = {};
    selectedFiles.forEach(function(file, i) { fileOrder[file.id] = i; });
    return entities.slice().sort(function(a, b) {
        var fc = (fileOrder[a.fileId] || 0) - (fileOrder[b.fileId] || 0);
        if (fc !== 0) return fc;
        return a.id.localeCompare(b.id);
    });
}

