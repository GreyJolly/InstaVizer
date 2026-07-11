// ===========================
// MDSChart — MDS 2D projection of file distances
// ===========================

class MDSChart extends Chart {
    constructor(container) {
        super(container);
        this._svgId = 'scatterplot-svg';
        this._currentMode = 'approximate';
        this._distResult = null;
        this._mdsCoords = null;
        this._jobId = 0;
        this._tooltip = null;
        this._scaleBubbles = true;
        this._zoomBehavior = null;
        this._config = null;
        this._bgJobs = {};
        this._progressTracker = null;
        this._currentWorkerTaskId = null;
        this._initialized = false;
    }

    // ---- Lifecycle hooks (Chart) ----

    // Tells the global resize dispatch to skip the generic data-layer rebuild for this chart.
    get handlesOwnResize() { return true; }

    headerTitle(/* item */) {
        return 'File Distance Map';
    }

    // Expensive render: (re)run the whole pipeline.
    _draw(/* data, options */) {
        this.startComputation();
    }

    // Cheap resize repaint: stretch the existing SVG to the new container size without recomputing distances or resetting zoom/pan
    renderView() {
        var svgEl = document.getElementById(this._svgId);
        if (!svgEl) return;
        var parent = svgEl.parentElement;
        if (!parent) return;
        var newW = parent.clientWidth;
        var newH = parent.clientHeight;
        if (newW > 0 && newH > 0) {
            svgEl.setAttribute('width', newW);
            svgEl.setAttribute('height', newH);
        }
    }

    destroy() {
        this.cancelAllJobs();
        this._distResult = null;
        this._mdsCoords = null;
        this._config = null;
        this._progressTracker = null;
        if (this._tooltip) { this._tooltip.remove(); this._tooltip = null; }
        d3.selectAll('.scatter-tooltip').remove();
        // Base clears its debounce timer + generic tooltips.
        super.destroy();
    }

    // ---- Open via modal system ----

    open() {
        if (FileRegistry.all().length < 2) {
            showToast('Need at least 2 data files to compare', 'warning');
            return;
        }

        var self = this;
        MdsConfig.show().then(function (config) {
            if (!config) return;

            self._config = config;
            self._applyModeFromConfig(config);

            ModalState.item = { type: 'scatter', name: 'File Distance Map' };
            ModalState.activeChart = self;

            // Scatter is a standalone view with no chart-type switching
            document.getElementById('chart-type-toggle').style.display = 'none';

            openModal('File Distance Map');
            setChartType('scatter');
            self._updateModeLabel();
        });
    }

    onModalClose() {
        this.destroy();
    }

    _applyModeFromConfig(config) {
        if (config.metric === 'emd') {
            this._currentMode = 'emd';
        } else if (config.structuralOpts && config.structuralOpts.approximate) {
            this._currentMode = 'approximate';
        } else {
            this._currentMode = 'exact';
        }
    }

    _updateModeLabel() {
        var label = document.getElementById('scatter-mode-label');
        if (!label || !this._config) return;
        if (this._config.metric === 'emd') {
            label.textContent = 'Attribute distance';
        } else if (this._config.structuralOpts && this._config.structuralOpts.approximate) {
            label.textContent = 'Structural distance (approximate)';
        } else {
            label.textContent = 'Structural distance (exact)';
        }
    }

    // ---- Main computation entry point ----

    startComputation() {
        var self = this;
        var filters = (this._config && this._config.filters) ? this._config.filters : {};
        var eligibleFiles = FileRegistry.all().filter(function(f) {
            if (!f.enabled) return false;
            if (Object.keys(filters).length === 0) return true;
            return FileDistance.hasFilteredData(f.id, filters);
        });

        var fileIds = eligibleFiles.map(function(f) { return f.id; });
        if (fileIds.length < 2) {
            this._distResult = null;
            this._mdsCoords = null;
            this._showEmptyState('Not enough files with data after filtering (need at least 2).');
            return;
        }

        this.cancelAllJobs();

        this._jobId++;
        var myJob = this._jobId;
        this._distResult = null;
        this._mdsCoords = null;

        var n = fileIds.length;

        this._progressTracker = new ProgressTracker([
            { name: 'distances', label: 'Computing pairwise distances…', weight: 5 },
            { name: 'mds', label: 'Running MDS projection…', weight: 2 }
        ]);

        var container = document.getElementById('chart-container');
        var loader = LoadingManager.show(container, {
            mode: 'bar',
            message: 'Preparing computation…',
            delay: 100,
            progress: 0
        });

        var useWorkerForMDS = n > 15;
        if (useWorkerForMDS) {
            this._computeDistancesThenWorkerMDS(fileIds, myJob, container, loader);
        } else {
            this._computeOnMainThread(fileIds, myJob, container, loader);
        }
    }

