// ==UserScript==
// @name         批量修改条目收藏状态
// @namespace    https://bgm.tv/
// @version      1.0.0
// @description  在 Bangumi 目录页/收藏页提供批量修改收藏状态的功能
// @author       liang0721gs
// @include      /^https?:\/\/.*\.?(bgm\.tv|bangumi\.tv|chii\.in)\/index\/\d+/
// @include      /^https?:\/\/.*\.?(bgm\.tv|bangumi\.tv|chii\.in)\/(anime|book|music|game|real)\/list\/[^/]+\/(do|wish|collect|on_hold|dropped)/
// @grant        none
// @license      MIT
// @updateURL   https://raw.githubusercontent.com/liang0721gs/bangumi-batch-tool/main/bgm-batch.user.js
// @downloadURL https://raw.githubusercontent.com/liang0721gs/bangumi-batch-tool/main/bgm-batch.user.js
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function() {
    'use strict';
    const AuthManager = {
        STORAGE_KEY: 'bgm_batch_auth_v5',
        WORKER_URL: 'https://bgm-oauth-proxy.zhangjun987426926.workers.dev', 

        getToken() { 
            try { 
                const data = JSON.parse(localStorage.getItem(this.STORAGE_KEY)); 
                if (data && data.accessToken && data.expiresAt > Date.now()) {
                    return data.accessToken; 
                } 
                return null; 
            } catch (e) { 
                return null; 
            } 
        },

        saveToken(token, expiresIn) { 
            const tokenData = { 
                accessToken: token, 
                expiresAt: Date.now() + parseInt(expiresIn) * 1000 
            }; 
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(tokenData));
        },

        initiateAuth() { 
            showToast('即将跳转授权页面...', 'info');
            const currentUrl = encodeURIComponent(window.location.href.split('?')[0]);
            setTimeout(() => { 
                window.location.href = `${this.WORKER_URL}/login?return_url=${currentUrl}`;
            }, 1000); 
        },

        handleCallback() { 
            const urlParams = new URLSearchParams(window.location.search);
            const token = urlParams.get('bgm_access_token');
            const expiresIn = urlParams.get('expires_in');
            if (token) {
                this.saveToken(token, expiresIn);
                const cleanUrl = window.location.href.split('?')[0];
                history.replaceState({}, document.title, cleanUrl);
                showToast('授权成功！', 'success');
                return true;
            }
            return false;
        }
    };
    const STATUS_MAP_TO_API = {
        1: 'wish',
        2: 'collect',
        3: 'do',
        4: 'on_hold',
        5: 'dropped'
    };
    const STATUS_LABELS = {
        all:   { 1: '想做', 2: '做过', 3: '在做', 4: '搁置', 5: '抛弃' },
        anime: { 1: '想看', 2: '看过', 3: '在看', 4: '搁置', 5: '抛弃' },
        book:  { 1: '想读', 2: '读过', 3: '在读', 4: '搁置', 5: '抛弃' },
        music: { 1: '想听', 2: '听过', 3: '在听', 4: '搁置', 5: '抛弃' },
        game:  { 1: '想玩', 2: '玩过', 3: '在玩', 4: '搁置', 5: '抛弃' },
        real:  { 1: '想看', 2: '看过', 3: '在看', 4: '搁置', 5: '抛弃' }
    };
    let accessToken = '';
    let catalogId = '';
    let sessionLogHistory = [];
    const detectPageSubjectType = () => {
        const urlParams = new URLSearchParams(window.location.search);
        const cat = urlParams.get('cat');
        const path = window.location.pathname;
        const catMap = {
            '1': 'book',
            '2': 'anime',
            '3': 'music',
            '4': 'game',
            '6': 'real'
        };

        if (cat && catMap[cat]) return catMap[cat];
        const activeNav = document.querySelector('#user_nav .focus a, #headerProfile .focus');
        if (activeNav) {
            const navText = activeNav.textContent.trim();
            if (navText.includes('全部') || navText.includes('收藏')) return 'all';
            if (navText.includes('动画')) return 'anime';
            if (navText.includes('书籍')) return 'book';
            if (navText.includes('音乐')) return 'music';
            if (navText.includes('游戏')) return 'game';
            if (navText.includes('三次元')) return 'real';
        }

        if (path.startsWith('/index/') || /\/user\/[^\/]+\/collect\/?$/.test(path)) return 'all';
        if (path.includes('/book')) return 'book';
        if (path.includes('/anime')) return 'anime';
        if (path.includes('/music')) return 'music';
        if (path.includes('/game')) return 'game';
        if (path.includes('/real')) return 'real';

        return 'all';
    };

    const getCurrentCatalogId = () => {
        const match = window.location.pathname.match(/\/index\/(\d+)/);
        return match ? match[1] : null;
    };

    function showToast(message, type = 'info', duration = 3500) {
        const colors = {
            success: '#4CAF50',
            error: '#f44336',
            info: '#2196F3',
            warning: '#FF9800'
        };
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed; top: 20px; right: 20px; z-index: 10004;
            background: ${colors[type] || '#323232'}; color: white;
            padding: 12px 18px; border-radius: 6px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15); font-size: 14px;
            animation: slideInRight 0.3s ease;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.animation = 'slideOutRight 0.3s ease forwards';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    function showLogToast(message) {
        const logToast = document.createElement('div');
        logToast.style.cssText = `
            position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
            z-index: 10005; background: #323232; color: white;
            padding: 10px 16px; border-radius: 6px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2); font-size: 13px;
            animation: fadeInDown 0.3s ease;
        `;
        logToast.innerHTML = message;
        document.body.appendChild(logToast);
        setTimeout(() => {
            logToast.style.animation = 'fadeOutUp 0.3s ease forwards';
            setTimeout(() => logToast.remove(), 300);
        }, 2000);
    }

    function createBatchButton() {
        if (document.getElementById('bgm-batch-manager-li')) return;
        const dockUl = document.querySelector("#dock ul");
        if (!dockUl) return;
        const userLink = dockUl.querySelector('a[href*="/user/"]');
        if (!userLink) return;
        const userListItem = userLink.closest('li');
        if (!userListItem) return;
        const newListItem = document.createElement('li');
        newListItem.id = 'bgm-batch-manager-li';
        const buttonLink = document.createElement('a');
        buttonLink.href = "javascript:void(0);";
        buttonLink.textContent = '批量管理';
        buttonLink.onclick = handleBatchButtonClick;
        newListItem.appendChild(buttonLink);
        dockUl.insertBefore(newListItem, userListItem);
    }

    async function handleBatchButtonClick() {
        catalogId = getCurrentCatalogId();
        accessToken = AuthManager.getToken();
        if (!accessToken) {
            AuthManager.initiateAuth();
            return;
        }
       if (window._bgmBatchPanelCache) {
           window._bgmBatchPanelCache.style.display = 'flex';
           return;
        }
        showBatchPanel();
    }

    function createModal(content, id = 'bgm-batch-modal', zIndex = 10001) {
        const modal = document.createElement('div');
        modal.id = id;
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.6); z-index: ${zIndex};
            display: flex; align-items: center; justify-content: center;
            animation: fadeIn 0.2s ease;
        `;
        modal.innerHTML = content;
        document.body.appendChild(modal);
        return modal;
    }

    function closeModal(modalId = 'bgm-batch-modal') {
        const modal = document.getElementById(modalId);
        if (modal) modal.remove();
    }

    async function showBatchPanel() {
        if (!window._bgmBatchPanelCache) {
            sessionLogHistory = [];
         }
        const items = getPageItems();
        if (items.length === 0) {
            showToast('当前页面没有找到可操作的条目', 'warning');
            return;
        }
        const subjectType = detectPageSubjectType();
        const labels = STATUS_LABELS[subjectType] || STATUS_LABELS.all;
        const removeFromCatalogButtonHTML = catalogId
            ? `<button class="bgm-panel-btn-warning" id="batchRemoveFromCatalogBtn">从当前目录删除</button>`
            : '';
        const itemsWithDisplayData = items.map(item => ({
            ...item,
            isCollected: !!item.currentStatus,
            displayStatus: item.currentStatus ? `当前: ${item.currentStatus}` : '当前: 未收藏'
        }));
        const modalHtml = `
            <div class="bgm-batch-panel is-resizable">
                <div class="panel-header">
                    <h2>批量管理 (共 ${items.length} 个条目)</h2>
                    <button id="showLogBtn" class="bgm-panel-btn-text">操作日志</button>
                   <span id="bgm-minimize-btn" class="bgm-panel-btn-text">—</span>
                    <span class="bgm-batch-close-btn">&times;</span>
                </div>
                <div class="panel-body">
                    <div class="search-bar-wrapper">
                        <input type="search" id="itemSearch" placeholder="搜索列表中的条目..." />
                    </div>
                    
                    <div class="panel-controls">
                        <label style="margin: 0; white-space: nowrap;">
                            <input type="checkbox" id="selectAllItems"> 全选
                            (已选: <span id="selectedCount">0</span>)
                        </label>
                        <button id="collectionFilterBtn" class="bgm-panel-btn">显示已/未收藏</button>
                        <button id="showFilterBtn" class="bgm-panel-btn">显示已/未勾选</button>
                    </div>
                    
                    <div id="itemsList">
                        ${itemsWithDisplayData.map(item => `
                            <div class="list-item" data-is-collected="${item.isCollected}">
                                <input type="checkbox" class="item-select" data-subject-id="${item.subjectId}">
                                <div class="item-info">
                                    <div class="item-title">${item.title}</div>
                                    <div class="item-meta">ID: ${item.subjectId} | ${item.displayStatus}</div>
                                </div>
                            </div>
                        `).join('')}
                    </div>

                    <div class="panel-actions-row">
                        <button class="bgm-panel-btn" data-type="1">${labels[1]}</button>
                        <button class="bgm-panel-btn" data-type="2">${labels[2]}</button>
                        <button class="bgm-panel-btn" data-type="3">${labels[3]}</button>
                        <button class="bgm-panel-btn" data-type="4">${labels[4]}</button>
                        <button class="bgm-panel-btn" data-type="5">${labels[5]}</button>
                        <button class="bgm-panel-btn-primary" id="addToCatalogBtn">加入目录</button>
                    </div>
                    <div class="action-buttons">
                        <button class="bgm-panel-btn-danger" id="batchDeleteBtn">从收藏中删除</button>
                        ${removeFromCatalogButtonHTML}
                    </div>
                </div>
            </div>
        `;
        const modal = createModal(modalHtml);
        const panel = modal.querySelector('.bgm-batch-panel');
        modal.querySelector('#bgm-minimize-btn').onclick = () => {
                modal.style.display = 'none';
                window._bgmBatchPanelCache = modal; 
        };
        const allListItems = modal.querySelectorAll('.list-item');
        const itemSearch = modal.querySelector('#itemSearch');
        const collectionFilterBtn = modal.querySelector('#collectionFilterBtn');
        const showFilterBtn = modal.querySelector('#showFilterBtn');
        let collectionState = 0; // 0:无 1:仅已收藏 2:仅未收藏
        let showState = 0;       // 0:无 1:仅已勾选 2:仅未勾选
        const collectionLabels = ['显示已/未收藏', '显示已收藏 ✔', '显示未收藏 ✘'];
        const showLabels = ['显示已/未勾选', '显示已勾选 ✔', '显示未勾选 ✘'];
        const updateSelectedCount = () => {
            const checkedNum = modal.querySelectorAll('.item-select:checked').length;
            modal.querySelector('#selectedCount').textContent = checkedNum;
        };

        const applyFilters = () => {
            const searchTerm = itemSearch.value.toLowerCase();
            allListItems.forEach(item => {
                const checkbox = item.querySelector('.item-select');
                const title = item.querySelector('.item-title').textContent.toLowerCase();
                let isVisible = true;
                if (searchTerm && !title.includes(searchTerm)) {
                    isVisible = false;
                }

                if (collectionState === 1 && item.dataset.isCollected !== 'true') {
                    isVisible = false;
                } else if (collectionState === 2 && item.dataset.isCollected !== 'false') {
                    isVisible = false;
                }

                if (showState === 1 && !checkbox.checked) {
                    isVisible = false;
                } else if (showState === 2 && checkbox.checked) {
                    isVisible = false;
                }
                item.style.display = isVisible ? 'flex' : 'none';
            });
        };

        modal.querySelector('.bgm-batch-close-btn').onclick = () => {
               window._bgmBatchPanelCache = null; 
               closeModal();
        };
        modal.onclick = (e) => {
            if (e.target === modal) closeModal();
        };
        modal.querySelector('#showLogBtn').onclick = showLogPanel;
        itemSearch.oninput = applyFilters;
        collectionFilterBtn.onclick = () => {
            collectionState = (collectionState + 1) % 3;
            collectionFilterBtn.textContent = collectionLabels[collectionState];
            applyFilters();
        };
        showFilterBtn.onclick = () => {
            showState = (showState + 1) % 3;
            showFilterBtn.textContent = showLabels[showState];
            applyFilters();
        };
        modal.querySelectorAll('.item-select').forEach(cb => {
            cb.onchange = () => {
                updateSelectedCount();
                applyFilters();
            };
        });
        modal.querySelector('#selectAllItems').onchange = (e) => {
            const isChecked = e.target.checked;
            allListItems.forEach(item => {
                if (item.style.display !== 'none') {
                    item.querySelector('.item-select').checked = isChecked;
                }
            });
            updateSelectedCount();
            applyFilters();
        };
        modal.querySelectorAll('.panel-actions-row > button[data-type]').forEach(btn => {
            btn.onclick = () => performBatchUpdate(parseInt(btn.dataset.type));
        });
        modal.querySelector('#batchDeleteBtn').onclick = performBatchDelete;
        if (catalogId) {
            modal.querySelector('#batchRemoveFromCatalogBtn').onclick = performBatchRemoveFromCatalog;
        }
        modal.querySelector('#addToCatalogBtn').onclick = handleAddToCatalogClick;
    }

    function showLogPanel() {
        const logContent = sessionLogHistory.length > 0
            ? sessionLogHistory.map(log => `<div>${log}</div>`).join('')
            : '<p style="text-align: center; color: var(--text-secondary);">暂无操作日志</p>';

        const modalHtml = `
            <div class="bgm-batch-panel" style="max-width: 600px; max-height: 80vh;">
                <div class="panel-header">
                    <h2>操作日志</h2>
                    <span class="bgm-batch-close-btn">&times;</span>
                </div>
                <div class="panel-body" id="log-panel-body">
                    ${logContent}
                </div>
            </div>
        `;
        const modal = createModal(modalHtml, 'bgm-log-modal', 10002);
        modal.querySelector('.bgm-batch-close-btn').onclick = () => closeModal('bgm-log-modal');
        modal.onclick = (e) => {
            if (e.target === modal) closeModal('bgm-log-modal');
        };
    }

    function updateItemInPanel(subjectId, newStatus) {
        const itemElement = document.querySelector(`.item-select[data-subject-id="${subjectId}"]`);
        if (!itemElement) return;
        const listItem = itemElement.closest('.list-item');
        if (!listItem) return;
        if (newStatus.deleted) {
            listItem.style.opacity = '0.5';
            listItem.style.backgroundColor = 'var(--bg-secondary)';
            itemElement.checked = false;
            const metaElement = listItem.querySelector('.item-meta');
            if (metaElement) metaElement.textContent = `ID: ${subjectId} | 已从收藏中删除`;
        } else if (newStatus.removed) {
            listItem.style.opacity = '0.5';
            listItem.style.backgroundColor = 'var(--bg-secondary)';
            itemElement.checked = false;
        } else {
            const metaElement = listItem.querySelector('.item-meta');
            if (metaElement) metaElement.textContent = `ID: ${subjectId} | 当前: ${newStatus.text}`;
            listItem.dataset.isCollected = "true";
        }
    }

    function getPageItems() {
        const items = [];
        const mainItemSelectors = [
            '.item',
            '.subject_line',
            '.browserList > li',
            '#browserItemList .item',
            'li[id^="item_"]'
        ];
        let elements = [];
        for (const selector of mainItemSelectors) {
            elements = document.querySelectorAll(selector);
            if (elements.length > 0) break;
        }
        const validStatusKeywords = [
            '看过', '听过', '玩过', '读过',
            '在看', '在听', '在玩', '在读',
            '想看', '想听', '想玩', '想读',
            '搁置', '抛弃'
        ];
        elements.forEach(el => {
            let subjectId = '';
            let title = '';
            let currentStatus = '';
            const titleLink = el.querySelector('h3 a[href*="/subject/"], a.l[href*="/subject/"]');
            if (titleLink) {
                title = titleLink.textContent.trim();
                const match = titleLink.href.match(/\/subject\/(\d+)/);
                if (match) subjectId = match[1];
            } else {
                const anySubjectLink = el.querySelector('a[href*="/subject/"]');
                if (anySubjectLink) {
                    const match = anySubjectLink.href.match(/\/subject\/(\d+)/);
                    if (match) subjectId = match[1];
                    const titleEl = el.querySelector('h3, .l, .name');
                    if (titleEl) title = titleEl.textContent.trim();
                }
            }
            if (!subjectId || !title) return;
            const statusSelectors = [
                '.collectControl .tip',
                '.tip_i',
                '.collect_box .tip',
                '.collectHint',
                '.collect_box .grey',
                '.grey'
            ];
            for (const selector of statusSelectors) {
                const statusEl = el.querySelector(selector);
                if (statusEl) {
                    let potentialStatus = statusEl.textContent.trim().split('|')[0].trim();
                    if (potentialStatus.includes('收藏')) continue;
                    if (validStatusKeywords.some(keyword => potentialStatus.includes(keyword))) {
                        currentStatus = potentialStatus;
                        break;
                    }
                }
            }
            items.push({ subjectId, title, currentStatus });
        });
        return items;
    }

    async function performBatchOperation(selectedIds, operationFn) {
        sessionLogHistory = [];

        const addLog = (msg) => {
            const timeStampedMsg = `[${new Date().toLocaleTimeString()}] ${msg}`;
            sessionLogHistory.push(timeStampedMsg);
            showLogToast(msg);
        };
        let successCount = 0;
        let failCount = 0;
        for (const subjectId of selectedIds) {
            try {
                await operationFn(subjectId);
                successCount++;
                addLog(`✅ ID: ${subjectId} 操作成功`);
            } catch (error) {
                failCount++;
                addLog(`❌ ID: ${subjectId} 操作失败: ${error.message}`);
            }
            await new Promise(r => setTimeout(r, 250));
        }
        const summaryMsg = `🎉 操作完成！成功: ${successCount}, 失败: ${failCount}`;
        showToast(summaryMsg, failCount > 0 ? 'warning' : 'success');
        sessionLogHistory.push(`[${new Date().toLocaleTimeString()}] ${summaryMsg}`);
    }

    async function performBatchUpdate(typeNumber) {
        const selectedIds = Array.from(document.querySelectorAll('.item-select:checked'))
            .map(cb => cb.dataset.subjectId);

        if (selectedIds.length === 0) {
            showToast('请先选择条目', 'warning');
            return;
        }

        const labels = STATUS_LABELS[detectPageSubjectType()] || STATUS_LABELS.all;
        const statusText = labels[typeNumber];
        const confirmTip = `确定要将 ${selectedIds.length} 个条目标记为 "${statusText}" 吗？
