// =================
// Multiple node selection
// =================

var GraphSelection = (function() {
    var _active = false;      // multi-select mode on/off
    var _nodes = new Set();   // selected node ids

    return {
        isActive: function() { return _active; },
        setActive: function(v) { _active = !!v; },
        toggleActive: function() { _active = !_active; return _active; },

        isSelected: function(id) { return _nodes.has(id); },
        toggle: function(id) {
            if (_nodes.has(id)) _nodes.delete(id);
            else _nodes.add(id);
        },
        add: function(id) { _nodes.add(id); },
        remove: function(id) { _nodes.delete(id); },
        clear: function() { _nodes.clear(); },
        size: function() { return _nodes.size; },
        ids: function() { return Array.from(_nodes); }
    };
})();
