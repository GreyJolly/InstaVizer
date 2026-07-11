// ===========================
// DataStore - Central Data Index
// ===========================

var DataStore = (function() {
    // Canonical storage per file: { nodes: [...], edges: [...] }
    var _files = {};

    // Indexes
    // entityIndex[entityType][fileId] = [node, node, ...]
    var _entityIndex = {};
    // relationIndex[relationType][sourceEntityType][targetEntityType][fileId] = [edge, edge, ...]
    var _relationIndex = {};
    // nodeMap[nodeId] = node (across all files)
    var _nodeMap = {};
    // Per-file instance counts
    var _fileCounts = {};
    // Attribute value index: _attrIndex[entityType][propName][fileId] = [value, value, ...]
    var _attrIndex = {};

    // ---- Parsing ----

    function parseFile(fileId, rawData) {
        var parsed = { nodes: [], edges: [] };

        if (!rawData || !rawData.elements) return parsed;

        var localNodeMap = {};

        // Parse nodes
        var rawNodes = rawData.elements.nodes || [];
        for (var i = 0; i < rawNodes.length; i++) {
            var n = rawNodes[i];
            if (!n.data) continue;
            var node = {
                id: n.data.id,
                entityType: n.data.name,
                properties: n.data.properties || [],
                fileId: fileId
            };
            parsed.nodes.push(node);
            localNodeMap[node.id] = node;
        }

        // Parse edges, resolving source/target entity types
        var rawEdges = rawData.elements.edges || [];
        for (var j = 0; j < rawEdges.length; j++) {
            var e = rawEdges[j];
            if (!e.data) continue;
            var srcNode = localNodeMap[e.data.source];
            var tgtNode = localNodeMap[e.data.target];
            var edge = {
                sourceId: e.data.source,
                targetId: e.data.target,
                relationType: e.data.name,
                sourceEntityType: srcNode ? srcNode.entityType : null,
                targetEntityType: tgtNode ? tgtNode.entityType : null,
                properties: e.data.properties || [],
                fileId: fileId
            };
            parsed.edges.push(edge);
        }

        return parsed;
    }

    // ---- Index Building ----

    function rebuildIndexes() {
        _entityIndex = {};
        _relationIndex = {};
        _nodeMap = {};
        _fileCounts = {};
        _attrIndex = {};

        for (var fileId in _files) {
            var file = _files[fileId];
            _fileCounts[fileId] = file.nodes.length + file.edges.length;

            // Index nodes
            for (var i = 0; i < file.nodes.length; i++) {
                var node = file.nodes[i];
                _nodeMap[node.id] = node;

                var et = node.entityType;
                if (!_entityIndex[et]) _entityIndex[et] = {};
                if (!_entityIndex[et][fileId]) _entityIndex[et][fileId] = [];
                _entityIndex[et][fileId].push(node);

                // Index attribute values
                if (!_attrIndex[et]) _attrIndex[et] = {};
                var props = node.properties || [];
                for (var p = 0; p < props.length; p++) {
                    var prop = props[p];
                    if (prop.value === undefined || prop.value === null || prop.value === 'TODO') continue;
                    var pn = prop.name;
                    if (!_attrIndex[et][pn]) _attrIndex[et][pn] = {};
                    if (!_attrIndex[et][pn][fileId]) _attrIndex[et][pn][fileId] = [];
                    _attrIndex[et][pn][fileId].push(prop.value);
                }
            }

            // Index edges
            for (var j = 0; j < file.edges.length; j++) {
                var edge = file.edges[j];
                var rt = edge.relationType;
                var set = edge.sourceEntityType || '_unknown';
                var tet = edge.targetEntityType || '_unknown';

                if (!_relationIndex[rt]) _relationIndex[rt] = {};
                if (!_relationIndex[rt][set]) _relationIndex[rt][set] = {};
                if (!_relationIndex[rt][set][tet]) _relationIndex[rt][set][tet] = {};
                if (!_relationIndex[rt][set][tet][fileId]) _relationIndex[rt][set][tet][fileId] = [];
                _relationIndex[rt][set][tet][fileId].push(edge);
            }
        }
    }

    // ---- Public API ----

    return {
        addFile: function(fileId, rawData) {
            _files[fileId] = parseFile(fileId, rawData);
            rebuildIndexes();
        },

        removeFile: function(fileId) {
            delete _files[fileId];
            rebuildIndexes();
        },

        clear: function() {
            _files = {};
            _entityIndex = {};
            _relationIndex = {};
            _nodeMap = {};
            _fileCounts = {};
            _attrIndex = {};
        },

        // Count entity instances for a specific file and entity type
        getEntityCount: function(fileId, entityType) {
            var idx = _entityIndex[entityType];
            if (!idx || !idx[fileId]) return 0;
            return idx[fileId].length;
        },

        // Count entity instances across all files for a given entity type
        // Returns { fileId: count, ... }
        getEntityCountsByFile: function(entityType) {
            var idx = _entityIndex[entityType];
            var result = {};
            if (!idx) return result;
            for (var fileId in idx) {
                result[fileId] = idx[fileId].length;
            }
            return result;
        },

        // Count relationship instances for a specific file
        getRelationCount: function(fileId, relationType, sourceEntityType, targetEntityType) {
            var rt = _relationIndex[relationType];
            if (!rt) return 0;
            var st = rt[sourceEntityType];
            if (!st) return 0;
            var tt = st[targetEntityType];
            if (!tt) return 0;
            var arr = tt[fileId];
            return arr ? arr.length : 0;
        },

        // Count relation instances across all files for a given relation signature
        // Returns { fileId: count, ... }
        getRelationCountsByFile: function(relationType, sourceEntityType, targetEntityType) {
            var result = {};
            var rt = _relationIndex[relationType];
            if (!rt) return result;
            var st = rt[sourceEntityType];
            if (!st) return result;
            var tt = st[targetEntityType];
            if (!tt) return result;
            for (var fileId in tt) {
                result[fileId] = tt[fileId].length;
            }
            return result;
        },

        // Degree distribution for a relation in a specific file
        // Returns { source: { degree: count }, target: { degree: count } }
        getDegreeDistribution: function(fileId, relationType, sourceEntityType, targetEntityType) {
            var rt = _relationIndex[relationType];
            if (!rt) return null;
            var st = rt[sourceEntityType];
            if (!st) return null;
            var tt = st[targetEntityType];
            if (!tt) return null;
            var edges = tt[fileId];
            if (!edges || edges.length === 0) return null;

            var srcDeg = {};
            var tgtDeg = {};
            for (var i = 0; i < edges.length; i++) {
                var e = edges[i];
                srcDeg[e.sourceId] = (srcDeg[e.sourceId] || 0) + 1;
                tgtDeg[e.targetId] = (tgtDeg[e.targetId] || 0) + 1;
            }

            // Convert to degree -> count histogram
            var sourceDist = {};
            for (var id in srcDeg) {
                var d = srcDeg[id];
                sourceDist[d] = (sourceDist[d] || 0) + 1;
            }
            var targetDist = {};
            for (var id in tgtDeg) {
                var d = tgtDeg[id];
                targetDist[d] = (targetDist[d] || 0) + 1;
            }

            return { source: sourceDist, target: targetDist };
        },

        // Total instances (nodes + edges) for a file
        getFileInstanceCount: function(fileId) {
            return _fileCounts[fileId] || 0;
        },

        // Get nodes across multiple files, optionally filtered by entity type
        getNodes: function(fileIds, entityType) {
            var results = [];
            if (entityType) {
                var idx = _entityIndex[entityType];
                if (!idx) return results;
                for (var i = 0; i < fileIds.length; i++) {
                    var arr = idx[fileIds[i]];
                    if (arr) {
                        for (var j = 0; j < arr.length; j++) {
                            results.push(arr[j]);
                        }
                    }
                }
            } else {
                for (var i = 0; i < fileIds.length; i++) {
                    var file = _files[fileIds[i]];
                    if (file) {
                        for (var j = 0; j < file.nodes.length; j++) {
                            results.push(file.nodes[j]);
                        }
                    }
                }
            }
            return results;
        },

        // Get edges across multiple files, filtered by relation/source/target types
        getEdges: function(fileIds, relationType, sourceEntityType, targetEntityType) {
            var results = [];
            var rt = _relationIndex[relationType];
            if (!rt) return results;
            var st = rt[sourceEntityType];
            if (!st) return results;
            var tt = st[targetEntityType];
            if (!tt) return results;

            for (var i = 0; i < fileIds.length; i++) {
                var arr = tt[fileIds[i]];
                if (arr) {
                    for (var j = 0; j < arr.length; j++) {
                        results.push(arr[j]);
                    }
                }
            }
            return results;
        },

        // Get a node by ID (cross-file)
        getNode: function(nodeId) {
            return _nodeMap[nodeId] || null;
        },

        // Get all parsed data for a file (for advanced use)
        getFile: function(fileId) {
            return _files[fileId] || null;
        },

        // Get all attribute values for a given entity type + property across files
        // Returns { fileId: [value, value, ...], ... }
        getAttributeValuesByFile: function(entityType, propName) {
            var idx = _attrIndex[entityType];
            if (!idx) return {};
            var pi = idx[propName];
            if (!pi) return {};
            var result = {};
            for (var fileId in pi) {
                result[fileId] = pi[fileId].slice();
            }
            return result;
        },

        // Get attribute distribution as { value: count } map for a given file (enum/int)
        // or raw values array for numeric types
        getAttributeDistribution: function(entityType, propName, fileId) {
            var idx = _attrIndex[entityType];
            if (!idx || !idx[propName] || !idx[propName][fileId]) return {};
            var values = idx[propName][fileId];
            var dist = {};
            for (var i = 0; i < values.length; i++) {
                var v = values[i];
                dist[v] = (dist[v] || 0) + 1;
            }
            return dist;
        },

        // Get all raw numeric values for an attribute across specified files
        getAttributeNumericValues: function(entityType, propName, fileIds) {
            var idx = _attrIndex[entityType];
            if (!idx || !idx[propName]) return [];
            var result = [];
            for (var i = 0; i < fileIds.length; i++) {
                var arr = idx[propName][fileIds[i]];
                if (arr) {
                    for (var j = 0; j < arr.length; j++) {
                        var v = arr[j];
                        if (typeof v === 'number' && isFinite(v)) result.push(v);
                    }
                }
            }
            return result;
        },

        // Get numeric values for a single file
        getAttributeNumericValuesForFile: function(entityType, propName, fileId) {
            var idx = _attrIndex[entityType];
            if (!idx || !idx[propName] || !idx[propName][fileId]) return [];
            var arr = idx[propName][fileId];
            var result = [];
            for (var i = 0; i < arr.length; i++) {
                var v = arr[i];
                if (typeof v === 'number' && isFinite(v)) result.push(v);
            }
            return result;
        },
    };
})();
