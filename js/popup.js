// ===== 工具函数 =====
function createElement(tag, className = '', text = '') {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text) el.textContent = text;
  return el;
}

function showToast(message, type = 'info', duration = 2500) {
  const existingToast = document.querySelector('.toast');
  if (existingToast) existingToast.remove();

  const toast = createElement('div', `toast ${type}`, message);
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  document.body.appendChild(toast);

  // 触发动画
  requestAnimationFrame(() => toast.classList.add('show'));

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function showConfirm(title, message, onConfirm) {
  // 移除现有的对话框
  const existingDialog = document.querySelector('.confirm-dialog');
  if (existingDialog) existingDialog.remove();

  const dialog = createElement('div', 'confirm-dialog');
  dialog.innerHTML = `
    <div class="confirm-box">
      <div class="confirm-title">${title}</div>
      <div class="confirm-message">${message}</div>
      <div class="confirm-actions">
        <button class="confirm-btn cancel">取消</button>
        <button class="confirm-btn confirm">确认</button>
      </div>
    </div>
  `;
  document.body.appendChild(dialog);

  dialog.classList.add('show');

  const cancelBtn = dialog.querySelector('.cancel');
  const confirmBtn = dialog.querySelector('.confirm');

  cancelBtn.addEventListener('click', () => {
    dialog.classList.remove('show');
    setTimeout(() => dialog.remove(), 200);
  });

  confirmBtn.addEventListener('click', () => {
    dialog.classList.remove('show');
    setTimeout(() => {
      dialog.remove();
      onConfirm();
    }, 200);
  });
}

// ===== DOM 元素 =====
let imageInput, selectFilesBtn, historyBtn, historyMask, historyContainer, clearHistoryBtn;
let linkItemsContainer, historyItemsContainer, globalFormatContainer, copyAllBtn;
let uploadCount = 0;
let globalFormat = 'url';
let uploadQueue = [];
let runningUploads = 0;

// ===== 初始化 =====
document.addEventListener('DOMContentLoaded', function() {
  // 获取DOM元素
  imageInput = document.getElementById('image-input');
  selectFilesBtn = document.querySelector('.select-files');
  historyBtn = document.querySelector('.history');
  historyMask = document.querySelector('.history-mask');
  historyContainer = document.querySelector('.history-container');
  clearHistoryBtn = document.querySelector('.clear-history');
  linkItemsContainer = document.querySelector('.container > main.link-items');
  historyItemsContainer = document.querySelector('.history-container main.link-items');
  globalFormatContainer = document.querySelector('.global-format');
  copyAllBtn = document.querySelector('.copy-all');
  const historySearch = document.getElementById('history-search');
  const copyHistoryBtn = document.getElementById('copy-history');
  const historyScope = document.getElementById('history-scope');
  const deleteHistoryVisibleBtn = document.getElementById('delete-history-visible');
  const dragOverlay = document.querySelector('.drag-overlay');

  // 检查配置
  checkConfig();
  
  // 绑定事件
  bindEvents();
  initGlobalFormatSelector();
  chrome.storage.sync.get(['globalFormat'], (storage) => {
    if (storage.globalFormat) {
      globalFormat = storage.globalFormat;
      initGlobalFormatSelector();
      updateAllItemsByFormat();
    }
  });
});

function checkConfig() {
  chrome.storage.sync.get(['domain', 'apiToken'], (storage) => {
    if (!storage.domain || !storage.apiToken) {
      showConfirm('配置缺失', '请先配置图床地址和API令牌', () => {
        if (chrome.runtime.openOptionsPage) {
          chrome.runtime.openOptionsPage();
        } else {
          window.open(chrome.runtime.getURL('options.html'));
        }
      });
    }
  });
}

function bindEvents() {
  const historySearch = document.getElementById('history-search');
  const copyHistoryBtn = document.getElementById('copy-history');
  const historyScope = document.getElementById('history-scope');
  const deleteHistoryVisibleBtn = document.getElementById('delete-history-visible');
  const deleteHistoryBtn = document.getElementById('delete-history');
  const dragOverlay = document.querySelector('.drag-overlay');
  // 选择文件
  selectFilesBtn.addEventListener('click', () => imageInput.click());

  // 文件选择变化
  imageInput.addEventListener('change', handleFileSelect);
  
  // 拖拽上传
  document.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (dragOverlay) dragOverlay.classList.add('show');
  });
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files || []).filter(f => f.type.startsWith('image/'));
    if (files.length) processFiles(files);
    if (dragOverlay) dragOverlay.classList.remove('show');
  });
  document.addEventListener('dragleave', (e) => {
    if (dragOverlay) dragOverlay.classList.remove('show');
  });
  
  // 粘贴上传
  document.addEventListener('paste', (e) => {
    const items = Array.from(e.clipboardData?.items || []);
    const files = items
      .filter(it => it.kind === 'file' && it.type.startsWith('image/'))
      .map(it => it.getAsFile())
      .filter(Boolean);
    if (files.length) processFiles(files);
  });

  // 历史记录
  historyBtn.addEventListener('click', openHistory);

  // 关闭历史记录
  historyMask.addEventListener('click', closeHistory);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeHistory();
    }
  });

  // 清空历史
  clearHistoryBtn.addEventListener('click', () => {
    showConfirm('确认清空', '确定要清空所有历史记录吗？此操作不可恢复。', () => {
      chrome.storage.local.clear();
      historyItemsContainer.innerHTML = '';
      showToast('历史记录已清空', 'success');
    });
  });
  
  // 批量复制
  if (copyAllBtn) {
    copyAllBtn.addEventListener('click', copyAllLinksInList);
  }
  if (copyHistoryBtn) {
    copyHistoryBtn.addEventListener('click', () => copyAllLinksInHistory(historyScope ? historyScope.value : 'visible'));
  }
  if (deleteHistoryBtn) {
    deleteHistoryBtn.addEventListener('click', deleteSelectedHistory);
  }
  if (deleteHistoryVisibleBtn) {
    deleteHistoryVisibleBtn.addEventListener('click', deleteVisibleHistory);
  }
  if (historySearch) {
    historySearch.addEventListener('input', filterHistory);
  }
  if (historyScope) {
    chrome.storage.sync.get(['historyScope'], (s) => {
      if (s.historyScope) historyScope.value = s.historyScope;
    });
    historyScope.addEventListener('change', () => {
      chrome.storage.sync.set({ historyScope: historyScope.value });
    });
  }
}

