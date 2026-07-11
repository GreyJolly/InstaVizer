// ===========================
// Drop Zone & File Handling
// ===========================
function initDropZone() {
    var dropZone = document.getElementById('drop-zone');
    var fileInput = document.getElementById('file-input');

    dropZone.addEventListener('click', function() { fileInput.click(); });

    fileInput.addEventListener('change', function(e) {
        handleFiles(e.target.files);
        fileInput.value = '';
    });

    dropZone.addEventListener('dragover', function(e) {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', function() {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', function(e) {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        handleFiles(e.dataTransfer.files);
    });
}

async function handleFiles(files) {
    if (!files || files.length === 0) return;
    
    var container = document.querySelector('.canvas-container');
    var totalFiles = files.length;
    var duplicateNames = [];
    
    // Decide: use worker for 3+ files or any file > 500KB
    var useWorker = totalFiles >= 3;
    if (!useWorker) {
        for (var i = 0; i < files.length; i++) {
            if (files[i].size > 500 * 1024) {
                useWorker = true;
                break;
            }
        }
    }
    
    // Create progress tracker
    var tracker = new ProgressTracker([
        { name: 'reading', label: 'Reading files…', weight: 2 },
        { name: 'parsing', label: 'Parsing files…', weight: 4 },
        { name: 'storing', label: 'Processing…', weight: 1 }
    ]);
    
    var loader = LoadingManager.show(container, {
        mode: (totalFiles > 1 || useWorker) ? 'bar' : 'spinner',
        message: 'Loading ' + totalFiles + ' file' + (totalFiles > 1 ? 's' : '') + '…',
        delay: 150,
        progress: (totalFiles > 1 || useWorker) ? 0 : null
    });
    
    try {
        // Phase 1: Read all files into memory
        tracker.startPhase('reading');
        
        var fileContents = [];
        for (var i = 0; i < files.length; i++) {
            var file = files[i];
            
            if (totalFiles > 1) {
                tracker.setPhaseProgress((i + 0.5) / totalFiles);
                loader.update({
                    progress: tracker.getOverallProgress(),
                    message: 'Reading ' + file.name + '…'
                });
            }
            
            var content = await readFile(file);
            fileContents.push({ name: file.name, size: file.size, content: content });
            
            if (totalFiles > 1) {
                tracker.setPhaseProgress((i + 1) / totalFiles);
                loader.update({
                    progress: tracker.getOverallProgress()
                });
            }
        }
        
        // Phase 2: Parse files (in worker or main thread)
        tracker.startPhase('parsing');
        
        var parsedFiles;
        
        if (useWorker) {
            // Use worker for parsing
            tracker.setPhaseProgress(0.1);
            loader.update({
                progress: tracker.getOverallProgress(),
                          message: 'Parsing files…'
            });

            // The payload structure: WorkerPool.submit(script, taskType, payload, onProgress)
            // Worker receives: { taskId, type: taskType, payload: payload }
            // So payload is { type: 'parse-multiple', files: fileContents }
            parsedFiles = await WorkerPool.submit(
                'src/workers/file-parser.worker.js',
                'parse',
                {
                    type: 'parse-multiple',
                    files: fileContents
                },
                function(progress, message) {
                    // Worker sends progress as (progress, message)
                    tracker.setPhaseProgress(0.1 + progress * 0.8);
                    loader.update({
                        progress: tracker.getOverallProgress(),
                                  message: message || 'Parsing files…'
                    });
                }
            );
        } else {
            // Parse on main thread (fewer/smaller files)
            parsedFiles = [];
            for (var i = 0; i < fileContents.length; i++) {
                var item = fileContents[i];
                
                if (totalFiles > 1) {
                    tracker.setPhaseProgress((i + 0.5) / totalFiles);
                    loader.update({
                        progress: tracker.getOverallProgress(),
                        message: 'Parsing ' + item.name + '…'
                    });
                }
                
                // Shared parse + classify (files/file-parse-core.js) — same
                // implementation the worker uses. 'invalid' records are skipped
                // by the storing loop below.
                parsedFiles.push(FileParseCore.parseFile(item));
                
                if (totalFiles > 1) {
                    tracker.setPhaseProgress((i + 1) / totalFiles);
                    loader.update({
                        progress: tracker.getOverallProgress()
                    });
                }
            }
        }
        
        // Phase 3: Store results
        tracker.startPhase('storing');
        
        var schemaCount = parsedFiles.filter(function(p) { return p.type === 'schema'; }).length;
        var dataCount = parsedFiles.filter(function(p) { return p.type === 'data'; }).length;
        var totalToProcess = schemaCount + dataCount;
        var processedCount = 0;
        
        for (var i = 0; i < parsedFiles.length; i++) {
            var parsed = parsedFiles[i];
            
            if (parsed.type === 'invalid') continue;
            
            loader.update({
                progress: tracker.getOverallProgress(),
                message: 'Storing ' + parsed.name + '…'
            });
            
            if (parsed.type === 'schema') {
                var loadedSchema = SchemaStore.getFile();
                if (loadedSchema && loadedSchema.name === parsed.name && loadedSchema.size === parsed.size) {
                    duplicateNames.push(parsed.name);
                } else {
                    SchemaStore.setSchema({ name: parsed.name, size: parsed.size, data: parsed.data });
                    renderSchemaFile();
                }
                processedCount++;
            } else {
                var alreadyLoaded = FileRegistry.all().some(function(f) {
                    return f.name === parsed.name && f.size === parsed.size;
                });
                if (alreadyLoaded) {
                    duplicateNames.push(parsed.name);
                } else {
                    addDataFile(parsed.name, parsed.size, parsed.data);
                }
                processedCount++;
            }
            
            tracker.setPhaseProgress(processedCount / Math.max(1, totalToProcess));
            loader.update({
                progress: tracker.getOverallProgress()
            });
        }
        
        // Show a single toast for all duplicates
        if (duplicateNames.length > 0) {
            if (duplicateNames.length === 1) {
                showToast('<span class="toast-filename">' + duplicateNames[0] + '</span> is already loaded', 'warning');
            } else {
                showToast('<span class="toast-filename">' + duplicateNames.length + ' files</span> were already loaded', 'warning');
            }
        }
        
        updateFileCount();
        updateGenerateButton();
        
    } catch (err) {
        console.error('File handling error:', err);
        showToast('Error loading files: ' + (err.message || 'Unknown error'), 'warning');
    } finally {
        loader.hide();
    }
}

function addDataFile(name, size, data) {
    // FileRegistry handles the duplicate check, id, and color.
    var file = FileRegistry.add(name, size);
    if (!file) return; // duplicate (same name and size)

    DataStore.addFile(file.id, data);
    renderFileList();
}

function toggleFile(fileId) {
    var file = FileRegistry.byId(fileId);
    if (file) {
        FileRegistry.toggleEnabled(fileId);
        renderFileList();
        
        if (ModalState.item) {
            if (file.enabled) {
                ModalState.selectedFiles.add(file.id);
            } else {
                ModalState.selectedFiles.delete(file.id);
            }
            renderModalFileList();
            updateChart();
        }
        
        if (nodes.length > 0) {
            renderDiagram();
        }
    }
}

function removeDataFile(fileId) {
    FileGroups.onFileRemoved(parseFloat(fileId));
    FileRegistry.remove(parseFloat(fileId));
    DataStore.removeFile(parseFloat(fileId));
    
    if (ModalState.item) {
        ModalState.selectedFiles.delete(parseFloat(fileId));
        renderFileList();
        updateChart();
    }
    
    renderFileList();
    updateFileCount();
    updateGenerateButton();
    
    if (nodes.length > 0) {
        renderDiagram();
    }
}

function removeSchemaFile() {
    SchemaStore.clear();
    nodes = [];
    links = [];
    
    renderSchemaFile();
    updateFileCount();
    updateGenerateButton();
    
    if (ModalState.item) {
        closeModal();
    }
    
    initSVG();
    document.getElementById('empty-state').classList.remove('hidden');
}

function showToast(message, type) {
    var container = document.getElementById('toast-container');
    var toast = document.createElement('div');
    toast.className = 'toast' + (type ? ' toast-' + type : '');
    
    var iconSvg = '';
    if (type === 'warning') {
        iconSvg = '<svg class="toast-icon" viewBox="0 0 20 20" fill="none">' +
            '<path d="M10 2L1 18h18L10 2z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>' +
            '<path d="M10 8v4M10 14v1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' +
            '</svg>';
    }
    
    toast.innerHTML = iconSvg + '<span class="toast-message">' + message + '</span>';
    container.appendChild(toast);
    
    setTimeout(function() {
        toast.classList.add('toast-out');
        setTimeout(function() {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 300);
    }, 3000);
}

function initButtons() {
    document.getElementById('generate-btn').addEventListener('click', renderDiagram);
    document.getElementById('clear-btn').addEventListener('click', clearAll);
    document.getElementById('scatter-btn').addEventListener('click', function() {
        ScatterplotScreen.open();
    });
}

function clearAll() {
    FileGroups.onClearAll();
    SchemaStore.clear();
    FileRegistry.clear();
    nodes = [];
    links = [];
    DataStore.clear();
    WorkerPool.cancelAll();
    
    renderSchemaFile();
    renderFileList();
    updateFileCount();
    updateGenerateButton();
    
    initSVG();
    document.getElementById('empty-state').classList.remove('hidden');
}
