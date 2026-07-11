// ==============
// FilterPanel - Collapsible filter UI
// ==============

var FilterPanel = (function() {

    // ---- State ----
    var _currentEntity = null;
    var _currentFileIds = [];
    var _panelEl = null;
    var _onFilterChange = null;
    var _viewMode = 'chart';     // 'list' or 'chart'
    var _binSizes = {};           // { attrName: userBinSize } for numeric attrs in chart mode
    var _MIN_PANEL_HEIGHT = 100;
    var _MAX_PANEL_HEIGHT = 600;
    var _globalMaxTotal = 0;

    // ---- Stacked bar colors ----
    var COLORS = {
        included:       'rgba(52, 211, 153, 0.85)',   // green
        exclThisOnly:   'rgba(248, 113, 113, 0.85)',  // red
        exclThisPlus1:  'rgba(180, 83, 83, 0.85)',    // darker red
        exclThisPlus2:  'rgba(120, 50, 50, 0.85)',    // darkest red
        exclOthers:     'rgba(100, 100, 110, 0.45)'   // grey
    };

    // --- Compute global maximum filter chart height ----
    function _computeGlobalMaxTotal(attrs) {
        _globalMaxTotal = 0;
        for (var i = 0; i < attrs.length; i++) {
            var attr = attrs[i];
            var numericBins = null;
            if (attr.dtype !== 'enum') {
                var allValues = DataStore.getAttributeNumericValues(_currentEntity, attr.name, _currentFileIds);
                if (allValues.length > 0) {
                    numericBins = BinningHelpers.computeNumericBins(allValues, attr.dtype, _binSizes[attr.name] || null);
                }
            }
            var impact = FilterQuery.computeBinImpact(_currentEntity, attr.name, _currentFileIds, numericBins);
            if (impact.bins.length > 0) {
                for (var b = 0; b < impact.bins.length; b++) {
                    var total = 0;
                    for (var s = 0; s < 5; s++) total += impact.stacks[b][s];
                    if (total > _globalMaxTotal) _globalMaxTotal = total;
                }
            }
        }
    }

    function render(opts) {
        _currentEntity = opts.entityType;
        _currentFileIds = opts.fileIds || [];
        _onFilterChange = opts.onFilterChange || function() {};
        var container = opts.container;

        var existing = container.querySelector('.filter-panel');
        if (existing) existing.remove();

        var attrs = FilterQuery.getAttributeMeta(_currentEntity, _currentFileIds);
        if (attrs.length === 0) return null;
        _computeGlobalMaxTotal(attrs);

        var panel = document.createElement('div');
        panel.className = 'filter-panel';

        // ---- Header ----
        var header = document.createElement('div');
        header.className = 'filter-panel-header';
        header.innerHTML =
            '<div class="filter-panel-title">' +
                '<svg width="14" height="14" viewBox="0 0 14 14" fill="none">' +
                    '<path d="M1 2h12L8.5 7.5V11l-3 1.5V7.5L1 2z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>' +
                '</svg>' +
                '<span>Filters</span>' +
                '<span class="filter-active-count" id="filter-active-count"></span>' +
            '</div>' +
            '<div class="filter-panel-actions">' +
                '<button class="filter-view-toggle" title="Toggle list / chart view">' +
                    '<svg class="filter-icon-list" width="14" height="14" viewBox="0 0 14 14" fill="none">' +
                        '<path d="M2 3h10M2 7h10M2 11h10" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>' +
                    '</svg>' +
                    '<svg class="filter-icon-chart" width="14" height="14" viewBox="0 0 14 14" fill="none">' +
                        '<rect x="1" y="6" width="3" height="6" rx="0.5" stroke="currentColor" stroke-width="1.1"/>' +
                        '<rect x="5.5" y="3" width="3" height="9" rx="0.5" stroke="currentColor" stroke-width="1.1"/>' +
                        '<rect x="10" y="1" width="3" height="11" rx="0.5" stroke="currentColor" stroke-width="1.1"/>' +
                    '</svg>' +
                '</button>' +
                '<button class="filter-clear-btn" id="filter-clear-all" title="Clear all filters">Clear</button>' +
                '<button class="filter-collapse-btn" id="filter-collapse-btn" title="Toggle filters">' +
                    '<svg width="12" height="12" viewBox="0 0 12 12" fill="none">' +
                        '<path d="M2 4.5l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
                    '</svg>' +
                '</button>' +
            '</div>';
        panel.appendChild(header);

        // ---- Resize handle (above body) ----
        var resizeHandle = document.createElement('div');
        resizeHandle.className = 'filter-resize-handle';
        resizeHandle.innerHTML = '<div class="filter-resize-grip"></div>';
        panel.appendChild(resizeHandle);

        // ---- Body ----
        var body = document.createElement('div');
        body.className = 'filter-panel-body';
        body.style.flex = '1';

        for (var i = 0; i < attrs.length; i++) {
            body.appendChild(_buildAttrSection(attrs[i]));
        }

        panel.appendChild(body);
        container.appendChild(panel);
        _panelEl = panel;

        // Apply view mode class
        panel.classList.toggle('view-chart', _viewMode === 'chart');
        panel.classList.toggle('view-list', _viewMode === 'list');

        // Start collapsed
        panel.classList.add('collapsed');

        // ---- Wire events ----
        header.addEventListener('click', function(e) {
            if (e.target.closest('.filter-clear-btn') || e.target.closest('.filter-view-toggle')) return;
            panel.classList.toggle('collapsed');
            _triggerResize();
        });

        panel.querySelector('#filter-clear-all').addEventListener('click', function(e) {
            e.stopPropagation();
            FilterState.clearAllFilters(_currentEntity);
            _restoreDefaults(panel, attrs);
            _updateActiveCount(panel);
            _onFilterChange();
        });

        panel.querySelector('.filter-view-toggle').addEventListener('click', function(e) {
            e.stopPropagation();
            _viewMode = _viewMode === 'list' ? 'chart' : 'list';
            panel.classList.toggle('view-chart', _viewMode === 'chart');
            panel.classList.toggle('view-list', _viewMode === 'list');
            _rebuildAllSections(panel, attrs);
        });

        // Resize handle drag
        _wireResizeHandle(resizeHandle, body);

        _updateActiveCount(panel);
        return panel;
    }

    // ===========================
    // Resize handle
    // ===========================
    var _resizeObserver = null;

    function _wireResizeHandle(handle, body) {
        var startY, startH;
        function onMouseMove(e) {
            var delta = startY - e.clientY;
            var newH = Math.max(_MIN_PANEL_HEIGHT, Math.min(_MAX_PANEL_HEIGHT, startH + delta));
            body.style.flex = 'none'; // Override flex for custom sizing
            body.style.height = newH + 'px';
            _panelHeight = newH;
            _triggerResize();
        }
        function onMouseUp() {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            // Redraw charts after drag ends
            if (_viewMode === 'chart') _redrawAllCharts();
        }
        handle.addEventListener('mousedown', function(e) {
            e.preventDefault();
            e.stopPropagation();
            startY = e.clientY;
            startH = body.offsetHeight;
            document.body.style.cursor = 'ns-resize';
            document.body.style.userSelect = 'none';
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);

            // When user starts dragging, switch from flex to fixed height
            body.style.flex = 'none';
            body.style.height = startH + 'px';
        });

        // Ensure the panel itself uses flex layout
        if (_panelEl) {
            _panelEl.style.display = 'flex';
            _panelEl.style.flexDirection = 'column';
            _panelEl.style.flex = '0 1 auto'; // Allow shrinking
        }

        // Observe body for horizontal size changes
        _resizeObserver = new ResizeObserver(_debounce(function() {
            if (_viewMode === 'chart') _redrawAllCharts();
        }, 200));
            _resizeObserver.observe(body);
    }

    function _debounce(fn, ms) {
        var timer;
        return function() {
            clearTimeout(timer);
            timer = setTimeout(fn, ms);
        };
    }

    // Re-render every mini chart SVG at current container dimensions
    function _redrawAllCharts() {
        if (!_panelEl) return;
        var charts = _panelEl.querySelectorAll('.filter-mini-chart');
        charts.forEach(function(chartEl) {
            var section = chartEl.closest('.filter-attr-section');
            if (!section) return;
            var attrName = section.dataset.attrName;
            var attrs = FilterQuery.getAttributeMeta(_currentEntity, _currentFileIds);
            var attr = null;
            for (var i = 0; i < attrs.length; i++) {
                if (attrs[i].name === attrName) { attr = attrs[i]; break; }
            }
            if (!attr) return;

            var isEnum = attr.dtype === 'enum';
            var numericBins = null;
            if (!isEnum) {
                var allValues = DataStore.getAttributeNumericValues(_currentEntity, attr.name, _currentFileIds);
                if (allValues.length === 0) return;
                numericBins = BinningHelpers.computeNumericBins(allValues, attr.dtype, _binSizes[attr.name] || null);
            }
            var impact = FilterQuery.computeBinImpact(_currentEntity, attr.name, _currentFileIds, numericBins);
            if (impact.bins.length === 0) return;

            chartEl.innerHTML = '';
            _renderMiniChart(chartEl, attr, impact, numericBins);
        });
    }

    function _rebuildAllSections(panel, attrs) {
        _computeGlobalMaxTotal(attrs);
        var body = panel.querySelector('.filter-panel-body');
        if (!body) return;
        body.innerHTML = '';
        for (var i = 0; i < attrs.length; i++) {
            body.appendChild(_buildAttrSection(attrs[i]));
        }
    }

    function _buildAttrSection(attr) {
        var section = document.createElement('div');
        section.className = 'filter-attr-section';
        section.dataset.attrName = attr.name;
        section.dataset.dtype = attr.dtype;

        var label = document.createElement('div');
        label.className = 'filter-attr-label';
        label.textContent = attr.name;
        var typeTag = document.createElement('span');
        typeTag.className = 'filter-attr-type';
        typeTag.textContent = attr.dtype;
        label.appendChild(typeTag);
        section.appendChild(label);

        if (_viewMode === 'chart') {
            section.appendChild(_buildChartFilter(attr));
        } else {
            if (attr.dtype === 'enum') {
                section.appendChild(_buildEnumFilter(attr));
            } else {
                section.appendChild(_buildNumericFilter(attr));
            }
        }

        return section;
    }

    // =========================
    // LIST MODE: Enum filter
    // =========================
    function _buildEnumFilter(attr) {
        var wrap = document.createElement('div');
        wrap.className = 'filter-enum-wrap';

        var impacts = FilterQuery.getEnumValueCounts(_currentEntity, attr.name, _currentFileIds);

        var checkWrap = document.createElement('div');
        checkWrap.className = 'filter-enum-checks';

        var values = attr.values || [];
        var existingFilter = FilterState.getFilter(_currentEntity, attr.name);
        for (var i = 0; i < values.length; i++) {
            var lbl = document.createElement('label');
            lbl.className = 'filter-enum-check';
            var cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.value = values[i];
            cb.checked = existingFilter ? existingFilter.selected.has(values[i]) : true;
            cb.dataset.attrName = attr.name;
            lbl.appendChild(cb);
            var nameSpan = document.createElement('span');
            nameSpan.className = 'filter-enum-name';
            nameSpan.textContent = values[i];
            nameSpan.title = values[i];
            lbl.appendChild(nameSpan);
            var countSpan = document.createElement('span');
            countSpan.className = 'filter-enum-count';
            var impact = impacts[values[i]] || 0;
            var sign = impact > 0 ? '+' : '';
            countSpan.textContent = '(' + sign + impact + ')';
            countSpan.classList.toggle('positive', impact > 0);
            countSpan.classList.toggle('negative', impact < 0);
            lbl.appendChild(countSpan);
            checkWrap.appendChild(lbl);
        }
        wrap.appendChild(checkWrap);

        checkWrap.addEventListener('change', function() {
            _applyEnumFilter(wrap, attr.name);
        });

        return wrap;
    }

    // ===========================
    // LIST MODE: Numeric filter
    // ===========================
    function _buildNumericFilter(attr) {
        var wrap = document.createElement('div');
        wrap.className = 'filter-numeric-wrap';

        var existingFilter = FilterState.getFilter(_currentEntity, attr.name);
        var gMin = attr.globalMin;
        var gMax = attr.globalMax;
        var isInt = attr.dtype === 'int';
        var step = isInt ? '1' : 'any';
        var fmt = function(v) { return isInt ? Math.round(v) : v.toFixed(2); };

        wrap.innerHTML =
            '<div class="filter-numeric-range">' +
                '<span class="filter-range-label">Min: ' + fmt(gMin) + '</span>' +
                '<span class="filter-range-label">Max: ' + fmt(gMax) + '</span>' +
            '</div>' +
            '<div class="filter-numeric-inputs">' +
                '<div class="filter-input-group">' +
                    '<label>Floor</label>' +
                    '<input type="number" class="filter-floor-input" step="' + step + '" ' +
                        'placeholder="' + fmt(gMin) + '" ' +
                        (existingFilter && existingFilter.floor != null ? 'value="' + existingFilter.floor + '"' : '') +
                    '>' +
                '</div>' +
                '<div class="filter-input-group">' +
                    '<label>Ceiling</label>' +
                    '<input type="number" class="filter-ceiling-input" step="' + step + '" ' +
                        'placeholder="' + fmt(gMax) + '" ' +
                        (existingFilter && existingFilter.ceiling != null ? 'value="' + existingFilter.ceiling + '"' : '') +
                    '>' +
                '</div>' +
            '</div>';

        var debounceTimer;
        wrap.addEventListener('input', function() {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(function() {
                _applyNumericFilter(wrap, attr.name, gMin, gMax);
            }, 300);
        });

        return wrap;
    }

    // ===========================
    // CHART MODE: Mini stacked bar chart
    // ===========================
    function _buildChartFilter(attr) {
        var wrap = document.createElement('div');
        wrap.className = 'filter-chart-wrap';

        var isEnum = attr.dtype === 'enum';
        var numericBins = null;

        if (!isEnum) {
            var allValues = DataStore.getAttributeNumericValues(_currentEntity, attr.name, _currentFileIds);
            if (allValues.length === 0) {
                wrap.innerHTML = '<div class="filter-chart-empty">No data</div>';
                return wrap;
            }
            var userBin = _binSizes[attr.name] || null;
            numericBins = BinningHelpers.computeNumericBins(allValues, attr.dtype, userBin);

            // Bin size input
            var binCtrl = document.createElement('div');
            binCtrl.className = 'filter-chart-bin-ctrl';
            binCtrl.innerHTML = '<label>Bin size:</label>';
            var binInput = document.createElement('input');
            binInput.type = 'number';
            binInput.className = 'filter-bin-input';
            binInput.placeholder = 'auto';
            binInput.step = attr.dtype === 'int' ? '1' : 'any';
            binInput.min = '0';
            if (userBin) binInput.value = userBin;
            var binDebounce;
            binInput.addEventListener('input', function() {
                clearTimeout(binDebounce);
                binDebounce = setTimeout(function() {
                    var v = binInput.value;
                    _binSizes[attr.name] = (v !== '' && parseFloat(v) > 0) ? parseFloat(v) : null;
                    var section = wrap.closest('.filter-attr-section');
                    if (section) {
                        var newWrap = _buildChartFilter(attr);
                        wrap.replaceWith(newWrap);
                    }
                }, 400);
            });
            binCtrl.appendChild(binInput);
            wrap.appendChild(binCtrl);
        }

        // Compute impact
        var impact = FilterQuery.computeBinImpact(_currentEntity, attr.name, _currentFileIds, numericBins);
        if (impact.bins.length === 0) {
            wrap.innerHTML = '<div class="filter-chart-empty">No data</div>';
            return wrap;
        }

        // Chart container
        var chartEl = document.createElement('div');
        chartEl.className = 'filter-mini-chart';
        wrap.appendChild(chartEl);

        requestAnimationFrame(function() {
            _renderMiniChart(chartEl, attr, impact, numericBins, _globalMaxTotal);
        });

        return wrap;
    }

    function _renderMiniChart(container, attr, impact, numericBins) {
        var bins = impact.bins;
        var stacks = impact.stacks;
        var isEnum = attr.dtype === 'enum';
        var nBins = bins.length;

        var maxTotal = _globalMaxTotal || 0;
        // If no global max provided, fall back to local max
        if (!maxTotal) {
            for (var b = 0; b < nBins; b++) {
                var total = 0;
                for (var s = 0; s < 5; s++) total += stacks[b][s];
                if (total > maxTotal) maxTotal = total;
            }
        }

        if (maxTotal === 0) {
            container.innerHTML = '<div class="filter-chart-empty">No data</div>';
            return;
        }

        var rect = container.getBoundingClientRect();
        var width = Math.max(80, rect.width || 260);
        var height = Math.max(40, rect.height || 90);

        var margin = { top: 4, right: 4, bottom: 22, left: 4 };
        var iw = width - margin.left - margin.right;
        var ih = height - margin.top - margin.bottom;

        var svg = d3.select(container).append('svg')
            .attr('width', width)
            .attr('height', height);

        var g = svg.append('g')
            .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

        var barWidth = Math.max(4, Math.min(40, (iw / nBins) * 0.78));
        var gap = (iw - barWidth * nBins) / (nBins + 1);
        if (gap < 1) { gap = 1; barWidth = Math.max(3, (iw - gap * (nBins + 1)) / nBins); }

        var colorArr = [
            COLORS.included,
            COLORS.exclThisOnly,
            COLORS.exclThisPlus1,
            COLORS.exclThisPlus2,
            COLORS.exclOthers
        ];

        var existingFilter = FilterState.getFilter(_currentEntity, attr.name);

        for (var bi = 0; bi < nBins; bi++) {
            var x = gap + bi * (barWidth + gap);
            var stack = stacks[bi];
            var yPos = ih;

            var binSelected = true;
            if (isEnum) {
                if (existingFilter && existingFilter.type === 'enum') {
                    binSelected = existingFilter.selected.has(bins[bi]);
                }
            } else {
                if (existingFilter && existingFilter.type === 'numeric') {
                    var mid = (numericBins[bi].x0 + numericBins[bi].x1) / 2;
                    if (existingFilter.floor != null && mid < existingFilter.floor) binSelected = false;
                    if (existingFilter.ceiling != null && mid > existingFilter.ceiling) binSelected = false;
                }
            }

            var barG = g.append('g')
                .attr('class', 'filter-bar-group')
                .style('cursor', 'pointer')
                .style('opacity', binSelected ? 1 : 0.35);

            // Stacked segments bottom-up
            for (var si2 = 0; si2 < 5; si2++) {
                var count = stack[si2];
                if (count === 0) continue;
                var segH = (count / maxTotal) * ih;
                yPos -= segH;
                barG.append('rect')
                    .attr('x', x)
                    .attr('y', yPos)
                    .attr('width', barWidth)
                    .attr('height', segH)
                    .attr('fill', colorArr[si2])
                    .attr('rx', 1);
            }

            // Hit area
            barG.append('rect')
                .attr('x', x - 1)
                .attr('y', 0)
                .attr('width', barWidth + 2)
                .attr('height', ih)
                .attr('fill', 'transparent');

            // Label
            var label = String(bins[bi]);
            if (label.length > 8) label = label.substring(0, 7) + '\u2026';
            g.append('text')
                .attr('x', x + barWidth / 2)
                .attr('y', ih + 12)
                .attr('text-anchor', 'middle')
                .attr('font-size', Math.min(9, barWidth * 0.8) + 'px')
                .attr('fill', 'var(--text-muted)')
                .text(label);

            // Click
            (function(binIndex, binValue) {
                barG.on('click', function() {
                    _toggleBin(attr, binIndex, binValue, numericBins);
                });
            })(bi, bins[bi]);

            // Tooltip
            (function(binValue, stack2) {
                barG.on('mouseenter', function(event) {
                    _showBinTooltip(event, binValue, stack2);
                });
                barG.on('mouseleave', function() { _hideBinTooltip(); });
            })(bins[bi], stack);
        }
    }

    // ===========================
    // Bin click toggling
    // ===========================
    function _toggleBin(attr, binIndex, binValue, numericBins) {
        var isEnum = attr.dtype === 'enum';

        if (isEnum) {
            var existingFilter = FilterState.getFilter(_currentEntity, attr.name);
            var values = attr.values || [];
            var selected;

            if (!existingFilter) {
                selected = new Set(values);
                selected.delete(binValue);
            } else {
                selected = new Set(existingFilter.selected);
                if (selected.has(binValue)) {
                    selected.delete(binValue);
                } else {
                    selected.add(binValue);
                }
            }

            if (selected.size === values.length) {
                FilterState.clearFilter(_currentEntity, attr.name);
            } else {
                FilterState.setEnumFilter(_currentEntity, attr.name, Array.from(selected));
            }
        } else {
            var existingFilter = FilterState.getFilter(_currentEntity, attr.name);
            var bin = numericBins[binIndex];
            var allValues = DataStore.getAttributeNumericValues(_currentEntity, attr.name, _currentFileIds);
            var gMin = d3.min(allValues);
            var gMax = d3.max(allValues);
            var floor = existingFilter ? existingFilter.floor : null;
            var ceiling = existingFilter ? existingFilter.ceiling : null;

            var mid = (bin.x0 + bin.x1) / 2;
            var isIncluded = true;
            if (floor != null && mid < floor) isIncluded = false;
            if (ceiling != null && mid > ceiling) isIncluded = false;

            if (isIncluded) {
                if (binIndex < numericBins.length / 2) {
                    floor = bin.x1;
                } else {
                    ceiling = bin.x0;
                }
            } else {
                if (floor != null && mid < floor) floor = bin.x0;
                if (ceiling != null && mid > ceiling) ceiling = bin.x1;
            }

            var isDefault = (floor === null || floor <= gMin) && (ceiling === null || ceiling >= gMax);
            if (isDefault) {
                FilterState.clearFilter(_currentEntity, attr.name);
            } else {
                FilterState.setNumericFilter(_currentEntity, attr.name, floor, ceiling, gMin, gMax);
            }
        }

        _updateActiveCount(_panelEl);
        _refreshAllSections();
        _onFilterChange();
    }

    // ===========================
    // Tooltip
    // ===========================
    var _tooltipEl = null;
    function _showBinTooltip(event, binValue, stack) {
        if (!_tooltipEl) {
            _tooltipEl = document.createElement('div');
            _tooltipEl.className = 'filter-bin-tooltip';
            document.body.appendChild(_tooltipEl);
        }
        var labels = ['Included', 'Excl. (this filter)', 'Excl. (this +1 other)', 'Excl. (this +2+ others)', 'Excl. (other filters)'];
        var total = 0;
        var html = '<div class="fbt-title">' + binValue + '</div>';
        for (var i = 0; i < 5; i++) {
            total += stack[i];
            if (stack[i] > 0) {
                html += '<div class="fbt-row"><span class="fbt-dot" style="background:' +
                    [COLORS.included, COLORS.exclThisOnly, COLORS.exclThisPlus1, COLORS.exclThisPlus2, COLORS.exclOthers][i] +
                    '"></span>' + labels[i] + ': <b>' + stack[i] + '</b></div>';
            }
        }
        html += '<div class="fbt-total">Total: ' + total + '</div>';
        _tooltipEl.innerHTML = html;
        _tooltipEl.style.display = 'block';
        positionTooltip(_tooltipEl, event);
    }

    function _hideBinTooltip() {
        if (_tooltipEl) _tooltipEl.style.display = 'none';
    }

    // ===========================
    // Apply filters from list mode
    // ===========================
    function _applyEnumFilter(wrap, attrName) {
        var checks = wrap.querySelectorAll('input[type="checkbox"]');
        var selected = [];
        checks.forEach(function(cb) { if (cb.checked) selected.push(cb.value); });

        if (selected.length === checks.length) {
            FilterState.clearFilter(_currentEntity, attrName);
        } else {
            FilterState.setEnumFilter(_currentEntity, attrName, selected);
        }
        _updateActiveCount(_panelEl);
        _refreshAllSections();
        _onFilterChange();
    }

    function _applyNumericFilter(wrap, attrName, globalMin, globalMax) {
        var floorInput = wrap.querySelector('.filter-floor-input');
        var ceilInput = wrap.querySelector('.filter-ceiling-input');
        var floor = floorInput.value !== '' ? parseFloat(floorInput.value) : null;
        var ceiling = ceilInput.value !== '' ? parseFloat(ceilInput.value) : null;

        var isDefault = (floor === null || floor <= globalMin) && (ceiling === null || ceiling >= globalMax);
        if (isDefault) {
            FilterState.clearFilter(_currentEntity, attrName);
        } else {
            FilterState.setNumericFilter(_currentEntity, attrName, floor, ceiling, globalMin, globalMax);
        }
        _updateActiveCount(_panelEl);
        _onFilterChange();
    }

    // =======================
    // Refresh all sections
    // =======================
    function _refreshAllSections() {
        if (!_panelEl) return;
        var attrs = FilterQuery.getAttributeMeta(_currentEntity, _currentFileIds);
        if (_viewMode === 'chart') {
            var sections = _panelEl.querySelectorAll('.filter-attr-section');
            sections.forEach(function(section) {
                var attrName = section.dataset.attrName;
                var attr = null;
                for (var i = 0; i < attrs.length; i++) {
                    if (attrs[i].name === attrName) { attr = attrs[i]; break; }
                }
                if (!attr) return;
                var oldWrap = section.querySelector('.filter-chart-wrap');
                if (oldWrap) {
                    var newWrap = _buildChartFilter(attr);
                    oldWrap.replaceWith(newWrap);
                }
            });
        } else {
            var enumSections = _panelEl.querySelectorAll('.filter-attr-section[data-dtype="enum"]');
            enumSections.forEach(function(section) {
                var attrName = section.dataset.attrName;
                var impacts = FilterQuery.getEnumValueCounts(_currentEntity, attrName, _currentFileIds);
                var labels = section.querySelectorAll('.filter-enum-check');
                labels.forEach(function(lbl) {
                    var cb = lbl.querySelector('input[type="checkbox"]');
                    var countSpan = lbl.querySelector('.filter-enum-count');
                    if (!countSpan) return;
                    var val = cb.value;
                    var impact = impacts[val] || 0;
                    var sign = impact > 0 ? '+' : '';
                    countSpan.textContent = '(' + sign + impact + ')';
                    countSpan.classList.toggle('positive', impact > 0);
                    countSpan.classList.toggle('negative', impact < 0);
                });
            });
        }
        _updateActiveCount(_panelEl);
    }

    // ===========================
    // Helpers
    // ===========================
    function _restoreDefaults(panel, attrs) {
        for (var i = 0; i < attrs.length; i++) {
            var section = panel.querySelector('[data-attr-name="' + attrs[i].name + '"]');
            if (!section) continue;
            if (attrs[i].dtype === 'enum') {
                section.querySelectorAll('input[type="checkbox"]').forEach(function(cb) { cb.checked = true; });
            } else {
                section.querySelectorAll('input[type="number"]').forEach(function(inp) { inp.value = ''; });
            }
        }
        _refreshAllSections();
    }

    function _updateActiveCount(panel) {
        if (!panel) return;
        var badge = panel.querySelector('#filter-active-count');
        if (!badge) return;
        var filters = FilterState.getFilters(_currentEntity);
        var count = 0;
        for (var k in filters) count++;
        if (count > 0) {
            badge.textContent = count;
            badge.style.display = 'inline-flex';
        } else {
            badge.textContent = '';
            badge.style.display = 'none';
        }
    }

    function _triggerResize() {
        window.dispatchEvent(new Event('resize'));
    }

    function destroy() {
        if (_resizeObserver) { _resizeObserver.disconnect(); _resizeObserver = null; }
        if (_tooltipEl) { _tooltipEl.remove(); _tooltipEl = null; }
        if (_panelEl && _panelEl.parentNode) _panelEl.remove();
        _panelEl = null;
        _currentEntity = null;
    }

    return {
        render: render,
        destroy: destroy
    };
})();
