// ==============
// FileRegistry
// ==============
// Single source of truth for the set of LOADED DATA FILES and their state

var FileRegistry = (function() {

    var _files = [];

    // ---- Identity / colors ----

    function _nextId() {
        return Date.now() + Math.random();
    }

    // First palette color not currently in use, else a golden-angle fallback.
    function nextUniqueColor() {
        var used = _files.map(function(f) { return normalizeColor(f.color); });
        for (var i = 0; i < FILE_COLOR_PALETTE.length; i++) {
            var normalized = normalizeColor(FILE_COLOR_PALETTE[i]);
            if (used.indexOf(normalized) === -1) return FILE_COLOR_PALETTE[i];
        }
        var hue = (_files.length * 137.508) % 360; // golden angle for spread
        return 'hsl(' + hue + ', 70%, 60%)';
    }

    // ---- Membership ----

    function exists(name, size) {
        return _files.some(function(f) { return f.name === name && f.size === size; });
    }

    // Adds a file record and returns it. Does not update DataStore.
    function add(name, size) {
        if (exists(name, size)) return null;
        var file = {
            id: _nextId(),
            name: name,
            size: size,
            color: nextUniqueColor(),
            enabled: true
        };
        _files.push(file);
        return file;
    }

    // Removes a file record by id. Caller pairs with DataStore.removeFile.
    function remove(fileId) {
        var idx = _files.findIndex(function(f) { return f.id == fileId; });
        if (idx !== -1) _files.splice(idx, 1);
    }

    // Empties the registry in place.
    function clear() {
        _files.length = 0;
    }

    // ---- Lookup / derived reads ----

    function all() { return _files; }

    function byId(fileId) {
        return _files.find(function(f) { return f.id == fileId; }) || null;
    }

    function count() { return _files.length; }

    function enabled() {
        return _files.filter(function(f) { return f.enabled; });
    }

    function enabledIds() {
        return _files.filter(function(f) { return f.enabled; }).map(function(f) { return f.id; });
    }

    // ---- Enabled flag (app-wide active set) ----

    function isEnabled(fileId) {
        var f = byId(fileId);
        return f ? !!f.enabled : false;
    }

    function setEnabled(fileId, on) {
        var f = byId(fileId);
        if (f) f.enabled = !!on;
    }

    function toggleEnabled(fileId) {
        var f = byId(fileId);
        if (f) f.enabled = !f.enabled;
        return f ? f.enabled : false;
    }

    function setAllEnabled(on) {
        _files.forEach(function(f) { f.enabled = !!on; });
    }

    // ---- Color ----

    function setColor(fileId, color) {
        var f = byId(fileId);
        if (f) f.color = color;
    }

    // Sets newColor on fileId; if another file already uses it, swaps them.
    function setColorWithSwap(fileId, newColor) {
        var file = byId(fileId);
        if (!file) return false;
        var normalizedNew = normalizeColor(newColor);
        var conflicting = _files.find(function(f) {
            return f.id != fileId && normalizeColor(f.color) === normalizedNew;
        });
        if (conflicting) conflicting.color = file.color;
        file.color = newColor;
        return true;
    }

    return {
        all: all,
        byId: byId,
        count: count,
        exists: exists,
        add: add,
        remove: remove,
        clear: clear,
        enabled: enabled,
        enabledIds: enabledIds,
        isEnabled: isEnabled,
        setEnabled: setEnabled,
        toggleEnabled: toggleEnabled,
        setAllEnabled: setAllEnabled,
        nextUniqueColor: nextUniqueColor,
        setColor: setColor,
        setColorWithSwap: setColorWithSwap
    };
})();
