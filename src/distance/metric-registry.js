// ===========================
// File Distance — base class, registry, and facade
// ===========================

// ---------------------------------------------------------------------------
// Base class
// ---------------------------------------------------------------------------

class DistanceMetric {
    // options: metric-specific, produced by this metric's readOptions()
    // filters: global instance filters { entityType: { attrName: filterObj } }
    constructor(options, filters) {
        this.options = options || {};
        this.filters = filters || {};
    }

    distance(fileId1, fileId2) {
        throw new Error('DistanceMetric.distance must be implemented by subclass');
    }

    // ---- Global filtering ---

    getFilteredFile(fileId) {
        var orig = DataStore.getFile(fileId);
        if (!orig) return null;
        if (!this.filters || Object.keys(this.filters).length === 0) return orig;

        var self = this;
        var filteredNodes = [];
        var keptNodeIds = {};
        for (var i = 0; i < orig.nodes.length; i++) {
            var node = orig.nodes[i];
            if (self._nodePassesFilters(node, node.entityType)) {
                filteredNodes.push(node);
                keptNodeIds[node.id] = true;
            }
        }

        // Keep edges only if both endpoints survived.
        var filteredEdges = [];
        for (var j = 0; j < orig.edges.length; j++) {
            var e = orig.edges[j];
            if (keptNodeIds[e.sourceId] && keptNodeIds[e.targetId]) {
                filteredEdges.push(e);
            }
        }

        return { nodes: filteredNodes, edges: filteredEdges };
    }

    // True if a file has any data remaining after this metric's filters.
    hasFilteredData(fileId) {
        var f = this.getFilteredFile(fileId);
        return !!(f && (f.nodes.length > 0 || f.edges.length > 0));
    }

    _nodePassesFilters(node, entityType) {
        var f = this.filters[entityType];
        if (!f) return true;

        var propMap = {};
        var props = node.properties || [];
        for (var i = 0; i < props.length; i++) {
            propMap[props[i].name] = props[i].value;
        }

        for (var attrName in f) {
            var filter = f[attrName];
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

    // ---- Connected components (shared graph decomposition) ----

    // Decompose file data into connected components via union-find over edges.
    // Returns [{ entities:[node], relations:[edge] }].
    getComponents(fileData) {
        var nodeIds = [];
        var nodeById = {};
        for (var i = 0; i < fileData.nodes.length; i++) {
            var n = fileData.nodes[i];
            nodeIds.push(n.id);
            nodeById[n.id] = n;
        }

        var parent = {};
        function find(x) {
            if (parent[x] === undefined) parent[x] = x;
            while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
            return x;
        }
        function union(a, b) { parent[find(a)] = find(b); }

        for (var i = 0; i < nodeIds.length; i++) parent[nodeIds[i]] = nodeIds[i];
        for (var j = 0; j < fileData.edges.length; j++) {
            var e = fileData.edges[j];
            union(e.sourceId, e.targetId);
        }

        var groups = {};
        for (var i = 0; i < nodeIds.length; i++) {
            var root = find(nodeIds[i]);
            if (!groups[root]) groups[root] = { entities: [], relations: [] };
            groups[root].entities.push(nodeById[nodeIds[i]]);
        }
        for (var j = 0; j < fileData.edges.length; j++) {
            var e = fileData.edges[j];
            var root = find(e.sourceId);
            if (!groups[root]) groups[root] = { entities: [], relations: [] };
            groups[root].relations.push(e);
        }

        var components = [];
        for (var key in groups) components.push(groups[key]);
        return components;
    }

    // Canonical signature of a component (sorted label multiset)
    componentSignature(comp) {
        var labels = [];
        for (var i = 0; i < comp.entities.length; i++) labels.push('E:' + comp.entities[i].entityType);
        for (var j = 0; j < comp.relations.length; j++) labels.push('R:' + comp.relations[j].relationType);
        labels.sort();
        return labels.join('|');
    }

    // ---- Pre-computation dialog contract ----

    // Render metric-specific controls into containerEl.
    renderOptions(containerEl) {}

    // Read metric-specific options from the dialog overlay element.
    readOptions(overlayEl) { return {}; }
}

// ---------------------------------------------------------------------------
// Metric registry + facade
// ---------------------------------------------------------------------------

var FileDistance = (function () {

    // id -> metric class
    var _registry = {};
    // preserves declaration/registration order for the dialog
    var _order = [];

    function register(MetricClass) {
        _registry[MetricClass.id] = MetricClass;
        if (_order.indexOf(MetricClass.id) === -1) _order.push(MetricClass.id);
    }

    function getMetricClass(id) {
        return _registry[id] || null;
    }

    // [{ id, label }] in registration order, for the dialog's radio buttons.
    function listMetrics() {
        return _order.map(function(id) {
            return { id: id, label: _registry[id].label };
        });
    }

    // Build a metric instance from a saved config object.
    // config = { metric, filters, ...metric-specific options }
    // Each metric class maps config -> its options via static optionsFromConfig
    function buildMetric(config) {
        config = config || {};
        var id = config.metric || (_order.length ? _order[0] : null);
        var Cls = _registry[id];
        if (!Cls) throw new Error('Unknown distance metric: ' + id);
        var options = Cls.optionsFromConfig ? Cls.optionsFromConfig(config) : config;
        return new Cls(options, config.filters || {});
    }

    // ---- Runtime factory ----
    function makeMetric(config) {
        if (!config) {
            var defId = _order.length ? _order[0] : null;
            var DefCls = defId ? _registry[defId] : null;
            if (!DefCls) throw new Error('No distance metrics registered');
            var def = new DefCls({}, {});
            return function(a, b) { return def.distance(a, b); };
        }
        var inst = buildMetric(config);
        return function(a, b) { return inst.distance(a, b); };
    }

    // ---- Eligibility helper ----
    // True if the file has data remaining under the given filters.
    function hasFilteredData(fileId, filters) {
        // Filtering is metric-agnostic, so a bare base instance suffices.
        var probe = new DistanceMetric({}, filters || {});
        return probe.hasFilteredData(fileId);
    }

    return {
        // class + registry
        DistanceMetric: DistanceMetric,
        register: register,
        getMetricClass: getMetricClass,
        listMetrics: listMetrics,
        buildMetric: buildMetric,

        // runtime factory
        makeMetric: makeMetric,
        hasFilteredData: hasFilteredData,

        setWeightsFromSchema: function(/* schema */) { /* weights are constant */ }
    };
})();
