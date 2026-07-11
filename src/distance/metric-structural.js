// ===========================
// StructuralMetric — ER structural distance
// ===========================
// Distance based on the largest common sub-structure between two files, found
// by matching connected components and the relations within them (exact
// backtracking, or randomized approximate sampling for large inputs).

class StructuralMetric extends DistanceMetric {

    // Largest number of matchings to enumerate (exact path safety bound).
    static get MAX_MATCHINGS() { return 1000000; }

    // ---- Weighting (constant) ----

    // 1 for a relation-key pair, 0 otherwise.
    _pairWeight(key) {
        return (typeof key === 'string' && key.indexOf('rel:') === 0) ? 1 : 0;
    }

    // Total weight of a file's universe = relation (edge) count.
    _universeWeight(fileData) {
        return fileData.edges.length;
    }

    // ---- Constraint propagation ----

    _propagate(phi, psi, assignments) {
        var newPhi = Object.assign({}, phi);
        var newPsi = Object.assign({}, psi);
        for (var k = 0; k < assignments.length; k++) {
            var u = assignments[k][0];
            var v = assignments[k][1];
            if (newPhi[u] !== undefined) {
                if (newPhi[u] !== v) return { phi: null, psi: null, ok: false };
            } else if (newPsi[v] !== undefined) {
                if (newPsi[v] !== u) return { phi: null, psi: null, ok: false };
            } else {
                newPhi[u] = v;
                newPsi[v] = u;
            }
        }
        return { phi: newPhi, psi: newPsi, ok: true };
    }

    // ---- Free entity extension (exact) ----

    _extendFreeEntities(phi, psi, comp1, comp2) {
        var free1 = [];
        for (var i = 0; i < comp1.entities.length; i++) {
            if (phi[comp1.entities[i].id] === undefined) free1.push(comp1.entities[i]);
        }
        var free2 = [];
        for (var j = 0; j < comp2.entities.length; j++) {
            if (psi[comp2.entities[j].id] === undefined) free2.push(comp2.entities[j]);
        }
        return this._enumPartialBijections(free1, free2, 0, phi, psi);
    }

    _enumPartialBijections(free1, free2, j, phi, psi) {
        if (j >= free1.length) {
            var pairs = [];
            for (var k in phi) pairs.push([k, phi[k]]);
            return [pairs];
        }
        var a = free1[j];
        var results = [];

        // Option A: leave a unmatched
        var sub = this._enumPartialBijections(free1, free2, j + 1, phi, psi);
        for (var s = 0; s < sub.length; s++) results.push(sub[s]);

        // Option B: match a to a compatible free entity
        for (var k = 0; k < free2.length; k++) {
            var c = free2[k];
            if (c.entityType !== a.entityType) continue;
            if (psi[c.id] !== undefined) continue;
            phi[a.id] = c.id;
            psi[c.id] = a.id;
            var sub2 = this._enumPartialBijections(free1, free2, j + 1, phi, psi);
            for (var s = 0; s < sub2.length; s++) results.push(sub2[s]);
            delete phi[a.id];
            delete psi[c.id];
        }
        return results;
    }

    // ---- Component-level backtracking (exact) ----

    _matchComponents(comp1, comp2) {
        return this._backtrack(comp1.relations, 0, {}, {}, comp1, comp2);
    }