    // ---- Path A: Distances on main thread, MDS in worker ----

    _computeDistancesThenWorkerMDS(fileIds, myJob, container, loader) {
        var self = this;
        var distFn = this._makeDistFn();
        var n = fileIds.length;
        var totalPairs = n * (n - 1) / 2;
        var pairIdx = 0;
        var localDists = {};

        var pairs = [];
        for (var i = 0; i < n; i++) {
            for (var j = i + 1; j < n; j++) {
                pairs.push([i, j]);
            }
        }

        if (!this._progressTracker) {
            this._progressTracker = new ProgressTracker([
                { name: 'distances', label: 'Computing pairwise distances…', weight: 5 },
                { name: 'mds', label: 'Running MDS projection…', weight: 2 }
            ]);
        }

        this._progressTracker.startPhase('distances');
        this._progressTracker.setPhaseProgress(0);
        loader.update({
            progress: this._progressTracker.getOverallProgress(),
            message: 'Computing distances (0/' + totalPairs + ')…'
        });

        function computeChunk() {
            if (self._jobId !== myJob || !self._progressTracker) {
                return;
            }

            var chunkSize = 50;
            var end = Math.min(pairIdx + chunkSize, pairs.length);

            while (pairIdx < end) {
                var p = pairs[pairIdx];
                var d = distFn(fileIds[p[0]], fileIds[p[1]]);
                var key = fileIds[p[0]] < fileIds[p[1]]
                    ? fileIds[p[0]] + ':' + fileIds[p[1]]
                    : fileIds[p[1]] + ':' + fileIds[p[0]];
                localDists[key] = d;
                pairIdx++;
            }

            if (pairIdx < pairs.length) {
                if (self._progressTracker) {
                    self._progressTracker.setPhaseProgress(pairIdx / totalPairs);
                    loader.update({
                        progress: self._progressTracker.getOverallProgress(),
                        message: 'Computing distances (' + pairIdx + '/' + totalPairs + ')…'
                    });
                }
                setTimeout(computeChunk, 0);
            } else {
                if (self._jobId !== myJob || !self._progressTracker) {
                    return;
                }

                self._progressTracker.startPhase('mds');
                self._progressTracker.setPhaseProgress(0);
                loader.update({
                    progress: self._progressTracker.getOverallProgress(),
                    message: 'Running MDS projection (worker)…'
                });

                var matrix = self._buildMatrix(fileIds, localDists);
                self._distResult = { matrix: matrix, fileIds: fileIds, n: n };

                self._currentWorkerTaskId = null;
                WorkerPool.submit(
                    'src/workers/distance.worker.js',
                    'mds',
                    {
                        type: 'compute-mds',
                        matrix: matrix,
                        fileIds: fileIds,
                        n: n
                    },
                    function(progress, message) {
                        if (self._jobId !== myJob || !self._progressTracker) return;
                        self._progressTracker.setPhaseProgress(progress);
                        loader.update({
                            progress: self._progressTracker.getOverallProgress(),
                            message: message || 'Running MDS…'
                        });
                    }
                ).then(function(coords) {
                    if (self._jobId !== myJob) return;
                    self._currentWorkerTaskId = null;

                    self._mdsCoords = coords;

                    loader.update({ progress: 1, message: 'Rendering scatterplot…' });
                    self.render();

                    setTimeout(function() { loader.hide(); }, 200);
                }).catch(function(err) {
                    if (self._jobId !== myJob) return;
                    console.error('Worker MDS failed:', err);
                    loader.hide();
                    self._showEmptyState('MDS computation failed: ' + (err.message || 'Unknown error'));
                });
            }
        }

        computeChunk();
    }

