// ===========================
// Progress Tracker
// ===========================
// Tracks phased progress with weights for accurate percentage calculation

function ProgressTracker(phases) {
    this.phases = phases || [];
    this.currentPhaseIndex = -1;
    this.currentPhaseName = null;
    this.phaseProgress = 0; // 0-1 within current phase
    this.listeners = [];
}

ProgressTracker.prototype.setPhases = function(phases) {
    this.phases = phases;
    this.reset();
};

ProgressTracker.prototype.reset = function() {
    this.currentPhaseIndex = -1;
    this.currentPhaseName = null;
    this.phaseProgress = 0;
};

ProgressTracker.prototype.startPhase = function(phaseName) {
    // Find phase index
    var index = -1;
    for (var i = 0; i < this.phases.length; i++) {
        if (this.phases[i].name === phaseName) {
            index = i;
            break;
        }
    }
    
    if (index === -1) {
        console.warn('Phase not found: ' + phaseName);
        return;
    }
    
    this.currentPhaseIndex = index;
    this.currentPhaseName = phaseName;
    this.phaseProgress = 0;
    this._notify();
};

ProgressTracker.prototype.setPhaseProgress = function(progress) {
    this.phaseProgress = Math.max(0, Math.min(1, progress));
    this._notify();
};

ProgressTracker.prototype.getOverallProgress = function() {
    if (this.phases.length === 0) return 0;
    
    var totalWeight = 0;
    var completedWeight = 0;
    
    for (var i = 0; i < this.phases.length; i++) {
        var phase = this.phases[i];
        var weight = phase.weight || 1;
        totalWeight += weight;
        
        if (i < this.currentPhaseIndex) {
            // Phase fully complete
            completedWeight += weight;
        } else if (i === this.currentPhaseIndex) {
            // Current phase partially complete
            completedWeight += weight * this.phaseProgress;
        }
        // Future phases contribute 0
    }
    
    return totalWeight > 0 ? completedWeight / totalWeight : 0;
};

ProgressTracker.prototype.getCurrentPhaseLabel = function() {
    if (this.currentPhaseIndex >= 0 && this.currentPhaseIndex < this.phases.length) {
        return this.phases[this.currentPhaseIndex].label || this.currentPhaseName;
    }
    return '';
};

ProgressTracker.prototype.onProgress = function(callback) {
    this.listeners.push(callback);
};

ProgressTracker.prototype._notify = function() {
    var progress = this.getOverallProgress();
    var label = this.getCurrentPhaseLabel();
    for (var i = 0; i < this.listeners.length; i++) {
        this.listeners[i](progress, label);
    }
};
