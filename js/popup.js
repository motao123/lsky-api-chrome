// ===== 工具函数 =====
// truncateFileName / ensureHostPermission / isPrivateOrBlockedHostname / validateDomainForSSRF
// 定义在 js/shared.js，由 popup.html 先于本文件加载

function createElement(tag, className = '', text = '') {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text) el.textContent = text;
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function createSvgElement(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, v);
  }
  return el;
}

function createCopyIconSvg() {
  const svg = createSvgElement('svg', { width: '16', height: '16', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' });
  svg.appendChild(createSvgElement('rect', { x: '9', y: '9', width: '13', height: '13', rx: '2' }));
  svg.appendChild(createSvgElement('rect', { x: '2', y: '2', width: '13', height: '13', rx: '2' }));
  return svg;
}

function showToast(message, type = 'info', duration = 2500) {
  const existingToast = document.querySelector('.toast');
  if (existingToast) existingToast.remove();

  const toast = createElement('div', `toast ${type}`, message);
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('show'));

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function showConfirm(title, message, onConfirm) {
  const existingDialog = document.querySelector('.confirm-dialog');
  if (existingDialog) existingDialog.remove();

  const dialog = createElement('div', 'confirm-dialog');
  const box = createElement('div', 'confirm-box');
  const titleEl = createElement('div', 'confirm-title', title);
  const msgEl = createElement('div', 'confirm-message', message);
  const actions = createElement('div', 'confirm-actions');
  const cancelBtn = createElement('button', 'confirm-btn cancel', '取消');
  const confirmBtn = createElement('button', 'confirm-btn confirm', '确认');
  actions.appendChild(cancelBtn);
  actions.appendChild(confirmBtn);
  box.appendChild(titleEl);
  box.appendChild(msgEl);
  box.appendChild(actions);
  dialog.appendChild(box);
  document.body.appendChild(dialog);

  dialog.classList.add('show');

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
let currentMaxConcurrent = 3;

// ===== 初始化 =====
document.addEventListener('DOMContentLoaded', function() {
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

  checkConfig();
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
  chrome.storage.sync.get(['domain'], (syncStorage) => {
    chrome.storage.local.get(['apiToken'], (localData) => {
      if (!syncStorage.domain || !localData.apiToken) {
        showConfirm('配置缺失', '请先配置图床地址和API令牌', () => {
          if (chrome.runtime.openOptionsPage) {
            chrome.runtime.openOptionsPage();
          } else {
            window.open(chrome.runtime.getURL('options.html'));
          }
        });
      }
    });
  });
}

function bindEvents() {
  const historySearch = document.getElementById('history-search');
  const copyHistoryBtn = document.getElementById('copy-history');
  const historyScope = document.getElementById('history-scope');
  const deleteHistoryVisibleBtn = document.getElementById('delete-history-visible');
  const dragOverlay = document.querySelector('.drag-overlay');

  selectFilesBtn.addEventListener('click', () => imageInput.click());
  imageInput.addEventListener('change', handleFileSelect);

  // 拖拽上传（计数器防止子元素闪烁）
  let dragCounter = 0;
  document.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    if (dragOverlay) dragOverlay.classList.add('show');
  });
  document.addEventListener('dragover', (e) => {
    e.preventDefault();
  });
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCounter = 0;
    const files = Array.from(e.dataTransfer.files || []).filter(f => f.type.startsWith('image/'));
    if (files.length) processFiles(files);
    if (dragOverlay) dragOverlay.classList.remove('show');
  });
  document.addEventListener('dragleave', () => {
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      if (dragOverlay) dragOverlay.classList.remove('show');
    }
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

  historyBtn.addEventListener('click', openHistory);
  historyMask.addEventListener('click', closeHistory);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeHistory();
  });

  clearHistoryBtn.addEventListener('click', () => {
    showConfirm('确认清空', '确定要清空所有历史记录吗？此操作不可恢复。', () => {
      historyWriteQueue = historyWriteQueue.then(() => {
        return new Promise(resolve => {
          chrome.storage.local.remove('history', resolve);
        });
      }).catch(err => console.error('History clear failed:', err));
      historyItemsContainer.replaceChildren();
      showToast('历史记录已清空', 'success');
    });
  });

  if (copyAllBtn) copyAllBtn.addEventListener('click', copyAllLinksInList);
  if (copyHistoryBtn) copyHistoryBtn.addEventListener('click', () => copyAllLinksInHistory(historyScope ? historyScope.value : 'visible'));
  if (deleteHistoryVisibleBtn) deleteHistoryVisibleBtn.addEventListener('click', deleteVisibleHistory);
  if (historySearch) historySearch.addEventListener('input', filterHistory);
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

