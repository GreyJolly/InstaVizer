// ===========================
// Shared Binning Helpers
// ===========================

var BinningHelpers = (function() {

    /**
     * Compute numeric bins for a set of values.
     * @param {number[]} allValues
     * @param {string} dtype - 'int' or 'float'
     * @param {number|null} userBinSize - optional override
     * @returns {{ x0: number, x1: number, label: string }[]}
     */
    function computeNumericBins(allValues, dtype, userBinSize) {
        var minVal = d3.min(allValues);
        var maxVal = d3.max(allValues);
        var bins;

        if (dtype === 'int' && (maxVal - minVal) <= 30) {
            bins = [];
            for (var iv = minVal; iv <= maxVal; iv++) {
                bins.push({ x0: iv, x1: iv + 1, label: String(iv) });
            }
        } else {
            var binSize = userBinSize;
            if (!binSize || binSize <= 0) {
                var nBins = Math.max(5, Math.ceil(Math.log2(allValues.length) + 1));
                var range = maxVal - minVal;
                if (range === 0) range = 1;
                binSize = range / nBins;
                if (dtype === 'int') binSize = Math.max(1, Math.round(binSize));
                if (dtype === 'float' && binSize > 0) {
                    var magnitude = Math.pow(10, Math.floor(Math.log10(binSize)));
                    var normalized = binSize / magnitude;
                    if (normalized <= 1.5) normalized = 1;
                    else if (normalized <= 3.5) normalized = 2;
                    else if (normalized <= 7.5) normalized = 5;
                    else normalized = 10;
                    binSize = normalized * magnitude;
                }
                if (binSize <= 0) binSize = 1;
            }
            bins = [];
            var start;
            if (dtype === 'int') {
                start = minVal;
            } else {
                start = Math.floor(minVal / binSize) * binSize;
            }
            while (start < maxVal + binSize * 0.001) {
                var end = start + binSize;
                var label;
                if (dtype === 'int') {
                    label = Math.round(start) + '\u2013' + Math.round(end - 1);
                } else {
                    label = start.toFixed(2) + '\u2013' + end.toFixed(2);
                }
                bins.push({ x0: start, x1: end, label: label });
                start = end;
            }
        }
        return bins;
    }

    /**
     * Bin a set of values into pre-computed bins.
     * @param {number[]} values
     * @param {{ x0: number, x1: number }[]} bins
     * @returns {number[]} counts per bin
     */
    function binValues(values, bins) {
        var counts = new Array(bins.length).fill(0);
        values.forEach(function(v) {
            for (var b = 0; b < bins.length; b++) {
                if (v >= bins[b].x0 && (v < bins[b].x1 || (b === bins.length - 1 && v <= bins[b].x1))) {
                    counts[b]++;
                    break;
                }
            }
        });
        return counts;
    }

    function suggestBinSizes(allValues, dtype) {
        var minVal = d3.min(allValues);
        var maxVal = d3.max(allValues);
        var range = maxVal - minVal;
        if (range === 0) return [1];

        var suggestions = [];
        if (dtype === 'int') {
            // Suggest 1, 2, 5, 10, ... up to range/3
            var steps = [1, 2, 5, 10, 20, 50, 100];
            for (var i = 0; i < steps.length; i++) {
                if (steps[i] <= range / 3) suggestions.push(steps[i]);
            }
            if (suggestions.length === 0) suggestions.push(1);
        } else {
            var mag = Math.pow(10, Math.floor(Math.log10(range)));
            var nice = [0.1, 0.2, 0.5, 1, 2, 5, 10];
            for (var j = 0; j < nice.length; j++) {
                var s = nice[j] * mag;
                if (s >= range / 50 && s <= range / 2) suggestions.push(s);
            }
            if (suggestions.length === 0) suggestions.push(range / 5);
        }
        return suggestions;
    }

    return {
        computeNumericBins: computeNumericBins,
        binValues: binValues,
        suggestBinSizes: suggestBinSizes
    };
})();