此操作会修改已收藏条目的状态，并为未收藏的条目创建新的收藏记录。`;
        if (!confirm(confirmTip)) return;
        const successfulIds = [];
        await performBatchOperation(selectedIds, async (subjectId) => {
            const apiUrl = `https://api.bgm.tv/v0/users/-/collections/${subjectId}`;
            const requestBody = { type: typeNumber };
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                try {
                    const errorData = await response.json();
                    throw new Error(errorData.description || `HTTP ${response.status}`);
                } catch (e) {
                    throw new Error(`HTTP ${response.status}`);
                }
            }
            successfulIds.push(subjectId);
        });
        successfulIds.forEach(id => updateItemInPanel(id, { text: statusText }));
    }

    async function performBatchDelete() {
        const allItems = getPageItems();
        const selectedCheckboxes = document.querySelectorAll('.item-select:checked');

        if (selectedCheckboxes.length === 0) {
            showToast('请先选择条目', 'warning');
            return;
        }
        const collectedItems = Array.from(selectedCheckboxes)
            .map(cb => allItems.find(i => i.subjectId === cb.dataset.subjectId))
            .filter(item => item && item.currentStatus);
        if (collectedItems.length === 0) {
            showToast('您选择的条目均未收藏，无法从收藏中删除', 'warning');
            return;
        }
        const anyDeleteLink = document.querySelector('a[onclick*="eraseSubjectCollect"]');
        if (!anyDeleteLink) {
            showToast('错误：无法在页面上找到删除操作所需的验证信息。', 'error');
            return;
        }
        const match = anyDeleteLink.getAttribute('onclick').match(/eraseSubjectCollect\(\d+,\s*'([^']+)'\)/);
        if (!match || !match[1]) {
            showToast('错误：解析删除验证信息失败。', 'error');
            return;
        }
        const formhash = match[1];
        const confirmTip = `在您选择的条目中，有 ${collectedItems.length} 个已收藏条目将被删除。此操作无法撤销！`;
        if (!confirm(confirmTip)) return;
        const originalConfirm = window.confirm;
        window.confirm = () => true; 
        sessionLogHistory = [];
        const addLog = (msg) => {
            const timeStampedMsg = `[${new Date().toLocaleTimeString()}] ${msg}`;
            sessionLogHistory.push(timeStampedMsg);
            showLogToast(msg);
        };
        let successCount = 0;
        addLog(`开始批量删除操作 (共 ${collectedItems.length} 个)...`);
        for (const item of collectedItems) {
            try {
                if (typeof eraseSubjectCollect === 'function') {
                    eraseSubjectCollect(item.subjectId, formhash);
                    const pageItemEl = document.querySelector(`#item_${item.subjectId}`);
                    if (pageItemEl) pageItemEl.style.opacity = '0.3';
                    updateItemInPanel(item.subjectId, { deleted: true });
                    addLog(`✅ ID: ${item.subjectId} 删除指令已发送`);
                    successCount++;
                } else {
                    throw new Error('内置删除函数不可用');
                }
            } catch (error) {
                addLog(`❌ ID: ${item.subjectId} 操作失败: ${error.message}`);
            }
            await new Promise(r => setTimeout(r, 300));
        }
        window.confirm = originalConfirm;
        const summaryMsg = `操作完成！共发送 ${successCount} 条删除指令。`;
        showToast(summaryMsg, 'success');
        sessionLogHistory.push(`[${new Date().toLocaleTimeString()}] ${summaryMsg}`);
    }

    async function performBatchRemoveFromCatalog() {
        const selectedIds = Array.from(document.querySelectorAll('.item-select:checked'))
            .map(cb => cb.dataset.subjectId);
        if (selectedIds.length === 0) {
            showToast('请先选择条目', 'warning');
            return;
        }
        const confirmTip = `确定要从这个目录中移除这 ${selectedIds.length} 个条目吗？
注意：此操作无法撤销，且您必须是该目录的创建者才能成功。`;
        if (!confirm(confirmTip)) return;
        const successfulIds = [];
        await performBatchOperation(selectedIds, async (subjectId) => {
            const apiUrl = `https://api.bgm.tv/v0/indices/${catalogId}/subjects/${subjectId}`;
            const response = await fetch(apiUrl, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });
            if (!response.ok) {
                if (response.status === 403) throw new Error('权限不足 (非目录创建者)');
                throw new Error(`HTTP ${response.status}`);
            }
            successfulIds.push(subjectId);
        });
        successfulIds.forEach(id => updateItemInPanel(id, { removed: true }));
    }

    function handleAddToCatalogClick() {
        const selectedIds = Array.from(document.querySelectorAll('.item-select:checked'))
            .map(cb => cb.dataset.subjectId);
        if (selectedIds.length === 0) {
            showToast('请先选择要加入目录的条目', 'warning');
            return;
        }
        showCatalogActionChoicePanel();
    }

    function showCatalogActionChoicePanel() {
        const modalHtml = `
            <div class="bgm-batch-panel" style="max-width: 400px;">
                <div class="panel-header">
                    <h2>加入目录</h2>
                    <span class="bgm-batch-close-btn">&times;</span>
                </div>
                <div class="panel-body">
                    <p style="text-align: center; margin-bottom: 20px;">请选择您的操作：</p>
                    <div class="action-buttons">
                        <button id="choice-add-existing" class="bgm-panel-btn">加入已有目录</button>
                        <button id="choice-create-new" class="bgm-panel-btn-primary">＋ 创建新目录</button>
                    </div>
                </div>
            </div>
        `;
        const modal = createModal(modalHtml, 'bgm-catalog-choice-modal', 10002);
        modal.querySelector('.bgm-batch-close-btn').onclick = () => closeModal('bgm-catalog-choice-modal');
        modal.querySelector('#choice-add-existing').onclick = () => {
            closeModal('bgm-catalog-choice-modal');
            handleAddToExistingCatalog();
        };
        modal.querySelector('#choice-create-new').onclick = () => {
            closeModal('bgm-catalog-choice-modal');
            handleCreateCatalogAndAdd();
        };
    }

    async function handleAddToExistingCatalog() {
        const input = prompt("请输入目标目录的ID或完整网址:", "");
        if (input === null) return;

        let targetCatalogId = null;
        const urlMatch = input.trim().match(/\/index\/(\d+)/);
        if (urlMatch && urlMatch[1]) {
            targetCatalogId = urlMatch[1];
        } else if (/^\d+$/.test(input.trim())) {
            targetCatalogId = input.trim();
        }
        if (targetCatalogId) {
            await performBatchAddToCatalog(targetCatalogId);
        } else {
            showToast('输入的ID或网址无效', 'error');
        }
    }

    async function handleCreateCatalogAndAdd() {
        const newTitle = prompt('请输入新目录的标题:');
        if (!newTitle || newTitle.trim() === '') {
            showToast('目录标题不能为空', 'warning');
            return;
        }
        showToast('正在创建新目录...', 'info');
        try {
            const response = await fetch('https://api.bgm.tv/v0/indices', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ title: newTitle.trim() })
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.description || err.title || `HTTP ${response.status}`);
            }
            const newCatalog = await response.json();
            showToast(`目录《${newCatalog.title}》创建成功！`, 'success');
            await performBatchAddToCatalog(newCatalog.id);
        } catch (error) {
            showToast(`创建目录失败: ${error.message}`, 'error');
            console.error('[BGM批量管理] 创建目录失败:', error);
        }
    }

    async function performBatchAddToCatalog(targetCatalogId) {
        const selectedIds = Array.from(document.querySelectorAll('.item-select:checked'))
            .map(cb => cb.dataset.subjectId);
        if (selectedIds.length === 0) return;
        showToast(`准备将 ${selectedIds.length} 个条目加入目录 #${targetCatalogId}...`, 'info');
        await performBatchOperation(selectedIds, async (subjectId) => {
            const apiUrl = `https://api.bgm.tv/v0/indices/${targetCatalogId}/subjects`;
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ subject_id: parseInt(subjectId) })
            });
            if (!response.ok) {
                if (response.status === 409) throw new Error('条目已存在');
                if (response.status === 403) throw new Error('权限不足 (非目录创建者)');
                const err = await response.json();
                throw new Error(err.description || `HTTP ${response.status}`);
            }
        });
    }

    function addGlobalStyles() {
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideInRight{from{transform:translateX(100%)}to{transform:translateX(0)}}
            @keyframes slideOutRight{from{transform:translateX(0)}to{transform:translateX(100%)}}
            @keyframes fadeIn{from{opacity:0}to{opacity:1}}
            @keyframes fadeInDown{from{opacity:0;transform:translate(-50%,-20px)}to{opacity:1;transform:translate(-50%,0)}}
            @keyframes fadeOutUp{from{opacity:1;transform:translate(-50%,0)}to{opacity:0;transform:translate(-50%,-20px)}}

            .bgm-batch-panel {
                --bg-primary: #fff;
                --bg-secondary: #f8f9fa;
                --text-primary: #333;
                --text-secondary: #888;
                --text-light: #fff;
                --border-primary: #e0e0e0;
                --border-secondary: #f0f0f0;
                --btn-bg: #fff;
                --btn-border: #ccc;
                --btn-text: #333;
                --btn-hover-bg: #f5f5f5;
                --btn-primary-bg: #E8F5E9;
                --btn-primary-border: #A5D6A7;
                --btn-primary-text: #1B5E20;
                --btn-primary-hover-bg: #C8E6C9;
                --btn-danger-bg: #FBE9E7;
                --btn-danger-border: #FFCCBC;
                --btn-danger-text: #c62828;
                --btn-danger-hover-bg: #FFCCBC;
                --btn-warning-bg: #FFF3E0;
                --btn-warning-border: #FFE0B2;
                --btn-warning-text: #E65100;
                --btn-warning-hover-bg: #FFE0B2;

                background: var(--bg-primary);
                border-radius: 6px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                max-width: 680px;
                width: 90vw;
                max-height: 95vh;
                overflow: hidden;
                display: flex;
                flex-direction: column;
            }

            .bgm-batch-panel.is-resizable {
                width: 680px;
                height: 650px;
                max-width: 95vw;
                max-height: 95vh;
                min-width: 480px;
                min-height: 420px;
                resize: both;
            }
            .bgm-batch-panel.is-resizable .panel-body {
                display: flex;
                flex-direction: column;
                overflow: hidden;     
            }
            .bgm-batch-panel.is-resizable .action-buttons {
                margin-top: 0;        
            }

            html.chii_night .bgm-batch-panel,
            html[data-theme="dark"] .bgm-batch-panel { 
                --bg-primary: #282828;
                --bg-secondary: #222;
                --text-primary: #eee;
                --text-secondary: #999;
                --border-primary: #444;
                --border-secondary: #444;
                --btn-bg: #444;
                --btn-border: #666;
                --btn-text: #ddd;
                --btn-hover-bg: #555;
                --btn-primary-bg: transparent;
                --btn-primary-border: #5a955a;
                --btn-primary-text: #a5d6a7;
                --btn-primary-hover-bg: #5a955a;
                --btn-danger-bg: transparent;
                --btn-danger-border: #a04040;
                --btn-danger-text: #e57373;
                --btn-danger-hover-bg: #a04040;
                --btn-warning-bg: transparent;
                --btn-warning-border: #b08040;
                --btn-warning-text: #ffcc80;
                --btn-warning-hover-bg: #b08040; 
            }

            .panel-controls {
                display: flex;
                gap: 10px;
                align-items: center;
                margin-bottom: 10px;
                flex-wrap: wrap;
            }
            .panel-controls .bgm-panel-btn {
                padding: 4px 8px;
                font-size: 12px;
            }
            .panel-header, .panel-body {
                padding: 15px 20px;
            }
            .panel-header {
                display: flex;
                align-items: center;
                border-bottom: 1px solid var(--border-primary);
                position: relative;
            }
            .panel-header h2 {
                font-size: 18px;
                color: var(--text-primary);
                margin: 0;
                font-weight: 500;
                flex-grow: 1;
            }
            .bgm-batch-close-btn {
                font-size: 26px;
                line-height: 1;
                font-weight: bold;
                color: var(--text-secondary);
                cursor: pointer;
                transition: color 0.2s ease;
                padding: 5px;
                margin-left: 10px;
            }
            .bgm-batch-close-btn:hover {
                color: var(--text-primary);
            }
            .panel-body {
                overflow-y: auto;
                flex: 1;
                color: var(--text-primary);
            }
            .panel-body label {
                cursor: pointer;
            }
            .search-bar-wrapper {
                margin-bottom: 10px;
            }
            #itemSearch {
                width: 100%;
                box-sizing: border-box;
                padding: 8px;
                border-radius: 4px;
                border: 1px solid var(--border-primary);
                background: var(--bg-primary);
                color: var(--text-primary);
            }
            #itemsList {
                flex: 1; 
                min-height: 150px;
                overflow-y: auto;
                border: 1px solid var(--border-primary);
                border-radius: 4px;
            }
            .list-item {
                padding: 10px 12px;
                border-bottom: 1px solid var(--border-secondary);
                display: flex;
                align-items: center;
            }
            .list-item:last-child {
                border-bottom: none;
            }
            .item-select {
                margin-right: 12px;
            }
            .item-title {
                font-weight: 500;
                font-size: 14px;
                color: var(--text-primary);
            }
            .item-meta {
                color: var(--text-secondary);
                font-size: 12px;
                margin-top: 4px;
            }
            .panel-actions-row {
                display: flex;
                gap: 10px;
                margin: 15px 0;
            }
            .panel-actions-row > button {
                flex: 1;
            }
            .action-buttons {
                display: flex;
                gap: 10px;
                margin-top: 15px;
            }
            .action-buttons > button {
                flex: 1;
            }
            .bgm-panel-btn,
            .bgm-panel-btn-primary,
            .bgm-panel-btn-danger,
            .bgm-panel-btn-warning {
                padding: 8px 12px;
                border-radius: 4px;
                cursor: pointer;
                transition: all .2s ease;
                font-size: 13px;
                border-style: solid;
                border-width: 1px;
            }
            .bgm-panel-btn {
                background: var(--btn-bg);
                border-color: var(--btn-border);
                color: var(--btn-text);
            }
            .bgm-panel-btn:hover {
                background: var(--btn-hover-bg);
            }
            .bgm-panel-btn-text {
                border: none;
                background: transparent;
                color: var(--text-secondary);
                font-size: 13px;
                padding: 5px 10px;
                white-space: nowrap;
            }
            .bgm-panel-btn-text:hover {
                color: var(--text-primary);
                text-decoration: underline;
            }
            .bgm-panel-btn-primary {
                background: var(--btn-primary-bg);
                border-color: var(--btn-primary-border);
                color: var(--btn-primary-text);
            }
            .bgm-panel-btn-primary:hover {
                background: var(--btn-primary-hover-bg);
            }
            .bgm-panel-btn-danger {
                background: var(--btn-danger-bg);
                border-color: var(--btn-danger-border);
                color: var(--btn-danger-text);
            }
            .bgm-panel-btn-danger:hover {
                background: var(--btn-danger-hover-bg);
                color: var(--text-light);
            }
            .bgm-panel-btn-warning {
                background: var(--btn-warning-bg);
                border-color: var(--btn-warning-border);
                color: var(--btn-warning-text);
            }
            .bgm-panel-btn-warning:hover {
                background: var(--btn-warning-hover-bg);
                color: var(--text-light);
            }
            #log-panel-body {
                font-family: monospace;
                font-size: 12px;
                color: var(--text-secondary);
                white-space: pre-wrap;
                word-break: break-all;
            }

        `;
        document.head.appendChild(style);
    }

    function initScript() {
        if (AuthManager.handleCallback()) return;
        addGlobalStyles();
        setTimeout(createBatchButton, 1000);
    }
    initScript();
})();