    // ---- Path B: Everything on main thread (chunked) ----

    _computeOnMainThread(fileIds, myJob, container, loader) {
        var self = this;
        var job = { fileIds: fileIds.slice(), cancelled: false };
        this._bgJobs[myJob] = job;

        var n = fileIds.length;
        var pairs = [];
        for (var i = 0; i < n; i++) {
            for (var j = i + 1; j < n; j++) {
                pairs.push([i, j]);
            }
        }
        var totalPairs = pairs.length;
        var pairIdx = 0;
        var localDists = {};

        if (!this._progressTracker) {
            this._progressTracker = new ProgressTracker([
                { name: 'distances', label: 'Computing pairwise distances…', weight: 5 },
                { name: 'mds', label: 'Running MDS projection…', weight: 2 }
            ]);
        }

        this._progressTracker.startPhase('distances');
        this._progressTracker.setPhaseProgress(0);
        loader.update({
            progress: this._progressTracker.getOverallProgress(),
            message: 'Computing distances (0/' + totalPairs + ')…'
        });

        var distFn = this._makeDistFn();

        if (totalPairs === 0) {
            this._finishWithLocal(myJob, fileIds, localDists, loader);
            return;
        }

        function processChunk() {
            if (job.cancelled || self._jobId !== myJob) {
                return;
            }

            if (pairIdx < pairs.length) {
                var p = pairs[pairIdx];
                var d = distFn(fileIds[p[0]], fileIds[p[1]]);
                var key = fileIds[p[0]] < fileIds[p[1]]
                    ? fileIds[p[0]] + ':' + fileIds[p[1]]
                    : fileIds[p[1]] + ':' + fileIds[p[0]];
                localDists[key] = d;
                pairIdx++;

                if (self._progressTracker && self._jobId === myJob && ModalState.chartType === 'scatter') {
                    self._progressTracker.setPhaseProgress(pairIdx / totalPairs);
                    loader.update({
                        progress: self._progressTracker.getOverallProgress(),
                        message: 'Computing distances (' + pairIdx + '/' + totalPairs + ')…'
                    });
                }

                setTimeout(processChunk, 0);
            } else {
                self._finishWithLocal(myJob, fileIds, localDists, loader);
            }
        }

        setTimeout(processChunk, 0);
    }

    _makeDistFn() {
        // FileDistance owns the metric catalog and option mapping
        return FileDistance.makeMetric(this._config);
    }

    _buildMatrix(fileIds, distances) {
        var n = fileIds.length;
        var matrix = new Float64Array(n * n);
        for (var i = 0; i < n; i++) {
            for (var j = i + 1; j < n; j++) {
                var key = fileIds[i] < fileIds[j]
                    ? fileIds[i] + ':' + fileIds[j]
                    : fileIds[j] + ':' + fileIds[i];
                var d = distances[key] !== undefined ? distances[key] : 1;
                matrix[i * n + j] = d;
                matrix[j * n + i] = d;
            }
        }
        return matrix;
    }

    _finishWithLocal(jobId, fileIds, localDists, loader) {
        var self = this;
        var job = this._bgJobs[jobId];
        if (!job) return;
        delete this._bgJobs[jobId];

        if (ModalState.chartType === 'scatter' && this._progressTracker) {
            var container = document.getElementById('chart-container');
            var n = fileIds.length;

            this._progressTracker.startPhase('mds');
            this._progressTracker.setPhaseProgress(0);

            var updateLoader = loader || {
                update: function(opts) { LoadingManager.update(container, opts); },
                hide: function() { LoadingManager.hide(container); }
            };

            updateLoader.update({
                progress: this._progressTracker.getOverallProgress(),
                message: 'Running MDS projection…'
            });

            var matrix = this._buildMatrix(fileIds, localDists);
            this._distResult = { matrix: matrix, fileIds: fileIds, n: n };

            this._progressTracker.setPhaseProgress(0.5);
            updateLoader.update({
                progress: this._progressTracker.getOverallProgress(),
                message: 'Running MDS projection…'
            });

            this._mdsCoords = this._classicalMDS(this._distResult);

            this._progressTracker.setPhaseProgress(1);
            updateLoader.update({ progress: 1, message: 'Rendering scatterplot…' });

            this.render();

            setTimeout(function() { updateLoader.hide(); }, 200);
        }
    }

