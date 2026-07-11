// ===========================
// FileParseCore - JSON file parse + classify
// ===========================

// Classification: valid JSON with both `entities` and `relations` is a
// 'schema'; any other valid JSON is 'data'; unparseable text is 'invalid'
// (carrying the error message). Downstream code skips 'invalid' records.

// Assigned as a top level global to allow loading from both main thread and workers
var FileParseCore = (function() {

    // Parse + classify a single { name, size, content } file record.
    // Returns:
    //   { name, size, type:'schema'|'data', data }      on success
    //   { name, size, type:'invalid', error }           on parse failure
    function parseFile(fileData) {
        try {
            var json = JSON.parse(fileData.content);
            var type = (json.entities && json.relations) ? 'schema' : 'data';
            return {
                name: fileData.name,
                size: fileData.size,
                type: type,
                data: json
            };
        } catch (e) {
            return {
                name: fileData.name,
                size: fileData.size,
                type: 'invalid',
                error: e.message
            };
        }
    }

    // Parse + classify an array of file records
    function parseFiles(files, onProgress) {
        var results = [];
        var total = files.length;
        for (var i = 0; i < total; i++) {
            results.push(parseFile(files[i]));
            if (onProgress) onProgress(i + 1, total);
        }
        return results;
    }

    return {
        parseFile: parseFile,
        parseFiles: parseFiles
    };
})();
