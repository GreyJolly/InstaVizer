// ===========================
// Modal & Charts
// ===========================

// Re-render the modal chart only if the given chart type is the active one.
// Control handlers below write their own state, then call this — replacing the
// scattered `if (ModalState.chartType === 'X') updateChart()` tails so a
// control's owning chart type is the only per-type coupling, expressed once.
function _rerenderIfActive(ownerType) {
    if (ModalState.chartType === ownerType) updateChart();
}

function initModal() {
    const closeBtn = document.getElementById('modal-close');
    const minimizeBtn = document.getElementById('modal-minimize');
    const previewHeader = document.getElementById('chart-preview-header');
    
    closeBtn.addEventListener('click', closeModal);
    if (minimizeBtn) minimizeBtn.addEventListener('click', minimizeModal);
    if (previewHeader) previewHeader.addEventListener('click', restoreModal);
    
    // Chart type toggle
    document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.dataset.type;
            setChartType(type);
        });
    });
    
    // Ordering algorithm change
    document.getElementById('ordering-algorithm').addEventListener('change', () => {
        _rerenderIfActive('parallel');
    });
    
    // Sort type change (instances chart)
    document.getElementById('sort-type').addEventListener('change', () => {
        _rerenderIfActive('instances');
    });
    
    // Reference file select change (instances compare)
    document.getElementById('reference-file-select').addEventListener('change', (e) => {
        var val = e.target.value;
        ModalState.instances.referenceFileId = val ? (val === '__MEAN__' ? '__MEAN__' : parseFloat(val)) : null;
        _rerenderIfActive('instances');
    });
    
    // Attribute select change
    document.getElementById('attribute-select').addEventListener('change', (e) => {
        var propName = e.target.value;
        if (ModalState.item && ModalState.item.type === 'entity') {
            var attrs = SchemaStore.getPlottableAttributes(ModalState.item.name);
            ModalState.attribute.prop = attrs.find(function(a) { return a.name === propName; }) || null;
        }
        _rerenderIfActive('attribute');
    });
    
    // Bin size input
    document.getElementById('bin-size-input').addEventListener('change', (e) => {
        var val = parseFloat(e.target.value);
        ModalState.attribute.binSize = (val && val > 0) ? val : null;
        _rerenderIfActive('attribute');
    });
    
    // Attribute compare file select
    document.getElementById('attr-compare-select').addEventListener('change', (e) => {
        var val = e.target.value;
        ModalState.attribute.compareFileId = val ? parseFloat(val) : null;
        _rerenderIfActive('attribute');
    });
    
    // Boxplot relation select
    document.getElementById('boxplot-relation-select').addEventListener('change', (e) => {
        var val = e.target.value;
        if (val === '__self__') {
            ModalState.boxplot.relation = null;
            ModalState.boxplot.xEntity = null;
            ModalState.boxplot.yEntity = null;
        } else {
            var parsed = _parseRelationKey(val);
            if (parsed) {
                var currentEntityName = ModalState.item ? ModalState.item.name : null;
                parsed.otherEntity = (parsed.sourceEntity === currentEntityName)
                    ? parsed.targetEntity : parsed.sourceEntity;
                ModalState.boxplot.relation = parsed;
                ModalState.boxplot.xEntity = null;
                ModalState.boxplot.yEntity = null;
            }
        }
        // Reset attribute selections when switching relation
        ModalState.boxplot.xProp = null;
        ModalState.boxplot.yProp = null;
        _rerenderIfActive('boxplot');
    });
    
    // Boxplot entity swap button
    document.getElementById('boxplot-swap-btn').addEventListener('click', () => {
        var tmp = ModalState.boxplot.xEntity;
        ModalState.boxplot.xEntity = ModalState.boxplot.yEntity;
        ModalState.boxplot.yEntity = tmp;
        ModalState.boxplot.xProp = null;
        ModalState.boxplot.yProp = null;
        _rerenderIfActive('boxplot');
    });

    // Boxplot X-axis attribute select
    document.getElementById('boxplot-x-select').addEventListener('change', (e) => {
        var propName = e.target.value;
        var xEntityName = ModalState.boxplot.xEntity || (ModalState.item ? ModalState.item.name : null);
        if (xEntityName) {
            var attrs = SchemaStore.getPlottableAttributes(xEntityName);
            ModalState.boxplot.xProp = attrs.find(function(a) { return a.name === propName; }) || null;
        }
        _rerenderIfActive('boxplot');
    });
    
    // Boxplot Y-axis attribute select
    document.getElementById('boxplot-y-select').addEventListener('change', (e) => {
        var propName = e.target.value;
        var yEntityName = ModalState.boxplot.yEntity || (ModalState.item ? ModalState.item.name : null);
        if (yEntityName) {
            var attrs = SchemaStore.getNumericAttributes(yEntityName);
            ModalState.boxplot.yProp = attrs.find(function(a) { return a.name === propName; }) || null;
        }
        _rerenderIfActive('boxplot');
    });
    
    // Boxplot bin size input
    document.getElementById('boxplot-bin-size-input').addEventListener('change', (e) => {
        var val = parseFloat(e.target.value);
        ModalState.boxplot.binSize = (val && val > 0) ? val : null;
        _rerenderIfActive('boxplot');
    });
    
    // Add relation button
    document.getElementById('add-relation-btn').addEventListener('click', showAddRelationDropdown);
    document.getElementById('close-relation-dropdown').addEventListener('click', hideAddRelationDropdown);
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.getElementById('modal-overlay').classList.contains('active')) {
            closeModal();
        }
    });
    
    initChartPreviewResize();
}

