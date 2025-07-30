document.addEventListener('DOMContentLoaded', async () => {
    const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

    const themeSwitcher = document.getElementById('theme-switcher');
    const toggleBlockingButton = document.getElementById('toggle-blocking');
    const blockedCountSpan = document.getElementById('blocked-count');
    const settingsButton = document.getElementById('settings-button');
    const settingsModal = document.getElementById('settings-modal');
    const closeModalButton = document.getElementById('close-modal');
    const saveSettingsButton = document.getElementById('save-settings');

    const regexInput = document.getElementById('regex-input');
    const addRegexButton = document.getElementById('add-regex');
    const viewRegexListButton = document.getElementById('view-regex-list');

    const tagInput = document.getElementById('tag-input');
    const addTagButton = document.getElementById('add-tag');
    const viewTagListButton = document.getElementById('view-tag-list');

    const serverIdInput = document.getElementById('server-id-input');
    const addServerIdButton = document.getElementById('add-server-id');
    const viewServerIdListButton = document.getElementById('view-server-id-list');

    const listModal = document.getElementById('list-modal');
    const listModalTitle = document.getElementById('list-modal-title');
    const listModalContent = document.getElementById('list-modal-content');
    const closeListModalButton = document.getElementById('close-list-modal');
    const listModalSearch = document.getElementById('list-modal-search');
    const listModalRemoveAll = document.getElementById('list-modal-remove-all');

    const notificationContainer = document.getElementById('notification-container');

    let themePreference = 'light-mode';
    let currentSettings = {
        regexPatterns: [],
        tags: [],
        serverIds: [],
    };

    let lastBlockedCount = 0;
    let blockedCountAnimationId = null;
    function showNotification(message, duration = 1000) {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        notificationContainer.appendChild(toast);

        void toast.offsetWidth;

        toast.classList.add('show');

        setTimeout(() => {
            toast.classList.remove('show');
            toast.addEventListener('transitionend', () => toast.remove(), { once: true });
        }, duration);
    }

    function updateBlockedCount(newCount) {
        const target = Number(newCount);
        if (target === lastBlockedCount) return;
        if (blockedCountAnimationId) {
            cancelAnimationFrame(blockedCountAnimationId);
            blockedCountAnimationId = null;
        }
        const start = lastBlockedCount;
        const duration = 80;
        const startTime = performance.now();
        function animate(now) {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const value = Math.round(start + (target - start) * progress);
            blockedCountSpan.textContent = value;
            if (progress < 1) {
                blockedCountAnimationId = requestAnimationFrame(animate);
            } else {
                blockedCountSpan.textContent = target;
                lastBlockedCount = target;
                blockedCountAnimationId = null;
            }
        }
        blockedCountAnimationId = requestAnimationFrame(animate);
    }

    async function sendMessageToContentScript(type, payload = {}) {
        try {
            const [tab] = await browserAPI.tabs.query({ active: true, currentWindow: true });
            if (tab && tab.url && tab.url.startsWith('https://disboard.org')) {
                browserAPI.tabs.sendMessage(tab.id, { type, payload });
            }
        } catch (error) {
            console.error('Error sending message to content script:', error);
        }
    }

    function applyTheme(theme) {
        document.documentElement.className = theme;
        themeSwitcher.querySelector('i').className =
            theme === 'dark-mode' ? 'fas fa-moon' : 'fas fa-sun';
    }

    themeSwitcher.addEventListener('click', () => {
        themePreference = themePreference === 'light-mode' ? 'dark-mode' : 'light-mode';
        applyTheme(themePreference);
        browserAPI.storage.local.set({ themePreference });
    });

    async function loadSettings() {
        const result = await browserAPI.storage.local.get([
            'disfilterSettings',
            'isBlockingEnabled',
            'themePreference',
        ]);

        currentSettings = result.disfilterSettings || {
            regexPatterns: [],
            tags: [],
            serverIds: [],
        };
        const isBlockingEnabled = result.isBlockingEnabled !== undefined ? result.isBlockingEnabled : true;

        if (result.themePreference) {
            themePreference = result.themePreference;
        } else {
            themePreference = window.matchMedia('(prefers-color-scheme: dark)').matches
                ? 'dark-mode'
                : 'light-mode';
        }

        applyTheme(themePreference);
        toggleBlockingButton.setAttribute('aria-pressed', isBlockingEnabled);
        if (isBlockingEnabled) {
            toggleBlockingButton.classList.add('pulsing');
        } else {
            toggleBlockingButton.classList.remove('pulsing');
        }

        return { settings: currentSettings, isBlockingEnabled };
    }

    async function saveSettings(settings) {
        await browserAPI.storage.local.set({ disfilterSettings: settings });
        showNotification('Settings saved!');
        sendMessageToContentScript('UPDATE_SETTINGS', { settings });
    }

    function updateBlockingUI(isEnabled) {
        toggleBlockingButton.setAttribute('aria-pressed', isEnabled);
        if (isEnabled) {
            toggleBlockingButton.classList.add('pulsing');
        } else {
            toggleBlockingButton.classList.remove('pulsing');
        }
    }

    toggleBlockingButton.addEventListener('click', async () => {
        let result = await browserAPI.storage.local.get('isBlockingEnabled');
        let isEnabled = result.isBlockingEnabled !== undefined ? result.isBlockingEnabled : true;
        isEnabled = !isEnabled;
        await browserAPI.storage.local.set({ isBlockingEnabled: isEnabled });
        updateBlockingUI(isEnabled);
        sendMessageToContentScript('TOGGLE_BLOCKING', { isEnabled });
    });

    settingsButton.addEventListener('click', () => {
        settingsModal.classList.add('active');
        settingsModal.setAttribute('aria-hidden', 'false');
    });

    closeModalButton.addEventListener('click', () => {
        settingsModal.classList.remove('active');
        settingsModal.setAttribute('aria-hidden', 'true');
    });

    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            settingsModal.classList.remove('active');
            settingsModal.setAttribute('aria-hidden', 'true');
        }
    });

    function createListItem(item, type, index) {
        const li = document.createElement('li');
        li.dataset.index = index;
        li.dataset.value = item;

        const span = document.createElement('span');
        span.textContent = item;
        li.appendChild(span);

        const removeButton = document.createElement('button');
        removeButton.className = 'remove-button';
        removeButton.textContent = 'Remove';
        removeButton.setAttribute('aria-label', `Remove ${item} from ${type} list`);
        removeButton.addEventListener('click', () => removeItem(item, type));
        li.appendChild(removeButton);

        return li;
    }

    let currentListType = null;
    let currentListItems = [];
    function renderListModal(type) {
        listModalContent.innerHTML = '';
        let items = [];
        let title = '';
        if (type === 'regexPatterns') {
            items = currentSettings.regexPatterns;
            title = 'Regex Patterns';
        } else if (type === 'tags') {
            items = currentSettings.tags;
            title = 'Tags';
        } else if (type === 'serverIds') {
            items = currentSettings.serverIds;
            title = 'Server IDs';
        }
        currentListType = type;
        currentListItems = items.slice();
        listModalTitle.textContent = title;
        listModalSearch.value = '';
        renderListModalItems(items);
        listModal.classList.add('active');
        listModal.setAttribute('aria-hidden', 'false');
    }

    function renderListModalItems(items) {
        listModalContent.innerHTML = '';
        items.forEach((item, idx) => {
            listModalContent.appendChild(createListItem(item, currentListType, idx));
        });
    }

    listModalSearch.addEventListener('input', () => {
        const q = listModalSearch.value.trim().toLowerCase();
        if (!q) {
            renderListModalItems(currentListItems);
        } else {
            renderListModalItems(currentListItems.filter(item => item.toLowerCase().includes(q)));
        }
    });

    listModalRemoveAll.addEventListener('click', () => {
        if (!currentListType) return;
        if (currentSettings[currentListType].length === 0) return;
        if (!confirm('Remove all items from this list?')) return;
        currentSettings[currentListType] = [];
        renderListModal(currentListType);
        showNotification('All items removed.');
    });

    closeListModalButton.addEventListener('click', () => {
        listModal.classList.remove('active');
        listModal.setAttribute('aria-hidden', 'true');
    });
    listModal.addEventListener('click', (e) => {
        if (e.target === listModal) {
            listModal.classList.remove('active');
            listModal.setAttribute('aria-hidden', 'true');
        }
    });

    viewRegexListButton.addEventListener('click', () => renderListModal('regexPatterns'));
    viewTagListButton.addEventListener('click', () => renderListModal('tags'));
    viewServerIdListButton.addEventListener('click', () => renderListModal('serverIds'));


    async function addItem(inputElement, type) {
        const value = inputElement.value.trim();
        if (value && !currentSettings[type].includes(value)) {
            currentSettings[type].push(value);
            inputElement.value = '';
            showNotification(`${value} added.`);
        } else if (value && currentSettings[type].includes(value)) {
            showNotification(`${value} is already in the list.`);
        }
    }

    function removeItem(item, type) {
        currentSettings[type] = currentSettings[type].filter((i) => i !== item);
        showNotification(`${item} removed.`);
        if (!listModal.classList.contains('active')) return;
        renderListModal(type);
    }

    addRegexButton.addEventListener('click', () => addItem(regexInput, 'regexPatterns'));
    regexInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addItem(regexInput, 'regexPatterns');
        }
    });

    addTagButton.addEventListener('click', () => addItem(tagInput, 'tags'));
    tagInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addItem(tagInput, 'tags');
        }
    });

    addServerIdButton.addEventListener('click', () => addItem(serverIdInput, 'serverIds'));
    serverIdInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addItem(serverIdInput, 'serverIds');
        }
    });

    saveSettingsButton.addEventListener('click', () => {
        saveSettings(currentSettings);
        settingsModal.classList.remove('active');
        settingsModal.setAttribute('aria-hidden', 'true');
    });

    await loadSettings();

    sendMessageToContentScript('REQUEST_BLOCKED_COUNT');

    browserAPI.runtime.onMessage.addListener((request) => {
        if (request.type === 'UPDATE_BLOCKED_COUNT') {
            updateBlockedCount(request.payload.count);
        }
    });
});