    _backtrack(rels, i, phi, psi, comp1, comp2) {
        if (i >= rels.length) {
            return this._extendFreeEntities(phi, psi, comp1, comp2);
        }

        var r1 = rels[i];
        var r1Key = 'rel:' + r1.sourceId + '-' + r1.targetId + '-' + r1.relationType;
        var results = [];

        // Option A: leave r1 unmatched
        var sub = this._backtrack(rels, i + 1, phi, psi, comp1, comp2);
        for (var s = 0; s < sub.length; s++) results.push(sub[s]);

        // Option B: match r1 to some r2 in comp2
        var rels2 = comp2.relations;
        for (var k = 0; k < rels2.length; k++) {
            var r2 = rels2[k];
            if (r2.relationType !== r1.relationType) continue;
            var r2Key = 'rel:' + r2.sourceId + '-' + r2.targetId + '-' + r2.relationType;
            if (psi[r2Key] !== undefined) continue;

            // Orientations: natural and swapped (only if types allow)
            var orientations = [
                [[r1.sourceId, r2.sourceId], [r1.targetId, r2.targetId]],
            ];
            if (r1.sourceEntityType === r1.targetEntityType ||
                (r1.sourceEntityType === r2.targetEntityType && r1.targetEntityType === r2.sourceEntityType)) {
                orientations.push([[r1.sourceId, r2.targetId], [r1.targetId, r2.sourceId]]);
            }

            for (var o = 0; o < orientations.length; o++) {
                var assignments = [[r1Key, r2Key]].concat(orientations[o]);
                var p = this._propagate(phi, psi, assignments);
                if (p.ok) {
                    var sub2 = this._backtrack(rels, i + 1, p.phi, p.psi, comp1, comp2);
                    for (var s = 0; s < sub2.length; s++) results.push(sub2[s]);
                }
            }
        }
        return results;
    }

    // ---- Group-level matching (exact) ----

    _matchGroup(list1, list2) {
        return this._assignComponents(list1, list2, 0, [{ pairs: [] }]);
    }

    _assignComponents(list1, list2, i, partials) {
        if (i >= list1.length) return partials;

        var c1 = list1[i];
        var results = [];

        // Option A: leave c1 unmatched
        var sub = this._assignComponents(list1, list2, i + 1, partials);
        for (var s = 0; s < sub.length; s++) results.push(sub[s]);

        // Option B: match c1 to an available c2
        for (var k = 0; k < list2.length; k++) {
            if (list2[k]._used) continue;
            var intra = this._matchComponents(c1, list2[k]);
            for (var m = 0; m < intra.length; m++) {
                list2[k]._used = true;
                var newPartials = [];
                for (var p = 0; p < partials.length; p++) {
                    newPartials.push({
                        pairs: partials[p].pairs.concat(intra[m])
                    });
                }
                var sub2 = this._assignComponents(list1, list2, i + 1, newPartials);
                for (var s = 0; s < sub2.length; s++) results.push(sub2[s]);
                list2[k]._used = false;
            }
        }
        return results;
    }

    // ---- Top-level exact matching ----

    _findAllMatchings(f1, f2) {
        if (!f1 || !f2) return [];

        var comps1 = this.getComponents(f1);
        var comps2 = this.getComponents(f2);

        var groups1 = this._groupBySignature(comps1);
        var groups2 = this._groupBySignature(comps2);

        var sigKeys = {};
        for (var s in groups1) sigKeys[s] = true;
        for (var s in groups2) sigKeys[s] = true;

        var allMatchings = [{ pairs: [] }];
        for (var sig in sigKeys) {
            var g1 = groups1[sig] || [];
            var g2 = groups2[sig] || [];
            var groupResults = this._matchGroup(g1, g2);

            var newAll = [];
            for (var a = 0; a < allMatchings.length; a++) {
                for (var b = 0; b < groupResults.length; b++) {
                    newAll.push({
                        pairs: allMatchings[a].pairs.concat(groupResults[b].pairs)
                    });
                }
                if (newAll.length > StructuralMetric.MAX_MATCHINGS) break;
            }
            allMatchings = newAll;
        }

        return allMatchings;
    }

    _groupBySignature(comps) {
        var groups = {};
        for (var i = 0; i < comps.length; i++) {
            var sig = this.componentSignature(comps[i]);
            if (!groups[sig]) groups[sig] = [];
            groups[sig].push(comps[i]);
        }
        return groups;
    }

    // ---- Approximate matching utilities ----

    _shuffle(arr) {
        for (var i = arr.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
        }
        return arr;
    }

    _hashMatching(matching) {
        var keys = [];
        for (var i = 0; i < matching.pairs.length; i++) {
            keys.push(matching.pairs[i][0] + '=' + matching.pairs[i][1]);
        }
        keys.sort();
        return keys.join(';');
    }

