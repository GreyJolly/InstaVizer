// ===========================
// SVG & Diagram
// ===========================

function initSVG() {
    const container = document.querySelector('.canvas-container');
    const width = container.clientWidth;
    const height = container.clientHeight;

    svg = d3.select('#er-canvas')
        .attr('width', width)
        .attr('height', height);

    svg.selectAll('*').remove();

    zoom = d3.zoom()
        .scaleExtent([0.1, 4])
        .on('zoom', (event) => {
            g.attr('transform', event.transform);
        });

    svg.call(zoom);
    svg.on('click', () => {
        hideNodePopup();
        if (GraphSelection.isActive()) clearNodeSelection();
    });
    g = svg.append('g');

    return { width, height };
}

function parseJSON(data) {
    nodes = [];
    links = [];
    const entityMap = {};
    let index = 0;

    var MINI_CHART_SIZE = 90;

    for (const entityName in data.entities) {
        entityMap[entityName] = index;
        nodes.push({
            id: index,
            name: entityName,
            type: 'entity',
            width: MINI_CHART_SIZE,
            height: MINI_CHART_SIZE
        });
        index++;
    }

    for (const sourceEntity in data.relations) {
        const relations = data.relations[sourceEntity];
        for (const relationType in relations) {
            const targets = relations[relationType];
            for (const targetEntity in targets) {
                const sourceIdx = entityMap[sourceEntity];
                const targetIdx = entityMap[targetEntity];
                const isSelfReferencing = sourceIdx === targetIdx;

                const relNode = {
                    id: index,
                    name: relationType,
                    type: 'relationship',
                    sourceEntity: sourceEntity,
                    targetEntity: targetEntity,
                    size: MINI_CHART_SIZE,
                    diamondSize: MINI_CHART_SIZE * 0.6,
                    isSelfReferencing: isSelfReferencing,
                    width: MINI_CHART_SIZE,
                    height: MINI_CHART_SIZE
                };
                nodes.push(relNode);

                if (sourceIdx !== undefined) {
                    links.push({
                        source: sourceIdx,
                        target: index,
                        isSelfReferencing: isSelfReferencing,
                        curveDirection: 1
                    });
                }

                if (targetIdx !== undefined) {
                    links.push({
                        source: index,
                        target: targetIdx,
                        isSelfReferencing: isSelfReferencing,
                        curveDirection: -1
                    });
                }

                index++;
            }
        }
    }

    return { nodes, links };
}

// ===========================
// Main Render
// ===========================
function renderDiagram() {
    if (!SchemaStore.isLoaded()) {
        alert('Please load a schema file first');
        return;
    }

    document.getElementById('empty-state').classList.add('hidden');

    var container = document.querySelector('.canvas-container');

    // Count total rendering steps for progress
    var entityCount = SchemaStore.getEntityCount();
    var relationCount = 0;
    var _schemaRelations = (SchemaStore.getSchema() || {}).relations || {};
    for (var sourceEntity in _schemaRelations) {
        var relations = _schemaRelations[sourceEntity];
        for (var relationType in relations) {
            relationCount += Object.keys(relations[relationType]).length;
        }
    }
    var totalCharts = entityCount + relationCount;

    var useBar = totalCharts >= 3;

    var loader = LoadingManager.show(container, {
        mode: useBar ? 'bar' : 'spinner',
        message: 'Generating diagram…',
        delay: useBar ? 100 : 200,
        progress: useBar ? 0 : null
    });

    // Use requestAnimationFrame to let the loading overlay paint first
    // Yield to browser so the loading overlay paints before we start heavy work
    setTimeout(function() {
        _renderDiagramCore(totalCharts, useBar, function(progress, message) {
            loader.update({ progress: progress, message: message });
        }, function() {
            loader.hide();
        });
    }, 50);
}

