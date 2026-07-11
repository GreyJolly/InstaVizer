// ===========================
// MDSCore - Classical MDS (shared, context-agnostic)
// ===========================

// Assigned as a top level global to allow loading from both main thread and workers
var MDSCore = (function() {

    var DEFAULT_MAX_ITER = 300;

    // Multiply n×n matrix M (flat Float64Array) by vector v.
    function matVec(M, v, sz) {
        var r = new Float64Array(sz);
        for (var i = 0; i < sz; i++) {
            var s = 0;
            for (var j = 0; j < sz; j++) s += M[i * sz + j] * v[j];
            r[i] = s;
        }
        return r;
    }

    function norm(v) {
        var s = 0;
        for (var i = 0; i < v.length; i++) s += v[i] * v[i];
        return Math.sqrt(s);
    }

    function normalize(v) {
        var n = norm(v);
        if (n < 1e-12) return v;
        return v.map(function(x) { return x / n; });
    }

    // Top-2 eigenvectors of symmetric n×n B via power iteration + deflation.
    // Returns coordinate pairs [[x, y], ...] scaled by sqrt(eigenvalue).
    function powerIteration2D(B, n, maxIter) {
        maxIter = maxIter || DEFAULT_MAX_ITER;

        var v1 = new Float64Array(n);
        for (var i = 0; i < n; i++) v1[i] = Math.random() - 0.5;
        v1 = normalize(v1);
        var lambda1 = 0;
        for (var iter = 0; iter < maxIter; iter++) {
            var Bv = matVec(B, v1, n);
            lambda1 = 0;
            for (var a = 0; a < n; a++) lambda1 += v1[a] * Bv[a];
            v1 = normalize(Bv);
        }

        // Deflate the first component, then iterate again for the second.
        var B2 = new Float64Array(n * n);
        for (var r = 0; r < n; r++) {
            for (var c = 0; c < n; c++) {
                B2[r * n + c] = B[r * n + c] - lambda1 * v1[r] * v1[c];
            }
        }

        var v2 = new Float64Array(n);
        for (var i2 = 0; i2 < n; i2++) v2[i2] = Math.random() - 0.5;
        v2 = normalize(v2);
        var lambda2 = 0;
        for (var iter2 = 0; iter2 < maxIter; iter2++) {
            var Bv2 = matVec(B2, v2, n);
            lambda2 = 0;
            for (var b = 0; b < n; b++) lambda2 += v2[b] * Bv2[b];
            v2 = normalize(Bv2);
        }

        var s1 = Math.sqrt(Math.max(0, lambda1));
        var s2 = Math.sqrt(Math.max(0, lambda2));
        var coords = [];
        for (var k = 0; k < n; k++) coords.push([v1[k] * s1, v2[k] * s2]);
        return coords;
    }

    // Classical MDS on a flat n×n distance matrix D.
    function compute(D, n, maxIter) {
        if (n <= 0) return [];
        if (n === 1) return [[0, 0]];
        if (n === 2) {
            // Two points: place them apart by their single pairwise distance.
            return [[-D[1] / 2, 0], [D[1] / 2, 0]];
        }

        // Squared distances.
        var D2 = new Float64Array(n * n);
        for (var i = 0; i < n * n; i++) D2[i] = D[i] * D[i];

        // Double centering: B = -1/2 J D2 J.
        var rowMeans = new Float64Array(n);
        var grandMean = 0;
        for (var r = 0; r < n; r++) {
            var s = 0;
            for (var c = 0; c < n; c++) s += D2[r * n + c];
            rowMeans[r] = s / n;
            grandMean += s;
        }
        grandMean /= (n * n);

        var B = new Float64Array(n * n);
        for (var ri = 0; ri < n; ri++) {
            for (var ci = 0; ci < n; ci++) {
                B[ri * n + ci] = -0.5 * (D2[ri * n + ci] - rowMeans[ri] - rowMeans[ci] + grandMean);
            }
        }

        return powerIteration2D(B, n, maxIter);
    }

    return {
        compute: compute,
        powerIteration2D: powerIteration2D
    };
})();