// ===========================
// Chart type configuration
// ===========================
// One declarative entry per chart type replaces the per-type if/else chains
// that were duplicated across setChartType, updateChart,
// updateMinimizeButtonVisibility, and minimizeModal. To add a chart type, add
// a row here instead of editing four functions.
//
//   controls:   control-row element IDs to show when this type is active.
//               (Empty for instances/attribute: those rows are shown/hidden by
//               their own render functions, which also populate them.)
//   canMinimize: whether the floating/minimized window is offered.
//   validFor:    item types this chart supports ('entity' | 'relationship').
//               Drives both the fallback in show*Chart AND which toggle
//               buttons are shown for the current item type.
//   toggleBtnId: id of this type's chart-type toggle button, or null if the
//               button is always visible (instances) / has no button.
//   render:      dispatch invoked by updateChart once the item is known.
var CHART_CONFIGS = {
    instances: {
        controls: [],
        canMinimize: true,
        validFor: ['entity', 'relationship'],
        toggleBtnId: null, // always-visible default; no per-item toggling
        menuLabel: 'Instances per file',
        // prepare(): per-type work updateChart must do BEFORE render (populating
        // dropdowns, etc.). Keeps updateChart free of per-type if/else.
        prepare: function() {
            var selectedFiles = FileRegistry.all().filter(function(f) { return ModalState.selectedFiles.has(f.id); });
            populateReferenceDropdown(selectedFiles);
        },
        render: function() {
            if (ModalState.item.type === 'entity') {
                updateEntityChart(ModalState.item.name);
            } else {
                updateRelationshipBarChart(ModalState.item.name, ModalState.item.sourceEntity, ModalState.item.targetEntity);
            }
        }
    },
    attribute: {
        controls: [],
        canMinimize: true,
        validFor: ['entity'],
        toggleBtnId: 'attribute-toggle-btn',
        menuLabel: 'Attribute distribution',
        render: function() { renderAttributeChart(); }
    },
    boxplot: {
        controls: ['boxplot-controls'],
        canMinimize: true,
        validFor: ['entity', 'relationship'],
        toggleBtnId: 'boxplot-toggle-btn',
        menuLabel: 'Compare distributions',
        render: function() { renderBoxplotChart(); }
    },
    parallel: {
        controls: ['parallel-controls'],
        canMinimize: true,
        validFor: ['relationship'],
        toggleBtnId: 'parallel-toggle-btn',
        menuLabel: 'Entity connections',
        render: function() {
            if (ModalState.item.type === 'relationship') renderParallelCoordinates();
        }
    },
    scatter: {
        controls: ['scatter-controls'],
        canMinimize: false,
        validFor: [],
        toggleBtnId: null,
        menuLabel: null, // not offered from the node popup
        // Scatter owns its async pipeline; prepare() runs it and render() is a
        // no-op so updateChart needs no scatter special-case.
        prepare: function() {
            hideChartLoading();
            ScatterplotScreen.refreshForSelection();
        },
        render: null,
        selfRendering: true // updateChart returns after prepare(); no cfg.render()
    }
};