function _renderDiagramCore(totalCharts, useBar, onProgress, onComplete) {
    var chartsRendered = 0;

    function reportProgress(phase, subProgress) {
        var base, range;
        if (phase === 'init')      { base = 0;    range = 0.05; }
        else if (phase === 'parse') { base = 0.05; range = 0.10; }
        else if (phase === 'layout'){ base = 0.15; range = 0.05; }
        else if (phase === 'draw')  { base = 0.20; range = 0.05; }
        else if (phase === 'charts'){ base = 0.25; range = 0.70; }
        else if (phase === 'final') { base = 0.95; range = 0.05; }
        else { base = 0; range = 1; }

        var progress = Math.min(1, base + subProgress * range);

        var message;
        if (phase === 'init') message = 'Initializing…';
        else if (phase === 'parse') message = 'Parsing schema…';
        else if (phase === 'layout') message = 'Computing layout…';
        else if (phase === 'draw') message = 'Drawing connections…';
        else if (phase === 'charts') {
            message = 'Rendering charts (' + chartsRendered + '/' + totalCharts + ')…';
        }
        else message = 'Finalizing…';

        if (onProgress && useBar) onProgress(progress, message);
    }

    // Phase 0: Init SVG
    reportProgress('init', 0);
    const { width, height } = initSVG();
    reportProgress('init', 1);

    // Yield before parse
    setTimeout(function() {
        // Phase 1: Parse JSON
        reportProgress('parse', 0);
        parseJSON(SchemaStore.getSchema());
        reportProgress('parse', 1);

        var defs = g.append('defs');

        // Resolve link references to node objects
        links.forEach(l => {
            if (typeof l.source === 'number') l.source = nodes[l.source];
            if (typeof l.target === 'number') l.target = nodes[l.target];
        });

            // Yield before layout
            setTimeout(function() {
                // Phase 2: Layout
                reportProgress('layout', 0);
                layoutNodes(nodes, links, width, height);
                nudgeOverlaps(nodes);
                saveNodePositions();
                reportProgress('layout', 1);

                // Phase 3: Draw connections
                reportProgress('draw', 0);
                const link = g.append('g')
                .attr('class', 'links-group')
                .selectAll('path')
                .data(links)
                .enter()
                .append('path')
                .attr('class', d => d.isSelfReferencing ? 'connection-line self-ref' : 'connection-line')
                .attr('fill', 'none');
                reportProgress('draw', 1);

                // Phase 4: Draw nodes (groups)
                const node = g.append('g')
                .attr('class', 'nodes-group')
                .selectAll('g')
                .data(nodes)
                .enter()
                .append('g')
                .attr('class', d => 'node-' + d.type)
                .attr('transform', d => 'translate(' + d.x + ',' + d.y + ')')
                .call(d3.drag()
                .on('start', function(event, d) {
                    d3.select(this).raise();
                    if (GraphSelection.isActive() && GraphSelection.isSelected(d.id)) {
                        d._dragPeers = [];
                        d3.selectAll('.nodes-group > g').each(function(peer) {
                            if (peer.id !== d.id && GraphSelection.isSelected(peer.id)) {
                                d._dragPeers.push({
                                    node: peer,
                                    el: d3.select(this),
                                                  offsetX: peer.x - d.x,
                                                  offsetY: peer.y - d.y
                                });
                            }
                        });
                    } else {
                        d._dragPeers = null;
                    }
                })
                .on('drag', function(event, d) {
                    d.x = event.x;
                    d.y = event.y;
                    d3.select(this).attr('transform', 'translate(' + d.x + ',' + d.y + ')');
                    if (d._dragPeers) {
                        d._dragPeers.forEach(function(p) {
                            p.node.x = d.x + p.offsetX;
                            p.node.y = d.y + p.offsetY;
                            p.el.attr('transform', 'translate(' + p.node.x + ',' + p.node.y + ')');
                        });
                    }
                    updateLinks(link);
                })
                .on('end', function(event, d) {
                    d._dragPeers = null;
                    saveNodePositions();
                }));

                // Yield before chart rendering (the heavy part)
                setTimeout(function() {
                    reportProgress('charts', 0);

                    function renderNextChart(index) {
                        if (index >= nodes.length) {
                            // All charts done
                            reportProgress('charts', 1);

                            // Yield before finalize
                            setTimeout(function() {
                                updateLinks(link);
                                reportProgress('final', 1);
                                if (onComplete) onComplete();
                            }, 30);
                                return;
                        }

                        var d = nodes[index];
                        if (d.type === 'entity') {
                            renderEntityMiniChart(d3.select('.nodes-group > g:nth-child(' + (index + 1) + ')'), d);
                        } else {
                            renderRelationMiniChart(d3.select('.nodes-group > g:nth-child(' + (index + 1) + ')'), d);
                        }
                        chartsRendered++;

                        if (chartsRendered % 2 === 0 || chartsRendered === totalCharts) {
                            reportProgress('charts', totalCharts > 0 ? chartsRendered / totalCharts : 1);
                        }

                        // Yield every few charts to keep UI responsive
                        if (chartsRendered % 3 === 0) {
                            setTimeout(function() { renderNextChart(index + 1); }, 0);
                        } else {
                            renderNextChart(index + 1);
                        }
                    }

                    // Add labels first (fast), then render charts one by one
                    var entities = node.filter(function(d) { return d.type === 'entity'; });
                    entities.append('text')
                    .attr('class', 'entity-label')
                    .attr('x', 0)
                    .attr('y', function(d) { return -d.height / 2 - 8; })
                    .attr('text-anchor', 'middle')
                    .attr('fill', 'var(--text-primary)')
                    .attr('font-size', '12px')
                    .attr('font-weight', '600')
                    .attr('font-family', "'DM Sans', sans-serif")
                    .text(function(d) { return d.name; });

                    var relationships = node.filter(function(d) { return d.type === 'relationship'; });
                    relationships.append('text')
                    .attr('class', 'relationship-label')
                    .attr('x', 0)
                    .attr('y', function(d) { return -d.height / 2 - 8; })
                    .attr('text-anchor', 'middle')
                    .attr('fill', 'var(--text-secondary)')
                    .attr('font-size', '10px')
                    .attr('font-weight', '500')
                    .attr('font-style', 'italic')
                    .attr('font-family', "'DM Sans', sans-serif")
                    .text(function(d) { return d.name; });

                    // Start rendering charts with yields
                    renderNextChart(0);

                }, 30); // end setTimeout before charts

            }, 30); // end setTimeout before layout

    }, 30); // end setTimeout before parse
}

