// ===========================================================================
// SchemaStore — owns the loaded ER schema definition and its file metadata
// ===========================================================================

var SchemaStore = (function() {
    var _schema = null;     // parsed schema definition (entities, relations)
    var _file = null;       // { name, size, data } of the loaded schema file

    // ---- Ownership / lifecycle ----
    function setSchema(file) {
        if (file && file.data) {
            _file = { name: file.name, size: file.size, data: file.data };
            _schema = file.data;
        } else {
            _file = null;
            _schema = null;
        }
    }

    function clear() {
        _schema = null;
        _file = null;
    }

    // ---- Accessors ----
    function getSchema() { return _schema; }
    function isLoaded() { return !!_schema; }
    function getFile() { return _file; }
    function getFileName() { return _file ? _file.name : null; }
    function getEntities() { return (_schema && _schema.entities) || null; }
    function getEntity(entityName) {
        return (_schema && _schema.entities && _schema.entities[entityName]) || null;
    }
    function getEntityCount() {
        return (_schema && _schema.entities) ? Object.keys(_schema.entities).length : 0;
    }

    // ---- Schema queries ----
    function getRelationsFromEntity(entityName) {
        if (!_schema || !_schema.relations) return [];
        var relations = [];
        var entityRelations = _schema.relations[entityName];
        if (entityRelations) {
            for (var relationType in entityRelations) {
                var targets = entityRelations[relationType];
                for (var targetEntity in targets) {
                    relations.push({ relation: relationType, sourceEntity: entityName, targetEntity: targetEntity });
                }
            }
        }
        return relations;
    }

    function getAllRelationsForEntity(entityName) {
        if (!_schema || !_schema.relations) return [];
        var relations = [];
        var seen = {};
        for (var srcEntity in _schema.relations) {
            var rels = _schema.relations[srcEntity];
            for (var relationType in rels) {
                var targets = rels[relationType];
                for (var tgtEntity in targets) {
                    if (srcEntity === entityName || tgtEntity === entityName) {
                        var key = relationType + ':' + srcEntity + ':' + tgtEntity;
                        if (!seen[key]) {
                            seen[key] = true;
                            var otherEntity = srcEntity === entityName ? tgtEntity : srcEntity;
                            relations.push({
                                relation: relationType,
                                sourceEntity: srcEntity,
                                targetEntity: tgtEntity,
                                otherEntity: otherEntity
                            });
                        }
                    }
                }
            }
        }
        return relations;
    }

    function getPlottableAttributes(entityName) {
        var def = getEntity(entityName);
        if (!def) return [];
        var props = def.properties || [];
        return props.filter(function(p) {
            return isCategorical(p) || p.dtype === 'int' || p.dtype === 'float';
        });
    }

    // ---- Categorical attributes (enum + bool) ----
    // Bool attributes reuse the enum code paths. Their values are keyed as the
    // strings 'true'/'false' so they work as labels, object keys and Set
    // members; instance data keeps the raw booleans.
    var BOOL_VALUES = ['true', 'false'];

    function isCategorical(prop) {
        return !!prop && (prop.dtype === 'enum' || prop.dtype === 'bool');
    }

    function getCategoryValues(prop) {
        if (!prop) return [];
        if (prop.dtype === 'bool') return BOOL_VALUES.slice();
        return (prop.values || []).slice();
    }

    // Raw instance value -> the key used in getCategoryValues()
    function categoryKey(value) {
        return typeof value === 'boolean' ? String(value) : value;
    }

    function getNumericAttributes(entityName) {
        var def = getEntity(entityName);
        if (!def) return [];
        var props = def.properties || [];
        return props.filter(function(p) {
            return p.dtype === 'int' || p.dtype === 'float';
        });
    }

    return {
        setSchema: setSchema,
        clear: clear,
        getSchema: getSchema,
        isLoaded: isLoaded,
        getFile: getFile,
        getFileName: getFileName,
        getEntities: getEntities,
        getEntity: getEntity,
        getEntityCount: getEntityCount,
        getRelationsFromEntity: getRelationsFromEntity,
        getAllRelationsForEntity: getAllRelationsForEntity,
        getPlottableAttributes: getPlottableAttributes,
        getNumericAttributes: getNumericAttributes,
        isCategorical: isCategorical,
        getCategoryValues: getCategoryValues,
        categoryKey: categoryKey
    };
})();
