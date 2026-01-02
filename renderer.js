const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

const tabsContainer = document.getElementById('tabs');
const addTabBtn = document.getElementById('add-tab');
const webviewContainer = document.getElementById('webview-container');
const urlInput = document.getElementById('url-input');
const backBtn = document.getElementById('back-btn');
const forwardBtn = document.getElementById('forward-btn');
const reloadBtn = document.getElementById('reload-btn');
const bookmarkBtn = document.getElementById('bookmark-btn');
const menuBtn = document.getElementById('menu-btn');
const menuDropdown = document.getElementById('menu-dropdown');
const bookmarksBar = document.getElementById('bookmarks-bar');
const sidebar = document.getElementById('sidebar');
const sidebarTitle = document.getElementById('sidebar-title');
const sidebarContent = document.getElementById('sidebar-content');
const closeSidebarBtn = document.getElementById('close-sidebar');
const inspectBtn = document.getElementById('inspect-btn');

const minBtn = document.getElementById('min-btn');
const maxBtn = document.getElementById('max-btn');
const closeBtn = document.getElementById('close-btn');

minBtn.onclick = () => ipcRenderer.send('window-minimize');
maxBtn.onclick = () => ipcRenderer.send('window-maximize');
closeBtn.onclick = () => ipcRenderer.send('window-close');

let tabs = [];
let activeTabId = null;

// Storage
let bookmarks = JSON.parse(localStorage.getItem('bookmarks') || '[]');
let history = JSON.parse(localStorage.getItem('history') || '[]');
let settings = JSON.parse(localStorage.getItem('settings') || '{"homepage": "https://www.google.com"}');

function saveBookmarks() {
    localStorage.setItem('bookmarks', JSON.stringify(bookmarks));
    renderBookmarksBar();
}

function saveHistory() {
    localStorage.setItem('history', JSON.stringify(history));
}

function saveSettings() {
    localStorage.setItem('settings', JSON.stringify(settings));
}

function createTab(url = settings.homepage) {
    const id = Date.now().toString();
    
    const tabBtn = document.createElement('div');
    tabBtn.className = 'tab';
    tabBtn.id = `tab-${id}`;
    tabBtn.innerHTML = `<span>New Tab</span><div class="close-tab">×</div>`;
    tabBtn.onclick = (e) => {
        if (e.target.className === 'close-tab') {
            closeTab(id);
        } else {
            setActiveTab(id);
        }
    };
    tabsContainer.insertBefore(tabBtn, addTabBtn);

    const webview = document.createElement('webview');
    webview.id = `webview-${id}`;
    webview.src = url;
    webview.setAttribute('allowpopups', '');
    webviewContainer.appendChild(webview);

    webview.addEventListener('did-start-loading', () => {
        if (id === activeTabId) {
            urlInput.value = webview.getURL();
            updateBookmarkBtn();
        }
    });

    webview.addEventListener('did-navigate', () => {
        if (id === activeTabId) {
            urlInput.value = webview.getURL();
            updateBookmarkBtn();
        }
    });

    webview.addEventListener('did-navigate-in-page', () => {
        if (id === activeTabId) {
            urlInput.value = webview.getURL();
            updateBookmarkBtn();
        }
    });

    webview.addEventListener('did-stop-loading', () => {
        const title = webview.getTitle() || 'New Tab';
        const currentUrl = webview.getURL();
        tabBtn.querySelector('span').innerText = title;
        
        if (id === activeTabId) {
            urlInput.value = currentUrl;
            updateBookmarkBtn();
            updateNavButtons();
        }

        // Add to history
        if (!currentUrl.startsWith('data:') && !currentUrl.startsWith('about:')) {
            const historyItem = { title, url: currentUrl, time: Date.now() };
            // Avoid duplicate consecutive history items
            if (history.length === 0 || history[0].url !== currentUrl) {
                history.unshift(historyItem);
                history = history.slice(0, 500);
                saveHistory();
            }
        }
    });

    webview.addEventListener('page-title-updated', (e) => {
        tabBtn.querySelector('span').innerText = e.title;
    });

    webview.addEventListener('new-window', (e) => {
        createTab(e.url);
    });

    webview.addEventListener('did-fail-load', (e) => {
        // -3 is ERR_ABORTED, often ignorable
        if (e.errorCode !== -3) {
            console.error(`Failed to load: ${e.errorDescription} (${e.errorCode})`);
        }
    });

    const tabData = { id, tabBtn, webview };
    tabs.push(tabData);
    setActiveTab(id);

    // If it's a new empty tab (homepage), focus the address bar
    if (url === settings.homepage) {
        urlInput.focus();
        urlInput.select();
    }
}