    _showEmptyState(msg) {
        var container = document.getElementById('chart-container');
        container.innerHTML =
            '<div class="scatter-empty-state">' +
            '<p style="color:var(--text-muted);text-align:center;padding:40px;">' + msg + '</p>' +
            '</div>';
    }

    cancelAllJobs() {
        for (var id in this._bgJobs) {
            this._bgJobs[id].cancelled = true;
        }
        this._bgJobs = {};

        if (this._currentWorkerTaskId) {
            WorkerPool.cancel(this._currentWorkerTaskId);
            this._currentWorkerTaskId = null;
        }
    }

    // ---- Classical MDS (main-thread path) ----

    _classicalMDS(distResult) {
        // Shared math lives in MDSCore
        var coords = MDSCore.compute(distResult.matrix, distResult.n);
        return distResult.fileIds.map(function(fid, idx) {
            return { fileId: fid, x: coords[idx][0], y: coords[idx][1] };
        });
    }

    // ---- Render ("paint from cached coords") ----

    render() {
        if (!this._mdsCoords || this._mdsCoords.length === 0) return;
        this.renderChart();
        this.renderSummary();
    }

    refreshForSelection() {
        this.startComputation();
    }

    // ---- Chart ----

    renderChart() {
        var self = this;
        if (!this._mdsCoords || this._mdsCoords.length === 0) return;

        var container = document.getElementById('chart-container');
        container.innerHTML = '<svg id="' + this._svgId + '" style="width:100%;height:100%;display:block;"></svg>';
        d3.selectAll('.scatter-tooltip').remove();

        var margin = { top: 30, right: 30, bottom: 50, left: 50 };
        var cw = container.clientWidth;
        var ch = container.clientHeight;
        var width = Math.max(200, cw - margin.left - margin.right);
        var height = Math.max(200, ch - margin.top - margin.bottom);

        var svg = d3.select('#' + this._svgId)
            .attr('width', cw)
            .attr('height', ch)
            .attr('viewBox', '0 0 ' + cw + ' ' + ch)
            .attr('preserveAspectRatio', 'xMidYMid meet');

        svg.append('defs').append('clipPath').attr('id', 'scatter-clip')
            .append('rect').attr('width', width).attr('height', height);

        var chartG = svg.append('g').attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
        var clipped = chartG.append('g').attr('clip-path', 'url(#scatter-clip)');
        var plotG = clipped.append('g');

        var fileMap = {};
        FileRegistry.all().forEach(function(f) { fileMap[f.id] = f; });

        var points = this._mdsCoords.map(function(c) {
            var f = fileMap[c.fileId];
            return {
                x: c.x, y: c.y, fileId: c.fileId,
                name: f ? f.name : '?', color: f ? f.color : '#888',
                instances: f ? DataStore.getFileInstanceCount(f.id) : 0
            };
        });

        var xExt = d3.extent(points, function(d) { return d.x; });
        var yExt = d3.extent(points, function(d) { return d.y; });
        var xPad = (xExt[1] - xExt[0]) * 0.15 || 1;
        var yPad = (yExt[1] - yExt[0]) * 0.15 || 1;

        var x0 = d3.scaleLinear().domain([xExt[0] - xPad, xExt[1] + xPad]).range([0, width]);
        var y0 = d3.scaleLinear().domain([yExt[0] - yPad, yExt[1] + yPad]).range([height, 0]);
        var x = x0.copy();
        var y = y0.copy();

        var xAxisG = chartG.append('g').attr('class', 'scatter-x-axis').attr('transform', 'translate(0,' + height + ')');
        var yAxisG = chartG.append('g').attr('class', 'scatter-y-axis');
        var gridYG = chartG.append('g').attr('class', 'scatter-grid');
        var gridXG = chartG.append('g').attr('class', 'scatter-grid-x').attr('transform', 'translate(0,' + height + ')');

        function drawAxes() {
            gridYG.call(d3.axisLeft(y).ticks(6).tickSize(-width).tickFormat(''))
                .selectAll('line').style('stroke', 'var(--border-color)').style('stroke-opacity', 0.25);
            gridYG.selectAll('.domain').remove();
            gridXG.call(d3.axisBottom(x).ticks(6).tickSize(-height).tickFormat(''))
                .selectAll('line').style('stroke', 'var(--border-color)').style('stroke-opacity', 0.25);
            gridXG.selectAll('.domain').remove();
            xAxisG.call(d3.axisBottom(x).ticks(6).tickFormat(d3.format('.2f')))
                .selectAll('text').style('fill', 'var(--text-muted)').style('font-size', '10px');
            yAxisG.call(d3.axisLeft(y).ticks(6).tickFormat(d3.format('.2f')))
                .selectAll('text').style('fill', 'var(--text-muted)').style('font-size', '10px');
            chartG.selectAll('.domain').style('stroke', 'var(--border-color)');
            chartG.selectAll('.tick line').style('stroke', 'var(--border-color)');
        }
        drawAxes();

        chartG.append('text').attr('x', width / 2).attr('y', height + 40)
            .attr('text-anchor', 'middle').attr('fill', 'var(--text-secondary)').attr('font-size', '11px')
            .text('MDS Dimension 1');
        chartG.append('text').attr('transform', 'rotate(-90)').attr('x', -height / 2).attr('y', -38)
            .attr('text-anchor', 'middle').attr('fill', 'var(--text-secondary)').attr('font-size', '11px')
            .text('MDS Dimension 2');

        this._tooltip = d3.select('body').append('div').attr('class', 'scatter-tooltip').style('opacity', 0);

        var instanceExt = d3.extent(points, function(d) { return d.instances; });
        var rScale = d3.scaleSqrt().domain([instanceExt[0] || 0, instanceExt[1] || 1]).range([6, 20]);
        var FIXED_R = 8;
        var scaleBubbles = this._scaleBubbles;
        function getR(d) { return scaleBubbles ? rScale(d.instances) : FIXED_R; }

        var lineGroup = plotG.append('g').attr('class', 'scatter-lines');

        var dots = plotG.selectAll('.scatter-dot').data(points).join('circle')
            .attr('class', 'scatter-dot')
            .attr('cx', function(d) { return x(d.x); }).attr('cy', function(d) { return y(d.y); })
            .attr('r', getR).attr('fill', function(d) { return d.color; }).attr('fill-opacity', 0.85)
            .attr('stroke', function(d) { return d.color; }).attr('stroke-width', 2).attr('stroke-opacity', 0.4)
            .style('cursor', 'pointer').style('filter', 'drop-shadow(0 0 4px rgba(0,0,0,0.5))');

        var labels = plotG.selectAll('.scatter-label').data(points).join('text')
            .attr('class', 'scatter-label')
            .attr('x', function(d) { return x(d.x); })
            .attr('y', function(d) { return y(d.y) - getR(d) - 6; })
            .attr('text-anchor', 'middle').attr('fill', 'var(--text-secondary)')
            .attr('font-size', '10px').attr('font-weight', '500')
            .text(function(d) { return d.name.length > 18 ? d.name.substring(0, 16) + '\u2026' : d.name; });

        // Zoom / Pan
        this._zoomBehavior = d3.zoom().scaleExtent([0.3, 10]).on('zoom', function(event) {
            var t = event.transform;
            x = t.rescaleX(x0); y = t.rescaleY(y0);
            dots.attr('cx', function(d) { return x(d.x); }).attr('cy', function(d) { return y(d.y); });
            labels.attr('x', function(d) { return x(d.x); }).attr('y', function(d) { return y(d.y) - getR(d) - 6; });
            lineGroup.selectAll('*').remove();
            drawAxes();
        });
        clipped.insert('rect', ':first-child').attr('width', width).attr('height', height)
            .attr('fill', 'none').style('pointer-events', 'all');
        svg.call(this._zoomBehavior);

        // Bubble size toggle
        var sizeToggle = document.querySelector('#scatter-size-toggle input');
        if (sizeToggle) {
            sizeToggle.checked = this._scaleBubbles;
            var newToggle = sizeToggle.cloneNode(true);
            sizeToggle.parentNode.replaceChild(newToggle, sizeToggle);
            newToggle.addEventListener('change', function() {
                self._scaleBubbles = this.checked;
                dots.transition().duration(200).attr('r', getR);
                labels.transition().duration(200).attr('y', function(d) { return y(d.y) - getR(d) - 6; });
            });
        }

        // Hover interactions
        dots.on('mouseover', function(event, d) {
            d3.select(this).transition().duration(150)
                .attr('fill-opacity', 1).attr('stroke-opacity', 1).attr('stroke-width', 3);
            lineGroup.selectAll('*').remove();
            if (!self._distResult) return;
            var n = self._distResult.n;
            var idx = self._distResult.fileIds.indexOf(d.fileId);
            points.forEach(function(p) {
                if (p.fileId === d.fileId) return;
                var j = self._distResult.fileIds.indexOf(p.fileId);
                var dist = self._distResult.matrix[idx * n + j];
                lineGroup.append('line')
                    .attr('x1', x(d.x)).attr('y1', y(d.y)).attr('x2', x(p.x)).attr('y2', y(p.y))
                    .attr('stroke', 'var(--text-muted)').attr('stroke-width', 1)
                    .attr('stroke-dasharray', '4 3').attr('opacity', 0.4);
                lineGroup.append('text')
                    .attr('x', (x(d.x) + x(p.x)) / 2).attr('y', (y(d.y) + y(p.y)) / 2 - 4)
                    .attr('text-anchor', 'middle').attr('fill', 'var(--text-muted)').attr('font-size', '9px')
                    .text(dist.toFixed(3));
            });

            self._tooltip.transition().duration(150).style('opacity', 1);
            self._tooltip.html(
                '<div class="scatter-tip-name" style="color:' + d.color + ';">' + d.name + '</div>' +
                '<div class="scatter-tip-row">' + d.instances + ' instances</div>'
            );
            positionTooltip(self._tooltip, event);
        })
        .on('mousemove', function(event) { positionTooltip(self._tooltip, event); })
        .on('mouseout', function() {
            d3.select(this).transition().duration(150)
                .attr('fill-opacity', 0.85).attr('stroke-opacity', 0.4).attr('stroke-width', 2);
            lineGroup.selectAll('*').remove();
            self._tooltip.transition().duration(200).style('opacity', 0);
        });
    }

