// ===== DOM 元素 =====
const domain = document.getElementById('domain');
const apiToken = document.getElementById('apiToken');
const saveBtn = document.getElementById('save');
const status = document.getElementById('status');
const testConnectionBtn = document.getElementById('testConnection'); // 添加测试连接按钮
const defaultFormatSelect = document.getElementById('defaultFormat');
const uploadStrategyInput = document.getElementById('uploadStrategy');
const retryAttemptsInput = document.getElementById('retryAttempts');
const retryBaseDelayInput = document.getElementById('retryBaseDelay');
const maxFileSizeMBInput = document.getElementById('maxFileSizeMB');
const maxConcurrentInput = document.getElementById('maxConcurrent');
const requestTimeoutMsInput = document.getElementById('requestTimeoutMs');

// ===== 初始化 =====
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  bindEvents();
});

// ===== 加载设置 =====
function loadSettings() {
  chrome.storage.sync.get({ domain: '', apiToken: '', globalFormat: 'url', uploadStrategy: '', retryAttempts: 2, retryBaseDelay: 800, maxFileSizeMB: 10, maxConcurrent: 3, requestTimeoutMs: 30000 }, (items) => {
    domain.value = items.domain;
    apiToken.value = items.apiToken;
    if (defaultFormatSelect) {
      defaultFormatSelect.value = items.globalFormat || 'url';
    }
    if (uploadStrategyInput) {
      uploadStrategyInput.value = items.uploadStrategy || '';
    }
    if (retryAttemptsInput) {
      retryAttemptsInput.value = items.retryAttempts;
    }
    if (retryBaseDelayInput) {
      retryBaseDelayInput.value = items.retryBaseDelay;
    }
    if (maxFileSizeMBInput) {
      maxFileSizeMBInput.value = items.maxFileSizeMB;
    }
    if (maxConcurrentInput) {
      maxConcurrentInput.value = items.maxConcurrent;
    }
    if (requestTimeoutMsInput) {
      requestTimeoutMsInput.value = items.requestTimeoutMs;
    }
  });
}

