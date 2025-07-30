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

function createBlockButton(serverId, isBlocked = false) {
    const blockButton = document.createElement('button');
    blockButton.className = `disfilter-block-btn ${isBlocked ? 'blocked' : ''}`;
    blockButton.setAttribute('data-server-id', serverId);
    blockButton.setAttribute('title', isBlocked ? 'Unblock this server' : 'Block this server');
    blockButton.setAttribute('aria-label', isBlocked ? 'Unblock this server' : 'Block this server');

    blockButton.innerHTML = isBlocked ? '🛡️' : '⛔';

    blockButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleServerBlock(serverId);
    });

    return blockButton;
}

function toggleServerBlock(serverId) {
    if (!serverId) return;

    const isCurrentlyBlocked = disfilterSettings.serverIds.includes(serverId);

    if (isCurrentlyBlocked) {
        disfilterSettings.serverIds = disfilterSettings.serverIds.filter(id => id !== serverId);
        showToast(`Server unblocked`, 'success');
    } else {
        disfilterSettings.serverIds.push(serverId);
        showToast(`Server blocked`, 'success');
    }

    browserAPI.storage.local.set({ disfilterSettings });

    updateBlockButtons(serverId, !isCurrentlyBlocked);

    applyFiltering();
}

function updateBlockButtons(serverId, isBlocked) {
    const buttons = document.querySelectorAll(`[data-server-id="${serverId}"]`);
    buttons.forEach(button => {
        button.className = `disfilter-block-btn ${isBlocked ? 'blocked' : ''}`;
        button.setAttribute('title', isBlocked ? 'Unblock this server' : 'Block this server');
        button.setAttribute('aria-label', isBlocked ? 'Unblock this server' : 'Block this server');
        button.innerHTML = isBlocked ? '🛡️' : '⛔';
    });
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `disfilter-toast disfilter-toast-${type}`;
    toast.textContent = message;

    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }, 1000);
}

function addBlockButtonToCard(cardElement) {
    if (cardElement.querySelector('.disfilter-block-btn')) {
        return;
    }

    const { serverId } = getServerInfo(cardElement);
    if (!serverId) return;

    const isBlocked = disfilterSettings.serverIds.includes(serverId);
    const blockButton = createBlockButton(serverId, isBlocked);

    const serverMenu = cardElement.querySelector('.server-menu.dropdown');
    if (serverMenu) {
        serverMenu.parentNode.insertBefore(blockButton, serverMenu);
    } else {
        const serverMisc = cardElement.querySelector('.server-misc');
        if (serverMisc) {
            serverMisc.appendChild(blockButton);
        }
    }
}

function applyFiltering() {
    const allColumnCards = document.querySelectorAll('.columns.is-multiline > .column');

    allColumnCards.forEach((columnElement) => {
        const cardElement = columnElement.querySelector('.listing-card');
        if (!cardElement) {
            return;
        }

        addBlockButtonToCard(cardElement);

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

.disfilter-block-btn {
    background: none;
    border: none;
    font-size: 16px;
    cursor: pointer;
    padding: 4px;
    margin: 0 4px;
    border-radius: 4px;
    transition: all 0.2s ease;
    opacity: 0.7;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    height: 24px;
}

.disfilter-block-btn:hover {
    opacity: 1;
    background-color: rgba(0, 0, 0, 0.1);
    transform: scale(1.1);
}

.disfilter-block-btn.blocked {
    opacity: 1;
    background-color: rgba(255, 0, 0, 0.1);
}

.disfilter-block-btn.blocked:hover {
    background-color: rgba(255, 0, 0, 0.2);
}

/* Toast notifications */
.disfilter-toast {
    position: fixed;
    top: 20px;
    right: 20px;
    background: #333;
    color: white;
    padding: 12px 20px;
    border-radius: 6px;
    font-size: 14px;
    z-index: 10000;
    opacity: 0;
    transform: translateX(100%);
    transition: all 0.3s ease;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.disfilter-toast.show {
    opacity: 1;
    transform: translateX(0);
}

.disfilter-toast-success {
    background: #4CAF50;
}

.disfilter-toast-error {
    background: #f44336;
}

/* Responsive positioning for block button */
@media (max-width: 768px) {
    .disfilter-block-btn {
        font-size: 14px;
        min-width: 20px;
        height: 20px;
        margin: 0 2px;
    }
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