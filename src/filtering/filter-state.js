// ===========================
// FilterState - Attribute filter state
// ===========================
//
// Filter shape per entity type:
//   _filters[entityType] = {
//     attrName: { type:'enum',    selected: Set(['v1','v2']) }
//     attrName: { type:'numeric', floor: n|null, ceiling: n|null,
//                                 globalMin: n, globalMax: n }
//   }

var FilterState = (function() {

    var _filters = {};
    var _listeners = [];

    function _key(entityType) {
        if (!_filters[entityType]) _filters[entityType] = {};
        return _filters[entityType];
    }

    function _notify(entityType) {
        for (var i = 0; i < _listeners.length; i++) {
            _listeners[i](entityType);
        }
    }

    // ---- Filter manipulation ----

    function setEnumFilter(entityType, attrName, selectedValues) {
        var f = _key(entityType);
        f[attrName] = { type: 'enum', selected: new Set(selectedValues) };
        _notify(entityType);
    }

    function setNumericFilter(entityType, attrName, floor, ceiling, globalMin, globalMax) {
        var f = _key(entityType);
        f[attrName] = { type: 'numeric', floor: floor, ceiling: ceiling, globalMin: globalMin, globalMax: globalMax };
        _notify(entityType);
    }

    function clearFilter(entityType, attrName) {
        var f = _filters[entityType];
        if (f) delete f[attrName];
        _notify(entityType);
    }

    function clearAllFilters(entityType) {
        if (entityType) {
            delete _filters[entityType];
        } else {
            _filters = {};
        }
        _notify(entityType || null);
    }

    // ---- Filter inspection ----

    function getFilter(entityType, attrName) {
        var f = _filters[entityType];
        if (!f) return null;
        return f[attrName] || null;
    }

    function getFilters(entityType) {
        return _filters[entityType] || {};
    }

    function hasActiveFilters(entityType) {
        var f = _filters[entityType];
        if (!f) return false;
        for (var k in f) return true;
        return false;
    }

    // Test a node against a raw filter map (entityType's _filters[entityType]).
    function nodePassesFilterMap(node, filters) {
        if (!filters || Object.keys(filters).length === 0) return true;

        var propMap = {};
        var props = node.properties || [];
        for (var i = 0; i < props.length; i++) {
            propMap[props[i].name] = props[i].value;
        }

        for (var attrName in filters) {
            var filter = filters[attrName];
            var val = propMap[attrName];

            if (filter.type === 'enum') {
                if (filter.selected.size === 0) return false;
                var hasVal = (val !== undefined && val !== null && val !== 'TODO');
                if (!hasVal || !filter.selected.has(SchemaStore.categoryKey(val))) return false;
            } else if (filter.type === 'numeric') {
                if (val === undefined || val === null || val === 'TODO') return false;
                var numVal = typeof val === 'number' ? val : parseFloat(val);
                if (isNaN(numVal)) return false;
                if (filter.floor !== null && filter.floor !== undefined && numVal < filter.floor) return false;
                if (filter.ceiling !== null && filter.ceiling !== undefined && numVal > filter.ceiling) return false;
            }
        }
        return true;
    }

    function nodePassesFilters(node, entityType) {
        return nodePassesFilterMap(node, _filters[entityType]);
    }

    // ---- Change events ----

    function onChange(callback) {
        _listeners.push(callback);
    }

    function offChange(callback) {
        _listeners = _listeners.filter(function(cb) { return cb !== callback; });
    }

    return {
        // manipulation
        setEnumFilter: setEnumFilter,
        setNumericFilter: setNumericFilter,
        clearFilter: clearFilter,
        clearAllFilters: clearAllFilters,
        // inspection
        getFilter: getFilter,
        getFilters: getFilters,
        hasActiveFilters: hasActiveFilters,
        // predicates
        nodePassesFilters: nodePassesFilters,
        nodePassesFilterMap: nodePassesFilterMap,
        // events
        onChange: onChange,
        offChange: offChange
    };
})();