    // ---- Summary ----

    renderSummary() {
        var summaryEl = document.getElementById('chart-summary');
        if (!summaryEl || !this._distResult) return;

        var n = this._distResult.n;
        var totalDist = 0, count = 0;
        var minDist = Infinity, maxDist = 0;
        for (var i = 0; i < n; i++) {
            for (var j = i + 1; j < n; j++) {
                var d = this._distResult.matrix[i * n + j];
                totalDist += d; count++;
                if (d < minDist) minDist = d;
                if (d > maxDist) maxDist = d;
            }
        }
        var avgDist = count > 0 ? totalDist / count : 0;

        var filterCount = 0;
        if (this._config && this._config.filters) {
            for (var et in this._config.filters) {
                for (var attr in this._config.filters[et]) filterCount++;
            }
        }
        var filterInfo = filterCount > 0
            ? '<div class="summary-item"><span class="summary-label">Active filters:</span><span class="summary-value">' + filterCount + '</span></div>'
            : '';

        summaryEl.innerHTML =
            '<div class="stats-summary"><div class="stats-row">' +
            '<div class="summary-item"><span class="summary-label">Files:</span><span class="summary-value">' + n + '</span></div>' +
            '<div class="summary-item"><span class="summary-label">Average distance:</span><span class="summary-value">' + avgDist.toFixed(3) + '</span></div>' +
            '<div class="summary-item"><span class="summary-label">Minimum distance:</span><span class="summary-value">' + minDist.toFixed(3) + '</span></div>' +
            '<div class="summary-item"><span class="summary-label">Maximum distance:</span><span class="summary-value">' + maxDist.toFixed(3) + '</span></div>' +
            filterInfo +
            '</div></div>';
    }

