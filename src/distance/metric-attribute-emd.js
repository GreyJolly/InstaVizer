// ===========================
// AttributeEMDMetric — Earth Mover's Distance on attribute distributions
// ===========================

// Compares, per entity type, the empirical distribution of each usable
// attribute between two files:
//
//   int / float  ->  1D EMD on min-max normalised values (CDF formulation)
//   bool         ->  |mean1 - mean2|  (1D EMD on {0,1})
//   enum         ->  1/2 * sum |p1(v) - p2(v)|  (total variation)
//   string       ->  skipped

// Each attribute is weighted equally.
// The per-entity-type distance is the average across attributes
// The overall distance is averaged across entity types, weighted by max(count1, count2).

// options.selectedAttributes (optional): { entityType: [attrName, ...] }
//   When present and non-empty, only those attributes (per entity type) are
//   compared, and entity types absent from the map are excluded entirely.
//   When absent/empty, all schema attributes are used.

class AttributeEMDMetric extends DistanceMetric {

    distance(fileId1, fileId2) {
        var f1 = this.getFilteredFile(fileId1);
        var f2 = this.getFilteredFile(fileId2);
        if (!f1 || !f2) return 1;
        if (f1.nodes.length === 0 && f2.nodes.length === 0) return 0;
        if (!SchemaStore.getEntities()) return 1;

        var byType1 = this._groupNodesByType(f1.nodes);
        var byType2 = this._groupNodesByType(f2.nodes);

        var allTypes = {};
        var k;
        for (k in byType1) allTypes[k] = true;
        for (k in byType2) allTypes[k] = true;

        var selectedAttrs = this.options.selectedAttributes || {};
        var hasSubset = selectedAttrs && Object.keys(selectedAttrs).length > 0;

        var totalWeight = 0;
        var weightedSum = 0;

        for (var entityType in allTypes) {
            var schemaDef = SchemaStore.getEntity(entityType);
            if (!schemaDef || !schemaDef.properties) continue;

            var nodes1 = byType1[entityType] || [];
            var nodes2 = byType2[entityType] || [];
            var weight = Math.max(nodes1.length, nodes2.length);
            if (weight === 0) continue;

            if (nodes1.length === 0 || nodes2.length === 0) {
                totalWeight += weight;
                weightedSum += weight; // distance = 1
                continue;
            }

            // Restrict to the selected attribute subset, if any.
            var props = schemaDef.properties;
            if (hasSubset) {
                var allowedAttrs = selectedAttrs[entityType];
                if (!allowedAttrs || allowedAttrs.length === 0) continue; // entity excluded
                var allowSet = {};
                for (var a = 0; a < allowedAttrs.length; a++) allowSet[allowedAttrs[a]] = true;
                props = props.filter(function(p) { return allowSet[p.name]; });
            }

            var attrDists = this._computePerAttributeDistances(nodes1, nodes2, props);
            if (attrDists.length === 0) continue;

            var sum = 0;
            for (var d = 0; d < attrDists.length; d++) sum += attrDists[d];
            var avgDist = sum / attrDists.length;

            totalWeight += weight;
            weightedSum += weight * avgDist;
        }

        if (totalWeight === 0) return 0;
        return Math.max(0, Math.min(1, weightedSum / totalWeight));
    }

    _groupNodesByType(nodes) {
        var groups = {};
        for (var i = 0; i < nodes.length; i++) {
            var t = nodes[i].entityType;
            if (!groups[t]) groups[t] = [];
            groups[t].push(nodes[i]);
        }
        return groups;
    }

    // One distance in [0,1] per usable attribute.
    _computePerAttributeDistances(nodes1, nodes2, schemaProps) {
        var distances = [];
        for (var p = 0; p < schemaProps.length; p++) {
            var prop = schemaProps[p];
            var dt = prop.dtype;
            if (dt === 'int' || dt === 'float') {
                distances.push(this._numericAttrEMD(nodes1, nodes2, prop.name));
            } else if (dt === 'bool') {
                distances.push(this._boolAttrDist(nodes1, nodes2, prop.name));
            } else if (dt === 'enum' && prop.values && prop.values.length > 0) {
                distances.push(this._enumAttrDist(nodes1, nodes2, prop.name, prop.values));
            }
            // string: skip
        }
        return distances;
    }

    // ---- Numeric attribute: 1D EMD on normalised values ----

    _numericAttrEMD(nodes1, nodes2, attrName) {
        var vals1 = this._extractNumeric(nodes1, attrName);
        var vals2 = this._extractNumeric(nodes2, attrName);

        if (vals1.length === 0 && vals2.length === 0) return 0;
        if (vals1.length === 0 || vals2.length === 0) return 1;

        var all = vals1.concat(vals2);
        var min = all[0], max = all[0];
        for (var i = 1; i < all.length; i++) {
            if (all[i] < min) min = all[i];
            if (all[i] > max) max = all[i];
        }
        var range = max - min;
        if (range === 0) return 0;

        var norm1 = vals1.map(function(v) { return (v - min) / range; });
        var norm2 = vals2.map(function(v) { return (v - min) / range; });
        norm1.sort(function(a, b) { return a - b; });
        norm2.sort(function(a, b) { return a - b; });

        return this._emd1D(norm1, norm2);
    }

