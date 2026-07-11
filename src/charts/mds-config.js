// ===========================
// MDS Configuration Dialog
// ===========================
// Shown before opening the MDS scatterplot. Lets the user choose:
//   - Distance metric (attribute vs structural)
//   - For attribute: which attributes to include
//   - For structural: approximate toggle + parameters
//   - Instance filters (same as bar-chart filters) for both metrics

var MdsConfig = (function () {

    var _overlay = null;
    var _resolve = null; // promise resolver

    // ---- Public: show dialog, returns a Promise<config|null> ----

    function show() {
        return new Promise(function (resolve) {
            _resolve = resolve;
            _buildDialog();
        });
    }

    // ---- Build DOM ----

    function _buildDialog() {
        // Overlay
        _overlay = document.createElement('div');
        _overlay.className = 'mds-config-overlay';

        var dialog = document.createElement('div');
        dialog.className = 'mds-config-dialog';

        // Header
        dialog.innerHTML =
            '<div class="mds-config-header">' +
                '<h3>MDS Distance Configuration</h3>' +
                '<button class="mds-config-close" id="mds-cfg-close">&times;</button>' +
            '</div>';

        // Body (scrollable)
        var body = document.createElement('div');
        body.className = 'mds-config-body';

        // ---- Section 1: Metric choice ----
        body.appendChild(_buildSection('Distance Metric', _buildMetricChoice()));

        // ---- Section 2: Metric-specific options (attribute subset / approx params) ----
        var metricOpts = document.createElement('div');
        metricOpts.id = 'mds-cfg-metric-opts';
        body.appendChild(metricOpts);

        // ---- Section 3: Instance filters ----
        body.appendChild(_buildSection('Instance Filters', _buildFilterSection(), 'mds-cfg-filter-section'));

        dialog.appendChild(body);

        // Footer
        var footer = document.createElement('div');
        footer.className = 'mds-config-footer';
        footer.innerHTML =
            '<button class="mds-cfg-btn mds-cfg-btn-cancel" id="mds-cfg-cancel">Cancel</button>' +
            '<button class="mds-cfg-btn mds-cfg-btn-run" id="mds-cfg-run">Compute</button>';
        dialog.appendChild(footer);

        _overlay.appendChild(dialog);
        document.body.appendChild(_overlay);

        // Wire events
        _overlay.querySelector('#mds-cfg-close').addEventListener('click', _cancel);
        _overlay.querySelector('#mds-cfg-cancel').addEventListener('click', _cancel);
        _overlay.querySelector('#mds-cfg-run').addEventListener('click', _submit);
        _overlay.addEventListener('click', function (e) {
            if (e.target === _overlay) _cancel();
        });

        // Initial metric option render
        _onMetricChange();
    }

    function _buildSection(title, content, id) {
        var sec = document.createElement('div');
        sec.className = 'mds-cfg-section';
        if (id) sec.id = id;
        var h = document.createElement('div');
        h.className = 'mds-cfg-section-title';
        h.textContent = title;
        sec.appendChild(h);
        sec.appendChild(content);
        return sec;
    }

    // ---- Metric choice ----

    function _buildMetricChoice() {
        var wrap = document.createElement('div');
        wrap.className = 'mds-cfg-metric-toggle';
        var metrics = FileDistance.listMetrics();
        var html = '';
        for (var i = 0; i < metrics.length; i++) {
            html += '<label class="mds-cfg-radio-label">' +
                '<input type="radio" name="mds-metric" value="' + metrics[i].id + '"' +
                (i === 0 ? ' checked' : '') + '> ' + metrics[i].label +
            '</label>';
        }
        wrap.innerHTML = html;
        wrap.addEventListener('change', _onMetricChange);
        return wrap;
    }

    function _getSelectedMetric() {
        var metrics = FileDistance.listMetrics();
        var fallback = metrics.length ? metrics[0].id : null;
        if (!_overlay) return fallback;
        var checked = _overlay.querySelector('input[name="mds-metric"]:checked');
        return checked ? checked.value : fallback;
    }

    // Instantiate the selected metric
    function _metricInstance() {
        var Cls = FileDistance.getMetricClass(_getSelectedMetric());
        return Cls ? new Cls({}, {}) : null;
    }

    function _onMetricChange() {
        var container = _overlay.querySelector('#mds-cfg-metric-opts');
        container.innerHTML = '';
        var metric = _metricInstance();
        if (!metric) return;
        var body = document.createElement('div');
        metric.renderOptions(body);   // metric populates its own controls
        container.appendChild(_buildSection('Options', body));
    }

    // ---- Attribute subset ----

    function _buildAttributeSubset() {
        var wrap = document.createElement('div');
        wrap.className = 'mds-cfg-attr-subset';
        if (!SchemaStore.getEntities()) {
            wrap.innerHTML = '<div class="mds-cfg-empty">No schema loaded</div>';
            return wrap;
        }

        var _entities = SchemaStore.getEntities();
        for (var entityType in _entities) {
            var def = _entities[entityType];
            var props = (def.properties || []).filter(function (p) {
                return p.dtype === 'enum' || p.dtype === 'int' || p.dtype === 'float' || p.dtype === 'bool';
            });
            if (props.length === 0) continue;

            var group = document.createElement('div');
            group.className = 'mds-cfg-collapsible';

            // Header
            var header = document.createElement('div');
            header.className = 'mds-cfg-collapsible-header';
            header.innerHTML =
                '<svg class="mds-cfg-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none">' +
                    '<path d="M3 4.5l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
                '</svg>' +
                '<span class="mds-cfg-collapsible-label">' + entityType + '</span>' +
                '<span class="mds-cfg-attr-count">' + props.length + ' attrs</span>';
            group.appendChild(header);

            // Content
            var content = document.createElement('div');
            content.className = 'mds-cfg-collapsible-body';

            // Select all / none
            var selRow = document.createElement('div');
            selRow.className = 'mds-cfg-select-row';
            selRow.innerHTML =
                '<button class="mds-cfg-link-btn mds-cfg-sel-all" data-entity="' + entityType + '">All</button>' +
                '<button class="mds-cfg-link-btn mds-cfg-sel-none" data-entity="' + entityType + '">None</button>';
            content.appendChild(selRow);

            for (var i = 0; i < props.length; i++) {
                var p = props[i];
                var lbl = document.createElement('label');
                lbl.className = 'mds-cfg-attr-check';
                lbl.innerHTML =
                    '<input type="checkbox" checked data-entity="' + entityType + '" data-attr="' + p.name + '">' +
                    '<span>' + p.name + '</span>' +
                    '<span class="mds-cfg-dtype-tag">' + p.dtype + '</span>';
                content.appendChild(lbl);
            }

            group.appendChild(content);
            wrap.appendChild(group);

            // Wire collapse toggle
            (function (h, c) {
                h.addEventListener('click', function () {
                    var g = h.parentElement;
                    g.classList.toggle('collapsed');
                });
            })(header, content);

            // Wire select all / none
            (function (et, contentEl) {
                contentEl.parentElement.querySelector('.mds-cfg-sel-all').addEventListener('click', function (e) {
                    e.stopPropagation();
                    contentEl.querySelectorAll('input[type="checkbox"]').forEach(function (cb) { cb.checked = true; });
                });
                contentEl.parentElement.querySelector('.mds-cfg-sel-none').addEventListener('click', function (e) {
                    e.stopPropagation();
                    contentEl.querySelectorAll('input[type="checkbox"]').forEach(function (cb) { cb.checked = false; });
                });
            })(entityType, content);
        }

        if (wrap.children.length === 0) {
            wrap.innerHTML = '<div class="mds-cfg-empty">No filterable attributes in schema</div>';
        }

        return wrap;
    }

    function _getSelectedAttributes() {
        // Returns { entityType: [attrName, ...], ... }
        var result = {};
        if (!_overlay) return result;
        var cbs = _overlay.querySelectorAll('.mds-cfg-attr-subset input[type="checkbox"]');
        cbs.forEach(function (cb) {
            if (cb.checked) {
                var et = cb.dataset.entity;
                if (!result[et]) result[et] = [];
                result[et].push(cb.dataset.attr);
            }
        });
        return result;
    }

    // ---- Structural options ----

    function _buildStructuralOptions() {
        var wrap = document.createElement('div');
        wrap.className = 'mds-cfg-structural-opts';
        wrap.innerHTML =
            '<label class="mds-cfg-toggle-row">' +
                '<input type="checkbox" id="mds-cfg-approx" checked>' +
                '<span>Approximate (faster, less accurate)</span>' +
            '</label>' +
            '<div class="mds-cfg-approx-params" id="mds-cfg-approx-params">' +
                '<div class="mds-cfg-param-row">' +
                    '<label>Samples (N_SAMPLES):</label>' +
                    '<input type="number" id="mds-cfg-nsamples" value="50" min="5" max="500" step="5">' +
                '</div>' +
                '<div class="mds-cfg-param-row">' +
                    '<label>Max iterations (T_MAX):</label>' +
                    '<input type="number" id="mds-cfg-tmax" value="200" min="10" max="2000" step="10">' +
                '</div>' +
                '<div class="mds-cfg-param-row">' +
                    '<label>Match probability (P_MATCH):</label>' +
                    '<input type="number" id="mds-cfg-pmatch" value="0.8" min="0" max="1" step="0.05">' +
                '</div>' +
                '<p class="mds-cfg-hint">Approximation improves performance at the cost of accuracy. ' +
                    'Higher samples and iterations give better results but take longer.</p>' +
            '</div>';

        // Wire toggle
        setTimeout(function () {
            var toggle = _overlay.querySelector('#mds-cfg-approx');
            var params = _overlay.querySelector('#mds-cfg-approx-params');
            if (toggle && params) {
                toggle.addEventListener('change', function () {
                    params.style.display = toggle.checked ? '' : 'none';
                });
            }
        }, 0);

        return wrap;
    }

    function _getStructuralConfig() {
        var approx = _overlay.querySelector('#mds-cfg-approx');
        if (!approx) return { approximate: true, nSamples: 50, tMax: 200, pMatch: 0.8 };
        return {
            approximate: approx.checked,
            nSamples: parseInt(_overlay.querySelector('#mds-cfg-nsamples').value) || 50,
            tMax: parseInt(_overlay.querySelector('#mds-cfg-tmax').value) || 200,
            pMatch: parseFloat(_overlay.querySelector('#mds-cfg-pmatch').value) || 0.8
        };
    }

    // ---- Instance filters ----

    function _buildFilterSection() {
        var wrap = document.createElement('div');
        wrap.className = 'mds-cfg-filters';
        if (!SchemaStore.getEntities()) {
            wrap.innerHTML = '<div class="mds-cfg-empty">No schema loaded</div>';
            return wrap;
        }

        var allFileIds = FileRegistry.enabledIds();

        // Entity filters
        var _entities = SchemaStore.getEntities();
        for (var entityType in _entities) {
            var def = _entities[entityType];
            var props = (def.properties || []).filter(function (p) {
                return p.dtype === 'enum' || p.dtype === 'int' || p.dtype === 'float';
            });
            if (props.length === 0) continue;

            var group = document.createElement('div');
            group.className = 'mds-cfg-collapsible collapsed';

            var header = document.createElement('div');
            header.className = 'mds-cfg-collapsible-header';
            header.innerHTML =
                '<svg class="mds-cfg-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none">' +
                    '<path d="M3 4.5l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
                '</svg>' +
                '<span class="mds-cfg-collapsible-label">' + entityType + '</span>' +
                '<span class="mds-cfg-attr-count">' + props.length + ' attrs</span>';
            group.appendChild(header);

            var content = document.createElement('div');
            content.className = 'mds-cfg-collapsible-body';

            for (var i = 0; i < props.length; i++) {
                var p = props[i];
                var section = _buildFilterAttr(entityType, p, allFileIds);
                content.appendChild(section);
            }

            group.appendChild(content);
            wrap.appendChild(group);

            header.addEventListener('click', function () {
                this.parentElement.classList.toggle('collapsed');
            });
        }

        // Relationship filters
        // Skip relationship attribute filters since the schema typically doesn't have filterable relation properties. Add them later if needed.

        if (wrap.children.length === 0) {
            wrap.innerHTML = '<div class="mds-cfg-empty">No filterable attributes in schema</div>';
        }

        return wrap;
    }

    function _buildFilterAttr(entityType, prop, allFileIds) {
        var attrWrap = document.createElement('div');
        attrWrap.className = 'mds-cfg-filter-attr';
        attrWrap.dataset.entityType = entityType;
        attrWrap.dataset.attrName = prop.name;
        attrWrap.dataset.dtype = prop.dtype;

        var label = document.createElement('div');
        label.className = 'mds-cfg-filter-attr-label';
        label.innerHTML = '<span>' + prop.name + '</span><span class="mds-cfg-dtype-tag">' + prop.dtype + '</span>';
        attrWrap.appendChild(label);

        if (prop.dtype === 'enum') {
            var values = prop.values || [];
            // Compute counts for this enum attribute
            var enumCounts = {};
            if (allFileIds.length > 0) {
                enumCounts = FilterQuery.getEnumValueCounts(entityType, prop.name, allFileIds);
            }
            
            var checkWrap = document.createElement('div');
            checkWrap.className = 'mds-cfg-enum-checks';
            for (var i = 0; i < values.length; i++) {
                var lbl = document.createElement('label');
                lbl.className = 'mds-cfg-enum-check';
                var count = enumCounts[values[i]] || 0;
                lbl.innerHTML =
                    '<input type="checkbox" checked data-entity-filter="' + entityType + '" data-attr-filter="' + prop.name + '" value="' + values[i] + '">' +
                    '<span>' + values[i] + ' (' + count + ')</span>';
                checkWrap.appendChild(lbl);
            }
            attrWrap.appendChild(checkWrap);
        } else if (prop.dtype === 'int' || prop.dtype === 'float') {
            var nums = DataStore.getAttributeNumericValues(entityType, prop.name, allFileIds);
            if (nums.length > 0) {
                var mn = nums[0], mx = nums[0];
                for (var j = 1; j < nums.length; j++) {
                    if (nums[j] < mn) mn = nums[j];
                    if (nums[j] > mx) mx = nums[j];
                }
                var isInt = prop.dtype === 'int';
                var step = isInt ? '1' : 'any';
                var fmt = function (v) { return isInt ? Math.round(v) : v.toFixed(2); };
                var numWrap = document.createElement('div');
                numWrap.className = 'mds-cfg-numeric-inputs';
                numWrap.innerHTML =
                    '<div class="mds-cfg-range-info">Range: ' + fmt(mn) + ' – ' + fmt(mx) + '</div>' +
                    '<div class="mds-cfg-num-row">' +
                        '<label>Floor</label>' +
                        '<input type="number" class="mds-cfg-floor" step="' + step + '" placeholder="' + fmt(mn) + '" ' +
                            'data-entity-filter="' + entityType + '" data-attr-filter="' + prop.name + '" data-role="floor" data-gmin="' + mn + '" data-gmax="' + mx + '">' +
                    '</div>' +
                    '<div class="mds-cfg-num-row">' +
                        '<label>Ceiling</label>' +
                        '<input type="number" class="mds-cfg-ceiling" step="' + step + '" placeholder="' + fmt(mx) + '" ' +
                            'data-entity-filter="' + entityType + '" data-attr-filter="' + prop.name + '" data-role="ceiling" data-gmin="' + mn + '" data-gmax="' + mx + '">' +
                    '</div>';
                attrWrap.appendChild(numWrap);
            }
        }

        return attrWrap;
    }

    // Collect filters from the dialog into a format usable by the filter engine
    // Returns { entityType: { attrName: filterObj, ... }, ... }
    function _getInstanceFilters() {
        var filters = {};
        if (!_overlay) return filters;

        // Enum filters
        var enumChecks = _overlay.querySelectorAll('.mds-cfg-enum-checks input[type="checkbox"]');
        var enumGroups = {};
        enumChecks.forEach(function (cb) {
            var et = cb.dataset.entityFilter;
            var attr = cb.dataset.attrFilter;
            var key = et + '::' + attr;
            if (!enumGroups[key]) enumGroups[key] = { entity: et, attr: attr, all: 0, selected: [] };
            enumGroups[key].all++;
            if (cb.checked) enumGroups[key].selected.push(cb.value);
        });
        for (var key in enumGroups) {
            var g = enumGroups[key];
            if (g.selected.length < g.all) {
                if (!filters[g.entity]) filters[g.entity] = {};
                filters[g.entity][g.attr] = { type: 'enum', selected: new Set(g.selected) };
            }
        }

        // Numeric filters
        var numInputs = _overlay.querySelectorAll('.mds-cfg-numeric-inputs input[type="number"]');
        var numGroups = {};
        numInputs.forEach(function (inp) {
            var et = inp.dataset.entityFilter;
            var attr = inp.dataset.attrFilter;
            var role = inp.dataset.role;
            var key = et + '::' + attr;
            if (!numGroups[key]) numGroups[key] = {
                entity: et, attr: attr,
                floor: null, ceiling: null,
                gmin: parseFloat(inp.dataset.gmin),
                gmax: parseFloat(inp.dataset.gmax)
            };
            if (role === 'floor' && inp.value !== '') numGroups[key].floor = parseFloat(inp.value);
            if (role === 'ceiling' && inp.value !== '') numGroups[key].ceiling = parseFloat(inp.value);
        });
        for (var key in numGroups) {
            var g = numGroups[key];
            var isDefault = (g.floor === null || g.floor <= g.gmin) && (g.ceiling === null || g.ceiling >= g.gmax);
            if (!isDefault) {
                if (!filters[g.entity]) filters[g.entity] = {};
                filters[g.entity][g.attr] = { type: 'numeric', floor: g.floor, ceiling: g.ceiling, globalMin: g.gmin, globalMax: g.gmax };
            }
        }

        return filters;
    }

    // ---- Submit / Cancel ----

    function _submit() {
        var metric = _metricInstance();
        var config = {
            metric: _getSelectedMetric(),
            filters: _getInstanceFilters()
        };

        if (metric) {
            var opts = metric.readOptions(_overlay) || {};
            for (var k in opts) config[k] = opts[k];
        }

        _close();
        _resolve(config);
    }

    function _cancel() {
        _close();
        _resolve(null);
    }

    function _close() {
        if (_overlay && _overlay.parentNode) {
            _overlay.remove();
        }
        _overlay = null;
    }

    // ---- Helpers exposed to metric classes for their renderOptions/readOptions ----

    function buildAttributeSubsetInto(containerEl /*, selected */) {
        containerEl.appendChild(_buildAttributeSubset());
    }
    function readSelectedAttributes(/* overlayEl */) {
        return _getSelectedAttributes();
    }
    function buildStructuralOptionsInto(containerEl /*, options */) {
        containerEl.appendChild(_buildStructuralOptions());
    }
    function readStructuralOptions(/* overlayEl */) {
        return _getStructuralConfig();
    }

    return {
        show: show,
        buildAttributeSubsetInto: buildAttributeSubsetInto,
        readSelectedAttributes: readSelectedAttributes,
        buildStructuralOptionsInto: buildStructuralOptionsInto,
        readStructuralOptions: readStructuralOptions
    };
})();