function setActiveTab(id) {
    activeTabId = id;
    tabs.forEach(tab => {
        if (tab.id === id) {
            tab.tabBtn.classList.add('active');
            tab.webview.classList.add('active');
            urlInput.value = tab.webview.getURL();
            updateBookmarkBtn();
            updateNavButtons();
            // Ensure the tab is visible in the container
            tab.tabBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
            // Focus webview
            tab.webview.focus();
        } else {
            tab.tabBtn.classList.remove('active');
            tab.webview.classList.remove('active');
        }
    });
}

function closeTab(id) {
    const index = tabs.findIndex(t => t.id === id);
    if (index === -1) return;

    const tab = tabs[index];
    tab.tabBtn.remove();
    tab.webview.remove();
    tabs.splice(index, 1);

    if (activeTabId === id) {
        if (tabs.length > 0) {
            const nextTab = tabs[Math.max(0, index - 1)];
            setActiveTab(nextTab.id);
        } else {
            activeTabId = null;
            urlInput.value = '';
            createTab(); // Always have at least one tab
        }
    }
}

function updateBookmarkBtn() {
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (!activeTab) return;
    
    const url = activeTab.webview.getURL();
    const isBookmarked = bookmarks.some(b => b.url === url);
    
    bookmarkBtn.classList.toggle('active', isBookmarked);
}

function updateNavButtons() {
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (!activeTab) return;

    backBtn.style.opacity = activeTab.webview.canGoBack() ? '1' : '0.5';
    forwardBtn.style.opacity = activeTab.webview.canGoForward() ? '1' : '0.5';
}

bookmarkBtn.onclick = () => {
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (!activeTab) return;

    const url = activeTab.webview.getURL();
    const title = activeTab.webview.getTitle();
    const index = bookmarks.findIndex(b => b.url === url);

    if (index === -1) {
        bookmarks.push({ title, url });
    } else {
        bookmarks.splice(index, 1);
    }
    
    saveBookmarks();
    updateBookmarkBtn();
};

function renderBookmarksBar() {
    bookmarksBar.innerHTML = '';
    bookmarks.slice(0, 15).forEach((b, index) => {
        const item = document.createElement('div');
        item.className = 'bookmark-item';
        item.innerText = b.title;
        item.title = b.url;
        item.onclick = () => {
            const activeTab = tabs.find(t => t.id === activeTabId);
            if (activeTab) activeTab.webview.loadURL(b.url);
            else createTab(b.url);
        };
        // Right click to delete
        item.oncontextmenu = (e) => {
            e.preventDefault();
            if (confirm(`Delete bookmark "${b.title}"?`)) {
                bookmarks.splice(index, 1);
                saveBookmarks();
                updateBookmarkBtn();
            }
        };
        bookmarksBar.appendChild(item);
    });
}

menuBtn.onclick = (e) => {
    e.stopPropagation();
    menuDropdown.classList.toggle('hidden');
};

document.addEventListener('click', () => {
    menuDropdown.classList.add('hidden');
});

menuDropdown.addEventListener('click', (e) => {
    e.stopPropagation();
});

document.getElementById('show-history').onclick = () => {
    menuDropdown.classList.add('hidden');
    showSidebar('History');
    renderHistory();
};

document.getElementById('show-bookmarks').onclick = () => {
    menuDropdown.classList.add('hidden');
    showSidebar('Bookmarks');
    renderAllBookmarks();
};

document.getElementById('show-settings').onclick = () => {
    menuDropdown.classList.add('hidden');
    showSidebar('Settings');
    renderSettings();
};

inspectBtn.onclick = () => {
    menuDropdown.classList.add('hidden');
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (activeTab) {
        activeTab.webview.openDevTools();
    }
};

function showSidebar(title) {
    sidebarTitle.innerText = title;
    sidebar.classList.remove('hidden');
}

closeSidebarBtn.onclick = () => {
    sidebar.classList.add('hidden');
};

function renderHistory() {
    sidebarContent.innerHTML = '';
    if (history.length === 0) {
        sidebarContent.innerHTML = '<p style="text-align:center;color:#666;margin-top:20px;">No history yet</p>';
        return;
    }
    history.forEach((item) => {
        const div = document.createElement('div');
        div.className = 'history-item';
        div.innerHTML = `<strong>${item.title}</strong><small>${item.url}</small>`;
        div.onclick = () => {
            const activeTab = tabs.find(t => t.id === activeTabId);
            if (activeTab) activeTab.webview.loadURL(item.url);
            else createTab(item.url);
        };
        sidebarContent.appendChild(div);
    });
}

