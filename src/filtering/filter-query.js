// ===========================
// FilterQuery - Filtered data access
// ===========================

var FilterQuery = (function() {

    // Attribute metadata for an entity type across given fileIds.
    // Returns [{ name, dtype, values? , globalMin?, globalMax? }]
    function getAttributeMeta(entityType, fileIds) {
        var _def = SchemaStore.getEntity(entityType);
        if (!_def) return [];
        var props = _def.properties || [];
        var result = [];
        for (var i = 0; i < props.length; i++) {
            var p = props[i];
            if (SchemaStore.isCategorical(p)) {
                result.push({ name: p.name, dtype: p.dtype, values: SchemaStore.getCategoryValues(p) });
            } else if (p.dtype === 'int' || p.dtype === 'float') {
                var nums = DataStore.getAttributeNumericValues(entityType, p.name, fileIds);
                if (nums.length === 0) continue;
                var mn = nums[0], mx = nums[0];
                for (var j = 1; j < nums.length; j++) {
                    if (nums[j] < mn) mn = nums[j];
                    if (nums[j] > mx) mx = nums[j];
                }
                result.push({ name: p.name, dtype: p.dtype, globalMin: mn, globalMax: mx });
            }
        }
        return result;
    }

    // ---- Filtered node access ----

    function getFilteredNodes(fileIds, entityType) {
        var allNodes = DataStore.getNodes(fileIds, entityType);
        if (!FilterState.hasActiveFilters(entityType)) return allNodes;
        var result = [];
        for (var i = 0; i < allNodes.length; i++) {
            if (FilterState.nodePassesFilters(allNodes[i], entityType)) result.push(allNodes[i]);
        }
        return result;
    }

    // Returns { fileId: count } for an entity type, applying active filters.
    function getFilteredEntityCountsByFile(entityType) {
        if (!FilterState.hasActiveFilters(entityType)) {
            // Fast path: no filters, defer entirely to the index.
            return DataStore.getEntityCountsByFile(entityType);
        }
        var result = {};
        var allFileIds = _getAllFileIds();
        for (var fi = 0; fi < allFileIds.length; fi++) {
            var fileId = allFileIds[fi];
            var nodes = DataStore.getNodes([fileId], entityType);
            var count = 0;
            for (var ni = 0; ni < nodes.length; ni++) {
                if (FilterState.nodePassesFilters(nodes[ni], entityType)) count++;
            }
            if (count > 0) result[fileId] = count;
        }
        return result;
    }

    // ---- Filtered attribute access ----

    function getFilteredAttributeDistribution(entityType, propName, fileId) {
        if (!FilterState.hasActiveFilters(entityType)) {
            return DataStore.getAttributeDistribution(entityType, propName, fileId);
        }
        var nodes = getFilteredNodes([fileId], entityType);
        var dist = {};
        for (var i = 0; i < nodes.length; i++) {
            var props = nodes[i].properties || [];
            for (var j = 0; j < props.length; j++) {
                if (props[j].name === propName) {
                    var v = props[j].value;
                    if (v !== undefined && v !== null && v !== 'TODO') {
                        dist[v] = (dist[v] || 0) + 1;
                    }
                }
            }
        }
        return dist;
    }

    function getFilteredNumericValues(entityType, propName, fileIds) {
        if (!FilterState.hasActiveFilters(entityType)) {
            return DataStore.getAttributeNumericValues(entityType, propName, fileIds);
        }
        var nodes = getFilteredNodes(fileIds, entityType);
        var result = [];
        for (var i = 0; i < nodes.length; i++) {
            var props = nodes[i].properties || [];
            for (var j = 0; j < props.length; j++) {
                if (props[j].name === propName) {
                    var v = props[j].value;
                    if (typeof v === 'number' && isFinite(v)) result.push(v);
                }
            }
        }
        return result;
    }

    function getFilteredNumericValuesForFile(entityType, propName, fileId) {
        return getFilteredNumericValues(entityType, propName, [fileId]);
    }

    // ---- Paired values ----

    // Paired (x, y) values per filtered node that has both attributes.
    // Returns [{ x, y:<number>, fileId }]. xAttr may be enum/bool/int/float;
    // yAttr must be numeric.
    function getFilteredPairedValues(entityType, xPropName, yPropName, fileIds) {
        var nodes = getFilteredNodes(fileIds, entityType);
        var result = [];
        for (var i = 0; i < nodes.length; i++) {
            var props = nodes[i].properties || [];
            var xVal = undefined, yVal = undefined;
            for (var j = 0; j < props.length; j++) {
                if (props[j].name === xPropName) xVal = props[j].value;
                if (props[j].name === yPropName) yVal = props[j].value;
            }
            if (xVal === undefined || xVal === null || xVal === 'TODO') continue;
            if (yVal === undefined || yVal === null || yVal === 'TODO') continue;
            var numY = typeof yVal === 'number' ? yVal : parseFloat(yVal);
            if (!isFinite(numY)) continue;
            result.push({ x: xVal, y: numY, fileId: nodes[i].fileId });
        }
        return result;
    }

    // Paired values across a relation: one node provides X, the connected node
    // provides Y. One {x,y} pair per Y-node when an X-node connects to many.
    //   xSide: 'source' | 'target' — which edge side provides X.
    function getRelationPairedValues(relName, sourceEntityType, targetEntityType,
                                     xSide, xPropName, yPropName, fileIds) {
        var result = [];
        for (var fi = 0; fi < fileIds.length; fi++) {
            var edges = DataStore.getEdges([fileIds[fi]], relName, sourceEntityType, targetEntityType);
            for (var i = 0; i < edges.length; i++) {
                var edge = edges[i];
                var xNodeId = xSide === 'source' ? edge.sourceId : edge.targetId;
                var yNodeId = xSide === 'source' ? edge.targetId : edge.sourceId;
                var xNode = DataStore.getNode(xNodeId);
                var yNode = DataStore.getNode(yNodeId);
                if (!xNode || !yNode) continue;

                var xVal = _getNodePropValue(xNode, xPropName);
                if (xVal === undefined) continue;

                var yVal = _getNodePropValue(yNode, yPropName);
                if (yVal === undefined) continue;
                var numY = typeof yVal === 'number' ? yVal : parseFloat(yVal);
                if (!isFinite(numY)) continue;

                result.push({ x: xVal, y: numY, fileId: fileIds[fi] });
            }
        }
        return result;
    }

    // ---- Enum value counts + toggle impact (for the filter panel) ----

    function getEnumValueCounts(entityType, attrName, fileIds) {
        var nodes = DataStore.getNodes(fileIds, entityType);

        // Active filters EXCEPT the one we're counting for.
        var allFilters = FilterState.getFilters(entityType);
        var otherFilters = {};
        for (var key in allFilters) {
            if (key !== attrName) otherFilters[key] = allFilters[key];
        }
        var thisFilter = allFilters[attrName] || null;

        // Count instances per value that pass the OTHER filters.
        var counts = {};
        for (var i = 0; i < nodes.length; i++) {
            var node = nodes[i];
            if (!FilterState.nodePassesFilterMap(node, otherFilters)) continue;
            var props = node.properties || [];
            for (var j = 0; j < props.length; j++) {
                if (props[j].name === attrName) {
                    var val = props[j].value;
                    if (val !== undefined && val !== null && val !== 'TODO') {
                        counts[val] = (counts[val] || 0) + 1;
                    }
                    break;
                }
            }
        }

        // Impact of toggling each value (signed: -removes / +adds).
        var impact = {};
        for (var val in counts) {
            var count = counts[val];
            var isSelected = thisFilter ? thisFilter.selected.has(val) : true; // default: all selected
            if (isSelected) {
                impact[val] = -count;
            } else {
                impact[val] = +count;
            }
        }

        return impact;
    }

    // ---- Bin impact analysis (how counts would be affected by a selection) ----
    // Returns: { bins: string[], stacks: number[][] }
    //   stacks[binIndex] = [included, exclThisOnly, exclThisPlus1, exclThisPlus2Plus, exclOthersOnly]
    function computeBinImpact(entityType, attrName, fileIds, numericBins) {
        var f = FilterState.getFilters(entityType);
        var nodes = DataStore.getNodes(fileIds, entityType);

        var otherFilterKeys = [];
        for (var k in f) {
            if (k !== attrName) otherFilterKeys.push(k);
        }

        var meta = getAttributeMeta(entityType, fileIds);
        var attrMeta = null;
        for (var m = 0; m < meta.length; m++) {
            if (meta[m].name === attrName) { attrMeta = meta[m]; break; }
        }
        if (!attrMeta) return { bins: [], stacks: [] };

        var isEnum = SchemaStore.isCategorical(attrMeta);
        var binLabels, binCount;

        if (isEnum) {
            binLabels = attrMeta.values || [];
            binCount = binLabels.length;
        } else {
            if (!numericBins || numericBins.length === 0) return { bins: [], stacks: [] };
            binLabels = numericBins.map(function(b) { return b.label; });
            binCount = numericBins.length;
        }

        var stacks = [];
        for (var b = 0; b < binCount; b++) {
            stacks.push([0, 0, 0, 0, 0]);
        }

        var thisFilter = f[attrName] || null;

        for (var i = 0; i < nodes.length; i++) {
            var node = nodes[i];
            var propMap = {};
            var props = node.properties || [];
            for (var j = 0; j < props.length; j++) {
                propMap[props[j].name] = props[j].value;
            }

            var val = propMap[attrName];
            if (val === undefined || val === null || val === 'TODO') continue;

            var binIdx = -1;
            if (isEnum) {
                binIdx = binLabels.indexOf(SchemaStore.categoryKey(val));
            } else {
                var numVal = typeof val === 'number' ? val : parseFloat(val);
                if (!isFinite(numVal)) continue;
                for (var bi = 0; bi < numericBins.length; bi++) {
                    if (numVal >= numericBins[bi].x0 &&
                        (numVal < numericBins[bi].x1 || (bi === numericBins.length - 1 && numVal <= numericBins[bi].x1))) {
                        binIdx = bi;
                        break;
                    }
                }
            }
            if (binIdx < 0) continue;

            var passesThis = true;
            if (thisFilter) {
                if (thisFilter.type === 'enum') {
                    passesThis = thisFilter.selected.has(SchemaStore.categoryKey(val));
                } else if (thisFilter.type === 'numeric') {
                    var nv = typeof val === 'number' ? val : parseFloat(val);
                    if (thisFilter.floor != null && nv < thisFilter.floor) passesThis = false;
                    if (thisFilter.ceiling != null && nv > thisFilter.ceiling) passesThis = false;
                }
            }

            var otherFailCount = 0;
            for (var oi = 0; oi < otherFilterKeys.length; oi++) {
                var oKey = otherFilterKeys[oi];
                var oFilter = f[oKey];
                var oVal = propMap[oKey];

                var passesOther = true;
                if (oVal === undefined || oVal === null || oVal === 'TODO') {
                    passesOther = false;
                } else if (oFilter.type === 'enum') {
                    passesOther = oFilter.selected.has(SchemaStore.categoryKey(oVal));
                } else if (oFilter.type === 'numeric') {
                    var onv = typeof oVal === 'number' ? oVal : parseFloat(oVal);
                    if (isNaN(onv)) passesOther = false;
                    else {
                        if (oFilter.floor != null && onv < oFilter.floor) passesOther = false;
                        if (oFilter.ceiling != null && onv > oFilter.ceiling) passesOther = false;
                    }
                }
                if (!passesOther) otherFailCount++;
            }

            if (passesThis && otherFailCount === 0) {
                stacks[binIdx][0]++;
            } else if (!passesThis && otherFailCount === 0) {
                stacks[binIdx][1]++;
            } else if (!passesThis && otherFailCount === 1) {
                stacks[binIdx][2]++;
            } else if (!passesThis && otherFailCount >= 2) {
                stacks[binIdx][3]++;
            } else {
                stacks[binIdx][4]++;
            }
        }

        return { bins: binLabels, stacks: stacks };
    }

    // ---- Helpers ----

    function _getNodePropValue(node, propName) {
        var props = node.properties || [];
        for (var j = 0; j < props.length; j++) {
            if (props[j].name === propName) {
                var v = props[j].value;
                if (v === undefined || v === null || v === 'TODO') return undefined;
                return v;
            }
        }
        return undefined;
    }

    function _getAllFileIds() {
        return FileRegistry.all().map(function(f) { return f.id; });
    }

    return {
        getAttributeMeta: getAttributeMeta,
        getFilteredNodes: getFilteredNodes,
        getFilteredEntityCountsByFile: getFilteredEntityCountsByFile,
        getFilteredAttributeDistribution: getFilteredAttributeDistribution,
        getFilteredNumericValues: getFilteredNumericValues,
        getFilteredNumericValuesForFile: getFilteredNumericValuesForFile,
        getFilteredPairedValues: getFilteredPairedValues,
        getRelationPairedValues: getRelationPairedValues,
        getEnumValueCounts: getEnumValueCounts,
        computeBinImpact: computeBinImpact
    };
})();