// All control-row IDs, derived from the map so adding a type can't desync this.
var ALL_CHART_CONTROL_IDS = (function() {
    var ids = ['sort-controls', 'attribute-controls']; // render-managed rows
    Object.keys(CHART_CONFIGS).forEach(function(type) {
        CHART_CONFIGS[type].controls.forEach(function(id) {
            if (ids.indexOf(id) === -1) ids.push(id);
        });
    });
    return ids;
})();

function setChartType(type) {
    ModalState.chartType = type;

    document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === type);
    });

    // Hide every control row, then show the ones this type declares.
    // (sort-controls / attribute-controls are shown by their render fns.)
    ALL_CHART_CONTROL_IDS.forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    var cfg = CHART_CONFIGS[type];
    if (cfg) {
        cfg.controls.forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.style.display = 'flex';
        });
    }

    updateMinimizeButtonVisibility();
    updateChart();
}

// Show/hide each chart-type toggle button based on whether its config is valid
// for the given item type. Replaces the per-item button-toggling that used to
// be hardcoded in showEntityChart / showRelationshipChart. The chart-type
// toggle container itself is always shown here.
function _configureToggleButtonsForItemType(itemType) {
    document.getElementById('chart-type-toggle').style.display = 'flex';
    Object.keys(CHART_CONFIGS).forEach(function(type) {
        var cfg = CHART_CONFIGS[type];
        if (!cfg.toggleBtnId) return; // always-visible / button-less types
        var btn = document.getElementById(cfg.toggleBtnId);
        if (!btn) return;
        var valid = cfg.validFor.indexOf(itemType) !== -1;
        btn.style.display = valid ? 'flex' : 'none';
    });
}

// Reset the active chart type to instances and sync the toggle-button active
// state. Used by the show*Chart entry points before rendering.
function _activateInstancesToggle() {
    ModalState.chartType = 'instances';
    document.querySelectorAll('.toggle-btn').forEach(function(btn) {
        btn.classList.toggle('active', btn.dataset.type === 'instances');
    });
}

function showAddRelationDropdown() {
    const dropdown = document.getElementById('add-relation-dropdown');
    const lastEntitySpan = document.getElementById('chain-last-entity');
    const relationsContainer = document.getElementById('available-relations');

    let lastEntity;
    if (ModalState.relationChain.length === 0) {
        lastEntity = ModalState.item.targetEntity;
    } else {
        lastEntity = ModalState.relationChain[ModalState.relationChain.length - 1].targetEntity;
    }

    lastEntitySpan.textContent = lastEntity;

    const availableRelations = SchemaStore.getRelationsFromEntity(lastEntity);

    if (availableRelations.length === 0) {
        relationsContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">No outgoing relations from ' + lastEntity + '</div>';
    } else {
        relationsContainer.innerHTML = availableRelations.map(rel =>
        '<div class="relation-option" onclick="addRelationToChain(\'' + rel.relation + '\', \'' + rel.sourceEntity + '\', \'' + rel.targetEntity + '\')">' +
        '<span class="relation-option-name">' + rel.relation + '</span>' +
        '<span class="relation-option-arrow">\u2192</span>' +
        '<span class="relation-option-target">' + rel.targetEntity + '</span>' +
        '</div>'
        ).join('');
    }

    // Just show the dropdown - it overlays without affecting layout
    dropdown.style.display = 'block';

    // Add click-outside listener
    setTimeout(() => {
        document.addEventListener('click', _handleClickOutsideDropdown);
    }, 0);
}

function hideAddRelationDropdown() {
    const dropdown = document.getElementById('add-relation-dropdown');
    dropdown.style.display = 'none';
    document.removeEventListener('click', _handleClickOutsideDropdown);
}

// Click-outside handler
function _handleClickOutsideDropdown(event) {
    const dropdown = document.getElementById('add-relation-dropdown');
    const addBtn = document.getElementById('add-relation-btn');
    if (!dropdown.contains(event.target) && event.target !== addBtn) {
        hideAddRelationDropdown();
    }
}

