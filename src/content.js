const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

let disfilterSettings = {
    regexPatterns: [],
    tags: [],
    serverIds: [],
};
let isBlockingEnabled = true;
let blockedServersCount = 0;

function sendBlockedCountToPopup() {
    browserAPI.runtime.sendMessage({
        type: 'UPDATE_BLOCKED_COUNT',
        payload: { count: blockedServersCount },
    });
}

function getServerInfo(cardElement) {
    const serverNameElement = cardElement.querySelector('.server-name');
    const serverName = serverNameElement ? serverNameElement.textContent.trim() : '';

    const tags = Array.from(cardElement.querySelectorAll('.server-tags ul li span.name')).map((el) =>
        el.textContent.trim().toLowerCase()
    );

    const idMatch = cardElement.className.match(/server-(\d+)/);
    const serverId = idMatch ? idMatch[1] : null;

    return { serverName, tags, serverId };
}

function shouldBlock(serverInfo) {
    const { serverName, tags, serverId } = serverInfo;

    for (const pattern of disfilterSettings.regexPatterns) {
        try {
            const regex = new RegExp(pattern, 'i');
            if (serverName.match(regex)) {
                return true;
            }
        } catch (e) {
            console.error(`DisFilter: Invalid regex pattern: ${pattern}`, e);
        }
    }

    for (const blockedTag of disfilterSettings.tags) {
        if (tags.includes(blockedTag.toLowerCase())) {
            return true;
        }
    }

    if (serverId && disfilterSettings.serverIds.includes(serverId)) {
        return true;
    }

    return false;
}

function hideServerColumn(columnElement) {
    columnElement.classList.add('disfilter-hidden');
}

function unhideServerColumn(columnElement) {
    columnElement.classList.remove('disfilter-hidden');
}

function updateBlockedCountForUI() {
    blockedServersCount = document.querySelectorAll('.column.disfilter-hidden').length;
    sendBlockedCountToPopup();
}

function applyFiltering() {
    const allColumnCards = document.querySelectorAll('.columns.is-multiline > .column');

    allColumnCards.forEach((columnElement) => {
        const cardElement = columnElement.querySelector('.listing-card');
        if (!cardElement) {
            return;
        }

        const serverInfo = getServerInfo(cardElement);
        const isCurrentlyHiddenByDisFilter = columnElement.classList.contains('disfilter-hidden');
        const shouldItBeBlocked = isBlockingEnabled && shouldBlock(serverInfo);

        if (shouldItBeBlocked && !isCurrentlyHiddenByDisFilter) {
            hideServerColumn(columnElement);
        } else if (!shouldItBeBlocked && isCurrentlyHiddenByDisFilter) {
            unhideServerColumn(columnElement);
        }
    });

    updateBlockedCountForUI();
}

const observer = new MutationObserver((mutations) => {
    let relevantChangeDetected = false;
    for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType === 1 && (node.matches('.column') || node.querySelector('.column') || node.matches('.listings'))) {
                    relevantChangeDetected = true;
                    break;
                }
            }
        }
        if (relevantChangeDetected) break;
    }

    if (relevantChangeDetected) {
        clearTimeout(window._disfilterDebounceTimer);
        window._disfilterDebounceTimer = setTimeout(() => {
            applyFiltering();
        }, 150);
    }
});

const listingsContainer = document.getElementById('listings');
if (listingsContainer) {
    observer.observe(listingsContainer, { childList: true, subtree: true });
} else {
    observer.observe(document.body, { childList: true, subtree: true });
}

const style = document.createElement('style');
style.textContent = `
.columns.is-multiline > .column {
    transition: opacity 0.3s ease-out, transform 0.3s ease-out,
                height 0.3s ease-out, width 0.3s ease-out,
                flex-basis 0.3s ease-out, min-height 0.3s ease-out,
                margin 0.3s ease-out, padding 0.3s ease-out;
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
}

.column.disfilter-hidden {
    opacity: 0 !important;
    transform: translateY(20px) !important;
    height: 0 !important;
    width: 0 !important;
    flex-basis: 0 !important;
    min-height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
    pointer-events: none !important;
}
`;
document.head.appendChild(style);


browserAPI.storage.local.get(['disfilterSettings', 'isBlockingEnabled'], (result) => {
    disfilterSettings = result.disfilterSettings || {
        regexPatterns: [],
        tags: [],
        serverIds: [],
    };
    isBlockingEnabled = result.isBlockingEnabled !== undefined ? result.isBlockingEnabled : true;
    applyFiltering();
});

browserAPI.runtime.onMessage.addListener((request) => {
    if (request.type === 'UPDATE_SETTINGS') {
        disfilterSettings = request.payload.settings;
        applyFiltering();
    } else if (request.type === 'TOGGLE_BLOCKING') {
        isBlockingEnabled = request.payload.isEnabled;
        applyFiltering();
    } else if (request.type === 'REQUEST_BLOCKED_COUNT') {
        sendBlockedCountToPopup();
    }
});