async function processFiles(files) {
  const syncStorage = await new Promise(resolve => {
    chrome.storage.sync.get(['domain', 'uploadStrategy', 'retryAttempts', 'retryBaseDelay', 'maxFileSizeMB', 'maxConcurrent', 'requestTimeoutMs'], resolve);
  });
  const localData = await new Promise(resolve => {
    chrome.storage.local.get(['apiToken'], resolve);
  });
  if (!syncStorage.domain || !localData.apiToken) {
    showToast('请先配置图床设置', 'error');
    return;
  }
  if (!validateDomainForSSRF(syncStorage.domain)) {
    showToast('图床地址不合法，请在设置中修改', 'error');
    return;
  }
  try {
    await ensureHostPermission(syncStorage.domain);
  } catch {
    showToast('未获得域名访问权限', 'error');
    return;
  }
  const validFiles = files.filter(file => {
    if (!file.type.startsWith('image/')) {
      showToast(`文件 ${truncateFileName(file.name)} 不是图片格式`, 'error');
      return false;
    }
    const maxMB = typeof syncStorage.maxFileSizeMB === 'number' ? syncStorage.maxFileSizeMB : 10;
    if (file.size > maxMB * 1024 * 1024) {
      showToast(`文件 ${truncateFileName(file.name)} 超过 ${maxMB}MB 限制`, 'error');
      return false;
    }
    return true;
  });
  if (validFiles.length === 0) return;
  const maxAttempts = typeof syncStorage.retryAttempts === 'number' ? syncStorage.retryAttempts : 2;
  const baseDelay = typeof syncStorage.retryBaseDelay === 'number' ? syncStorage.retryBaseDelay : 800;
  currentMaxConcurrent = typeof syncStorage.maxConcurrent === 'number' ? syncStorage.maxConcurrent : 3;
  const timeoutMs = typeof syncStorage.requestTimeoutMs === 'number' ? syncStorage.requestTimeoutMs : 30000;
  validFiles.forEach(file => {
    uploadQueue.push({ file, domain: syncStorage.domain, apiToken: localData.apiToken, strategyId: syncStorage.uploadStrategy, attempt: 1, maxAttempts, baseDelay, timeoutMs });
  });
  runUploadQueue();
}

function runUploadQueue() {
  while (runningUploads < currentMaxConcurrent && uploadQueue.length > 0) {
    const job = uploadQueue.shift();
    runningUploads++;
    uploadFile(job)
      .catch(e => console.error('Queue job error:', e))
      .finally(() => {
        runningUploads--;
        runUploadQueue();
      });
  }
}