// ===== 文件处理 =====
function handleFileSelect() {
  const files = Array.from(imageInput.files);
  if (files.length === 0) return;
  processFiles(files);
  imageInput.value = '';
}

function processFiles(files) {
  chrome.storage.sync.get(['domain', 'apiToken', 'uploadStrategy', 'retryAttempts', 'retryBaseDelay', 'maxFileSizeMB', 'maxConcurrent', 'requestTimeoutMs'], (storage) => {
    if (!storage.domain || !storage.apiToken) {
      showToast('请先配置图床设置', 'error');
      return;
    }
    const validFiles = files.filter(file => {
      if (!file.type.startsWith('image/')) {
        showToast(`文件 ${file.name} 不是图片格式`, 'error');
        return false;
      }
      const maxMB = typeof storage.maxFileSizeMB === 'number' ? storage.maxFileSizeMB : 10;
      if (file.size > maxMB * 1024 * 1024) {
        showToast(`文件 ${file.name} 超过 ${maxMB}MB 限制`, 'error');
        return false;
      }
      return true;
    });
    if (validFiles.length === 0) return;
    const maxAttempts = typeof storage.retryAttempts === 'number' ? storage.retryAttempts : 2;
    const baseDelay = typeof storage.retryBaseDelay === 'number' ? storage.retryBaseDelay : 800;
    const concurrency = typeof storage.maxConcurrent === 'number' ? storage.maxConcurrent : 3;
    const timeoutMs = typeof storage.requestTimeoutMs === 'number' ? storage.requestTimeoutMs : 30000;
    validFiles.forEach(file => {
      uploadQueue.push(() => uploadFile(file, storage.domain, storage.apiToken, storage.uploadStrategy, 1, maxAttempts, baseDelay, timeoutMs));
    });
    runUploadQueue(concurrency);
  });
}
function runUploadQueue(maxConcurrent = 3) {
  while (runningUploads < maxConcurrent && uploadQueue.length > 0) {
    const job = uploadQueue.shift();
    runningUploads++;
    Promise.resolve()
      .then(() => job())
      .catch(() => {})
      .finally(() => {
        runningUploads--;
        runUploadQueue(maxConcurrent);
      });
  }
}
async function uploadFile(file, domain, apiToken, strategyId, attempt = 1, maxAttempts = 2, baseDelay = 800, requestTimeoutMs = 30000) {
  if (attempt === 1) {
    uploadCount++;
    updateUploadStatus();
  }
  let willRetry = false;

  const formData = new FormData();
  formData.append('file', file);
  if (strategyId) {
    formData.append('strategy_id', strategyId);
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
    const response = await fetch(`${domain}/api/v1/upload`, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiToken,
        'Accept': 'application/json'
      },
      body: formData,
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!response.ok) {
      let msg = '';
      switch (response.status) {
        case 401: msg = '未授权或令牌无效'; break;
        case 403: msg = '无权限或接口被禁用'; break;
        case 413: msg = '文件过大，服务器拒绝（413）'; break;
        case 415: msg = '不支持的媒体类型（415）'; break;
        case 429: msg = '请求过于频繁（429），请稍后再试'; break;
        default:
          if (response.status >= 500) msg = `服务器异常（${response.status}）`;
      }
      const errorData = await response.json().catch(() => ({}));
      msg = msg || errorData.message || `HTTP ${response.status}: ${response.statusText}`;
      if (attempt < maxAttempts) {
        willRetry = true;
        const backoff = baseDelay * Math.pow(2, attempt - 1);
        showToast(`${file.name} 上传失败，重试中(${attempt}/${maxAttempts})`, 'info');
        setTimeout(() => {
          uploadFile(file, domain, apiToken, strategyId, attempt + 1, maxAttempts, baseDelay, requestTimeoutMs);
        }, backoff);
        return;
      } else {
        throw new Error(msg);
      }
    }

    const data = await response.json();

    if (data.status) {
      addResultToList(data.data);
      addToHistory(data.data);
      showToast(`${file.name} 上传成功`, 'success', 2000);
      const limit = response.headers.get('X-RateLimit-Limit');
      const remaining = response.headers.get('X-RateLimit-Remaining');
      if (limit && remaining) {
        showToast(`剩余请求配额 ${remaining}/${limit}`, 'info', 1800);
      }
    } else {
      const msg = data.message || '上传失败';
      throw new Error(msg);
    }
  } catch (error) {
    console.error('Upload error:', error);
    showToast(`${file.name} 上传失败: ${error.message}`, 'error');
    showConfirm('上传失败', `是否重试 ${file.name}？`, () => {
      uploadFile(file, domain, apiToken, strategyId, 1, maxAttempts, baseDelay, requestTimeoutMs);
    });
  }
  if (!willRetry) {
    uploadCount--;
    updateUploadStatus();
  }
}

