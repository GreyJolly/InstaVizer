// ===========================
// MDS Worker
// ===========================
// Runs Classical MDS projection off the main thread for large file counts.
// The MDS math itself lives in the shared shared-utils/mds-core.js so this worker and
// the main-thread path in mds-chart.js use one identical implementation.
// importScripts is how a worker loads shared code without a bundler.
importScripts('../shared-utils/mds-core.js');

self.onmessage = function(e) {
    var data = e.data;
    var taskId = data.taskId;
    var payload = data.payload;

    try {
        if (payload.type === 'compute-mds') {
            computeMDS(taskId, payload.matrix, payload.fileIds, payload.n);
        } else {
            self.postMessage({
                taskId: taskId,
                type: 'error',
                message: 'Unknown task type: ' + (payload.type || 'undefined')
            });
        }
    } catch (err) {
        self.postMessage({
            taskId: taskId,
            type: 'error',
            message: err.message || 'Unknown computation error'
        });
    }
};

function computeMDS(taskId, matrix, fileIds, n) {
    self.postMessage({
        taskId: taskId,
        type: 'progress',
        progress: 0,
        message: 'Running MDS projection...'
    });

    // Closed-form small cases stay fast and skip the progress chatter.
    var coords;
    if (n > 2) {
        self.postMessage({
            taskId: taskId,
            type: 'progress',
            progress: 0.25,
            message: 'Computing projection...'
        });
    }

    var pairs = MDSCore.compute(matrix, n);

    coords = [];
    for (var i = 0; i < n; i++) {
        coords.push({ fileId: fileIds[i], x: pairs[i][0], y: pairs[i][1] });
    }

    self.postMessage({
        taskId: taskId,
        type: 'result',
        payload: coords
    });
}