    updateColors() {
        var scatterSvg = document.getElementById(this._svgId);
        if (!scatterSvg) return;
        var fileMap = {};
        FileRegistry.all().forEach(function(f) { fileMap[f.id] = f; });

        d3.select(scatterSvg).selectAll('.scatter-dot')
            .transition().duration(200)
            .attr('fill', function(d) { var f = fileMap[d.fileId]; return f ? f.color : '#888'; })
            .attr('stroke', function(d) { var f = fileMap[d.fileId]; return f ? f.color : '#888'; });
    }

    getZoom() { return this._zoomBehavior; }

    // ---- Lasso selection contract ----

    get supportsLassoSelection() { return true; }

    getSelectionSvg() {
        return document.getElementById(this._svgId);
    }

    getSelectableElements() {
        return {
            selector: '.scatter-dot',
            hitTest: function(el, d) {
                var cx = +d3.select(el).attr('cx');
                var cy = +d3.select(el).attr('cy');
                // point element: degenerate box (y1 === y2 === cy)
                return { x: cx, y1: cy, y2: cy, fileId: d.fileId };
            }
        };
    }

    onSelectionModeEnter() {
        // Disable zoom while lassoing (it would fight the drag rectangle).
        var svg = this.getSelectionSvg();
        if (svg) d3.select(svg).on('.zoom', null);
    }

