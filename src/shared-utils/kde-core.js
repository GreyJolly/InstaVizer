// ===========================
// KDE Core — kernel density estimation math (context-agnostic)
// ===========================

var KDE = (function() {

// ===========================
// KDE Helpers
// ===========================
function gaussianKernel(x) {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

function kde1D(data, nPoints, bandwidth) {
    if (data.length === 0) return [];
    var min = d3.min(data);
    var max = d3.max(data);
    if (min === max) { min -= 1; max += 1; }
    var step = (max - min) / (nPoints - 1);
    var result = [];
    for (var i = 0; i < nPoints; i++) {
        var x = min + i * step;
        var density = 0;
        for (var j = 0; j < data.length; j++) {
            density += gaussianKernel((x - data[j]) / bandwidth);
        }
        density /= (data.length * bandwidth);
        result.push({ x: x, y: density });
    }
    return result;
}

function kde2D(dataX, dataY, gridSize, bandwidthX, bandwidthY) {
    if (dataX.length === 0 || dataY.length === 0) return { grid: [], xMin: 0, xMax: 1, yMin: 0, yMax: 1, maxDensity: 0 };
    var xMin = d3.min(dataX), xMax = d3.max(dataX);
    var yMin = d3.min(dataY), yMax = d3.max(dataY);
    if (xMin === xMax) { xMin -= 1; xMax += 1; }
    if (yMin === yMax) { yMin -= 1; yMax += 1; }
    var grid = [];
    var maxDensity = 0;
    for (var iy = 0; iy < gridSize; iy++) {
        var row = [];
        var gy = yMin + (yMax - yMin) * iy / (gridSize - 1);
        for (var ix = 0; ix < gridSize; ix++) {
            var gx = xMin + (xMax - xMin) * ix / (gridSize - 1);
            var density = 0;
            for (var k = 0; k < dataX.length; k++) {
                density += gaussianKernel((gx - dataX[k]) / bandwidthX) *
                           gaussianKernel((gy - dataY[k]) / bandwidthY);
            }
            density /= (dataX.length * bandwidthX * bandwidthY);
            if (density > maxDensity) maxDensity = density;
            row.push(density);
        }
        grid.push(row);
    }
    return { grid: grid, xMin: xMin, xMax: xMax, yMin: yMin, yMax: yMax, maxDensity: maxDensity };
}

// ===========================
// VKDE – Variable (Adaptive) Kernel Density Estimation
// ===========================

function vkde2D(dataX, dataY, gridSize, bandwidthX, bandwidthY) {
    var n = dataX.length;
    if (n === 0) return { grid: [], xMin: 0, xMax: 1, yMin: 0, yMax: 1, maxDensity: 0 };

    var xMin = d3.min(dataX), xMax = d3.max(dataX);
    var yMin = d3.min(dataY), yMax = d3.max(dataY);
    if (xMin === xMax) { xMin -= 1; xMax += 1; }
    if (yMin === yMax) { yMin -= 1; yMax += 1; }

    // --- Step 1: Pilot density at each data point using global bandwidth ---
    var pilotDensities = new Float64Array(n);
    for (var i = 0; i < n; i++) {
        var d = 0;
        for (var j = 0; j < n; j++) {
            d += gaussianKernel((dataX[i] - dataX[j]) / bandwidthX) *
                 gaussianKernel((dataY[i] - dataY[j]) / bandwidthY);
        }
        pilotDensities[i] = d / (n * bandwidthX * bandwidthY);
    }

    // --- Step 2: Local bandwidth factors (Abramson square-root law) ---
    // Geometric mean of pilot densities (using log to avoid overflow)
    var logSum = 0;
    var validCount = 0;
    var FLOOR = 1e-300;
    for (var i = 0; i < n; i++) {
        if (pilotDensities[i] > FLOOR) {
            logSum += Math.log(pilotDensities[i]);
            validCount++;
        }
    }
    var logGeoMean = validCount > 0 ? logSum / validCount : 0;

    // λ_i = (f_pilot(x_i) / g)^(-α), α = 0.5 (Abramson)
    var ALPHA = 0.5;
    var lambdas = new Float64Array(n);
    for (var i = 0; i < n; i++) {
        if (pilotDensities[i] > FLOOR) {
            lambdas[i] = Math.exp(-ALPHA * (Math.log(pilotDensities[i]) - logGeoMean));
        } else {
            lambdas[i] = 1;
        }
        // Clamp to prevent extreme bandwidths
        if (lambdas[i] < 0.2) lambdas[i] = 0.2;
        if (lambdas[i] > 5.0) lambdas[i] = 5.0;
    }

    // --- Step 3: Evaluate VKDE on the grid ---
    var grid = [];
    var maxDensity = 0;

    for (var iy = 0; iy < gridSize; iy++) {
        var row = [];
        var gy = yMin + (yMax - yMin) * iy / (gridSize - 1);
        for (var ix = 0; ix < gridSize; ix++) {
            var gx = xMin + (xMax - xMin) * ix / (gridSize - 1);
            var density = 0;
            for (var k = 0; k < n; k++) {
                var hx = bandwidthX * lambdas[k];
                var hy = bandwidthY * lambdas[k];
                density += gaussianKernel((gx - dataX[k]) / hx) *
                           gaussianKernel((gy - dataY[k]) / hy) /
                           (hx * hy);
            }
            density /= n;
            if (density > maxDensity) maxDensity = density;
            row.push(density);
        }
        grid.push(row);
    }

    return { grid: grid, xMin: xMin, xMax: xMax, yMin: yMin, yMax: yMax, maxDensity: maxDensity };
}

// Sheather-Jones plug-in bandwidth
// Solves the MISE-optimal fixed-point equation iteratively.

function _dnorm(x) {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

// Compute the sum of ψ_r (the r-th derivative functional of the density)
// using a pilot bandwidth g:  Σ_i Σ_j K^(r)(( x_i - x_j ) / g) / (n² g^(r+1))
// For the Gaussian kernel, K''(u) = (u² - 1) φ(u), K''''(u) = (u⁴ - 6u² + 3) φ(u)
function _psiHat(r, g, diffs, n) {
    var sum = 0;
    var gPow = Math.pow(g, r + 1);
    for (var k = 0; k < diffs.length; k++) {
        var u = diffs[k] / g;
        var u2 = u * u;
        var phi = _dnorm(u);
        if (r === 4) {
            sum += (u2 * u2 - 6 * u2 + 3) * phi;
        } else if (r === 6) {
            sum += (u2 * u2 * u2 - 15 * u2 * u2 + 45 * u2 - 15) * phi;
        }
    }
    return sum / (n * n * gPow);
}

function sheatherJonesBandwidth(data) {
    var n = data.length;
    if (n < 2) return 1;

    var sorted = data.slice().sort(function(a, b) { return a - b; });
    var mean = d3.mean(sorted);
    var sigma = Math.sqrt(d3.mean(sorted.map(function(v) { return (v - mean) * (v - mean); })));
    if (sigma === 0) return 1;

    // IQR for robust scale estimate
    var q1 = d3.quantile(sorted, 0.25);
    var q3 = d3.quantile(sorted, 0.75);
    var iqr = q3 - q1;
    var A = Math.min(sigma, (iqr || sigma) / 1.349);
    if (A === 0) A = sigma || 1;

    // Precompute all pairwise differences
    var diffs = [];
    for (var i = 0; i < n; i++) {
        for (var j = i; j < n; j++) {
            diffs.push(sorted[i] - sorted[j]);
            if (i !== j) diffs.push(sorted[j] - sorted[i]);
        }
    }

    // Initial pilot bandwidths for ψ₆ and ψ₈ using normal reference rules
    // g₁ for ψ₆: based on ψ₈^NR
    var psi8NR = 105 / (Math.pow(A, 9) * Math.sqrt(2 * Math.PI));
    var g1 = Math.pow(-6 / (Math.sqrt(2 * Math.PI) * psi8NR * n), 1.0 / 9);

    // ψ₆ estimate
    var psi6 = _psiHat(6, Math.abs(g1), diffs, n);
    if (psi6 === 0) return 1.06 * A * Math.pow(n, -0.2); // fallback to Silverman

    // g₂ for ψ₄ from ψ₆
    var g2 = Math.pow(-6 * Math.sqrt(2) / (psi6 * n), 1.0 / 7);

    // ψ₄ estimate
    var psi4 = _psiHat(4, Math.abs(g2), diffs, n);
    if (psi4 === 0) return 1.06 * A * Math.pow(n, -0.2); // fallback

    // Sheather-Jones optimal bandwidth from ψ₄
    // h = ( R(K) / (μ₂(K)² ψ₄ n) )^(1/5)
    // For Gaussian: R(K) = 1/(2√π), μ₂(K) = 1
    var Rk = 1 / (2 * Math.sqrt(Math.PI));
    var h = Math.pow(Rk / (psi4 * n), 0.2);

    // Clamp to reasonable range
    if (!isFinite(h) || h <= 0) return 1.06 * A * Math.pow(n, -0.2);
    h = Math.max(h, A * 0.01);
    h = Math.min(h, A * 5);

    return h;
}


    return {
        gaussianKernel: gaussianKernel,
        kde1D: kde1D,
        kde2D: kde2D,
        vkde2D: vkde2D,
        sheatherJonesBandwidth: sheatherJonesBandwidth
    };
})();
