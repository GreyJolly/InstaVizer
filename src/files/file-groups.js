// ===========================
// File Groups Manager
// ===========================
// Manages named groups of files. Files inherit the group color.
// Supports drag-and-drop from sidebar (one file, or a Ctrl/Cmd/Shift-click
// multi-selection) and lasso/click selection mode.

var FileGroups = (function() {

    var _groups = []; // [{ id, name, color, collapsed, fileIds: [] }]
    var _nextId = 1;

    // Selection-mode state
    var _selectionMode = false;
    var _targetGroupId = null;
    var _pendingFileIds = new Set();

    // Drag state (one or more files being dragged onto a group)
    var _dragFileIds = [];

    // Sidebar multi-selection (Ctrl/Cmd+click, Shift+click) used to drag
    // several files into a group at once. Independent of the enabled state.
    var _multiSelected = new Set();
    var _selectAnchor = null;

    // ---- Group CRUD ----

    function createGroup(name, color) {
        var group = {
            id: _nextId++,
            name: name || 'Group ' + _nextId,
            color: color || _pickGroupColor(),
            collapsed: false,
            fileIds: []
        };
        _groups.push(group);
        _applyGroupColors();
        renderFileList();
        return group;
    }

    function removeGroup(groupId) {
        var idx = _groups.findIndex(function(g) { return g.id === groupId; });
        if (idx === -1) return;
        var group = _groups[idx];
        // Restore each removed file's original (pre-group) color.
        group.fileIds.forEach(function(fid) {
            var file = FileRegistry.all().find(function(f) { return f.id == fid; });
            if (file) _restoreFileColor(file);
        });
        _groups.splice(idx, 1);
        updateGroupColorsInPlace();
    }

    function renameGroup(groupId, newName) {
        var group = _getGroup(groupId);
        if (group) {
            group.name = newName;
            renderFileList();
        }
    }

    function changeGroupColor(groupId, newColor) {
        var group = _getGroup(groupId);
        if (!group) return;
        group.color = newColor;
        if (isSelectionMode()) cancelSelectionMode();
        updateGroupColorsInPlace();
    }

    function toggleGroupCollapse(groupId) {
        var group = _getGroup(groupId);
        if (group) {
            group.collapsed = !group.collapsed;
            renderFileList();
        }
    }

    // ---- File <-> Group membership ----

    function addFileToGroup(fileId, groupId) {
        // Remove from any existing group first
        _groups.forEach(function(g) {
            var idx = g.fileIds.indexOf(fileId);
            if (idx !== -1) g.fileIds.splice(idx, 1);
        });
        var group = _getGroup(groupId);
        if (group) {
            group.fileIds.push(fileId);
            _applyFileColor(fileId, group.color);
        }
    }

    function removeFileFromGroup(fileId) {
        _groups.forEach(function(g) {
            var idx = g.fileIds.indexOf(fileId);
            if (idx !== -1) g.fileIds.splice(idx, 1);
        });
        // Restore the file's original (pre-group) color.
        var file = FileRegistry.all().find(function(f) { return f.id == fileId; });
        if (file) _restoreFileColor(file);
        updateGroupColorsInPlace();
    }

    function getGroupForFile(fileId) {
        for (var i = 0; i < _groups.length; i++) {
            if (_groups[i].fileIds.indexOf(fileId) !== -1) return _groups[i];
        }
        return null;
    }

    function getGroups() { return _groups; }

    function getUngroupedFiles() {
        var grouped = new Set();
        _groups.forEach(function(g) {
            g.fileIds.forEach(function(fid) { grouped.add(fid); });
        });
        return FileRegistry.all().filter(function(f) { return !grouped.has(f.id); });
    }

    // ---- Selection Mode (for lasso / click-to-select) ----

    function startSelectionMode(groupId) {
        _multiSelected.clear();
        _selectAnchor = null;
        _selectionMode = true;
        _targetGroupId = groupId;
        _pendingFileIds = new Set();
        document.body.classList.add('group-selection-mode');
        _renderSelectionBar();
        renderFileList();
        // Attach the lasso to the active chart if it supports selection
        _initLasso();
    }

    function cancelSelectionMode() {
        _selectionMode = false;
        _targetGroupId = null;
        _pendingFileIds = new Set();
        document.body.classList.remove('group-selection-mode');
        _removeSelectionBar();
        _updateAllSelectionHighlights();
        _removeLasso();
        renderFileList();
    }

    function confirmSelection() {
        if (!_targetGroupId || _pendingFileIds.size === 0) {
            cancelSelectionMode();
            return;
        }
        _pendingFileIds.forEach(function(fid) {
            addFileToGroup(fid, _targetGroupId);
        });
        _selectionMode = false;
        var gid = _targetGroupId;
        _targetGroupId = null;
        _pendingFileIds = new Set();
        document.body.classList.remove('group-selection-mode');
        _removeSelectionBar();
        _removeLasso();
        _updateAllSelectionHighlights();
        renderFileList();
        updateGroupColorsInPlace();
    }

    function togglePendingFile(fileId) {
        if (!_selectionMode) return;
        if (_pendingFileIds.has(fileId)) {
            _pendingFileIds.delete(fileId);
        } else {
            _pendingFileIds.add(fileId);
        }
        renderFileList();
        _updateAllSelectionHighlights();
    }

    function isSelectionMode() { return _selectionMode; }
    function getPendingFileIds() { return _pendingFileIds; }

    // ---- Selection mode UI bar ----

    function _renderSelectionBar() {
        _removeSelectionBar();
        var group = _getGroup(_targetGroupId);
        var bar = document.createElement('div');
        bar.id = 'group-selection-bar';
        bar.className = 'group-selection-bar';
        bar.innerHTML =
            '<div class="group-selection-bar-info">' +
                '<span class="group-selection-bar-dot" style="background:' + (group ? group.color : '#888') + '"></span>' +
                '<span>Select files for <strong>' + (group ? group.name : 'group') + '</strong></span>' +
                '<span class="group-selection-count" id="group-selection-count">0 selected</span>' +
            '</div>' +
            '<div class="group-selection-bar-actions">' +
                '<button class="select-btn group-sel-confirm" id="group-sel-confirm">Confirm</button>' +
                '<button class="select-btn group-sel-cancel" id="group-sel-cancel">Cancel</button>' +
            '</div>';
        document.body.appendChild(bar);
        document.getElementById('group-sel-confirm').addEventListener('click', confirmSelection);
        document.getElementById('group-sel-cancel').addEventListener('click', cancelSelectionMode);
    }

    function _removeSelectionBar() {
        var bar = document.getElementById('group-selection-bar');
        if (bar) bar.remove();
    }

    function _updateSelectionCount() {
        var el = document.getElementById('group-selection-count');
        if (el) el.textContent = _pendingFileIds.size + ' selected';
    }

    // In-place color update (no full re-render)
    function updateGroupColorsInPlace() {
        _applyGroupColors(); // updates file.color on data objects

        // Recolor the active modal chart polymorphically
        if (ModalState.activeChart && ModalState.activeChart.updateColors) {
            ModalState.activeChart.updateColors();
        }

        // The ER diagram's canvas mini-charts aren't modal Charts, so they're recolored separately
        invalidateMiniChartCache();
        if (nodes.length > 0) renderDiagram();

        // Re-render file list sidebar only
        renderFileList();

        _removeLasso();
    }

    // ---- Lasso / click selection (delegated to LassoController)----

    function _initLasso() {
        if (typeof LassoController === 'undefined') return;
        LassoController.attach(ModalState.activeChart, {
            onToggle: function(fileId) {
                _togglePendingNoRender(fileId);
                _updateSelectionCount();
            },
            onLassoHits: function(idSet) {
                idSet.forEach(function(fid) { _pendingFileIds.add(fid); });
                _updateSelectionCount();
                renderFileList();
            },
            isSelected: function(fileId) { return _pendingFileIds.has(fileId); }
        });
    }

    function _removeLasso() {
        if (typeof LassoController !== 'undefined') LassoController.detach();
    }

    // Repaint selection highlights on the active chart (delegated).
    function _updateAllSelectionHighlights() {
        if (typeof LassoController !== 'undefined') LassoController.refreshHighlights();
    }

    // Toggle without triggering a file-list re-render
    function _togglePendingNoRender(fileId) {
        if (!_selectionMode) return;
        if (_pendingFileIds.has(fileId)) _pendingFileIds.delete(fileId);
        else _pendingFileIds.add(fileId);
        _updateAllSelectionHighlights();
    }

    // ---- Sidebar multi-selection ----

    // Called from a file item's click handler. Returns true when the click was
    // a multi-select gesture (Ctrl/Cmd or Shift held) and has been handled, so
    // the caller should skip its normal enable/disable toggle.
    function onFileClick(event, fileId) {
        if (_selectionMode) return false;

        var additive = event.ctrlKey || event.metaKey;
        if (!additive && !event.shiftKey) {
            // Plain click: drop any multi-selection and let the normal toggle run.
            if (_multiSelected.size > 0) {
                _multiSelected.clear();
                _selectAnchor = null;
            }
            return false;
        }

        if (event.shiftKey) {
            // Shift+click would otherwise extend the page's text selection.
            if (window.getSelection) window.getSelection().removeAllRanges();
            var visible = _visibleFileIds();
            var from = visible.indexOf(_selectAnchor);
            var to = visible.indexOf(fileId);
            if (from !== -1 && to !== -1) {
                if (!additive) _multiSelected.clear();
                var lo = Math.min(from, to), hi = Math.max(from, to);
                for (var i = lo; i <= hi; i++) _multiSelected.add(visible[i]);
                renderFileList();
                return true;
            }
            // No usable anchor: fall through and treat it as a single toggle.
        }

        if (_multiSelected.has(fileId)) _multiSelected.delete(fileId);
        else _multiSelected.add(fileId);
        _selectAnchor = fileId;
        renderFileList();
        return true;
    }

    // File ids in the order they currently appear in the sidebar (files inside
    // collapsed groups are not rendered, so they're skipped by range selects).
    function _visibleFileIds() {
        var items = document.querySelectorAll('#file-sidebar-list .file-item[data-file-id]');
        return Array.prototype.map.call(items, function(el) {
            return parseFloat(el.dataset.fileId);
        });
    }

    function isMultiSelected(fileId) { return _multiSelected.has(fileId); }

    // Selected ids in sidebar-registry order.
    function getMultiSelectedIds() {
        return FileRegistry.all()
            .filter(function(f) { return _multiSelected.has(f.id); })
            .map(function(f) { return f.id; });
    }

    function clearMultiSelection() {
        if (_multiSelected.size === 0) return;
        _multiSelected.clear();
        _selectAnchor = null;
        renderFileList();
    }

    // Escape clears the multi-selection. Captured on window so it runs before
    // the modal's Escape-to-close handler and doesn't also close the modal.
    window.addEventListener('keydown', function(e) {
        if (e.key !== 'Escape' || _multiSelected.size === 0) return;
        var t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
        e.stopPropagation();
        clearMultiSelection();
    }, true);

    // ---- Drag & Drop from sidebar ----

    // Accepts a single file id or an array of ids.
    function onDragStart(fileIds) {
        _dragFileIds = Array.isArray(fileIds) ? fileIds.slice() : [fileIds];
    }

    function onDragEnd() {
        _dragFileIds = [];
        document.querySelectorAll('.file-group-header.drag-over').forEach(function(el) {
            el.classList.remove('drag-over');
        });
    }

    function onGroupDragOver(event, groupId) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }

    function onGroupDrop(event, groupId) {
        event.preventDefault();
        if (_dragFileIds.length > 0) {
            _dragFileIds.forEach(function(fid) { addFileToGroup(fid, groupId); });
            _dragFileIds = [];
            _multiSelected.clear();
            _selectAnchor = null;
            updateGroupColorsInPlace();
        }
    }

    // ---- Internal helpers ----

    function _getGroup(groupId) {
        return _groups.find(function(g) { return g.id === groupId; });
    }

    function _pickGroupColor() {
        var usedColors = _groups.map(function(g) { return normalizeColor(g.color); });
        var palette = [
            '#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6',
            '#ef4444', '#06b6d4', '#84cc16', '#f97316', '#a855f7'
        ];
        for (var i = 0; i < palette.length; i++) {
            if (usedColors.indexOf(normalizeColor(palette[i])) === -1) return palette[i];
        }
        var hue = (_groups.length * 137.508) % 360;
        return 'hsl(' + hue + ', 65%, 55%)';
    }

    function _applyGroupColors() {
        _groups.forEach(function(g) {
            g.fileIds.forEach(function(fid) {
                _applyFileColor(fid, g.color);
            });
        });
    }

    function _applyFileColor(fileId, color) {
        var file = FileRegistry.all().find(function(f) { return f.id == fileId; });
        if (file) {
            // Remember the file's color before it first joined a group, so it can
            // be restored on removal rather than reassigned a fresh palette color.
            if (file._origColor == null) file._origColor = file.color;
            file.color = color;
        }
    }

    // Restore a file's pre-group color (or a fresh unique color if none saved).
    function _restoreFileColor(file) {
        if (file._origColor != null) {
            file.color = file._origColor;
            delete file._origColor;
        } else {
            file.color = FileRegistry.nextUniqueColor();
        }
    }

    // When a file is removed globally, clean it from groups
    function onFileRemoved(fileId) {
        _groups.forEach(function(g) {
            var idx = g.fileIds.indexOf(fileId);
            if (idx !== -1) g.fileIds.splice(idx, 1);
        });
        _multiSelected.delete(fileId);
        if (_selectAnchor === fileId) _selectAnchor = null;
    }

    // When all files cleared
    function onClearAll() {
        _groups = [];
        _nextId = 1;
        _multiSelected.clear();
        _selectAnchor = null;
        cancelSelectionMode();
    }

    return {
        createGroup: createGroup,
        removeGroup: removeGroup,
        renameGroup: renameGroup,
        changeGroupColor: changeGroupColor,
        toggleGroupCollapse: toggleGroupCollapse,
        addFileToGroup: addFileToGroup,
        removeFileFromGroup: removeFileFromGroup,
        getGroupForFile: getGroupForFile,
        getGroups: getGroups,
        getUngroupedFiles: getUngroupedFiles,
        startSelectionMode: startSelectionMode,
        cancelSelectionMode: cancelSelectionMode,
        confirmSelection: confirmSelection,
        togglePendingFile: togglePendingFile,
        isSelectionMode: isSelectionMode,
        getPendingFileIds: getPendingFileIds,
        onFileClick: onFileClick,
        isMultiSelected: isMultiSelected,
        getMultiSelectedIds: getMultiSelectedIds,
        clearMultiSelection: clearMultiSelection,
        onDragStart: onDragStart,
        onDragEnd: onDragEnd,
        onGroupDragOver: onGroupDragOver,
        onGroupDrop: onGroupDrop,
        onFileRemoved: onFileRemoved,
        onClearAll: onClearAll,
        _updateSelectionCount: _updateSelectionCount
    };
})();
