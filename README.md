# Lsky Pro 图片上传助手（Chrome 扩展）

- 这是一款基于 Manifest V3 的 Chrome 扩展，用于将本地或剪贴板中的图片快速上传到 Lsky Pro 图床，并一键复制多种格式的链接。
- 支持拖拽、粘贴、文件选择三种上传入口；提供 Markdown、HTML、BBCode、URL、缩略图等输出格式；内置历史记录与批量复制；具备失败重试、并发控制与请求超时。
- 适用于需要高效管理图片资源、生成引用链接的开发者、内容创作者与文档编写者。

## 功能特性
- 多入口上传：选择文件、拖拽图片、粘贴图片上传
- 多格式输出：URL、Markdown、HTML、BBCode、缩略图统一切换
- 一键复制：点击单条链接或批量复制列表/历史记录
- 历史记录：本地存储最近上传结果，支持搜索与清空
- 失败重试：指数退避（可配置基础间隔与最大重试次数）
- 并发队列：最大并发可配置，减少触发限流（429）
- 请求超时：超过阈值自动取消，提升交互响应
- 限流提示：显示 X-RateLimit-Limit 与 X-RateLimit-Remaining
- 连接测试：校验令牌有效性与服务可用性

## 安装指南
1. 克隆或下载项目到本地：
  ```bash
   git clone https://github.com/motao123/lsky-api-chrome.git
  # 或直接下载 zip 解压到任意目录
  https://cnb.cool/code_free/lsky-api-chrome
  ```
2. 打开 Chrome，访问 `chrome://extensions`。
3. 打开右上角"开发者模式"（Developer mode）。
4. 点击"加载已解压的扩展程序"（Load unpacked），选择项目目录 `lsky-api-chrome`。
5. 扩展安装完成后，浏览器工具栏会显示图标，点击打开弹窗。

> 清单文件与权限参考：[/manifest.json]
> - Manifest Version: 3
> - 权限：storage、unlimitedStorage
> - host_permissions：`https://*/*`、`http://*/*`
> - 扩展页面：action popup、options 页面

## 配置说明
### 环境要求
- Chrome 114+（支持 Manifest V3）
- 可访问的 Lsky Pro 图床服务实例
- 在图床后台个人中心获取 API Token
- 接口需支持 Bearer Token 与 `Accept: application/json`

### 设置项（Options）
在“图床设置”页面中进行如下配置（参考代码位置：[/options.html]、[/js/options.js]）：
- 图床地址（domain）：如 `https://img.imotao.com`
- API 令牌（apiToken）：形如 `Bearer 1|xxxx...` 中的令牌部分（填写时无需带 `Bearer ` 前缀）
- 默认输出格式（globalFormat）：`url | markdown | html | bbcode | thumbnail`
- 上传策略 ID（uploadStrategy）：可选，作为 `strategy_id` 传入
- 自动重试次数（retryAttempts）：默认 2，范围 0–5
- 重试基础间隔（retryBaseDelay）：默认 800ms，范围 200–5000ms（指数退避：base × 2^(n-1)）
- 最大上传文件大小（maxFileSizeMB）：默认 10MB
- 最大并发上传数（maxConcurrent）：默认 3
- 请求超时（requestTimeoutMs）：默认 30000ms

点击“测试连接”按钮，会进行以下校验：
- `GET {domain}/api/v1/profile`（校验令牌与权限）
- `OPTIONS/GET {domain}/api/v1/upload`（校验接口可用性与限流状态）

### 接口约定
- 基础地址：`{domain}/api/v1`
- 认证方式：HTTP Bearer Token
- 公共请求头：
  - `Authorization: Bearer <token>`
  - `Accept: application/json`
- 公共响应头（用于提示配额）：
  - `X-RateLimit-Limit`、`X-RateLimit-Remaining`
- 常见状态码：`401/403/429/500`

参考接口文档：https://img.imotao.com/page/api-docs.html

## 使用示例
### 上传并复制链接
1. 打开扩展弹窗。
2. 选择图片、拖拽图片到弹窗、或粘贴图片。
3. 左上方选择输出格式（例如 Markdown）。
4. 点击每条结果中的链接框即可复制；也可使用“批量复制”复制当前列表全部链接。

弹窗核心上传逻辑参考：[/js/popup.js]：
```javascript
const formData = new FormData();
formData.append('file', file);
if (strategyId) formData.append('strategy_id', strategyId);

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
const resp = await fetch(`${domain}/api/v1/upload`, {
  method: 'POST',
  headers: {
    Authorization: 'Bearer ' + apiToken,
    Accept: 'application/json',
  },
  body: formData,
  signal: controller.signal
});
clearTimeout(timer);
```

### 历史记录
- 打开“历史记录”，可查看近 100 条本地记录，支持搜索与清空。
- 批量删除与批量复制在页面存在对应按钮时自动启用；删除会携带鉴权头。
---

## 文件索引与代码参考
- 弹窗页面与逻辑：[/popup.html]、[/js/popup.js]、[/css/main.css]
- 设置页面与逻辑：[/options.html]、[/js/options.js]
