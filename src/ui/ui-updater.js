// ====================
// File UI Rendering
// ====================

// Tracks whether we're in modal context

function renderSchemaFile() {
    var container = document.getElementById('schema-slot');
    
    if (!SchemaStore.isLoaded()) {
        container.innerHTML = '<span class="placeholder">No schema loaded</span>';
        return;
    }
    
    var entityCount = SchemaStore.getEntityCount();
    
    container.innerHTML =
        '<div class="file-item">' +
            '<div class="file-icon" style="background: linear-gradient(135deg, #3b82f6, #22d3ee);">' +
                '<svg viewBox="0 0 20 20" fill="none">' +
                    '<path d="M4 4h12v12H4V4z" stroke="white" stroke-width="1.5"/>' +
                    '<path d="M7 8h6M7 12h4" stroke="white" stroke-width="1.5" stroke-linecap="round"/>' +
                '</svg>' +
            '</div>' +
            '<div class="file-info">' +
                '<div class="file-name" title="' + SchemaStore.getFileName() + '">' + SchemaStore.getFileName() + '</div>' +
                '<div class="file-meta">' + entityCount + ' entities</div>' +
            '</div>' +
            '<div class="file-remove" onclick="removeSchemaFile()" title="Remove schema" style="display:flex">' +
                '<svg viewBox="0 0 12 12" fill="none">' +
                    '<path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' +
                '</svg>' +
            '</div>' +
        '</div>';
}

// Unified file list renderer used by both main sidebar and modal.
function renderFileList() {
    var container = document.getElementById('file-sidebar-list');
    
    if (FileRegistry.all().length === 0) {
        container.innerHTML = '<span class="placeholder">No data files loaded</span>';
        return;
    }
    
    var inModal = ModalState.sidebarContext === 'modal';
    var inSelMode = FileGroups.isSelectionMode();
    var pendingIds = inSelMode ? FileGroups.getPendingFileIds() : null;
    var html = '';

    // Render groups first
    var groups = FileGroups.getGroups();
    groups.forEach(function(group) {
        html += _renderGroupHeader(group, inModal);
        if (!group.collapsed) {
            var groupFiles = group.fileIds.map(function(fid) {
                return FileRegistry.all().find(function(f) { return f.id == fid; });
            }).filter(Boolean);
            groupFiles.forEach(function(file) {
                html += _renderFileItem(file, inModal, inSelMode, pendingIds, true);
            });
        }
        html += '</div>'; // close .file-group
    });

    // Ungrouped files
    var ungrouped = FileGroups.getUngroupedFiles();
    ungrouped.forEach(function(file) {
        html += _renderFileItem(file, inModal, inSelMode, pendingIds, false);
    });

    container.innerHTML = html;

    // Wire up drag events on file items
    if (!inSelMode) {
        container.querySelectorAll('.file-item[draggable="true"]').forEach(function(el) {
            el.addEventListener('dragstart', function(e) {
                var fid = parseFloat(el.dataset.fileId);
                FileGroups.onDragStart(fid);
                e.dataTransfer.effectAllowed = 'move';
                el.classList.add('dragging');
            });
            el.addEventListener('dragend', function() {
                FileGroups.onDragEnd();
                el.classList.remove('dragging');
            });
        });
        container.querySelectorAll('.file-group-header').forEach(function(el) {
            var gid = parseInt(el.dataset.groupId);
            el.addEventListener('dragover', function(e) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                el.classList.add('drag-over');
            });
            el.addEventListener('dragleave', function() {
                el.classList.remove('drag-over');
            });
            el.addEventListener('drop', function(e) {
                el.classList.remove('drag-over');
                FileGroups.onGroupDrop(e, gid);
            });
        });
    }

    // Update selection count if in selection mode
    if (inSelMode) FileGroups._updateSelectionCount();
}

