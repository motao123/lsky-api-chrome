// ===== 工具函数 =====
// ensureHostPermission / isPrivateOrBlockedHostname / validateDomainForSSRF / fetchWithTimeout
// 定义在 js/shared.js，由 options.html 先于本文件加载

// ===== DOM 元素 =====
let domain, apiToken, saveBtn, status, testConnectionBtn;
let defaultFormatSelect, uploadStrategyInput, retryAttemptsInput, retryBaseDelayInput;
let maxFileSizeMBInput, maxConcurrentInput, requestTimeoutMsInput;

// ===== 初始化 =====
document.addEventListener('DOMContentLoaded', () => {
  domain = document.getElementById('domain');
  apiToken = document.getElementById('apiToken');
  saveBtn = document.getElementById('save');
  status = document.getElementById('status');
  testConnectionBtn = document.getElementById('testConnection');
  defaultFormatSelect = document.getElementById('defaultFormat');
  uploadStrategyInput = document.getElementById('uploadStrategy');
  retryAttemptsInput = document.getElementById('retryAttempts');
  retryBaseDelayInput = document.getElementById('retryBaseDelay');
  maxFileSizeMBInput = document.getElementById('maxFileSizeMB');
  maxConcurrentInput = document.getElementById('maxConcurrent');
  requestTimeoutMsInput = document.getElementById('requestTimeoutMs');

  loadSettings();
  bindEvents();
});

// ===== 加载设置 =====
function loadSettings() {
  chrome.storage.sync.get({ domain: '', globalFormat: 'url', uploadStrategy: '', retryAttempts: 2, retryBaseDelay: 800, maxFileSizeMB: 10, maxConcurrent: 3, requestTimeoutMs: 30000 }, (items) => {
    domain.value = items.domain;
    chrome.storage.local.get({ apiToken: '' }, (local) => {
      apiToken.value = local.apiToken;
    });
    if (defaultFormatSelect) defaultFormatSelect.value = items.globalFormat || 'url';
    if (uploadStrategyInput) uploadStrategyInput.value = items.uploadStrategy || '';
    if (retryAttemptsInput) retryAttemptsInput.value = items.retryAttempts;
    if (retryBaseDelayInput) retryBaseDelayInput.value = items.retryBaseDelay;
    if (maxFileSizeMBInput) maxFileSizeMBInput.value = items.maxFileSizeMB;
    if (maxConcurrentInput) maxConcurrentInput.value = items.maxConcurrent;
    if (requestTimeoutMsInput) requestTimeoutMsInput.value = items.requestTimeoutMs;
  });
}

