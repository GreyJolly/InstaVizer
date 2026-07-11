// ===========================
// LassoController — generic rectangular lasso + click selection over charts
// ===========================
// ONE implementation of the lasso machinery (drag rectangle, hit-testing,
// click-to-toggle, selection highlight). It is completely chart-agnostic: it
// drives whatever chart is currently active (ModalState.activeChart) through
// the Chart lasso-selection contract:
//
//   chart.supportsLassoSelection   -> may we attach at all?
//   chart.getSelectionSvg()        -> the SVG to draw/hit-test on
//   chart.getSelectableElements()  -> { selector, hitTest(el,d)->{x,y1,y2,fileId} }
//   chart.onSelectionModeEnter()   -> chart-specific prep (e.g. disable zoom)
//   chart.onSelectionModeExit()    -> undo that prep
//   chart.setElementSelected(el, selected, d) -> per-chart selected styling
//
// The controller knows nothing about scatter dots, bars, or parallel dots —
// adding a new selectable chart requires zero changes here.
//
// Selection results are reported via callbacks supplied to attach():
//   onToggle(fileId)   — a single element was clicked
//   onLassoHits(idSet) — a drag rectangle finished; idSet is the Set of fileIds
//                        whose elements fell inside it
//   isSelected(fileId) — query used to paint current highlight state
//
// The owner (FileGroups) keeps the pending-set; the controller just maps DOM
// interactions to fileIds and repaints highlights on request.

var LassoController = (function() {

    var _chart = null;        // the chart we're attached to
    var _svgNode = null;      // its selection SVG
    var _spec = null;         // { selector, hitTest }
    var _cb = null;           // { onToggle, onLassoHits, isSelected }
    var _origin = null;
    var _lassoRect = null;

    function isAttached() { return _chart !== null; }

    // Attach to the currently active chart, if it supports selection.
    // Returns true if attached. callbacks: { onToggle, onLassoHits, isSelected }
    function attach(chart, callbacks) {
        detach(); // ensure clean slate

        if (!chart || !chart.supportsLassoSelection) return false;
        var svgNode = chart.getSelectionSvg();
        var spec = chart.getSelectableElements();
        if (!svgNode || !spec || !spec.selector) return false;

        _chart = chart;
        _svgNode = svgNode;
        _spec = spec;
        _cb = callbacks || {};

        chart.onSelectionModeEnter();

        var svgEl = d3.select(svgNode);

        // Lasso rectangle overlay
        var lassoGroup = svgEl.append('g').attr('class', 'lasso-group');
        _lassoRect = lassoGroup.append('rect')
            .attr('class', 'lasso-rect')
            .attr('fill', 'rgba(59,130,246,0.15)')
            .attr('stroke', 'var(--accent-blue)')
            .attr('stroke-width', 1.5)
            .attr('stroke-dasharray', '4 3')
            .attr('display', 'none');

        _origin = null;

        svgEl.on('mousedown.lasso', function(event) {
            if (event.button !== 0) return;
            var pt = d3.pointer(event, svgNode);
            _origin = { x: pt[0], y: pt[1] };
            _lassoRect.attr('x', pt[0]).attr('y', pt[1]).attr('width', 0).attr('height', 0).attr('display', null);
        });

        svgEl.on('mousemove.lasso', function(event) {
            if (!_origin) return;
            var pt = d3.pointer(event, svgNode);
            var x = Math.min(_origin.x, pt[0]);
            var y = Math.min(_origin.y, pt[1]);
            var w = Math.abs(pt[0] - _origin.x);
            var h = Math.abs(pt[1] - _origin.y);
            _lassoRect.attr('x', x).attr('y', y).attr('width', w).attr('height', h);
        });

        svgEl.on('mouseup.lasso', function(event) {
            if (!_origin) return;
            var pt = d3.pointer(event, svgNode);
            var x1 = Math.min(_origin.x, pt[0]);
            var y1 = Math.min(_origin.y, pt[1]);
            var x2 = Math.max(_origin.x, pt[0]);
            var y2 = Math.max(_origin.y, pt[1]);
            _origin = null;
            _lassoRect.attr('display', 'none');

            // Ignore tiny drags (treated as clicks)
            if (x2 - x1 < 5 && y2 - y1 < 5) return;

            var hits = new Set();
            svgEl.selectAll(_spec.selector).each(function(d) {
                var h = _spec.hitTest(this, d);
                if (h && h.fileId != null &&
                    h.x >= x1 && h.x <= x2 && h.y2 >= y1 && h.y1 <= y2) {
                    hits.add(h.fileId);
                }
            });
            if (_cb.onLassoHits) _cb.onLassoHits(hits);
            refreshHighlights();
        });

        // Click-to-toggle on individual elements. A chart may expose a
        // separate clickSelector (e.g. a full-height transparent hit rect)
        // distinct from the lasso-geometry selector; default to the same.
        var clickSelector = _spec.clickSelector || _spec.selector;
        svgEl.selectAll(clickSelector).on('click.lasso', function(event, d) {
            event.stopPropagation();
            var h = _spec.hitTest(this, d);
            if (h && h.fileId != null) {
                if (_cb.onToggle) _cb.onToggle(h.fileId);
                refreshHighlights();
            }
        });

        refreshHighlights();
        return true;
    }

    // Repaint the selected/unselected visual on every selectable element,
    // delegating the per-element styling to the chart.
    function refreshHighlights() {
        if (!_chart || !_svgNode || !_spec) return;
        var svgEl = d3.select(_svgNode);
        var isSel = _cb.isSelected || function() { return false; };
        var chart = _chart;
        var spec = _spec;
        svgEl.selectAll(spec.selector).each(function(d) {
            var h = spec.hitTest(this, d);
            var selected = !!(h && h.fileId != null && isSel(h.fileId));
            chart.setElementSelected(this, selected, d);
        });
    }

    function detach() {
        if (_chart) {
            // remove listeners + overlay from the SVG we attached to
            if (_svgNode) {
                var svgEl = d3.select(_svgNode);
                svgEl.on('mousedown.lasso', null)
                     .on('mousemove.lasso', null)
                     .on('mouseup.lasso', null);
                if (_spec && _spec.selector) {
                    svgEl.selectAll(_spec.selector).on('click.lasso', null);
                    var clickSel = _spec.clickSelector || _spec.selector;
                    if (clickSel !== _spec.selector) {
                        svgEl.selectAll(clickSel).on('click.lasso', null);
                    }
                }
                svgEl.selectAll('.lasso-group').remove();
            }
            // let the chart undo any prep (e.g. restore zoom)
            _chart.onSelectionModeExit();
        }
        _chart = null;
        _svgNode = null;
        _spec = null;
        _cb = null;
        _origin = null;
        _lassoRect = null;
    }

    return {
        attach: attach,
        detach: detach,
        isAttached: isAttached,
        refreshHighlights: refreshHighlights
    };
})();