function _renderGroupHeader(group, inModal) {
    var chevron = group.collapsed
        ? '<path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'
        : '<path d="M4 8l4-4 4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>';

    var fileCount = group.fileIds.filter(function(fid) {
        return FileRegistry.all().some(function(f) { return f.id == fid; });
    }).length;

    // Conditionally show "select files to add" lasso when the active chart allows it
    var lassoAvailable = !!(window.ModalState && ModalState.activeChart &&
                            ModalState.activeChart.supportsLassoSelection);
    var selectBtn = lassoAvailable
        ? '<button class="file-group-action-btn" onclick="event.stopPropagation(); FileGroups.startSelectionMode(' + group.id + ')" title="Select files to add">' +
            '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 8.5C2.5 9.5 3.5 10 5 10C7 10 9 9 9.5 7C10 5 9 3 7.5 2.5C6 2 4.5 2.5 4 4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 4L2.5 8.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="4" cy="8.5" r="1.5" stroke="currentColor" stroke-width="1" fill="none"/></svg>' +
          '</button>'
        : '<button class="file-group-action-btn file-group-action-btn--disabled" onclick="event.stopPropagation(); _notifyLassoUnavailable()" title="Lasso selection isn\'t available for this chart">' +
            '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 8.5C2.5 9.5 3.5 10 5 10C7 10 9 9 9.5 7C10 5 9 3 7.5 2.5C6 2 4.5 2.5 4 4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 4L2.5 8.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="4" cy="8.5" r="1.5" stroke="currentColor" stroke-width="1" fill="none"/></svg>' +
          '</button>';

    var actions =
            '<div class="file-group-actions">' +
                selectBtn +
                '<button class="file-group-action-btn" onclick="event.stopPropagation(); _promptRenameGroup(' + group.id + ')" title="Rename group">' +
                    '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8.5 1.5l2 2-6 6H2.5v-2l6-6z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
                '</button>' +
                '<button class="file-group-action-btn file-group-action-btn--danger" onclick="event.stopPropagation(); FileGroups.removeGroup(' + group.id + ')" title="Remove group">' +
                    '<svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>' +
                '</button>' +
            '</div>';

    return '<div class="file-group" data-group-id="' + group.id + '">' +
        '<div class="file-group-header" data-group-id="' + group.id + '" onclick="FileGroups.toggleGroupCollapse(' + group.id + ')">' +
            '<div class="file-group-color" style="background:' + group.color + ';" onclick="event.stopPropagation(); _openGroupColorPicker(' + group.id + ')">' +
                '<input type="color" class="file-color-input" id="group-color-input-' + group.id + '" value="' + group.color + '" ' +
                    'onchange="FileGroups.changeGroupColor(' + group.id + ', this.value)" onclick="event.stopPropagation()">' +
            '</div>' +
            '<svg class="file-group-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none">' + chevron + '</svg>' +
            '<span class="file-group-name">' + group.name + '</span>' +
            '<span class="file-group-count">' + fileCount + '</span>' +
            actions +
        '</div>';
}

function _renderFileItem(file, inModal, inSelMode, pendingIds, isGrouped) {
    var isEnabled = file.enabled;
    var isSelected = inModal ? ModalState.selectedFiles.has(file.id) : isEnabled;
    var isPending = inSelMode && pendingIds && pendingIds.has(file.id);

    var meta = '';
    if (inModal && ModalState.item) {
        var count = 0;
        if (ModalState.item.type === 'scatter') {
            meta = DataStore.getFileInstanceCount(file.id) + ' instances';
        } else if (ModalState.item.type === 'entity') {
            count = DataStore.getEntityCount(file.id, ModalState.item.name);
            meta = count + ' instance' + (count !== 1 ? 's' : '');
        } else {
            count = DataStore.getRelationCount(file.id, ModalState.item.name, ModalState.item.sourceEntity, ModalState.item.targetEntity);
            meta = count + ' instance' + (count !== 1 ? 's' : '');
        }
    } else {
        meta = DataStore.getFileInstanceCount(file.id) + ' instances';
    }

    var itemClass = 'file-item';
    if (isSelected && !inSelMode) itemClass += ' selected';
    if (!isEnabled && !inModal && !inSelMode) itemClass += ' disabled';
    if (isPending) itemClass += ' selected'; // highlight pending files
    if (isGrouped) itemClass += ' file-item--grouped';

    var clickHandler;
    if (inSelMode) {
        clickHandler = 'FileGroups.togglePendingFile(' + file.id + '); FileGroups._updateSelectionCount()';
    } else if (inModal) {
        clickHandler = 'toggleModalFile(\'' + file.id + '\')';
    } else {
        clickHandler = 'toggleFile(\'' + file.id + '\')';
    }

    var draggable = !inSelMode ? ' draggable="true"' : '';

    // In grouped context within edit mode, show an "ungroup" button instead of remove
    var removeBtn = '';
    if (isGrouped) {
        removeBtn =
            '<div class="file-remove" onclick="event.stopPropagation(); FileGroups.removeFileFromGroup(' + file.id + ')" title="Remove from group">' +
                '<svg viewBox="0 0 12 12" fill="none"><path d="M2 6h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>' +
            '</div>';
    } else {
        removeBtn =
            '<div class="file-remove" onclick="event.stopPropagation(); removeDataFile(\'' + file.id + '\')" title="Remove file">' +
                '<svg viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>' +
            '</div>';
    }

    var colorClickable = !isGrouped;
    var colorOnClick = colorClickable
        ? ' onclick="event.stopPropagation(); openColorPicker(\'' + file.id + '\')"'
        : '';

    return '<div class="' + itemClass + '" ' +
             'data-file-id="' + file.id + '"' + draggable +
             ' onclick="' + clickHandler + '">' +
            '<div class="file-icon" style="background: ' + file.color + ';"' + colorOnClick + '>' +
                '<svg viewBox="0 0 20 20" fill="none">' +
                    '<path d="M4 3h8l4 4v10H4V3z" stroke="white" stroke-width="1.5"/>' +
                    '<path d="M12 3v4h4" stroke="white" stroke-width="1.5"/>' +
                '</svg>' +
                (colorClickable ? '<input type="color" class="file-color-input" id="color-input-' + file.id + '" ' +
                       'value="' + file.color + '" ' +
                       'onchange="changeFileColor(\'' + file.id + '\', this.value)" ' +
                       'onclick="event.stopPropagation()">' : '') +
            '</div>' +
            '<div class="file-info">' +
                '<div class="file-name" title="' + file.name + '">' + file.name + '</div>' +
                '<div class="file-meta">' + meta + '</div>' +
            '</div>' +
            '<div class="file-toggle">' +
                '<svg viewBox="0 0 12 12" fill="none">' +
                    '<path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
                '</svg>' +
            '</div>' +
            removeBtn +
        '</div>';
}