    _extractNumeric(nodes, attrName) {
        var vals = [];
        for (var i = 0; i < nodes.length; i++) {
            var props = nodes[i].properties || [];
            for (var p = 0; p < props.length; p++) {
                if (props[p].name === attrName) {
                    var v = props[p].value;
                    if (typeof v === 'number' && !isNaN(v)) vals.push(v);
                    break;
                }
            }
        }
        return vals;
    }

    // ---- Bool attribute: |mean1 - mean2| ----

    _boolAttrDist(nodes1, nodes2, attrName) {
        var m1 = this._boolMean(nodes1, attrName);
        var m2 = this._boolMean(nodes2, attrName);
        if (m1 === null && m2 === null) return 0;
        if (m1 === null || m2 === null) return 1;
        return Math.abs(m1 - m2);
    }

    _boolMean(nodes, attrName) {
        var sum = 0, count = 0;
        for (var i = 0; i < nodes.length; i++) {
            var props = nodes[i].properties || [];
            for (var p = 0; p < props.length; p++) {
                if (props[p].name === attrName) {
                    var v = props[p].value;
                    if (v === true || v === false) {
                        sum += v ? 1 : 0;
                        count++;
                    }
                    break;
                }
            }
        }
        return count > 0 ? sum / count : null;
    }

    // ---- Enum attribute: total variation = 1/2 sum |p1(v) - p2(v)| ----

    _enumAttrDist(nodes1, nodes2, attrName, enumValues) {
        var hist1 = this._enumHistogram(nodes1, attrName, enumValues);
        var hist2 = this._enumHistogram(nodes2, attrName, enumValues);

        if (hist1.total === 0 && hist2.total === 0) return 0;
        if (hist1.total === 0 || hist2.total === 0) return 1;

        var tv = 0;
        for (var v = 0; v < enumValues.length; v++) {
            var p1 = hist1.counts[v] / hist1.total;
            var p2 = hist2.counts[v] / hist2.total;
            tv += Math.abs(p1 - p2);
        }
        return tv / 2;
    }

    _enumHistogram(nodes, attrName, enumValues) {
        var counts = new Array(enumValues.length);
        for (var v = 0; v < enumValues.length; v++) counts[v] = 0;
        var total = 0;

        for (var i = 0; i < nodes.length; i++) {
            var props = nodes[i].properties || [];
            for (var p = 0; p < props.length; p++) {
                if (props[p].name === attrName) {
                    var val = props[p].value;
                    var idx = enumValues.indexOf(val);
                    if (idx >= 0) {
                        counts[idx]++;
                        total++;
                    }
                    break;
                }
            }
        }
        return { counts: counts, total: total };
    }

    // ---- 1D Earth Mover's Distance (CDF formulation) ----
    // Inputs: two sorted arrays of values in [0,1]. EMD = integral |F1 - F2|.

    _emd1D(sorted1, sorted2) {
        var n1 = sorted1.length;
        var n2 = sorted2.length;
        if (n1 === 0 && n2 === 0) return 0;
        if (n1 === 0 || n2 === 0) return 1;

        var events = [];
        var i = 0, j = 0;
        while (i < n1 || j < n2) {
            if (i < n1 && (j >= n2 || sorted1[i] <= sorted2[j])) {
                events.push({ val: sorted1[i], d1: 1, d2: 0 });
                i++;
            } else {
                events.push({ val: sorted2[j], d1: 0, d2: 1 });
                j++;
            }
        }

        var cdf1 = 0, cdf2 = 0;
        var totalArea = 0;
        var prevVal = events[0].val;

        for (var e = 0; e < events.length; e++) {
            var ev = events[e];
            if (ev.val > prevVal) {
                totalArea += Math.abs(cdf1 / n1 - cdf2 / n2) * (ev.val - prevVal);
                prevVal = ev.val;
            }
            cdf1 += ev.d1;
            cdf2 += ev.d2;
        }

        return Math.min(1, totalArea);
    }

    // ---- Pre-computation dialog contract ----
    renderOptions(containerEl) {
        // The dialog supplies the attribute-subset builder
        if (typeof MdsConfig !== 'undefined' && MdsConfig.buildAttributeSubsetInto) {
            MdsConfig.buildAttributeSubsetInto(containerEl, this.options.selectedAttributes || null);
        }
    }

    readOptions(overlayEl) {
        if (typeof MdsConfig !== 'undefined' && MdsConfig.readSelectedAttributes) {
            return { selectedAttributes: MdsConfig.readSelectedAttributes(overlayEl) };
        }
        return { selectedAttributes: {} };
    }

    static optionsFromConfig(config) {
        return { selectedAttributes: config.selectedAttributes || {} };
    }
}

AttributeEMDMetric.id = 'emd';
AttributeEMDMetric.label = 'Attribute distance';

FileDistance.register(AttributeEMDMetric);