    onSelectionModeExit() {
        // Restore zoom behavior.
        var svg = this.getSelectionSvg();
        if (svg && this._zoomBehavior) d3.select(svg).call(this._zoomBehavior);
    }

    setElementSelected(el, selected, d) {
        d3.select(el)
            .attr('stroke-width', selected ? 4 : 2)
            .attr('stroke', selected ? 'var(--accent-blue)' : (d ? d.color : null))
            .attr('stroke-opacity', selected ? 1 : 0.4);
    }

    // ---- Init (one-time wiring of reconfigure button + resize) ----

    init() {
        var self = this;
        if (SchemaStore.isLoaded()) {
            FileDistance.setWeightsFromSchema(SchemaStore.getSchema());
        }

        var reconfigBtn = document.getElementById('scatter-reconfigure-btn');
        if (reconfigBtn) {
            reconfigBtn.addEventListener('click', function () {
                self.cancelAllJobs();
                MdsConfig.show().then(function (config) {
                    if (!config) return;
                    self._config = config;
                    self._applyModeFromConfig(config);
                    self._updateModeLabel();
                    self._distResult = null;
                    self._mdsCoords = null;
                    self.startComputation();
                });
            });
        }

        if (!this._initialized) {
            var container = document.getElementById('chart-container');
            this._containerObserver = new ResizeObserver(function() {
                self.onResize(30);
            });
            this._containerObserver.observe(container);
            this._initialized = true;
        }
    }
}

// ---------------------------------------------------------------------------
// ScatterplotScreen — façade for call sites
// ---------------------------------------------------------------------------

var ScatterplotScreen = (function() {
    var _instance = null;
    function inst() {
        if (!_instance) {
            _instance = new MDSChart(document.getElementById('chart-container'));
        }
        return _instance;
    }
    return {
        open: function() { return inst().open(); },
        init: function() { return inst().init(); },
        onModalClose: function() { return inst().onModalClose(); },
        startComputation: function() { return inst().startComputation(); },
        refreshForSelection: function() { return inst().refreshForSelection(); },
        updateColors: function() { return inst().updateColors(); },
        cancelAllJobs: function() { return inst().cancelAllJobs(); },
        getZoom: function() { return inst().getZoom(); },
        // expose the instance for orchestration that wants the Chart handle
        instance: inst
    };
})();