async function uploadFile(job) {
  const { file, domain, apiToken, strategyId, attempt, maxAttempts, baseDelay, timeoutMs } = job;

  // uploadCount 仅在首次调用(attempt=1)时递增，重试不再重复计数
  if (attempt === 1) {
    uploadCount++;
    updateUploadStatus();
  }

  const formData = new FormData();
  formData.append('file', file);
  if (strategyId) {
    formData.append('strategy_id', strategyId);
  }

  try {
    const response = await fetchWithTimeout(`${domain}/api/v1/upload`, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiToken,
        'Accept': 'application/json'
      },
      body: formData
    }, timeoutMs);

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
        const backoff = baseDelay * Math.pow(2, attempt - 1);
        showToast(`${truncateFileName(file.name)} 上传失败，重试中(${attempt}/${maxAttempts})`, 'info');
        setTimeout(() => {
          uploadQueue.push({ ...job, attempt: attempt + 1 });
          runUploadQueue();
        }, backoff);
        return;
      } else {
        throw new Error(msg);
      }
    }

    const data = await response.json();

    if (data.status) {
      try {
        addResultToList(data.data);
        addToHistory(data.data);
      } catch (postError) {
        console.error('Post-upload processing error:', postError);
      }
      const limit = response.headers.get('X-RateLimit-Limit');
      const remaining = response.headers.get('X-RateLimit-Remaining');
      const rateInfo = (limit && remaining) ? ` | 剩余配额 ${remaining}/${limit}` : '';
      showToast(`${truncateFileName(file.name)} 上传成功${rateInfo}`, 'success', 2500);
    } else {
      const msg = data.message || '上传失败';
      throw new Error(msg);
    }
  } catch (error) {
    console.error('Upload error:', error);
    showToast(`${truncateFileName(file.name)} 上传失败: ${error.message}`, 'error');
    showConfirm('上传失败', `是否重试 ${truncateFileName(file.name)}？`, () => {
      uploadQueue.push({ ...job, attempt: 1 });
      runUploadQueue();
    });
  }
  uploadCount--;
  updateUploadStatus();
}

function updateUploadStatus() {
  if (uploadCount > 0) {
    selectFilesBtn.setAttribute('disabled', true);
    selectFilesBtn.classList.add('loading');
    const spinner = createElement('span', 'loading-spinner');
    selectFilesBtn.textContent = '';
    selectFilesBtn.appendChild(spinner);
    selectFilesBtn.appendChild(document.createTextNode(`上传中(${uploadCount})`));
  } else {
    selectFilesBtn.removeAttribute('disabled');
    selectFilesBtn.classList.remove('loading');
    selectFilesBtn.textContent = '选择图片';
  }
}

// ===== 列表项管理 =====
function addResultToList(data) {
  const li = createResultItem(data);
  linkItemsContainer.insertBefore(li, linkItemsContainer.firstChild);
}

function createResultItem(data) {
  const li = createElement('li');
  if (data.delete_url) li.dataset.deleteUrl = data.delete_url;
  const content = createElement('div', 'result-content');
  const fileName = createElement('div', 'file-name', data.origin_name);

  const linkBox = createElement('div', 'link-box');
  const input = createElement('textarea', 'selected-link');
  input.value = getLinkByFormat(data.links, globalFormat);
  input.readOnly = true;
  input.dataset.links = JSON.stringify(data.links);
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
  const copySvg = createCopyIconSvg();
  copyBtn.appendChild(copySvg);
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(input.value);
      copyBtn.classList.add('copied');
      copyBtn.textContent = '已复制 ✓';
      setTimeout(() => {
        copyBtn.classList.remove('copied');
        copyBtn.textContent = '';
        copyBtn.appendChild(copySvg);
      }, 1200);
      showToast('已复制', 'success');
      input.rows = 2;
      input.style.height = '';
      input.scrollTop = 0;
    } catch (err) {
      showToast('复制失败，请重试', 'error');
    }
  });

  const expandBtn = createElement('button', 'text-btn');
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

  // 删除按钮（仅在有 delete_url 时显示）
  if (data.delete_url) {
    const deleteBtn = createElement('button', 'text-btn');
    deleteBtn.setAttribute('aria-label', '删除图片');
    deleteBtn.textContent = '删除';
    deleteBtn.style.color = '#dc2626';
    deleteBtn.addEventListener('click', () => handleDelete(data.delete_url, li));
    linkBox.appendChild(deleteBtn);
  }

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
    const links = JSON.parse(input.dataset.links || '{}');
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

// ===== 删除相关 =====
function removeHistoryEntry(deleteUrl) {
  if (!deleteUrl) return;
  historyWriteQueue = historyWriteQueue.then(() => {
    return new Promise(resolve => {
      chrome.storage.local.get(['history'], (result) => {
        let history = result.history || [];
        const before = history.length;
        history = history.filter(item => item.delete_url !== deleteUrl);
        if (history.length < before) {
          chrome.storage.local.set({ history }, resolve);
        } else {
          resolve();
        }
      });
    });
  }).catch(err => console.error('History remove failed:', err));
}

