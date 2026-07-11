// ===========================
// Layout Handlers
// ===========================
function _getLayoutKey() {
    return 'er-layout:' + (SchemaStore.getFileName() || '_none');
}

function saveNodePositions() {
    var positions = {};
    nodes.forEach(function(n) {
        var key = n.type === 'relationship'
            ? 'r:' + n.name + ':' + n.sourceEntity + ':' + n.targetEntity
            : 'e:' + n.name;
        positions[key] = { x: n.x, y: n.y };
    });
    try {
        localStorage.setItem(_getLayoutKey(), JSON.stringify(positions));
    } catch (e) { /* quota exceeded or unavailable */ }
}

function loadNodePositions() {
    try {
        var raw = localStorage.getItem(_getLayoutKey());
        return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
}

function clearSavedLayout() {
    try {
        localStorage.removeItem(_getLayoutKey());
    } catch (e) { /* ignore */ }
    if (nodes.length > 0) {
        renderDiagram();
    }
}

function layoutNodes(nodes, links, width, height) {
    var saved = loadNodePositions();
    var usedSaved = false;

    if (saved) {
        var allFound = true;
        nodes.forEach(function(n) {
            var key = n.type === 'relationship'
                ? 'r:' + n.name + ':' + n.sourceEntity + ':' + n.targetEntity
                : 'e:' + n.name;
            if (saved[key]) {
                n.x = saved[key].x;
                n.y = saved[key].y;
            } else {
                allFound = false;
            }
        });
        if (allFound) usedSaved = true;
    }

    if (!usedSaved) {
        const entities = nodes.filter(n => n.type === 'entity');
        const rels = nodes.filter(n => n.type === 'relationship');
        const count = entities.length;
        const radius = Math.min(width, height) * 0.9;
        const cx = width / 1.5, cy = height / 2;

        entities.forEach((e, i) => {
            const angle = (2 * Math.PI * i) / count - Math.PI / 2;
            e.x = cx + radius * Math.cos(angle);
            e.y = cy + radius * Math.sin(angle);
        });

        rels.forEach(r => {
            const src = nodes.find(n => n.name === r.sourceEntity && n.type === 'entity');
            const tgt = nodes.find(n => n.name === r.targetEntity && n.type === 'entity');
            if (src && tgt) {
                if (r.isSelfReferencing) {
                    const dx = src.x - cx, dy = src.y - cy;
                    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                    r.x = src.x + (dx / dist) * 150;
                    r.y = src.y + (dy / dist) * 150;
                } else {
                    r.x = (src.x + tgt.x) / 2;
                    r.y = (src.y + tgt.y) / 2;
                }
            } else {
                r.x = cx;
                r.y = cy;
            }
        });
    }
}

function nudgeOverlaps(nodes, iterations = 100) {
    const padding = 30;
    for (let iter = 0; iter < iterations; iter++) {
        let moved = false;
        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                const a = nodes[i];
                const b = nodes[j];
                const aw = a.type === 'entity' ? (a.width || 100) / 2 + padding : (a.size || 40) / 2 + padding;
                const ah = a.type === 'entity' ? (a.height || 40) / 2 + padding : (a.size || 40) / 3 + padding;
                const bw = b.type === 'entity' ? (b.width || 100) / 2 + padding : (b.size || 40) / 2 + padding;
                const bh = b.type === 'entity' ? (b.height || 40) / 2 + padding : (b.size || 40) / 3 + padding;

                let dx = b.x - a.x;
                let dy = b.y - a.y;

                // If exactly overlapping, jitter randomly to break tie
                if (dx === 0 && dy === 0) {
                    dx = (Math.random() - 0.5) * 2;
                    dy = (Math.random() - 0.5) * 2;
                    b.x += dx;
                    b.y += dy;
                }

                const overlapX = (aw + bw) - Math.abs(dx);
                const overlapY = (ah + bh) - Math.abs(dy);

                if (overlapX > 0 && overlapY > 0) {
                    moved = true;
                    if (overlapX < overlapY) {
                        const shift = overlapX / 2 + 1;
                        const sign = dx >= 0 ? 1 : -1;
                        a.x -= sign * shift;
                        b.x += sign * shift;
                    } else {
                        const shift = overlapY / 2 + 1;
                        const sign = dy >= 0 ? 1 : -1;
                        a.y -= sign * shift;
                        b.y += sign * shift;
                    }
                }
            }
        }
        if (!moved) break;
    }
}