function addRelationToChain(relation, sourceEntity, targetEntity) {
    ModalState.relationChain.push({ relation, sourceEntity, targetEntity });
    hideAddRelationDropdown();
    renderRelationChain();
    updateChart();
}

function removeRelationFromChain(index) {
    ModalState.relationChain = ModalState.relationChain.slice(0, index);
    renderRelationChain();
    updateChart();
}

function renderRelationChain() {
    const container = document.getElementById('relation-chain');
    
    if (!ModalState.item || ModalState.item.type !== 'relationship') {
        container.innerHTML = '';
        return;
    }
    
    let html = '<span class="chain-entity">' + ModalState.item.sourceEntity + '</span>' +
        '<span class="chain-arrow">\u2192</span>' +
        '<span class="chain-relation">' + ModalState.item.name + '</span>' +
        '<span class="chain-arrow">\u2192</span>' +
        '<span class="chain-entity">' + ModalState.item.targetEntity + '</span>';
    
    ModalState.relationChain.forEach((rel, index) => {
        html += '<span class="chain-arrow">\u2192</span>' +
            '<span class="chain-relation">' + rel.relation +
                '<button class="chain-remove-btn" onclick="removeRelationFromChain(' + index + ')" title="Remove">&times;</button>' +
            '</span>' +
            '<span class="chain-arrow">\u2192</span>' +
            '<span class="chain-entity">' + rel.targetEntity + '</span>';
    });
    
    container.innerHTML = html;
}

function openModal(title) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-overlay').classList.add('active');
    
    // Hide tools column in modal view
    document.getElementById('tools-column').classList.add('hidden');
    
    // Switch file sidebar to modal context
    ModalState.sidebarContext = 'modal';
    
    // Initialize: select files that are enabled in main sidebar
    ModalState.selectedFiles.clear();
    FileRegistry.all().forEach(file => {
        if (file.enabled) {
            ModalState.selectedFiles.add(file.id);
        }
    });
    
    renderFileList();
    updateMinimizeButtonVisibility();
}

function toggleModalFile(fileId) {
    var file = FileRegistry.byId(fileId);
    if (!file) return;
    
    if (ModalState.selectedFiles.has(file.id)) {
        ModalState.selectedFiles.delete(file.id);
    } else {
        ModalState.selectedFiles.add(file.id);
    }
    
    // Sync to sidebar: modal selection = sidebar enabled
    FileRegistry.setEnabled(file.id, ModalState.selectedFiles.has(file.id));
    
    renderFileList();
    updateChart();
    
    // Re-render diagram if active
    if (nodes.length > 0) {
        renderDiagram();
    }
}

function updateChart() {
    if (!ModalState.item && ModalState.chartType !== 'scatter') return;

    var cfg = CHART_CONFIGS[ModalState.chartType];
    if (!cfg) return;

    // Per-type preparation (dropdown population, or scatter's own pipeline).
    if (cfg.prepare) cfg.prepare();

    // Self-rendering types (scatter) handle everything in prepare() and have no
    // synchronous cfg.render() to run.
    if (cfg.selfRendering) return;

    showChartLoading();

    // Defer rendering to next frame so the spinner paints first
    requestAnimationFrame(function() {
        setTimeout(function() {
            if (cfg.render) cfg.render();

            hideChartLoading();

            // The active chart (and thus lasso-selection capability) may have
            // changed; refresh the sidebar so the "select files to add" button
            // reflects the new chart. Skip while minimized to avoid disrupting
            // the floating view's layout.
            if (!document.body.classList.contains('modal-minimized')) {
                renderFileList();
            }

            if (document.body.classList.contains('modal-minimized') &&
                typeof declutterFloatingChartLabels === 'function') {
                requestAnimationFrame(function() {
                    declutterFloatingChartLabels();
                });
            }
        }, 20);
    });
}

function showChartLoading() {
    var modalMain = document.querySelector('.modal-main');
    if (!modalMain) return;
    LoadingManager.show(modalMain, {
        mode: 'spinner',
        message: 'Rendering chart…',
        delay: 150
    });
}