function updateUploadStatus() {
  if (uploadCount > 0) {
    selectFilesBtn.setAttribute('disabled', true);
    selectFilesBtn.classList.add('loading');
    selectFilesBtn.innerHTML = `<span class="loading-spinner"></span>上传中(${uploadCount})`;
  } else {
    selectFilesBtn.removeAttribute('disabled');
    selectFilesBtn.classList.remove('loading');
    selectFilesBtn.textContent = '选择图片';
  }
}

// ===== 列表项管理 =====
function addResultToList(data) {
  const li = createResultItem(data, true, false);
  linkItemsContainer.insertBefore(li, linkItemsContainer.firstChild);
}

function createResultItem(data, showDeleteBtn = true, isHistory = false) {
  const li = createElement('li');
  const content = createElement('div', 'result-content');
  
  const fileName = createElement('div', 'file-name', data.origin_name);

  const linkBox = createElement('div', 'link-box');
  const input = createElement('textarea', 'selected-link');
  input.value = getLinkByFormat(data.links, globalFormat);
  input.readOnly = true;
  input.setAttribute('data-links', JSON.stringify(data.links));
  input.setAttribute('rows', '2');
  input.setAttribute('title', input.value);
  input.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(input.value);
      showToast('已复制', 'success');
      input.rows = 2;
      input.style.height = '';
      input.scrollTop = 0;
    } catch (err) {
      showToast('复制失败，请手动复制', 'error');
    }
  });
  input.addEventListener('focus', () => {
    input.select();
  });

  const copyBtn = createElement('button', 'copy-icon');
  copyBtn.setAttribute('aria-label', '复制链接');
  copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"></rect><rect x="2" y="2" width="13" height="13" rx="2"></rect></svg>';
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(input.value);
      const prev = copyBtn.innerHTML;
      copyBtn.classList.add('copied');
      copyBtn.innerHTML = '已复制 ✓';
      setTimeout(() => {
        copyBtn.classList.remove('copied');
        copyBtn.innerHTML = prev;
      }, 1200);
      showToast('已复制', 'success');
      input.rows = 2;
      input.style.height = '';
      input.scrollTop = 0;
    } catch (err) {
      showToast('复制失败，请重试', 'error');
    }
  });
  const expandBtn = createElement('button', 'copy-icon');
  expandBtn.setAttribute('aria-label', '展开/收起');
  expandBtn.textContent = '展开';
  expandBtn.addEventListener('click', () => {
    if (expandBtn.textContent === '展开') {
      expandBtn.textContent = '收起';
      input.rows = 6;
      input.style.height = '';
    } else {
      expandBtn.textContent = '展开';
      input.rows = 2;
      input.style.height = '';
      input.scrollTop = 0;
    }
  });

  linkBox.appendChild(input);
  linkBox.appendChild(copyBtn);
  linkBox.appendChild(expandBtn);
  content.appendChild(fileName);
  content.appendChild(linkBox);
  li.appendChild(content);
  // 历史模式不再显示选择复选框

  return li;
}

