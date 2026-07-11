// ===========================
// Loading Manager
// ===========================
// Centralized loading overlay management with support for spinners and progress bars.

var LoadingManager = (function() {
    var overlays = {};
    var delayTimers = {};
    var DEFAULT_DELAY = 150;

    function getOrCreateOverlay(container) {
        var containerEl;
        var key;

        if (typeof container === 'string') {
            containerEl = document.querySelector(container);
            key = container;
        } else if (container && container.getAttribute) {
            containerEl = container;
            key = containerEl.getAttribute('data-loading-key');
            if (!key) {
                key = 'loading-' + Math.random().toString(36).substr(2, 9);
                containerEl.setAttribute('data-loading-key', key);
            }
        } else {
            return null;
        }

        if (!containerEl || !document.body.contains(containerEl)) {
            // Container doesn't exist or was removed from DOM
            return null;
        }

        // Ensure container has position context
        var computedStyle = window.getComputedStyle(containerEl);
        if (computedStyle.position === 'static') {
            containerEl.style.position = 'relative';
        }

        // Check if overlay still exists and is attached to the container
        var existing = overlays[key];
        if (existing && existing.element && document.body.contains(existing.element)) {
            // Verify it's still a child of the container
            if (existing.element.parentElement !== containerEl) {
                containerEl.appendChild(existing.element);
            }
            return existing;
        }

        // Create new overlay
        var overlay = document.createElement('div');
        overlay.className = 'loading-overlay';
        overlay.setAttribute('data-loading-key', key);
        overlay.innerHTML =
        '<div class="loading-content">' +
        '<div class="loading-spinner-container">' +
        '<div class="spinner"></div>' +
        '</div>' +
        '<div class="loading-progress-container" style="display:none;">' +
        '<div class="loading-progress-bar-bg">' +
        '<div class="loading-progress-bar-fill"></div>' +
        '</div>' +
        '<span class="loading-progress-text">0%</span>' +
        '</div>' +
        '<span class="loading-text">Loading…</span>' +
        '</div>';

        containerEl.appendChild(overlay);

        var overlayData = {
            element: overlay,
            container: containerEl,
            key: key,
            mode: 'spinner',
            visible: false,
            progress: null,
            showSpinner: undefined
        };

        overlays[key] = overlayData;
        return overlayData;
    }

    function getExistingOverlay(container) {
        var key;
        if (typeof container === 'string') {
            key = container;
        } else if (container && container.getAttribute) {
            key = container.getAttribute('data-loading-key');
        } else {
            return null;
        }

        if (!key) return null;

        var existing = overlays[key];
        if (existing && existing.element && document.body.contains(existing.element)) {
            return existing;
        }

        // Overlay was removed from DOM, clean up
        delete overlays[key];
        return null;
    }

    function show(container, options) {
        var opts = options || {};
        var mode = opts.mode || 'spinner';
        var message = opts.message || 'Loading…';
        var delay = opts.delay !== undefined ? opts.delay : DEFAULT_DELAY;
        var progress = opts.progress !== undefined ? opts.progress : null;

        // Clear any existing delay timer for this container
        var key;
        if (typeof container === 'string') {
            key = container;
        } else if (container && container.getAttribute) {
            key = container.getAttribute('data-loading-key');
        }

        if (key && delayTimers[key]) {
            clearTimeout(delayTimers[key]);
            delete delayTimers[key];
        }

        // Create or get overlay
        var overlayData = getOrCreateOverlay(container);
        if (!overlayData) {
            // Container not in DOM yet, retry after a short delay
            if (delay >= 0) {
                var retryKey = key || (typeof container === 'string' ? container : 'unknown');
                delayTimers[retryKey] = setTimeout(function() {
                    delete delayTimers[retryKey];
                    show(container, Object.assign({}, opts, { delay: 0 }));
                }, 50);
                return { update: function() {}, hide: function() {} };
            }
            return { update: function() {}, hide: function() {} };
        }

        // Update overlay content
        if (opts.showSpinner !== undefined) overlayData.showSpinner = opts.showSpinner;
        updateOverlayContent(overlayData, mode, message, progress);

        // Show with delay
        if (delay > 0) {
            var showKey = overlayData.key;
            delayTimers[showKey] = setTimeout(function() {
                delete delayTimers[showKey];
                if (overlayData.element && document.body.contains(overlayData.element)) {
                    overlayData.element.classList.add('visible');
                    overlayData.visible = true;
                }
            }, delay);
        } else {
            overlayData.element.classList.add('visible');
            overlayData.visible = true;
        }

        return {
            update: function(updateOpts) {
                update(container, updateOpts);
            },
            hide: function() {
                hide(container);
            }
        };
    }

    function update(container, options) {
        var overlayData = getExistingOverlay(container);
        if (!overlayData) {
            // Try to create it if it doesn't exist
            overlayData = getOrCreateOverlay(container);
        }
        if (!overlayData) return;

        var opts = options || {};
        if (opts.showSpinner !== undefined) overlayData.showSpinner = opts.showSpinner;
        updateOverlayContent(
            overlayData,
            opts.mode || overlayData.mode,
            opts.message || null,
            opts.progress !== undefined ? opts.progress : overlayData.progress
        );

        // Ensure visible
        if (!overlayData.visible) {
            overlayData.element.classList.add('visible');
            overlayData.visible = true;
        }
    }

    function hide(container) {
        var overlayData = getExistingOverlay(container);
        if (!overlayData) return;

        // Clear any pending show timer
        if (delayTimers[overlayData.key]) {
            clearTimeout(delayTimers[overlayData.key]);
            delete delayTimers[overlayData.key];
        }

        overlayData.element.classList.remove('visible');
        overlayData.visible = false;
        overlayData.progress = null;
    }

    function updateOverlayContent(overlayData, mode, message, progress) {
        if (!overlayData || !overlayData.element) return;

        overlayData.mode = mode;

        var spinnerContainer = overlayData.element.querySelector('.loading-spinner-container');
        var progressContainer = overlayData.element.querySelector('.loading-progress-container');
        var messageEl = overlayData.element.querySelector('.loading-text');

        if (!spinnerContainer || !progressContainer || !messageEl) return;

        var showBar = (mode === 'bar');
        var showSpinner = (overlayData.showSpinner !== undefined)
            ? overlayData.showSpinner
            : true; // spinner present by default

        spinnerContainer.style.display = showSpinner ? 'flex' : 'none';
        progressContainer.style.display = showBar ? 'flex' : 'none';

        if (showBar) {
            if (progress !== null && progress !== undefined) {
                overlayData.progress = progress;
                var percentage = Math.round(Math.max(0, Math.min(1, progress)) * 100);
                var fillEl = progressContainer.querySelector('.loading-progress-bar-fill');
                var textEl = progressContainer.querySelector('.loading-progress-text');

                if (fillEl) fillEl.style.width = percentage + '%';
                if (textEl) textEl.textContent = percentage + '%';
            }
        } else {
            overlayData.progress = null;
        }

        if (message) {
            messageEl.textContent = message;
        }
    }

    function destroy(container) {
        var overlayData = getExistingOverlay(container);
        if (!overlayData) return;

        if (delayTimers[overlayData.key]) {
            clearTimeout(delayTimers[overlayData.key]);
            delete delayTimers[overlayData.key];
        }

        if (overlayData.element && overlayData.element.parentNode) {
            overlayData.element.parentNode.removeChild(overlayData.element);
        }

        delete overlays[overlayData.key];

        if (overlayData.container && overlayData.container.removeAttribute) {
            overlayData.container.removeAttribute('data-loading-key');
        }
    }

    function destroyAll() {
        var keys = Object.keys(overlays);
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var overlayData = overlays[key];
            if (delayTimers[key]) {
                clearTimeout(delayTimers[key]);
                delete delayTimers[key];
            }
            if (overlayData.element && overlayData.element.parentNode) {
                overlayData.element.parentNode.removeChild(overlayData.element);
            }
            if (overlayData.container && overlayData.container.removeAttribute) {
                overlayData.container.removeAttribute('data-loading-key');
            }
        }
        overlays = {};
        delayTimers = {};
    }

    return {
        show: show,
        update: update,
        hide: hide,
        destroy: destroy,
        destroyAll: destroyAll
    };
})();