function hideChartLoading() {
    var modalMain = document.querySelector('.modal-main');
    if (!modalMain) return;
    LoadingManager.hide(modalMain);
}

function closeModal() {
    document.getElementById('modal-overlay').classList.remove('active');
    
    // If closing from minimized state, move chart-container back
    if (document.body.classList.contains('modal-minimized')) {
        var modalMain = document.querySelector('.modal-main');
        var previewBody = document.getElementById('chart-preview-body');
        var chartContainer = previewBody ? previewBody.querySelector('#chart-container') : null;
        if (chartContainer && modalMain) {
            var summary = document.getElementById('chart-summary');
            if (summary) {
                modalMain.insertBefore(chartContainer, summary);
            } else {
                modalMain.appendChild(chartContainer);
            }
        }
    }
    document.body.classList.remove('modal-minimized');
    document.getElementById('modal-overlay').classList.remove('minimized');
    document.getElementById('chart-preview').style.display = 'none';

    if (typeof clearActiveNodeHighlight === 'function') clearActiveNodeHighlight();
    
    // Restore tools column and sidebar context
    document.getElementById('tools-column').classList.remove('hidden');
    ModalState.sidebarContext = 'main';
    
    // Clean up scatter state if needed
    ScatterplotScreen.onModalClose();
    
    // Clean up filters
    FilterState.clearAllFilters();
    FilterPanel.destroy();
    
    ModalState.item = null;
    ModalState.selectedFiles.clear();
    ModalState.relationChain = [];
    ModalState.activeChart = null;   // no chart is shown once the modal closes
    ModalState.reset();
    d3.selectAll('.chart-tooltip').remove();
    d3.selectAll('.axis-label-tooltip').remove();
    d3.selectAll('.scatter-tooltip').remove();
    hideAddRelationDropdown();

    _activateInstancesToggle();
    ALL_CHART_CONTROL_IDS.forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    document.getElementById('chart-type-toggle').style.display = 'flex';

    renderFileList();
}

function showEntityChart(entityNode) {
    const entityName = entityNode.name;

    ModalState.item = { type: 'entity', name: entityName };

    _activateInstancesToggle();
    // Hide all per-type control rows (instances, the default, declares none).
    ALL_CHART_CONTROL_IDS.forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    _configureToggleButtonsForItemType('entity');

    openModal('Entity: ' + entityName);
    updateEntityChart(entityName);
}

function showRelationshipChart(relNode) {
    const relName = relNode.name;
    const sourceEntity = relNode.sourceEntity;
    const targetEntity = relNode.targetEntity;

    ModalState.item = {
        type: 'relationship',
        name: relName,
        sourceEntity: sourceEntity,
        targetEntity: targetEntity
    };

    ModalState.relationChain = [];

    // Show the toggle buttons valid for relationships (attribute hidden, etc.).
    _configureToggleButtonsForItemType('relationship');

    openModal('Relationship: ' + relName);
    renderRelationChain();

    // Render the persisted chart type if it supports relationships; otherwise
    // fall back to instances. validFor lives in CHART_CONFIGS so this no longer
    // hardcodes which types are relationship-capable.
    var cfg = CHART_CONFIGS[ModalState.chartType];
    if (cfg && cfg.validFor.indexOf('relationship') !== -1 && cfg.render) {
        cfg.render();
    } else {
        setChartType('instances');
    }
}

// Minimize / Restore functions
function _chartCanMinimize() {
    var cfg = CHART_CONFIGS[ModalState.chartType];
    return !!(cfg && cfg.canMinimize);
}

function updateMinimizeButtonVisibility() {
    var btn = document.getElementById('modal-minimize');
    if (!btn) return;
    btn.style.display = _chartCanMinimize() ? 'flex' : 'none';
}