function renderAllBookmarks() {
    sidebarContent.innerHTML = '';
    if (bookmarks.length === 0) {
        sidebarContent.innerHTML = '<p style="text-align:center;color:#666;margin-top:20px;">No bookmarks yet</p>';
        return;
    }
    bookmarks.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'all-bookmarks-item';
        div.innerHTML = `<strong>${item.title}</strong><small>${item.url}</small>`;
        div.onclick = () => {
            const activeTab = tabs.find(t => t.id === activeTabId);
            if (activeTab) activeTab.webview.loadURL(item.url);
            else createTab(item.url);
        };
        div.oncontextmenu = (e) => {
            e.preventDefault();
            if (confirm(`Delete bookmark "${item.title}"?`)) {
                bookmarks.splice(index, 1);
                saveBookmarks();
                updateBookmarkBtn();
                renderAllBookmarks();
            }
        };
        sidebarContent.appendChild(div);
    });
}

function renderSettings() {
    sidebarContent.innerHTML = `
        <div class="settings-group">
            <h3>General</h3>
            <label style="font-size:13px;color:#5f6368;">Homepage</label>
            <input type="text" id="homepage-input" value="${settings.homepage}">
            <button id="save-settings-btn">Save Changes</button>
        </div>
        <div class="settings-group">
            <h3>Privacy & Safety</h3>
            <button id="clear-history-btn">Clear Browsing Data</button>
        </div>
    `;

    document.getElementById('save-settings-btn').onclick = () => {
        settings.homepage = document.getElementById('homepage-input').value;
        saveSettings();
        // Visual feedback
        const btn = document.getElementById('save-settings-btn');
        const oldText = btn.innerText;
        btn.innerText = 'Saved!';
        btn.style.backgroundColor = '#4caf50';
        setTimeout(() => {
            btn.innerText = oldText;
            btn.style.backgroundColor = '';
        }, 2000);
    };

    document.getElementById('clear-history-btn').onclick = () => {
        if (confirm('Clear all browsing history?')) {
            history = [];
            saveHistory();
            renderHistory();
        }
    };
}

addTabBtn.onclick = () => createTab();

urlInput.onkeydown = (e) => {
    if (e.key === 'Enter') {
        let input = urlInput.value.trim();
        if (!input) return;

        let url = input;
        if (!/^https?:\/\//i.test(input)) {
            // Check if it looks like a URL (no spaces, contains a dot)
            if (input.includes('.') && !input.includes(' ')) {
                url = 'http://' + input;
            } else {
                url = 'https://www.google.com/search?q=' + encodeURIComponent(input);
            }
        }

        const activeTab = tabs.find(t => t.id === activeTabId);
        if (activeTab) {
            activeTab.webview.loadURL(url);
        } else {
            createTab(url);
        }
        urlInput.blur();
    }
};

urlInput.onfocus = () => {
    urlInput.select();
};

backBtn.onclick = () => {
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (activeTab && activeTab.webview.canGoBack()) {
        activeTab.webview.goBack();
    }
};

forwardBtn.onclick = () => {
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (activeTab && activeTab.webview.canGoForward()) {
        activeTab.webview.goForward();
    }
};

reloadBtn.onclick = () => {
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (activeTab) {
        activeTab.webview.reload();
    }
};

function takeScreenshot() {
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (!activeTab) return;

    activeTab.webview.capturePage().then(image => {
        const screenshotPath = path.join(process.env.USERPROFILE || process.env.HOME, 'Desktop', `screenshot-${Date.now()}.png`);
        fs.writeFile(screenshotPath, image.toPNG(), (err) => {
            if (err) {
                console.error('Failed to save screenshot:', err);
                alert('Failed to save screenshot');
            } else {
                alert(`Screenshot saved to Desktop: ${screenshotPath}`);
            }
        });
    });
}

window.addEventListener('keydown', (e) => {
    if (e.ctrlKey) {
        switch (e.key.toLowerCase()) {
            case 't':
                e.preventDefault();
                createTab();
                break;
            case 'w':
                e.preventDefault();
                ipcRenderer.send('create-window');
                break;
            case 's':
                e.preventDefault();
                takeScreenshot();
                break;
            case 'd':
                e.preventDefault();
                showSidebar('Settings');
                renderSettings();
                break;
            case 'h':
                e.preventDefault();
                showSidebar('History');
                renderHistory();
                break;
            case 'i':
                e.preventDefault();
                const activeTab = tabs.find(t => t.id === activeTabId);
                if (activeTab) {
                    activeTab.webview.openDevTools();
                }
                break;
            case 'l':
                e.preventDefault();
                urlInput.focus();
                urlInput.select();
                break;
        }
    }
});

// Initialization
renderBookmarksBar();
createTab();