// ===== 绑定事件 =====
function bindEvents() {
  saveBtn.addEventListener('click', saveSettings);

  if (testConnectionBtn) {
    testConnectionBtn.addEventListener('click', () => {
      const domainValue = domain.value.trim();
      const tokenValue = apiToken.value.trim();

      if (!domainValue || !tokenValue) {
        showStatus('请先填写图床地址和API令牌', 'error');
        return;
      }

      if (!validateDomainForSSRF(domainValue)) {
        showStatus('不允许使用内网或受限地址', 'error');
        return;
      }

      ensureHostPermission(domainValue).then(() => {
        testConnection(domainValue, tokenValue);
      }).catch(() => {
        showStatus('未获得域名访问权限', 'error');
      });
    });
  }

  [domain, apiToken].forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.ctrlKey) {
        saveSettings();
      }
    });
  });
  if (defaultFormatSelect) {
    defaultFormatSelect.addEventListener('change', () => {
      chrome.storage.sync.set({ globalFormat: defaultFormatSelect.value });
    });
  }
  if (uploadStrategyInput) {
    uploadStrategyInput.addEventListener('change', () => {
      chrome.storage.sync.set({ uploadStrategy: uploadStrategyInput.value.trim() });
    });
  }
  if (retryAttemptsInput) {
    retryAttemptsInput.addEventListener('change', () => {
      const v = Math.max(0, Math.min(5, parseInt(retryAttemptsInput.value || '2', 10)));
      retryAttemptsInput.value = v;
      chrome.storage.sync.set({ retryAttempts: v });
    });
  }
  if (retryBaseDelayInput) {
    retryBaseDelayInput.addEventListener('change', () => {
      const v = Math.max(200, Math.min(5000, parseInt(retryBaseDelayInput.value || '800', 10)));
      retryBaseDelayInput.value = v;
      chrome.storage.sync.set({ retryBaseDelay: v });
    });
  }
  if (maxFileSizeMBInput) {
    maxFileSizeMBInput.addEventListener('change', () => {
      const v = Math.max(1, Math.min(200, parseInt(maxFileSizeMBInput.value || '10', 10)));
      maxFileSizeMBInput.value = v;
      chrome.storage.sync.set({ maxFileSizeMB: v });
    });
  }
  if (maxConcurrentInput) {
    maxConcurrentInput.addEventListener('change', () => {
      const v = Math.max(1, Math.min(6, parseInt(maxConcurrentInput.value || '3', 10)));
      maxConcurrentInput.value = v;
      chrome.storage.sync.set({ maxConcurrent: v });
    });
  }
  if (requestTimeoutMsInput) {
    requestTimeoutMsInput.addEventListener('change', () => {
      const v = Math.max(5000, Math.min(120000, parseInt(requestTimeoutMsInput.value || '30000', 10)));
      requestTimeoutMsInput.value = v;
      chrome.storage.sync.set({ requestTimeoutMs: v });
    });
  }

  domain.addEventListener('blur', () => {
    const value = domain.value.trim();
    if (value && !value.startsWith('http://') && !value.startsWith('https://')) {
      domain.value = value === 'localhost' ? 'http://localhost' : 'https://' + value;
    }
  });

  domain.addEventListener('input', validateDomain);
  apiToken.addEventListener('input', validateApiToken);
}

// ===== 验证域名 =====
function validateDomain() {
  const value = domain.value.trim();
  let isValid = false;
  try {
    const url = new URL(value.startsWith('http') ? value : 'https://' + value);
    isValid = (url.hostname.includes('.') || url.hostname === 'localhost') && !isPrivateOrBlockedHostname(url.hostname);
  } catch { isValid = false; }

  domain.style.borderColor = (value && !isValid) ? '#f87171' : '';
}

// ===== 验证API Token =====
function validateApiToken() {
  const value = apiToken.value.trim();
  const isValid = /^[A-Za-z0-9._|:-]{10,200}$/.test(value) || value === '';
  apiToken.style.borderColor = (value && !isValid) ? '#f87171' : '';
}

