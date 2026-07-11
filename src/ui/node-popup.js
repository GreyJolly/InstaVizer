// ===========================
// Node Context Popup
// ===========================

function showNodePopup(event, d) {
    hideNodePopup();

    const popup = document.getElementById('node-popup');
    const titleEl = document.getElementById('node-popup-title');
    const chartsEl = document.getElementById('node-popup-charts');

    titleEl.textContent = d.type === 'entity' ? d.name : d.name + ' (' + d.sourceEntity + ' – ' + d.targetEntity + ')';

    let chartsHTML = '';
    Object.keys(CHART_CONFIGS).forEach(function(type) {
        var cfg = CHART_CONFIGS[type];
        if (!cfg.menuLabel) return;
        if (cfg.validFor.indexOf(d.type) === -1) return;
        chartsHTML += '<button class="node-popup-btn" onclick="popupOpenChart(\'' + type + '\')">' +
            cfg.menuLabel + '</button>';
    });
    chartsEl.innerHTML = chartsHTML;

    // Store reference for chart opening
    popup._nodeData = d;

    // Position popup near click
    popup.style.display = 'block';
    const popupRect = popup.getBoundingClientRect();
    let left = event.clientX + 8;
    let top = event.clientY + 8;
    if (left + popupRect.width > window.innerWidth - 10) left = event.clientX - popupRect.width - 8;
    if (top + popupRect.height > window.innerHeight - 10) top = event.clientY - popupRect.height - 8;
    popup.style.left = left + 'px';
    popup.style.top = top + 'px';

    // Close on outside click
    setTimeout(() => {
        document.addEventListener('click', hideNodePopupOnOutside);
    }, 0);
}

function hideNodePopup() {
    document.getElementById('node-popup').style.display = 'none';
    document.removeEventListener('click', hideNodePopupOnOutside);
}

function hideNodePopupOnOutside(e) {
    const popup = document.getElementById('node-popup');
    if (!popup.contains(e.target)) {
        hideNodePopup();
    }
}

function popupOpenChart(chartType) {
    const popup = document.getElementById('node-popup');
    const d = popup._nodeData;
    hideNodePopup();

    if (d.type === 'entity') {
        ModalState.item = { type: 'entity', name: d.name };
        _configureToggleButtonsForItemType('entity');
        openModal('Entity: ' + d.name);
    } else {
        ModalState.item = {
            type: 'relationship',
            name: d.name,
            sourceEntity: d.sourceEntity,
            targetEntity: d.targetEntity
        };
        ModalState.relationChain = [];
        _configureToggleButtonsForItemType('relationship');
        openModal('Relationship: ' + d.name);
        renderRelationChain();
    }

    setChartType(chartType);
}