    // ---- Greedy component matching (approximate) ----

    _greedyComponentMatch(comp1, comp2) {
        var candidates = [];
        for (var i = 0; i < comp1.relations.length; i++) {
            var r1 = comp1.relations[i];
            var r1Key = 'rel:' + r1.sourceId + '-' + r1.targetId + '-' + r1.relationType;
            for (var j = 0; j < comp2.relations.length; j++) {
                var r2 = comp2.relations[j];
                if (r2.relationType !== r1.relationType) continue;
                var r2Key = 'rel:' + r2.sourceId + '-' + r2.targetId + '-' + r2.relationType;

                candidates.push({
                    r1Key: r1Key, r2Key: r2Key,
                    assignments: [[r1Key, r2Key], [r1.sourceId, r2.sourceId], [r1.targetId, r2.targetId]]
                });

                if (r1.sourceEntityType === r1.targetEntityType ||
                    (r1.sourceEntityType === r2.targetEntityType && r1.targetEntityType === r2.sourceEntityType)) {
                    candidates.push({
                        r1Key: r1Key, r2Key: r2Key,
                        assignments: [[r1Key, r2Key], [r1.sourceId, r2.targetId], [r1.targetId, r2.sourceId]]
                    });
                }
            }
        }

        this._shuffle(candidates);

        var phi = {};
        var psi = {};

        for (var c = 0; c < candidates.length; c++) {
            var p = this._propagate(phi, psi, candidates[c].assignments);
            if (p.ok) {
                phi = p.phi;
                psi = p.psi;
            }
        }

        var pairs = this._randomExtendFree(phi, psi, comp1, comp2);

        var allPairs = [];
        for (var k in phi) allPairs.push([k, phi[k]]);
        return allPairs.concat(pairs);
    }

    _randomExtendFree(phi, psi, comp1, comp2) {
        var free1 = [];
        for (var i = 0; i < comp1.entities.length; i++) {
            if (phi[comp1.entities[i].id] === undefined) free1.push(comp1.entities[i]);
        }
        var free2 = [];
        for (var j = 0; j < comp2.entities.length; j++) {
            if (psi[comp2.entities[j].id] === undefined) free2.push(comp2.entities[j]);
        }

        this._shuffle(free1);
        var result = [];
        var pMatch = (this.options.pMatch !== undefined) ? this.options.pMatch : 0.8;

        for (var i = 0; i < free1.length; i++) {
            var a = free1[i];
            var cands = [];
            for (var j = 0; j < free2.length; j++) {
                if (free2[j].entityType === a.entityType && psi[free2[j].id] === undefined) {
                    cands.push(free2[j]);
                }
            }
            if (cands.length > 0 && Math.random() < pMatch) {
                var c = cands[Math.floor(Math.random() * cands.length)];
                phi[a.id] = c.id;
                psi[c.id] = a.id;
                result.push([a.id, c.id]);
            }
        }
        return result;
    }

    // ---- Group-level sampling (approximate) ----

    _sampleGroup(list1, list2, nSamples) {
        if (list1.length * list2.length <= nSamples) {
            return this._matchGroup(list1, list2);
        }

        var results = [];
        for (var t = 0; t < nSamples; t++) {
            var available = {};
            for (var k = 0; k < list2.length; k++) available[k] = true;

            var shuffled1 = this._shuffle(list1.slice());
            var allPairs = [];

            for (var i = 0; i < shuffled1.length; i++) {
                var avail = [];
                for (var k = 0; k < list2.length; k++) {
                    if (available[k]) avail.push(k);
                }
                if (avail.length === 0) break;

                if (Math.random() < 0.5 && avail.length > 0) {
                    var pick = avail[Math.floor(Math.random() * avail.length)];
                    available[pick] = false;
                    var m = this._greedyComponentMatch(shuffled1[i], list2[pick]);
                    allPairs = allPairs.concat(m);
                }
            }
            results.push({ pairs: allPairs });
        }
        return results;
    }

    // ---- Top-level approximate matching with diversity hashing ----