function _promptRenameGroup(groupId) {
    var groups = FileGroups.getGroups();
    var group = groups.find(function(g) { return g.id === groupId; });
    if (!group) return;

    // Find the name span for this group's header and swap it for an inline editable input
    var header = document.querySelector('.file-group-header[data-group-id="' + groupId + '"]');
    if (!header) return;
    var nameEl = header.querySelector('.file-group-name');
    if (!nameEl || header.querySelector('.file-group-name-input')) return; // already editing

    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'file-group-name-input';
    input.value = group.name;
    input.maxLength = 60;
    // Don't let clicks/keys in the field collapse the group or bubble away.
    input.addEventListener('click', function(e) { e.stopPropagation(); });
    input.addEventListener('mousedown', function(e) { e.stopPropagation(); });

    var committed = false;
    function commit() {
        if (committed) return;
        committed = true;
        var v = input.value.trim();
        if (v) {
            FileGroups.renameGroup(groupId, v);  // re-renders the list
        } else {
            renderFileList();                    // restore original name
        }
    }
    function cancel() {
        if (committed) return;
        committed = true;
        renderFileList();
    }

    input.addEventListener('keydown', function(e) {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
    input.addEventListener('blur', commit);

    nameEl.replaceWith(input);
    input.focus();
    input.select();
}

function _openGroupColorPicker(groupId) {
    var input = document.getElementById('group-color-input-' + groupId);
    if (input) input.click();
}

function _notifyLassoUnavailable() {
    var msg = (window.ModalState && ModalState.activeChart)
        ? 'Lasso selection isn\'t available for this chart. You can still add files from the list.'
        : 'Open a chart with selectable points (e.g. the file distance map or a bar chart) to lasso files.';
    showToast(msg, 'warning');
}

function _promptCreateGroup() {
    var defaultName = 'Group ' + (FileGroups.getGroups().length + 1);
    var group = FileGroups.createGroup(defaultName);  // re-renders the list
    if (group) _promptRenameGroup(group.id);
}

function updateFileCount() {
    var count = (SchemaStore.isLoaded() ? 1 : 0) + FileRegistry.all().length;
    document.getElementById('file-count').textContent = count;
}

function updateGenerateButton() {
    var btn = document.getElementById('generate-btn');
    btn.disabled = !SchemaStore.isLoaded();
    
    var scatterBtn = document.getElementById('scatter-btn');
    if (scatterBtn) {
        scatterBtn.disabled = !SchemaStore.isLoaded() || FileRegistry.all().length < 2;
    }
}

function initFileSidebar() {
    var editToggle = document.getElementById('edit-mode-toggle');
    var editLabel = document.getElementById('edit-toggle-label');
    var sidebar = document.getElementById('file-sidebar');
    var footer = document.getElementById('file-sidebar-footer');
    
    editToggle.addEventListener('change', function() {
        var active = editToggle.checked;
        editLabel.classList.toggle('active', active);
        sidebar.classList.toggle('edit-mode', active);
        footer.style.display = active ? 'block' : 'none';
    });
    
    // Collapse / expand toggle
    document.getElementById('collapse-sidebar-btn').addEventListener('click', function() {
        sidebar.classList.toggle('collapsed');
        // After transition, re-render the active chart so it fills the new space
        scheduleChartResize();
    });
    
    document.getElementById('select-all-btn').addEventListener('click', function() {
        if (ModalState.sidebarContext === 'modal') {
            FileRegistry.all().forEach(function(file) { ModalState.selectedFiles.add(file.id); });
        } else {
            FileRegistry.setAllEnabled(true);
        }
        renderFileList();
        if (ModalState.sidebarContext === 'modal') updateChart();
        if (nodes.length > 0) renderDiagram();
    });
    
    document.getElementById('select-none-btn').addEventListener('click', function() {
        if (ModalState.sidebarContext === 'modal') {
            ModalState.selectedFiles.clear();
        } else {
            FileRegistry.setAllEnabled(false);
        }
        renderFileList();
        if (ModalState.sidebarContext === 'modal') updateChart();
        if (nodes.length > 0) renderDiagram();
    });
}

// ===========================
// Chart resize on layout change
// ===========================
var _resizeTimer = null;

function scheduleChartResize() {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(function() {
        if (!document.getElementById('modal-overlay').classList.contains('active')) return;

        var active = ModalState.activeChart;
        if (active && active.handlesOwnResize) return;

        updateChart();
    }, 280); // Slightly longer than 250ms CSS transition
}