// ===========================
// Active-node highlight for minimized modal)
// ===========================
function highlightActiveNode(modalItem) {
    clearActiveNodeHighlight();
    if (!modalItem) return;
    d3.selectAll('.nodes-group > g').each(function(d) {
        var match = false;
        if (modalItem.type === 'entity' && d.type === 'entity' && d.name === modalItem.name) match = true;
        if (modalItem.type === 'relationship' && d.type === 'relationship' &&
            d.name === modalItem.name && d.sourceEntity === modalItem.sourceEntity &&
            d.targetEntity === modalItem.targetEntity) match = true;
        if (match) {
            d3.select(this).classed('node-active', true);
        }
    });
}

function clearActiveNodeHighlight() {
    d3.selectAll('.nodes-group > g.node-active').classed('node-active', false);
}


function updateLinks(linkSelection) {
    linkSelection.attr('d', d => {
        const x1 = d.source.x, y1 = d.source.y;
        const x2 = d.target.x, y2 = d.target.y;

        if (d.isSelfReferencing) {
            const sx = d.source.x, sy = d.source.y;
            const tx = d.target.x, ty = d.target.y;
            const dx = tx - sx, dy = ty - sy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const radius = dist / 2;

            return 'M' + sx + ',' + sy +
                ' A' + radius + ',' + radius + ' 0 1,1 ' + tx + ',' + ty +
                ' A' + radius + ',' + radius + ' 0 1,1 ' + sx + ',' + sy + 'Z';
        }
        else {
            return 'M' + x1 + ',' + y1 + ' L' + x2 + ',' + y2;
        }
    });
}

// ===========================
// Multi-Select
// ===========================
function toggleMultiSelectMode() {
    var active = GraphSelection.toggleActive();
    var btn = document.getElementById('multiselect-btn');
    if (btn) btn.classList.toggle('active', active);
    if (!active) {
        clearNodeSelection();
    }
    // Change cursor on canvas
    var canvas = document.getElementById('er-canvas');
    if (canvas) canvas.style.cursor = active ? 'crosshair' : '';
}

function toggleNodeSelection(d) {
    GraphSelection.toggle(d.id);
    _updateSelectionVisuals();
}

function clearNodeSelection() {
    GraphSelection.clear();
    _updateSelectionVisuals();
}

function _updateSelectionVisuals() {
    d3.selectAll('.nodes-group > g').each(function(d) {
        d3.select(this).classed('node-multiselected', GraphSelection.isSelected(d.id));
    });
}

// ===========================
// Zoom Controls
// ===========================
function zoomIn() {
    svg.transition().duration(300).call(zoom.scaleBy, 1.3);
}

function zoomOut() {
    svg.transition().duration(300).call(zoom.scaleBy, 0.7);
}

function resetZoom() {
    svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity);
}

// ===========================
// Canvas Loading Spinner
// ===========================
function showCanvasLoading() {
    var canvasContainer = document.querySelector('.canvas-container');
    if (!canvasContainer) return;
    var existing = canvasContainer.querySelector('.loading-overlay');
    if (existing) {
        existing.classList.add('visible');
        return;
    }
    var overlay = document.createElement('div');
    overlay.className = 'loading-overlay visible';
    overlay.innerHTML = '<div class="spinner"></div><span class="loading-text">Rendering diagram\u2026</span>';
    canvasContainer.appendChild(overlay);
}

function hideCanvasLoading() {
    var overlay = document.querySelector('.canvas-container .loading-overlay');
    if (overlay) {
        overlay.classList.remove('visible');
    }
}
