// ===========================
// Worker Pool Manager
// ===========================

var WorkerPool = (function() {
    var MAX_WORKERS = Math.max(2, (navigator.hardwareConcurrency || 4) - 1);
    var _workers = [];
    var _taskQueue = [];
    var _taskIdCounter = 0;
    var _activeTasks = {};

    function _getWorker(scriptPath) {
        for (var i = 0; i < _workers.length; i++) {
            if (!_workers[i].busy && _workers[i].script === scriptPath) {
                return _workers[i];
            }
        }

        if (_workers.length < MAX_WORKERS) {
            var worker = new Worker(scriptPath);
            var entry = { worker: worker, busy: false, script: scriptPath };
            _workers.push(entry);

            worker.onmessage = function(e) {
                _handleMessage(entry, e.data);
            };

            worker.onerror = function(err) {
                console.error('Worker error:', err);
                // Find the task this worker was handling
                for (var id in _activeTasks) {
                    if (_activeTasks[id].workerEntry === entry) {
                        if (!_activeTasks[id].cancelled) {
                            _activeTasks[id].reject(new Error('Worker error: ' + (err.message || 'Unknown')));
                        }
                        _cleanupTask(id, entry);
                        break;
                    }
                }
            };

            return entry;
        }

        return null;
    }

    function _handleMessage(workerEntry, data) {
        var taskId = data.taskId;
        var task = _activeTasks[taskId];

        if (!task) {
            // Task might have been cancelled, ignore
            return;
        }

        if (data.type === 'progress') {
            if (task.onProgress && !task.cancelled) {
                task.onProgress(data.progress, data.message);
            }
            return;
        }

        if (data.type === 'result') {
            if (!task.cancelled) {
                task.resolve(data.payload);
            }
            _cleanupTask(taskId, workerEntry);
            return;
        }

        if (data.type === 'error') {
            if (!task.cancelled) {
                task.reject(new Error(data.message || 'Worker error'));
            }
            _cleanupTask(taskId, workerEntry);
            return;
        }
    }

    function _cleanupTask(taskId, workerEntry) {
        delete _activeTasks[taskId];
        if (workerEntry) {
            workerEntry.busy = false;
        }
        _processQueue();
    }

    function _processQueue() {
        if (_taskQueue.length === 0) return;

        // Find first task that can run
        for (var i = 0; i < _taskQueue.length; i++) {
            var task = _taskQueue[i];
            var workerEntry = _getWorker(task.script);
            if (workerEntry) {
                _taskQueue.splice(i, 1);
                workerEntry.busy = true;

                var activeTask = {
                    resolve: task.resolve,
                  reject: task.reject,
                  onProgress: task.onProgress || null,
                  cancelled: false,
                  workerEntry: workerEntry,
                  script: task.script
                };
                _activeTasks[task.taskId] = activeTask;

                // Send: { taskId, type, payload }
                workerEntry.worker.postMessage({
                    taskId: task.taskId,
                    type: task.taskType,
                    payload: task.payload
                });
                return;
            }
        }
    }

    function submit(scriptPath, taskType, payload, onProgress) {
        return new Promise(function(resolve, reject) {
            var taskId = ++_taskIdCounter;

            _taskQueue.push({
                taskId: taskId,
                script: scriptPath,
                taskType: taskType,
                payload: payload,
                resolve: resolve,
                reject: reject,
                onProgress: onProgress || null
            });

            // Single dispatch path: _processQueue picks up any runnable task.
            _processQueue();
        });
    }

    function cancel(taskId) {
        var task = _activeTasks[taskId];
        if (task) {
            task.cancelled = true;
            if (task.workerEntry) {
                task.workerEntry.busy = false;
            }
            delete _activeTasks[taskId];
        }
        _taskQueue = _taskQueue.filter(function(t) { return t.taskId !== taskId; });
        _processQueue();
    }

    function cancelAll() {
        for (var id in _activeTasks) {
            _activeTasks[id].cancelled = true;
            if (_activeTasks[id].workerEntry) {
                _activeTasks[id].workerEntry.busy = false;
            }
        }
        _taskQueue = [];
        _activeTasks = {};
    }

    function terminateAll() {
        cancelAll();
        for (var i = 0; i < _workers.length; i++) {
            _workers[i].worker.terminate();
        }
        _workers = [];
    }

    function getActiveCount() {
        var count = 0;
        for (var id in _activeTasks) {
            if (!_activeTasks[id].cancelled) count++;
        }
        return count;
    }

    function getQueueLength() {
        return _taskQueue.length;
    }

    return {
        submit: submit,
        cancel: cancel,
        cancelAll: cancelAll,
        terminateAll: terminateAll,
        getActiveCount: getActiveCount,
        getQueueLength: getQueueLength,
        MAX_WORKERS: MAX_WORKERS
    };
})();