function getLinkByFormat(links, format) {
  switch (format) {
    case 'markdown': return links.markdown || links.url || '';
    case 'html': return links.html || links.url || '';
    case 'bbcode': return links.bbcode || links.url || '';
    case 'thumbnail': return links.thumbnail_url || links.url || '';
    default: return links.url || '';
  }
}

function updateAllItemsByFormat() {
  const inputs = document.querySelectorAll('.selected-link');
  inputs.forEach(input => {
    const links = JSON.parse(input.getAttribute('data-links') || '{}');
    input.value = getLinkByFormat(links, globalFormat);
  });
}

function copyAllLinksInList() {
  const inputs = document.querySelectorAll('.container > main.link-items .selected-link');
  if (inputs.length === 0) {
    showToast('当前列表为空', 'info');
    return;
  }
  const lines = Array.from(inputs).map(i => i.value).filter(Boolean);
  const text = lines.join('\n');
  navigator.clipboard.writeText(text)
    .then(() => showToast(`已复制 ${lines.length} 条链接`, 'success'))
    .catch(() => showToast('复制失败，请重试', 'error'));
}

function copyAllLinksInHistory(scope = 'visible') {
  let inputs = Array.from(document.querySelectorAll('.history-container .selected-link'));
  if (scope === 'visible') inputs = inputs.filter(i => i.offsetParent !== null);
  if (scope === 'selected') {
    const checks = Array.from(document.querySelectorAll('.history-container .select-checkbox:checked'));
    inputs = checks.map(c => c.closest('li')?.querySelector('.selected-link')).filter(Boolean);
  }
  if (inputs.length === 0) {
    showToast('历史列表为空', 'info');
    return;
  }
  const lines = inputs.map(i => i.value).filter(Boolean);
  const text = lines.join('\n');
  navigator.clipboard.writeText(text)
    .then(() => showToast(`已复制 ${lines.length} 条历史链接`, 'success'))
    .catch(() => showToast('复制失败，请重试', 'error'));
}

function filterHistory(e) {
  const q = (e.target.value || '').toLowerCase();
  const items = document.querySelectorAll('.history-container li');
  items.forEach(li => {
    const nameEl = li.querySelector('.file-name');
    const inputEl = li.querySelector('.selected-link');
    const name = nameEl ? nameEl.textContent.toLowerCase() : '';
    const link = inputEl ? inputEl.value.toLowerCase() : '';
    const match = name.includes(q) || link.includes(q);
    li.style.display = match ? '' : 'none';
  });
}

async function deleteSelectedHistory() {
  const checks = Array.from(document.querySelectorAll('.history-container .select-checkbox:checked'));
  if (checks.length === 0) {
    showToast('未选择记录', 'info');
    return;
  }
  let success = 0;
  const storage = await new Promise((resolve) => chrome.storage.sync.get(['apiToken'], resolve));
  const token = storage.apiToken || '';
  for (const c of checks) {
    const li = c.closest('li');
    const del = c.dataset.deleteUrl || '';
    if (!del) continue;
    try {
      const resp = await fetch(del, { method: 'DELETE', headers: { 'Accept': 'application/json', ...(token ? { 'Authorization': 'Bearer ' + token } : {}) } });
      if (resp.ok) {
        success++;
        li.remove();
      }
    } catch (e) {}
  }
  showToast(`已删除 ${success} 条`, success ? 'success' : 'info');
}