    _findApproxMatchings(f1, f2) {
        if (!f1 || !f2) return [];

        var comps1 = this.getComponents(f1);
        var comps2 = this.getComponents(f2);

        var groups1 = this._groupBySignature(comps1);
        var groups2 = this._groupBySignature(comps2);

        var sigKeys = {};
        for (var s in groups1) sigKeys[s] = true;
        for (var s in groups2) sigKeys[s] = true;

        var nSamples = (this.options.nSamples !== undefined) ? this.options.nSamples : 50;
        var tMax = (this.options.tMax !== undefined) ? this.options.tMax : 200;

        var seen = {};
        var results = [];
        var stale = 0;

        for (var t = 0; t < tMax; t++) {
            var perGroup = {};
            for (var sig in sigKeys) {
                var g1 = groups1[sig] || [];
                var g2 = groups2[sig] || [];
                perGroup[sig] = this._sampleGroup(g1, g2, 1);
            }

            var combined = [{ pairs: [] }];
            for (var sig in sigKeys) {
                var newCombined = [];
                for (var a = 0; a < combined.length; a++) {
                    for (var b = 0; b < perGroup[sig].length; b++) {
                        newCombined.push({
                            pairs: combined[a].pairs.concat(perGroup[sig][b].pairs)
                        });
                    }
                }
                combined = newCombined;
            }

            for (var c = 0; c < combined.length; c++) {
                var h = this._hashMatching(combined[c]);
                if (!seen[h]) {
                    seen[h] = true;
                    results.push(combined[c]);
                    stale = 0;
                } else {
                    stale++;
                }
            }

            if (results.length >= nSamples || stale >= nSamples) break;
        }

        return results;
    }

    // ---- Scoring ----

    // Largest weighted matching score: number of matched relation-key pairs.
    _scoreMatchings(matchings) {
        var bestScore = 0;
        for (var i = 0; i < matchings.length; i++) {
            var score = 0;
            var pairs = matchings[i].pairs;
            for (var j = 0; j < pairs.length; j++) {
                score += this._pairWeight(pairs[j][0]);
            }
            if (score > bestScore) bestScore = score;
        }
        return bestScore;
    }

    _distanceFromMatchings(matchings, f1, f2) {
        if (!f1 || !f2) return 1;
        var totalWeight = this._universeWeight(f1) + this._universeWeight(f2);
        if (totalWeight === 0) return 0;

        var bestScore = this._scoreMatchings(matchings);
        var distance = 1 - (2 * bestScore) / totalWeight;
        return Math.max(0, Math.min(1, distance));
    }

    // ---- Public distance ----

    distance(fileId1, fileId2) {
        var f1 = this.getFilteredFile(fileId1);
        var f2 = this.getFilteredFile(fileId2);
        if (!f1 || !f2) return 1;
        if (f1.nodes.length === 0 && f2.nodes.length === 0) return 0;

        var approximate = this.options.approximate !== false; // default approximate
        var matchings = approximate
            ? this._findApproxMatchings(f1, f2)
            : this._findAllMatchings(f1, f2);

        return this._distanceFromMatchings(matchings, f1, f2);
    }

    // ---- Pre-computation dialog contract ----
    renderOptions(containerEl) {
        if (typeof MdsConfig !== 'undefined' && MdsConfig.buildStructuralOptionsInto) {
            MdsConfig.buildStructuralOptionsInto(containerEl, this.options || null);
        }
    }

    readOptions(overlayEl) {
        if (typeof MdsConfig !== 'undefined' && MdsConfig.readStructuralOptions) {
            return { structuralOpts: MdsConfig.readStructuralOptions(overlayEl) };
        }
        return { structuralOpts: { approximate: true, nSamples: 50, tMax: 200, pMatch: 0.8 } };
    }

    // ---- config <-> options ----
    // The saved config nests structural params under structuralOpts.
    static optionsFromConfig(config) {
        return config.structuralOpts || {};
    }
}

StructuralMetric.id = 'structural';
StructuralMetric.label = 'Relationship structural distance';

FileDistance.register(StructuralMetric);