function minimizeModal() {
    if (!_chartCanMinimize()) return;
    
    document.body.classList.add('modal-minimized');
    document.getElementById('modal-overlay').classList.add('minimized');
    
    // Move the entire chart-container into the floating preview
    var preview = document.getElementById('chart-preview');
    var previewBody = document.getElementById('chart-preview-body');
    var previewTitle = document.getElementById('chart-preview-title');
    var chartContainer = document.getElementById('chart-container');
    
    previewTitle.textContent = document.getElementById('modal-title').textContent;
    if (chartContainer) previewBody.appendChild(chartContainer);
    preview.style.display = 'flex';
    // Reset position to top-right each time
    preview.style.left = 'auto';
    preview.style.top = '20px';
    preview.style.right = '20px';
    
    if (typeof hideNodePopup === 'function') hideNodePopup();
    // Highlight the active node on the ER diagram
    if (typeof highlightActiveNode === 'function') highlightActiveNode(ModalState.item);
        
    // Re-render at the new (smaller) size
    requestAnimationFrame(function() { updateChart(); });
}

function restoreModal() {
    document.body.classList.remove('modal-minimized');
    document.getElementById('modal-overlay').classList.remove('minimized');
    
    // Move chart-container back into .modal-main
    var modalMain = document.querySelector('.modal-main');
    var previewBody = document.getElementById('chart-preview-body');
    var chartContainer = previewBody ? previewBody.querySelector('#chart-container') : null;
    if (chartContainer && modalMain) {
        // Re-insert before #chart-summary (which never moved)
        var summary = document.getElementById('chart-summary');
        if (summary) {
            modalMain.insertBefore(chartContainer, summary);
        } else {
            modalMain.appendChild(chartContainer);
        }
    }
    
    document.getElementById('chart-preview').style.display = 'none';
    if (typeof clearActiveNodeHighlight === 'function') clearActiveNodeHighlight();
    
    requestAnimationFrame(function() { updateChart(); });
}

function initChartPreviewResize() {
    var preview = document.getElementById('chart-preview');
    if (!preview) return;
    
    var canvasEl = document.querySelector('.canvas-container');
    var MIN_W = 320, MIN_H = 250;
    var rerenderTimer = null;
    
    // Directions: 'n','s','e','w','ne','nw','se','sw'
    var directions = ['n','s','e','w','ne','nw','se','sw'];
    
    directions.forEach(function(dir) {
        var handle = document.createElement('div');
        handle.className = 'chart-preview-resize chart-preview-resize-' + dir;
        preview.appendChild(handle);
        
        handle.addEventListener('mousedown', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            var rect = preview.getBoundingClientRect();
            var canvasRect = canvasEl.getBoundingClientRect();
            var startX = e.clientX;
            var startY = e.clientY;
            var startW = rect.width;
            var startH = rect.height;
            // Convert anchor to top/left so we can resize freely (switch from right anchor)
            var startLeft = rect.left - canvasRect.left;
            var startTop = rect.top - canvasRect.top;
            preview.style.right = 'auto';
            preview.style.left = startLeft + 'px';
            preview.style.top = startTop + 'px';
            
            function onMove(ev) {
                var dx = ev.clientX - startX;
                var dy = ev.clientY - startY;
                var newW = startW, newH = startH, newLeft = startLeft, newTop = startTop;

                // Clamp to canvas bounds
                var canvasCur = canvasEl.getBoundingClientRect();
                newW = Math.min(newW, canvasCur.width - 20);
                newH = Math.min(newH, canvasCur.height - 20);
                newLeft = Math.max(0, Math.min(newLeft, canvasCur.width - newW));
                newTop = Math.max(0, Math.min(newTop, canvasCur.height - newH));
                
                if (dir.indexOf('e') !== -1) newW = Math.max(MIN_W, startW + dx);
                if (dir.indexOf('w') !== -1) {
                    newW = Math.max(MIN_W, startW - dx);
                    newLeft = startLeft + (startW - newW);
                }
                if (dir.indexOf('s') !== -1) newH = Math.max(MIN_H, startH + dy);
                if (dir.indexOf('n') !== -1) {
                    newH = Math.max(MIN_H, startH - dy);
                    newTop = startTop + (startH - newH);
                }
                
                preview.style.width = newW + 'px';
                preview.style.height = newH + 'px';
                preview.style.left = newLeft + 'px';
                preview.style.top = newTop + 'px';
                
                if (rerenderTimer) clearTimeout(rerenderTimer);
                rerenderTimer = setTimeout(function() { updateChart(); }, 80);
            }
            
            function onUp() {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                if (rerenderTimer) clearTimeout(rerenderTimer);
                updateChart();
            }
            
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    });
}
