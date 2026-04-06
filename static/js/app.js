// ==================== 全局状态 ====================
const state = {
    currentPage: 'chat',
    currentSession: null,
    sessions: [],
    providers: [],
    currentProviderId: null,
    enableTools: true,
    isSending: false,
    logs: []
};

// ==================== 工具函数 ====================

function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

function showToast(message, type = 'info') {
    const container = $('#toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function showModal(id) { $(`#${id}`).classList.add('active'); }
function closeModal(id) { $(`#${id}`).classList.remove('active'); }

async function api(method, url, data = null) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (data) opts.body = JSON.stringify(data);
    const resp = await fetch(url, opts);
    return resp.json();
}

function togglePassword(inputId, btn) {
    const input = $(`#${inputId}`);
    if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = '🔒';
    } else {
        input.type = 'password';
        btn.textContent = '👁';
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatMessage(text) {
    // 简单的 Markdown 渲染
    let html = escapeHtml(text);
    // 代码块
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
    // 行内代码
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    // 粗体
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // 换行
    html = html.replace(/\n/g, '<br>');
    return html;
}

// ==================== 页面切换 ====================

function switchPage(page) {
    state.currentPage = page;
    $$('.page').forEach(p => p.classList.remove('active'));
    $(`#page-${page}`).classList.add('active');
    $$('.nav-item').forEach(n => n.classList.remove('active'));
    $(`.nav-item[data-page="${page}"]`).classList.add('active');

    // 加载页面数据
    if (page === 'providers') loadProviders();
    if (page === 'prompts') loadPrompts();
    if (page === 'logs') startLogStream();
    if (page === 'settings') loadSettings();
}

// ==================== 提供商管理 ====================

async function loadProviders() {
    const data = await api('GET', '/api/providers');
    state.providers = data.providers;
    state.currentProviderId = data.current_id;
    renderProviders();
    updateChatModelSelector();
}

function renderProviders() {
    const grid = $('#providersGrid');
    if (!state.providers.length) {
        grid.innerHTML = '<div class="empty-state"><div class="empty-icon">🔌</div><p>暂无提供商，请添加</p></div>';
        return;
    }

    grid.innerHTML = state.providers.map(p => {
        const isActive = p.id === state.currentProviderId;
        const hasKey = p.api_key && p.api_key.length > 0;
        const models = p.models || [];

        return `
        <div class="provider-card ${isActive ? 'active' : ''}">
            <div class="provider-card-header">
                <div class="provider-name">
                    ${escapeHtml(p.name)}
                    ${p.is_builtin ? '<span class="badge badge-blue">内置</span>' : '<span class="badge badge-yellow">自定义</span>'}
                    ${isActive ? '<span class="badge badge-green">使用中</span>' : ''}
                </div>
            </div>
            <div class="provider-key-status">
                API Key: ${hasKey ? '已配置 (' + p.api_key.substring(0, 6) + '...)' : '<span style="color:var(--red)">未配置</span>'}
            </div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:6px;word-break:break-all;">
                ${escapeHtml(p.base_url)}
            </div>
            ${models.length ? `
            <div class="provider-models">
                ${models.map(m => `<span class="provider-model-tag">${escapeHtml(m.name || m.id)}</span>`).join('')}
            </div>` : ''}
            <div class="provider-actions">
                ${!isActive ? `<button class="btn btn-sm btn-success" onclick="activateProvider(${p.id})">激活</button>` : ''}
                <button class="btn btn-sm" onclick="showApiKeyModal(${p.id}, '${escapeHtml(p.name)}')">🔑 设置密钥</button>
                <button class="btn btn-sm" onclick="testProvider(${p.id})">测试连接</button>
                ${!p.is_builtin ? `
                <button class="btn btn-sm" onclick="editProvider(${p.id})">编辑</button>
                <button class="btn btn-sm btn-danger" onclick="deleteProvider(${p.id})">删除</button>` : ''}
            </div>
        </div>`;
    }).join('');
}

async function activateProvider(id) {
    await api('POST', `/api/providers/${id}/activate`);
    showToast('已切换提供商', 'success');
    loadProviders();
}

async function testProvider(id) {
    showToast('正在测试连接...', 'info');
    const result = await api('POST', `/api/providers/${id}/test`);
    if (result.success) {
        showToast('连接成功！', 'success');
    } else {
        showToast(`连接失败: ${result.error}`, 'error');
    }
}

function showAddProviderModal() {
    $('#editProviderId').value = '';
    $('#providerName').value = '';
    $('#providerBaseUrl').value = '';
    $('#providerApiKey').value = '';
    $('#providerModels').value = '';
    $('#providerModalTitle').textContent = '添加自定义提供商';
    showModal('providerModal');
}

async function editProvider(id) {
    const p = state.providers.find(x => x.id === id);
    if (!p) return;
    $('#editProviderId').value = id;
    $('#providerName').value = p.name;
    $('#providerBaseUrl').value = p.base_url;
    $('#providerApiKey').value = p.api_key || '';
    $('#providerModels').value = (p.models || []).map(m => m.id).join('\n');
    $('#providerModalTitle').textContent = '编辑提供商';
    showModal('providerModal');
}

async function saveProvider() {
    const id = $('#editProviderId').value;
    const name = $('#providerName').value.trim();
    const base_url = $('#providerBaseUrl').value.trim();
    const api_key = $('#providerApiKey').value.trim();
    const modelsText = $('#providerModels').value.trim();

    if (!name || !base_url) {
        showToast('名称和 API 地址不能为空', 'error');
        return;
    }

    const models = modelsText.split('\n').filter(m => m.trim()).map(m => ({ id: m.trim(), name: m.trim(), type: 'chat' }));

    if (id) {
        const data = { name, base_url };
        if (api_key) data.api_key = api_key;
        if (models.length) data.models = models;
        await api('PUT', `/api/providers/${id}`, data);
        showToast('提供商已更新', 'success');
    } else {
        await api('POST', '/api/providers', { name, base_url, api_key, models });
        showToast('提供商已添加', 'success');
    }

    closeModal('providerModal');
    loadProviders();
}

async function deleteProvider(id) {
    if (!confirm('确定删除此提供商？')) return;
    await api('DELETE', `/api/providers/${id}`);
    showToast('已删除', 'success');
    loadProviders();
}

function showApiKeyModal(id, name) {
    const p = state.providers.find(x => x.id === id);
    $('#apiKeyProviderId').value = id;
    $('#apiKeyModalTitle').textContent = `设置 ${name} 的 API Key`;
    $('#apiKeyValue').value = p ? (p.api_key || '') : '';
    showModal('apiKeyModal');
}

async function saveApiKey() {
    const id = $('#apiKeyProviderId').value;
    const api_key = $('#apiKeyValue').value.trim();
    await api('PUT', `/api/providers/${id}`, { api_key });
    showToast('API Key 已保存', 'success');
    closeModal('apiKeyModal');
    loadProviders();
}

// ==================== 聊天功能 ====================

function updateChatModelSelector() {
    const select = $('#chatModel');
    const current = state.providers.find(p => p.id === state.currentProviderId);
    const models = current ? (current.models || []) : [];

    select.innerHTML = models.map(m =>
        `<option value="${escapeHtml(m.id)}">${escapeHtml(m.name || m.id)}</option>`
    ).join('');

    if (!models.length) {
        select.innerHTML = '<option value="">请先配置提供商</option>';
    }
}

async function loadSessions() {
    const data = await api('GET', '/api/sessions');
    state.sessions = data.sessions;
    renderSessions();
}

function renderSessions() {
    const list = $('#sessionsList');
    if (!state.sessions.length) {
        list.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:12px;">暂无对话</div>';
        return;
    }

    list.innerHTML = state.sessions.map(s => `
        <div class="session-item ${state.currentSession === s.id ? 'active' : ''}"
             onclick="selectSession('${s.id}')">
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">
                ${escapeHtml(s.title)}
            </span>
            <span class="session-delete" onclick="event.stopPropagation();deleteSession('${s.id}')">✕</span>
        </div>
    `).join('');
}

async function createSession() {
    const data = await api('POST', '/api/sessions', { title: '新对话' });
    state.currentSession = data.session_id;
    await loadSessions();
    clearChatMessages();
    showToast('新对话已创建', 'success');
}

async function selectSession(id) {
    state.currentSession = id;
    renderSessions();
    await loadMessages();
}

async function deleteSession(id) {
    if (!confirm('确定删除此对话？')) return;
    await api('DELETE', `/api/sessions/${id}`);
    if (state.currentSession === id) {
        state.currentSession = null;
        clearChatMessages();
    }
    await loadSessions();
    showToast('对话已删除', 'success');
}

async function loadMessages() {
    if (!state.currentSession) return;
    const data = await api('GET', `/api/sessions/${state.currentSession}/messages`);
    renderMessages(data.messages);
}

function clearChatMessages() {
    const container = $('#chatMessages');
    container.innerHTML = `
        <div class="chat-welcome" id="chatWelcome">
            <div class="welcome-icon"><img src='/static/logo.jpg' style='width:48px;height:48px;border-radius:12px;object-fit:cover;opacity:0.4;'></div>
            <h3>zyg's agent</h3>
            <p>拥有计算机完全控制权限的 AI 助手。输入消息开始对话。</p>
        </div>`;
}

function renderMessages(messages) {
    const container = $('#chatMessages');
    if (!messages || !messages.length) {
        clearChatMessages();
        return;
    }

    container.innerHTML = messages.map(msg => `
        <div class="message ${msg.role}">
            <div class="message-avatar">${msg.role === 'user' ? '👤' : "<img src='/static/logo.jpg' style='width:26px;height:26px;border-radius:6px;object-fit:cover;'>"}</div>
            <div class="message-content">
                <div class="message-role">${msg.role === 'user' ? '你' : 'AI 助手'}</div>
                <div class="message-text">${formatMessage(msg.content)}</div>
            </div>
        </div>
    `).join('');

    // 滚动到底部
    container.scrollTop = container.scrollHeight;
}

function handleChatKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}

function autoResize(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
}

function toggleToolMode() {
    state.enableTools = !state.enableTools;
    const el = $('#toggleTools');
    el.classList.toggle('active', state.enableTools);
    el.textContent = state.enableTools ? '🔧 工具调用: 开启' : '🔧 工具调用: 关闭';
}

async function sendMessage() {
    const input = $('#chatInput');
    const message = input.value.trim();
    if (!message || state.isSending) return;

    state.isSending = true;
    $('#sendBtn').disabled = true;
    $('#sendBtn').textContent = '发送中...';

    // 如果没有会话，自动创建
    if (!state.currentSession) {
        const data = await api('POST', '/api/sessions', { title: message.substring(0, 20) });
        state.currentSession = data.session_id;
        await loadSessions();
    }

    // 显示用户消息
    appendMessage('user', message);
    input.value = '';
    input.style.height = 'auto';

    // 显示加载
    appendTyping();

    try {
        const model = $('#chatModel').value;
        const result = await api('POST', '/api/chat', {
            message,
            session_id: state.currentSession,
            model,
            enable_tools: state.enableTools
        });

        removeTyping();

        if (result.success) {
            appendMessage('assistant', result.content);
            if (result.tool_rounds > 0) {
                showToast(`执行了 ${result.tool_rounds} 轮工具调用`, 'info');
            }
        } else {
            appendMessage('assistant', `❌ 错误: ${result.error}`);
            showToast(result.error, 'error');
        }
    } catch (err) {
        removeTyping();
        appendMessage('assistant', `❌ 网络错误: ${err.message}`);
    }

    state.isSending = false;
    $('#sendBtn').disabled = false;
    $('#sendBtn').textContent = '发送';
}

function appendMessage(role, content) {
    const container = $('#chatMessages');
    const welcome = $('#chatWelcome');
    if (welcome) welcome.remove();

    const div = document.createElement('div');
    div.className = `message ${role}`;
    div.innerHTML = `
        <div class="message-avatar">${role === 'user' ? '👤' : "<img src='/static/logo.jpg' style='width:26px;height:26px;border-radius:6px;object-fit:cover;'>"}</div>
        <div class="message-content">
            <div class="message-role">${role === 'user' ? '你' : 'AI 助手'}</div>
            <div class="message-text">${formatMessage(content)}</div>
        </div>`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function appendTyping() {
    const container = $('#chatMessages');
    const div = document.createElement('div');
    div.className = 'message assistant';
    div.id = 'typingIndicator';
    div.innerHTML = `
        <div class="message-avatar"><img src='/static/logo.jpg' style='width:26px;height:26px;border-radius:6px;object-fit:cover;'></div>
        <div class="message-content">
            <div class="message-role">AI 助手</div>
            <div class="typing-indicator"><span></span><span></span><span></span></div>
        </div>`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function removeTyping() {
    const el = $('#typingIndicator');
    if (el) el.remove();
}

function saveChatSettings() {
    // 模型选择已通过 select 值在发送时读取
}

// ==================== 提示词管理 ====================

async function loadPrompts() {
    const data = await api('GET', '/api/prompts');
    renderPrompts(data.prompts);
}

function renderPrompts(prompts) {
    const container = $('#promptsList');
    if (!prompts || !prompts.length) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">📝</div><p>暂无提示词</p></div>';
        return;
    }

    container.innerHTML = prompts.map(p => `
        <div class="prompt-card ${p.is_default ? 'default' : ''}">
            <div class="prompt-name">
                ${escapeHtml(p.name)}
                ${p.is_default ? '<span class="badge badge-accent">默认</span>' : ''}
            </div>
            <div class="prompt-preview">${escapeHtml(p.content)}</div>
            <div class="prompt-actions">
                <button class="btn btn-sm" onclick="editPrompt(${p.id})">编辑</button>
                ${!p.is_default ? `<button class="btn btn-sm btn-success" onclick="setDefaultPrompt(${p.id})">设为默认</button>` : ''}
                <button class="btn btn-sm btn-danger" onclick="deletePrompt(${p.id})">删除</button>
            </div>
        </div>
    `).join('');
}

function showAddPromptModal() {
    $('#editPromptId').value = '';
    $('#promptName').value = '';
    $('#promptContent').value = '';
    $('#promptDefault').checked = false;
    $('#promptModalTitle').textContent = '新建提示词';
    showModal('promptModal');
}

async function editPrompt(id) {
    const data = await api('GET', '/api/prompts');
    const p = data.prompts.find(x => x.id === id);
    if (!p) return;
    $('#editPromptId').value = id;
    $('#promptName').value = p.name;
    $('#promptContent').value = p.content;
    $('#promptDefault').checked = !!p.is_default;
    $('#promptModalTitle').textContent = '编辑提示词';
    showModal('promptModal');
}

async function savePrompt() {
    const id = $('#editPromptId').value;
    const name = $('#promptName').value.trim();
    const content = $('#promptContent').value.trim();
    const is_default = $('#promptDefault').checked ? 1 : 0;

    if (!name || !content) {
        showToast('名称和内容不能为空', 'error');
        return;
    }

    if (id) {
        await api('PUT', `/api/prompts/${id}`, { name, content, is_default });
        showToast('提示词已更新', 'success');
    } else {
        await api('POST', '/api/prompts', { name, content, is_default });
        showToast('提示词已创建', 'success');
    }

    closeModal('promptModal');
    loadPrompts();
}

async function setDefaultPrompt(id) {
    await api('PUT', `/api/prompts/${id}`, { is_default: 1 });
    showToast('已设为默认', 'success');
    loadPrompts();
}

async function deletePrompt(id) {
    if (!confirm('确定删除此提示词？')) return;
    await api('DELETE', `/api/prompts/${id}`);
    showToast('已删除', 'success');
    loadPrompts();
}

// ==================== 日志 ====================

let logEventSource = null;

function startLogStream() {
    if (logEventSource) logEventSource.close();

    logEventSource = new EventSource('/api/logs/stream');

    logEventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        appendLog(data.log);
    };

    logEventSource.onerror = () => {
        // 自动重连
    };
}

function stopLogStream() {
    if (logEventSource) {
        logEventSource.close();
        logEventSource = null;
    }
}

function appendLog(logText) {
    const container = $('#logContainer');
    // 清除空状态
    const empty = container.querySelector('.empty-state');
    if (empty) empty.remove();

    const line = document.createElement('div');
    line.className = 'log-line';

    // 解析日志级别颜色
    let levelClass = '';
    if (logText.includes('[OK]')) levelClass = 'log-level-ok';
    else if (logText.includes('[ERROR]')) levelClass = 'log-level-error';
    else if (logText.includes('[WARN]')) levelClass = 'log-level-warn';
    else if (logText.includes('[INFO]')) levelClass = 'log-level-info';

    line.innerHTML = `<span class="${levelClass}">${escapeHtml(logText)}</span>`;
    container.appendChild(line);

    // 限制显示数量
    while (container.children.length > 500) {
        container.removeChild(container.firstChild);
    }

    container.scrollTop = container.scrollHeight;
}

async function refreshLogs() {
    const data = await api('GET', '/api/logs');
    const container = $('#logContainer');
    container.innerHTML = '';
    data.logs.forEach(log => appendLog(log));
}

function clearLogDisplay() {
    const container = $('#logContainer');
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>日志已清空</p></div>';
}

// ==================== 设置 ====================

function loadSettings() {
    $('#pythonVersion').textContent = navigator.userAgent.includes('Windows') ? '请查看服务端' : '-';
    $('#osInfo').textContent = navigator.platform;
    $('#serverAddr').textContent = window.location.origin;
}

async function clearAllChats() {
    if (!confirm('确定清空所有聊天记录？此操作不可撤销！')) return;
    // 获取所有会话并逐个删除
    const data = await api('GET', '/api/sessions');
    for (const s of data.sessions) {
        await api('DELETE', `/api/sessions/${s.id}`);
    }
    state.currentSession = null;
    clearChatMessages();
    await loadSessions();
    showToast('所有聊天记录已清空', 'success');
}

async function resetProviders() {
    if (!confirm('确定重置所有提供商配置？这将清除所有 API Key！')) return;
    showToast('请手动在提供商页面清除各提供商的 API Key', 'info');
}

// ==================== 初始化 ====================

async function init() {
    // 加载提供商数据
    await loadProviders();
    // 加载会话
    await loadSessions();
    // 加载系统信息
    $('#serverAddr').textContent = window.location.origin;
}

init();