// ===== 保存设置 =====
function saveSettings() {
  const domainValue = domain.value.trim();
  const tokenValue = apiToken.value.trim();
  const formatValue = defaultFormatSelect ? defaultFormatSelect.value : 'url';
  const strategyValue = uploadStrategyInput ? uploadStrategyInput.value.trim() : '';
  const attemptsValue = retryAttemptsInput ? Math.max(0, Math.min(5, parseInt(retryAttemptsInput.value || '2', 10))) : 2;
  const baseDelayValue = retryBaseDelayInput ? Math.max(200, Math.min(5000, parseInt(retryBaseDelayInput.value || '800', 10))) : 800;
  const maxSizeMBValue = maxFileSizeMBInput ? Math.max(1, Math.min(200, parseInt(maxFileSizeMBInput.value || '10', 10))) : 10;
  const maxConcurrentValue = maxConcurrentInput ? Math.max(1, Math.min(6, parseInt(maxConcurrentInput.value || '3', 10))) : 3;
  const requestTimeoutMsValue = requestTimeoutMsInput ? Math.max(5000, Math.min(120000, parseInt(requestTimeoutMsInput.value || '30000', 10))) : 30000;

  if (!domainValue) { showStatus('请输入图床地址', 'error'); domain.focus(); return; }
  if (!tokenValue) { showStatus('请输入API令牌', 'error'); apiToken.focus(); return; }
  if (!validateDomainFormat(domainValue)) { showStatus('图床地址格式不正确', 'error'); domain.focus(); return; }
  if (!validateApiTokenFormat(tokenValue)) { showStatus('API令牌格式不正确', 'error'); apiToken.focus(); return; }
  if (!validateDomainForSSRF(domainValue)) { showStatus('不允许使用内网或受限地址', 'error'); domain.focus(); return; }

  saveBtn.disabled = true;
  const spinner = document.createElement('span');
  spinner.className = 'loading-spinner';
  saveBtn.textContent = '';
  saveBtn.appendChild(spinner);
  saveBtn.appendChild(document.createTextNode('保存中...'));

  chrome.storage.local.set({ apiToken: tokenValue }, () => {
    chrome.storage.sync.set(
      { domain: domainValue, globalFormat: formatValue, uploadStrategy: strategyValue, retryAttempts: attemptsValue, retryBaseDelay: baseDelayValue, maxFileSizeMB: maxSizeMBValue, maxConcurrent: maxConcurrentValue, requestTimeoutMs: requestTimeoutMsValue },
      () => {
        saveBtn.disabled = false;
        saveBtn.textContent = '保存设置';

        if (chrome.runtime.lastError) {
          showStatus('保存失败，请重试', 'error');
          console.error('Storage error:', chrome.runtime.lastError);
        } else {
          showStatus('设置已保存！', 'success');
          ensureHostPermission(domainValue).then(() => {
            testConnection(domainValue, tokenValue);
          }).catch(() => {
            showStatus('已保存，但未获得域名访问权限', 'error');
          });
        }
      }
    );
  });
}

// ===== 验证格式 =====
function validateDomainFormat(domain) {
  try { new URL(domain); return true; } catch { return false; }
}

function validateApiTokenFormat(token) {
  return /^[A-Za-z0-9._|:-]{10,200}$/.test(token);
}

// ===== 测试连接 =====
async function testConnection(domain, token) {
  showStatus('正在测试连接...', 'info');

  const timeoutMs = requestTimeoutMsInput ? Math.max(5000, Math.min(120000, parseInt(requestTimeoutMsInput.value || '30000', 10))) : 30000;

  try {
    const headers = { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json' };

    const profileResp = await fetchWithTimeout(`${domain}/api/v1/profile`, { method: 'GET', headers }, timeoutMs);
    if (profileResp.ok) { showStatus('连接测试成功！令牌有效', 'success'); return; }
    if (profileResp.status === 401) { showStatus('连接正常，但令牌无效或未授权', 'error'); return; }
    if (profileResp.status === 403) { showStatus('连接正常，但接口被禁用或无权限', 'error'); return; }

    const optResp = await fetchWithTimeout(`${domain}/api/v1/upload`, { method: 'OPTIONS', headers }, timeoutMs);
    if (optResp.ok || optResp.status === 204 || optResp.status === 405) { showStatus('连接正常，但无法校验令牌有效性', 'success'); return; }

    const getResp = await fetchWithTimeout(`${domain}/api/v1/upload`, { method: 'GET', headers }, timeoutMs);
    if (getResp.status === 405) { showStatus('连接正常，但无法校验令牌有效性', 'success'); return; }
    if (getResp.status === 429) { showStatus('连接正常，但请求受限（429），请稍后再试', 'error'); return; }
    if (getResp.status >= 500) { showStatus(`服务端异常（${getResp.status}）`, 'error'); return; }

    const errorData = await getResp.json().catch(() => ({}));
    showStatus(`连接测试失败: ${errorData.message || `HTTP ${getResp.status}`}`, 'error');
  } catch (error) {
    console.error('Connection test error:', error);
    showStatus(`连接测试失败: ${error.message}`, 'error');
  }
}

// ===== 显示状态 =====
let statusTimer = null;
function showStatus(message, type = 'info') {
  const statusEl = document.getElementById('status');
  statusEl.textContent = message;
  statusEl.className = type;

  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    statusEl.textContent = '';
    statusEl.className = '';
    statusTimer = null;
  }, 5000);
}