async function deleteVisibleHistory() {
  const items = Array.from(document.querySelectorAll('.history-container li')).filter(li => li.offsetParent !== null);
  if (items.length === 0) {
    showToast('无可见记录', 'info');
    return;
  }
  let success = 0;
  const storage = await new Promise((resolve) => chrome.storage.sync.get(['apiToken'], resolve));
  const token = storage.apiToken || '';
  for (const li of items) {
    const c = li.querySelector('.select-checkbox');
    const del = c ? c.dataset.deleteUrl : '';
    if (!del) continue;
    try {
      const resp = await fetch(del, { method: 'DELETE', headers: { 'Accept': 'application/json', ...(token ? { 'Authorization': 'Bearer ' + token } : {}) } });
      if (resp.ok) {
        success++;
        li.remove();
      }
    } catch (e) {}
  }
  showToast(`已删除可见记录 ${success} 条`, success ? 'success' : 'info');
}
function initGlobalFormatSelector() {
  if (!globalFormatContainer) return;
  const types = [
    { label: 'URL', key: 'url' },
    { label: 'Markdown', key: 'markdown' },
    { label: 'HTML', key: 'html' },
    { label: 'BBCode', key: 'bbcode' },
    { label: '缩略图', key: 'thumbnail' }
  ];
  globalFormatContainer.innerHTML = '';
  types.forEach(t => {
    const btn = createElement('button', 'btn format-btn', t.label);
    if (t.key === globalFormat) btn.classList.add('active');
    btn.addEventListener('click', () => {
      globalFormat = t.key;
      chrome.storage.sync.set({ globalFormat });
      const all = globalFormatContainer.querySelectorAll('.format-btn');
      all.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateAllItemsByFormat();
    });
    globalFormatContainer.appendChild(btn);
  });
}

async function handleDelete(deleteUrl, item) {
  showConfirm('确认删除', '确定要删除这张图片吗？此操作不可恢复。', async () => {
    try {
      const storage = await new Promise((resolve) => chrome.storage.sync.get(['apiToken'], resolve));
      const token = storage.apiToken || '';
      const response = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: {
          'Accept': 'application/json',
          ...(token ? { 'Authorization': 'Bearer ' + token } : {})
        }
      });
      
      if (response.ok) {
        item.remove();
        showToast('图片已删除', 'success');
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }
    } catch (error) {
      console.error('Delete error:', error);
      showToast(`删除失败: ${error.message}`, 'error');
    }
  });
}

async function copyToClipboard(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    const originalText = button.textContent;
    button.textContent = '已复制 ✓';
    setTimeout(() => {
      button.textContent = originalText;
    }, 1500);
  } catch (err) {
    showToast('复制失败，请手动复制', 'error');
  }
}

// ===== 历史记录 =====
function openHistory() {
  loadHistory();
  historyMask.style.display = 'block';
  requestAnimationFrame(() => {
    historyMask.classList.add('show');
    historyContainer.classList.add('open');
  });
}

function closeHistory() {
  historyMask.classList.remove('show');
  historyContainer.classList.remove('open');
  setTimeout(() => {
    historyMask.style.display = 'none';
  }, 250);
}

function addToHistory(data) {
  chrome.storage.local.get(['history'], (result) => {
    let history = result.history || [];
    history.unshift({
      origin_name: data.origin_name,
      links: data.links,
      date: new Date().toISOString()
    });
    
    if (history.length > 100) {
      history = history.slice(0, 100);
    }
    
    chrome.storage.local.set({ history });
  });
}

function loadHistory() {
  chrome.storage.local.get(['history'], (result) => {
    historyItemsContainer.innerHTML = '';
    
    if (result.history && result.history.length > 0) {
      result.history.forEach(item => {
        const li = createResultItem(item, false, true);
        historyItemsContainer.appendChild(li);
      });
    } else {
      const emptyMsg = createElement('li', '', '暂无历史记录');
      emptyMsg.style.textAlign = 'center';
      emptyMsg.style.color = '#9ca3af';
      emptyMsg.style.padding = '20px';
      historyItemsContainer.appendChild(emptyMsg);
    }
  });
}
