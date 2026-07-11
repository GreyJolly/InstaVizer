// ===========================
// ModalState - Central Modal/Chart UI State
// ===========================

var ModalState = (function() {

    // ---- Core modal state ----

    var _item = null;            // { type: 'entity'|'relationship'|'scatter', name, sourceEntity?, targetEntity? }
    var _chartType = 'instances'; // 'instances' | 'attribute' | 'boxplot' | 'parallel' | 'scatter'
    var _selectedFiles = new Set(); // file IDs selected in the modal
    var _relationChain = [];     // [{ relation, sourceEntity, targetEntity }]
    var _activeChart = null;     // the Chart instance currently shown (polymorphic handle)
    var _sidebarContext = 'main'; // 'main' | 'modal' — which sidebar the file list serves

    // ---- Per-chart config groups (formerly chart module-locals) ----

    var instances = {
        referenceFileId: null   // file ID for diverging compare mode (null = off)
    };

    var attribute = {
        prop: null,             // { name, dtype, values? }
        binSize: null,          // user bin size for numeric attrs (null = auto)
        compareFileId: null     // file ID for attribute compare mode (null = off)
    };

    var boxplot = {
        xProp: null,            // X-axis attribute { name, dtype, values? }
        yProp: null,            // Y-axis attribute (numeric) { name, dtype }
        binSize: null,          // user bin size for numeric X-axis (null = auto)
        relation: null,         // { relation, sourceEntity, targetEntity, otherEntity } or null
        xEntity: null,          // entity type providing X values (relation mode)
        yEntity: null           // entity type providing Y values (relation mode)
    };

    function resetInstances() {
        instances.referenceFileId = null;
    }

    function resetAttribute() {
        attribute.prop = null;
        attribute.binSize = null;
        attribute.compareFileId = null;
    }

    function resetBoxplot() {
        boxplot.xProp = null;
        boxplot.yProp = null;
        boxplot.binSize = null;
        boxplot.relation = null;
        boxplot.xEntity = null;
        boxplot.yEntity = null;
    }

    return {
        // Config groups (mutated directly by event handlers + render adapters)
        instances: instances,
        attribute: attribute,
        boxplot: boxplot,

        // ---- Core state accessors ----
        get item() { return _item; },
        set item(v) { _item = v; },

        get chartType() { return _chartType; },
        set chartType(v) { _chartType = v; },

        // Returns the live Set instance
        get selectedFiles() { return _selectedFiles; },
        set selectedFiles(v) { _selectedFiles = v; },

        get relationChain() { return _relationChain; },
        set relationChain(v) { _relationChain = v; },

        // The Chart instance currently displayed in the modal.
        get activeChart() { return _activeChart; },
        set activeChart(v) { _activeChart = v; },

        // Which context the file sidebar is serving: 'main' (tools view) or 'modal'
        get sidebarContext() { return _sidebarContext; },
        set sidebarContext(v) { _sidebarContext = v; },

        // Returns the list of currently selected file objects, in registry order.
        selectedFileObjects: function() {
            return FileRegistry.all().filter(function(f) { return _selectedFiles.has(f.id); });
        },

        // Returns just the IDs
        selectedFileIds: function() {
            return FileRegistry.all()
                .filter(function(f) { return _selectedFiles.has(f.id); })
                .map(function(f) { return f.id; });
        },

        // ---- Reset ----
        // Clears every per-chart config group.
        reset: function() {
            resetInstances();
            resetAttribute();
            resetBoxplot();
        }
    };
})();
