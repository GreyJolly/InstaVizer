// ===========================
// File Parser Worker
// ===========================
// Parses JSON files off the main thread for large/numerous file sets. The
// parse + classify logic itself lives in the shared utils/file-parse-core.js
// so this worker and the main-thread path in file-handler.js use one identical
// implementation. importScripts is how a worker loads shared code without a
// bundler.
importScripts('../files/file-parse-core.js');

self.onmessage = function(e) {
    var data = e.data;
    var taskId = data.taskId;
    var taskType = data.type;      // 'parse' from submit()
    var payload = data.payload;    // { files: [...] } from file-handler

    try {
        if (payload.type === 'parse-multiple') {
            parseMultipleFiles(taskId, payload.files);
        } else if (payload.type === 'parse-single') {
            parseSingleFile(taskId, payload.file);
        } else if (taskType === 'parse') {
            // Direct file array: the payload IS the files array
            parseMultipleFiles(taskId, payload.files || payload);
        } else {
            self.postMessage({
                taskId: taskId,
                type: 'error',
                message: 'Unknown parse task type: ' + taskType + ', payload.type: ' + (payload && payload.type)
            });
        }
    } catch (err) {
        self.postMessage({
            taskId: taskId,
            type: 'error',
            message: err.message || 'Unknown parsing error'
        });
    }
};

function parseSingleFile(taskId, fileData) {
    var result = FileParseCore.parseFile(fileData);
    self.postMessage({
        taskId: taskId,
        type: 'result',
        payload: [result]  // Return as array for consistency
    });
}

function parseMultipleFiles(taskId, files) {
    var total = files.length;
    // Preserve the original progress cadence: post roughly every 5% (total/20),
    // and always on the final file.
    var step = Math.max(1, Math.floor(total / 20));

    var results = FileParseCore.parseFiles(files, function(done, t) {
        var i = done - 1;
        if (t > 1 && (i % step === 0 || done === t)) {
            self.postMessage({
                taskId: taskId,
                type: 'progress',
                progress: done / t,
                message: 'Parsed ' + done + ' of ' + t + ' files'
            });
        }
    });

    self.postMessage({
        taskId: taskId,
        type: 'result',
        payload: results
    });
}