// ===== 绑定事件 =====
function bindEvents() {
  saveBtn.addEventListener('click', saveSettings);
  
  // 添加测试连接按钮事件
  if(testConnectionBtn) {
    testConnectionBtn.addEventListener('click', () => {
      const domainValue = domain.value.trim();
      const tokenValue = apiToken.value.trim();
      
      if (!domainValue || !tokenValue) {
        showStatus('请先填写图床地址和API令牌', 'error');
        return;
      }
      
      testConnection(domainValue, tokenValue);
    });
  }
  
  // 输入框按回车保存
  [domain, apiToken].forEach(input => {
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && e.ctrlKey) { // Ctrl+Enter保存
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

  // 自动添加协议
  domain.addEventListener('blur', () => {
    const value = domain.value.trim();
    if (value && !value.startsWith('http://') && !value.startsWith('https://')) {
      if(value !== 'localhost') {
        domain.value = 'https://' + value;
      }
    }
  });

  // 验证域名格式
  domain.addEventListener('input', validateDomain);
  
  // 验证API Token格式
  apiToken.addEventListener('input', validateApiToken);
}

// ===== 验证域名 =====
function validateDomain() {
  const value = domain.value.trim();
  const isValid = value.includes('.') || value === 'localhost' || /^https?:\/\/localhost/.test(value);
  
  if (value && !isValid) {
    domain.style.borderColor = '#f87171';
  } else {
    domain.style.borderColor = '';
  }
}

// ===== 验证API Token =====
function validateApiToken() {
  const value = apiToken.value.trim();
  const isValid = /^[A-Za-z0-9._|:-]{10,200}$/.test(value) || value === '';
  
  if (value && !isValid) {
    apiToken.style.borderColor = '#f87171';
  } else {
    apiToken.style.borderColor = '';
  }
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

  // 验证
  if (!domainValue) {
    showStatus('请输入图床地址', 'error');
    domain.focus();
    return;
  }

  if (!tokenValue) {
    showStatus('请输入API令牌', 'error');
    apiToken.focus();
    return;
  }

  // 再次验证格式
  if (!validateDomainFormat(domainValue)) {
    showStatus('图床地址格式不正确', 'error');
    domain.focus();
    return;
  }
  
  if (!validateApiTokenFormat(tokenValue)) {
    showStatus('API令牌格式不正确', 'error');
    apiToken.focus();
    return;
  }

  // 显示加载状态
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<span class="loading-spinner"></span>保存中...';

  // 保存到存储
  chrome.storage.sync.set(
    { domain: domainValue, apiToken: tokenValue, globalFormat: formatValue, uploadStrategy: strategyValue, retryAttempts: attemptsValue, retryBaseDelay: baseDelayValue, maxFileSizeMB: maxSizeMBValue, maxConcurrent: maxConcurrentValue, requestTimeoutMs: requestTimeoutMsValue },
    () => {
      saveBtn.disabled = false;
      saveBtn.textContent = '保存设置';
      
      if (chrome.runtime.lastError) {
        showStatus('保存失败，请重试', 'error');
        console.error('Storage error:', chrome.runtime.lastError);
      } else {
        showStatus('设置已保存！', 'success');
        
        // 自动测试连接
        testConnection(domainValue, tokenValue);
      }
    }
  );
}

// ===== 验证格式 =====
function validateDomainFormat(domain) {
  try {
    new URL(domain);
    return true;
  } catch (e) {
    return false;
  }
}

function validateApiTokenFormat(token) {
  return /^[A-Za-z0-9._|:-]{10,200}$/.test(token);
}

// ===== 测试连接 =====
async function testConnection(domain, token) {
  showStatus('正在测试连接...', 'info');
  
  try {
    const headers = {
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/json'
    };
    const profileResp = await fetch(`${domain}/api/v1/profile`, { method: 'GET', headers });
    if (profileResp.ok) {
      showStatus('连接测试成功！令牌有效', 'success');
      return;
    }
    if (profileResp.status === 401) {
      showStatus('连接正常，但令牌无效或未授权', 'error');
      return;
    }
    if (profileResp.status === 403) {
      showStatus('连接正常，但接口被禁用或无权限', 'error');
      return;
    }
    const optResp = await fetch(`${domain}/api/v1/upload`, { method: 'OPTIONS', headers });
    if (optResp.ok || optResp.status === 204 || optResp.status === 405) {
      showStatus('连接正常，但无法校验令牌有效性', 'success');
      return;
    }
    const getResp = await fetch(`${domain}/api/v1/upload`, { method: 'GET', headers });
    if (getResp.status === 405) {
      showStatus('连接正常，但无法校验令牌有效性', 'success');
      return;
    }
    if (getResp.status === 429) {
      showStatus('连接正常，但请求受限（429），请稍后再试', 'error');
      return;
    }
    if (getResp.status >= 500) {
      showStatus(`服务端异常（${getResp.status}）`, 'error');
      return;
    }
    const errorData = await getResp.json().catch(() => ({}));
    showStatus(`连接测试失败: ${errorData.message || `HTTP ${getResp.status}`}`, 'error');
  } catch (error) {
    console.error('Connection test error:', error);
    showStatus(`连接测试失败: ${error.message}`, 'error');
  }
}

// ===== 显示状态 =====
function showStatus(message, type = 'success') {
  const statusEl = document.getElementById('status');
  statusEl.textContent = message;
  statusEl.className = type;

  // 5秒后清除
  setTimeout(() => {
    const statusEl = document.getElementById('status');
    statusEl.textContent = '';
    statusEl.className = '';
  }, 5000);
}

// ===== 添加加载动画样式（如果没有则添加） =====
if (!document.getElementById('spinner-style')) {
  const style = document.createElement('style');
  style.id = 'spinner-style';
  style.textContent = `
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .loading-spinner {
      display: inline-block;
      width: 14px;
      height: 14px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-radius: 50%;
      border-top-color: #fff;
      animation: spin 0.8s linear infinite;
      margin-right: 6px;
    }
  `;
  document.head.appendChild(style);
}