function isUrlAllowedForDomain(url, allowedDomain) {
  try {
    const allowed = new URL(allowedDomain).origin;
    const target = new URL(url).origin;
    return target === allowed;
  } catch { return false; }
}

async function fetchDeleteItems(getItemsFn) {
  const [localData, syncData] = await Promise.all([
    new Promise(resolve => chrome.storage.local.get(['apiToken'], resolve)),
    new Promise(resolve => chrome.storage.sync.get(['domain'], resolve))
  ]);
  const token = localData.apiToken || '';
  const domain = syncData.domain || '';
  let success = 0;
  let failures = 0;
  const items = getItemsFn();
  for (const { del, li } of items) {
    if (!del || !isUrlAllowedForDomain(del, domain)) continue;
    try {
      const resp = await fetchWithTimeout(del, {
        method: 'DELETE',
        headers: { 'Accept': 'application/json', ...(token ? { 'Authorization': 'Bearer ' + token } : {}) }
      }, 15000);
      if (resp.ok) {
        success++;
        li.remove();
        removeHistoryEntry(del);
      } else {
        failures++;
        console.error('Delete failed:', resp.status, del);
      }
    } catch (e) {
      failures++;
      console.error('Delete error:', e, del);
    }
  }
  if (failures > 0) {
    showToast(`${success} 条删除成功，${failures} 条失败`, 'error');
  }
  return success;
}

async function deleteVisibleHistory() {
  const lis = Array.from(document.querySelectorAll('.history-container li')).filter(li => li.offsetParent !== null);
  if (lis.length === 0) {
    showToast('无可见记录', 'info');
    return;
  }
  showConfirm('确认删除', `确定要删除 ${lis.length} 条可见记录吗？此操作不可恢复。`, async () => {
    const success = await fetchDeleteItems(() =>
      lis.map(li => ({ del: li.dataset.deleteUrl || '', li }))
    );
    showToast(`已删除可见记录 ${success} 条`, success ? 'success' : 'info');
  });
}

async function handleDelete(deleteUrl, item) {
  const syncData = await new Promise(resolve => chrome.storage.sync.get(['domain'], resolve));
  if (!isUrlAllowedForDomain(deleteUrl, syncData.domain || '')) {
    showToast('删除地址不合法', 'error');
    return;
  }
  showConfirm('确认删除', '确定要删除这张图片吗？此操作不可恢复。', async () => {
    try {
      const localData = await new Promise((resolve) => chrome.storage.local.get(['apiToken'], resolve));
      const token = localData.apiToken || '';
      const response = await fetchWithTimeout(deleteUrl, {
        method: 'DELETE',
        headers: {
          'Accept': 'application/json',
          ...(token ? { 'Authorization': 'Bearer ' + token } : {})
        }
      }, 15000);

      if (response.ok) {
        item.remove();
        removeHistoryEntry(deleteUrl);
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

function initGlobalFormatSelector() {
  if (!globalFormatContainer) return;
  const types = [
    { label: 'URL', key: 'url' },
    { label: 'Markdown', key: 'markdown' },
    { label: 'HTML', key: 'html' },
    { label: 'BBCode', key: 'bbcode' },
    { label: '缩略图', key: 'thumbnail' }
  ];
  globalFormatContainer.replaceChildren();
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

// ===== 历史记录 =====
let historyWriteQueue = Promise.resolve();

function addToHistory(data) {
  historyWriteQueue = historyWriteQueue.then(() => {
    return new Promise(resolve => {
      chrome.storage.local.get(['history'], (result) => {
        let history = result.history || [];
        history.unshift({
          origin_name: data.origin_name,
          links: data.links,
          delete_url: data.delete_url || '',
          date: new Date().toISOString()
        });

        if (history.length > 100) {
          history = history.slice(0, 100);
        }

        chrome.storage.local.set({ history }, resolve);
      });
    });
  }).catch((err) => {
    console.error('History write failed:', err);
  });
}

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

function loadHistory() {
  chrome.storage.local.get(['history'], (result) => {
    historyItemsContainer.replaceChildren();

    if (result.history && result.history.length > 0) {
      result.history.forEach(item => {
        const li = createResultItem(item);
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
