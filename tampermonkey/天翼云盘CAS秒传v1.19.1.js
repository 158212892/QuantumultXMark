// ==UserScript==
// @name         天翼云盘 CAS 秒传助手
// @namespace    https://github.com/teleagent/189-cas-rapid-upload
// @version      1.19.1
// @description  小胜子秒传助手（天翼云盘 CAS）：①秒传码入库；②生成 .cas/秒传码；③CAS 转文件（扫描识别 .cas/.cas.torrent，二进制按字节下载不损坏）；④设置（跟随目录/覆盖/删 .cas/自动刷新列表/外观主题/详细日志）。上传协议完全对齐网页版（init 不带哈希，规避内容安全误拦）；判重四态区分（命中/未命中/未确认/登录失效），提交失败先核查目标目录防重复，任务状态全程可视；个人云与家庭云双空间自动识别，支持主题色/毛玻璃/液体玻璃/暗黑模式；登录态自检自愈，已登录处显示头像。
// @author       TeleAgent
// @match        https://cloud.189.cn/*
// @match        https://*.cloud.189.cn/*
// @run-at       document-idle
// @noframes
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @grant        GM.xmlHttpRequest
// @grant        GM.setClipboard
// @connect      upload.cloud.189.cn
// @connect      cloud.189.cn
// @connect      api.cloud.189.cn
// @connect      189.cn
// @connect      ctyun.cn
// @connect      ctyunxs.cn
// @connect      cloudcube.telecomjs.com
// @connect      cloudcube.wuxi.cn
// @connect      mini189.cn
// @connect      *
// @require      https://cdn.jsdelivr.net/npm/crypto-js@4.2.0/crypto-js.min.js
// @require      https://cdn.jsdelivr.net/npm/jsencrypt@3.3.2/bin/jsencrypt.min.js
// @require      https://cdn.jsdelivr.net/npm/spark-md5@3.0.2/spark-md5.min.js
// ==/UserScript==

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * 工作原理（CAS 秒传）
 * ─────────────────────────────────────────────────────────────────────────────
 * 天翼云盘的存储后端按内容寻址（CAS），只要云端已存在相同内容的数据块，
 * 就可以凭哈希"秒传"入库，无需传输文件本身。本脚本实现网页端同款流程：
 *
 *   1. GET /person/initMultiUpload        创建上传会话，得到 uploadFileId
 *      参数: parentFolderId, fileName, fileSize, sliceSize, lazyCheck=1
 *   2. GET /person/checkTransSecond       用 fileMd5 + sliceMd5 判重
 *      参数: fileMd5, sliceMd5, uploadFileId
 *      返回 data.fileDataExists === 1 表示云端已有该内容，可秒传
 *   3. GET /person/commitMultiUploadFile  提交，得到最终文件对象
 *      参数: uploadFileId, fileMd5, sliceMd5, lazyCheck=1, isLog=0, opertype
 *      v1.18.5 稳定性强化：判重四态区分（命中/未命中/未确认/登录失效——接口异常
 *      绝不当作“云端没有文件”）；提交响应丢失时先核查目标目录再决定是否重试
 *      （防重复文件）；全流程任务状态（初始化/判重/命中/上传/提交）实时上报。
 *      v1.18.7：res_code 字符串错误码兼容；核查目录失败按“状态不明”处理
 *      （禁止当作未提交，防网络抖动时盲目重试产生重复）。
 *      v1.18.8：commit 正常返回但缺文件 ID 时核查目录后才判成功；目录列表
 *      兼容 data.fileListAO 嵌套且缺结构直接报错；错误码兼容 data 层；家庭云
 *      建目录按错误类型分流（登录/权限失效不再被按名兜底掩盖）。
 *      v1.19.0：响应错误码/消息解析全面收口到 getRespCode/getRespMsg
 *      （apiGet / apiPostForm / parseFamilyRes 共用，个人云与家庭云统一）；
 *      目录列表结构校验共用 requireFileListAO（缺结构报错不当作空目录）；
 *      按名查目录条目 ID 有效性校验；0 字节文件也参与大小核对。
 *      v1.19.1：会话池 TTL 自动保鲜（10 分钟）+ InvalidSessionKey 先重新收集
 *      再轮换（长时间上传期间官方网页轮换密钥不再引发“无效会话”）；
 *      面板常驻会话保活（5 分钟轻量请求）；.cas 生成遇登录失效
 *      提前结束并保留已产出部分。
 *
 * 关键规则（与官方客户端一致，否则 sliceMd5 对不上、秒传必然失败）：
 *   - 分片大小 sliceSize 由文件大小唯一决定（见 cassSliceSize）：
 *       ≤ 10GiB → 10MiB；≤ 20GiB*999/10GiB... → 见函数体（10MiB / 20MiB /
 *       更大文件按"最多 1999 片"向上取 10MiB 的整数倍，至少 50MiB）。
 *   - 文件 ≤ sliceSize（单分片）：sliceMd5 = 整体 MD5（大写）。
 *   - 文件 >  sliceSize（多分片）：sliceMd5 = MD5(各分片 MD5(大写) 用 "\n"
 *     拼接后的字符串)，结果大写。
 *
 * 网页端鉴权（免密复用浏览器登录态）：
 *   - 会话密钥：多源候选池，按可靠性排序（页面正在用的密钥最可靠）——
 *       ① 网页自身存储：window.__sessionKey / sessionStorage|localStorage 的
 *          sessionKey / cookie（SESSION_KEY、SSON 等）
 *       ② GET portal/v2/getUserBriefInfo.action → sessionKey
 *       ③ GET portal/getUserSizeInfo.action → 响应头 SessionKey
 *     不同来源的密钥对上传接口效力可能不同：InvalidSessionKey 时自动轮换
 *     下一个候选（generateRsaKey 与上传接口均支持轮换重试）。
 *   - RSA 公钥: GET cloud.189.cn/api/security/generateRsaKey.action?sessionKey=..
 *     带 AppKey:600100422 / Timestamp / Signature=MD5("AppKey=..&Timestamp=..")
 *     / Sign-Type:1 请求头；响应为 JSON 或 XML（<keyPair><pubKey>…）
 *   - 每次 API 请求:
 *       params   = hex( AES-ECB( "k=v&k=v" 查询串, 随机16位hex密钥 key ) )
 *       加密头   = EncryptionText: base64( RSA-PKCS1v1.5( key ) ) + PkId
 *       签名头   = Signature: hex( HMAC-SHA1( "SessionKey=..&Operate=..
 *                  &RequestURI=..&Date=..&params=..", key ) )
 *       其他头   = SessionKey / X-Request-Date(毫秒) / X-Request-ID(UUID)
 *
 * 秒传码格式（本脚本自定义，文本可读、一行一文件）：
 *   {"name":"文件名.mp4","size":12345,"md5":"...","sliceMd5":"...","sliceSize":10485760}
 *   189|文件名.mp4|12345|MD5|SLICEMD5
 *   fast://MD5:12345/文件名.mp4        （兼容 rpdg/cloud189 格式，仅小文件可靠）
 *   其中：size ≤ 10MiB 时 sliceMd5 可省略（自动取整体 MD5）；
 *         大文件必须带 sliceMd5，否则无法秒传。
 *
 * CAS 文件转文件（v1.1.0 新增）：解析 OpenList 生态三种 CAS 载荷后批量秒传——
 *   ① .cas 文件 = Base64(或裸) JSON 载荷（CASPayload）：
 *        单文件 legacy 五字段 {name, size, md5, sliceMd5, create_time}
 *        +可选 partsMd5/slice_md5s（逐片 MD5）、slice_size、cloud、files[]（多文件）
 *   ② openlist-sharing-seed JSON 种子：
 *        {format, version, piece_size, files:[{path, size, hashes:{md5, pieces:{md5[]}}, cas_slice_md5, cas_cloud}]}
 *   ③ .cas.torrent（bencode）：info{name,length|files[]} + x-cas{cloud,file_md5,slice_md5,
 *      slice_size,slice_md5s[]}(单文件) + x-openlist（Seed 的 bencode，多文件）
 *   解析规则与 OpenList 一致：sliceMd5 显式值优先；否则逐片列表可信时推算
 *   （要求片数与 CAS 分片规则完全吻合）；单分片文件取整体 MD5。
 *
 * 云盘生成 .cas（v1.2.0 引入，v1.3.0 重构）：cookie 鉴权读取目录列表与下载地址——
 *   列表: GET cloud.189.cn/api/open/file/listFiles.action?folderId=..&pageNum=..
 *         （fileListAO.fileList[].md5 为整文件 MD5）
 *   下载: GET cloud.189.cn/api/portal/getFileInfo.action?fileId=.. → downloadUrl
 *   小文件（≤单片）sliceMd5 = 整文件 MD5，零流量；大文件按 sliceSize 用
 *   Range 请求逐片下载计算 MD5，拼出最终分片摘要。
 *   生成物可直接下载、复制，或真实上传回云盘目录（小文件完整上传链路：
 *   initMultiUpload(不带哈希，lazyCheck=1) → getMultiUploadUrls → PUT 分片 → commit）。
 *
 * 生态互通（v1.3.0 新增，对齐社区“天翼云盘秒传助手”的链接规范）：
 *   - 秒传码新增两种输入格式：cloud189://Base64(JSON 或 名|大小|MD5|分片MD5)、
 *     无前缀管道串 名|大小|MD5|分片MD5（含 189| 前缀旧格式仍兼容）
 *   - name / path 含目录（“剧集/S01/E01.mkv”）时自动拆分 dirPath，
 *     批量秒传时逐级创建对应子目录（open/file/createFolder.action，幂等）
 *   - 本地生成码可切换输出 cloud189:// 秒传链接（生态通用格式）
 *   - CAS 种子内的目录结构（openlist-seed 的 path）在转存时自动还原为子目录
 *
 * 已知限制：
 *   - 仅支持个人云（家庭云目录 ID 不在此流程内）。
 *   - 秒传依赖云端已存在相同内容（例如他人分享过的公开文件），云端没有
 *     就是"未命中"，这是 CAS 秒传的原理所限，不是脚本故障。
 *   - 秒传计一次上传流量，受账号"每日上传流量上限"限制。
 *   - 空文件（0 字节）无法上传/秒传。
 * ─────────────────────────────────────────────────────────────────────────────
 */

(function () {
  'use strict';

  if (window.__TELEAGENT_189_CAS__) return;
  window.__TELEAGENT_189_CAS__ = true;

  /* ══════════════════════ 常量 ══════════════════════ */

  var UPLOAD_BASE = 'https://upload.cloud.189.cn';
  var PORTAL_BASE = 'https://cloud.189.cn/api';
  var ROOT_FOLDER_ID = '-11'; // 个人云根目录（目标目录由设置页开关决定）
  // URL 附加参数：与官方 PC/网页客户端保持一致（OpenList 189pc 同款）
  var URL_SUFFIX =
    'clientType=TELEPC&version=7.2.4.0&channelId=web_cloud.189.cn&rand=';

  // 签名候选方案：参数拼接顺序 × 大小写。
  // 服务端对签名串的规范化顺序在不同实现中存在分歧（OpenList/官方 app 用
  // 固定顺序 SessionKey→Operate→RequestURI→Date→params），脚本运行时自动
  // 尝试，成功后记住可用方案，后续请求直接复用。
  var SIG_SCHEMES = [
    { name: 'fixed-lower', order: 'fixed', upper: false },
    { name: 'sorted-lower', order: 'sorted', upper: false },
    { name: 'fixed-upper', order: 'fixed', upper: true },
    { name: 'sorted-upper', order: 'sorted', upper: true }
  ];
  var workingScheme = null; // 首次成功后缓存

  /* ══════════════════════ 小工具 ══════════════════════ */

  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  function uuid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function randomHex(len) {
    var bytes = new Uint8Array(Math.ceil(len / 2));
    window.crypto.getRandomValues(bytes);
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
    return s.slice(0, len);
  }

  function fmtSize(bytes) {
    if (!isFinite(bytes) || bytes < 0) return '?';
    var units = ['B', 'KB', 'MB', 'GB', 'TB'];
    var i = 0, v = Number(bytes);
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return (i === 0 ? v : v.toFixed(v >= 100 ? 0 : 2)) + ' ' + units[i];
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function copyText(text) {
    if (typeof GM_setClipboard === 'function') { GM_setClipboard(text, 'text'); return Promise.resolve(true); }
    if (typeof GM !== 'undefined' && GM.setClipboard) { GM.setClipboard(text, 'text'); return Promise.resolve(true); }
    // 兜底：临时 textarea + execCommand
    return new Promise(function (resolve) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        var ok = document.execCommand('copy');
        document.body.removeChild(ta);
        resolve(ok);
      } catch (e) { resolve(false); }
    });
  }

  /* ══════════════════════ 核心算法 ══════════════════════ */

  /** 分片大小：与官方上传链路逐字一致（OpenList CASSliceSize），错一位秒传必失败 */
  function cassSliceSize(size) {
    var DEFAULT = 10 * 1024 * 1024; // 10MiB
    if (size > DEFAULT * 2 * 999) {
      return Math.max(Math.ceil(size / 1999 / DEFAULT), 5) * DEFAULT;
    }
    if (size > DEFAULT * 999) return DEFAULT * 2; // 20MiB
    return DEFAULT;
  }

  function cassPartCount(size) {
    var s = cassSliceSize(size);
    return size <= s ? 1 : Math.ceil(size / s);
  }

  /** AES-ECB + PKCS7，输出小写 hex（网页端实现同款） */
  function aesEcbHex(text, key16) {
    var key = CryptoJS.enc.Utf8.parse(key16); // 16 字符 → AES-128
    var data = CryptoJS.enc.Utf8.parse(text);
    var encrypted = CryptoJS.AES.encrypt(data, key, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7
    });
    return encrypted.ciphertext.toString(CryptoJS.enc.Hex);
  }

  /**
   * HMAC-SHA1 签名。签名串字段顺序支持 fixed / sorted 两种候选。
   * fields: { sessionKey, operate, requestURI, dateMs, paramsHex }
   */
  function signHmacSha1(fields, key16, order, upper) {
    var pairs;
    if (order === 'sorted') {
      pairs = [
        ['Date', fields.dateMs],
        ['Operate', fields.operate],
        ['params', fields.paramsHex],
        ['RequestURI', fields.requestURI],
        ['SessionKey', fields.sessionKey]
      ];
    } else {
      // 文档化顺序（与官方 app 签名格式一致）
      pairs = [
        ['SessionKey', fields.sessionKey],
        ['Operate', fields.operate],
        ['RequestURI', fields.requestURI],
        ['Date', fields.dateMs],
        ['params', fields.paramsHex]
      ];
    }
    var data = pairs.map(function (kv) { return kv[0] + '=' + kv[1]; }).join('&');
    var sig = CryptoJS.HmacSHA1(data, CryptoJS.enc.Utf8.parse(key16))
      .toString(CryptoJS.enc.Hex);
    return upper ? sig.toUpperCase() : sig.toLowerCase();
  }

  /** RSA-PKCS1v1.5 加密随机密钥（JSEncrypt），返回 base64 */
  function rsaEncryptBase64(text, pubKeyRaw) {
    var enc = new JSEncrypt();
    var pub = String(pubKeyRaw || '').trim();
    if (pub.indexOf('-----BEGIN') === -1) {
      pub = '-----BEGIN PUBLIC KEY-----\n' + pub + '\n-----END PUBLIC KEY-----';
    }
    enc.setPublicKey(pub);
    var out = enc.encrypt(text);
    if (out === false) throw new Error('RSA 加密失败（公钥格式异常）');
    return out;
  }

  /* ══════════════════════ GM 网络层 ══════════════════════ */

  var DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  /**
   * GM 请求封装。opts.onAbortRegister(fn)：可选，注册"中断当前请求"的回调
   * （fn 调用即中止进行中的请求，触发 onabort → reject 带 aborted 标记的错）。
   */
  function gmXhr(opts) {
    return new Promise(function (resolve, reject) {
      var fn = (typeof GM_xmlhttpRequest === 'function')
        ? GM_xmlhttpRequest
        : (typeof GM !== 'undefined' && GM.xmlHttpRequest ? GM.xmlHttpRequest : null);
      if (!fn) return reject(new Error('当前脚本管理器不支持 GM_xmlhttpRequest，请使用 Tampermonkey / Violentmonkey'));
      var merged = Object.assign({}, opts);
      merged.headers = Object.assign({}, opts.headers);
      // 统一带浏览器 UA（下载 CDN 会校验；不覆盖调用方显式设置的头）
      if (!merged.headers['User-Agent'] && !merged.headers['user-agent']) {
        merged.headers['User-Agent'] = navigator.userAgent || DEFAULT_UA;
      }
      var handle = fn(Object.assign(merged, {
        timeout: opts.timeout || 30000,
        onload: resolve,
        onerror: function (e) {
          var hint = (e && e.error === 'API_ERROR') ? '；请求域名未获脚本授权，请在 Tampermonkey 脚本设置中允许跨域请求' : '';
          reject(new Error('网络请求失败（请检查网络或代理' + hint + '）'));
        },
        ontimeout: function () { reject(new Error('网络请求超时')); },
        onabort: function () {
          var e = new Error('已中止');
          e.aborted = true;
          reject(e);
        }
      }));
      if (typeof opts.onAbortRegister === 'function') {
        opts.onAbortRegister(function () {
          try { if (handle && handle.abort) handle.abort(); } catch (e) {}
        });
      }
    });
  }

  /**
   * 同源门户请求（cloud.189.cn/api）：优先走页面自身 fetch。
   * 动机：Tampermonkey 的 GM_xmlhttpRequest 走扩展后台网络栈，浏览器长时间
   * 挂机/网络切换/睡眠唤醒后可能整体卡死——页面本身能正常浏览，但脚本所有
   * 请求（容量 / 目录列表 / 会话探测）全部失败，只有重启浏览器才恢复。
   * 页面 fetch 与网页同栈同凭证，不受该故障影响；fetch 网络层失败再回退 GM。
   * 返回与 GM 一致的 { status, responseText, responseHeaders, via }。
   */
  function portalRequest(method, url, opts) {
    opts = opts || {};
    function viaFetch() {
      if (typeof window.fetch !== 'function') return Promise.reject(new Error('no-fetch'));
      var headers = Object.assign({ accept: 'application/json;charset=UTF-8' }, opts.headers || {});
      var init = { method: method, credentials: 'include', headers: headers };
      if (opts.form != null) init.body = opts.form; // Content-Type 由调用方 headers 提供
      return window.fetch(url, init).then(function (r) {
        return r.text().then(function (text) {
          var lines = [];
          try { r.headers.forEach(function (v, k) { lines.push(k + ': ' + v); }); } catch (e) {}
          return { status: r.status, responseText: text, responseHeaders: lines.join('\n'), via: 'fetch' };
        });
      });
    }
    function viaGm() {
      var headers = Object.assign({}, opts.headers || {});
      var gmOpts = { method: method, url: url, headers: headers };
      if (opts.form != null) {
        headers['Content-Type'] = headers['Content-Type'] || 'application/x-www-form-urlencoded';
        gmOpts.data = opts.form;
      }
      return gmXhr(gmOpts);
    }
    return viaFetch().catch(function (e) {
      if (e && e.aborted) throw e;
      return viaGm().catch(function (ge) {
        throw new Error('网络请求失败（页面与脚本两条通道均不通：' +
          ((ge && ge.message) || (e && e.message) || '网络错误') +
          '；若页面本身能浏览，请刷新页面或重启浏览器后重试）');
      });
    });
  }

  /**
   * JSON 解析（带大整数保护）。
   * 天翼接口的 id 类字段（fileId / folderId / uploadFileId 等）是 18 位大整数，
   * 超过 JS Number.MAX_SAFE_INTEGER（16 位），直接 JSON.parse 会静默丢精度
   * （如 …4989 被舍入成 …5000），后续按 ID 查询即报 "not found"。
   * 预处理：把 16 位以上整数字面量加引号转为字符串（size/时间戳等均低于 16 位，
   * 不受影响；md5 本身是带引号的 hex 字符串也不会被改写）。
   */
  function parseJsonLoose(text) {
    if (typeof text !== 'string' || !text) return null;
    var safe = text.replace(/("(?:[^"\\]|\\.)*"\s*:\s*)(-?\d{16,})(?=\s*[,\}\]])/g, '$1"$2"');
    try { return JSON.parse(safe); } catch (e) { return null; }
  }

  /**
   * XML 响应解析（v1.16.0）：批量任务接口在网页端会返回 XML 而非 JSON——
   *   <TaskIdResp><taskId>234…</taskId></TaskIdResp>（创建任务）
   *   <BatchTaskInfoResp><taskStatus>4</taskStatus><successedCount>3</…>（查任务）
   * 之前 JSON 解析失败直接报“接口响应异常（HTTP 200）”，但服务端任务其实已执行
   * （表现为“删除失败”而文件实际已删）。现把根元素子节点（含嵌套层）收集为平面对象，
   * 字段名与 JSON 响应一致，extractTaskId / extractTaskStatus / taskCount 直接兼容。
   */
  function parseXmlToFields(text) {
    try {
      var s = String(text || '');
      if (!/^\s*</.test(s)) return null;
      if (typeof window.DOMParser !== 'function') return null;
      var doc = new DOMParser().parseFromString(s, 'text/xml');
      if (doc.getElementsByTagName('parsererror').length) return null;
      var root = doc.documentElement;
      if (!root) return null;
      var out = {};
      (function walk(node) {
        var kids = node.children;
        for (var i = 0; i < kids.length; i++) {
          var k = kids[i];
          if (k.children && k.children.length) walk(k);
          else out[k.tagName] = (k.textContent || '').trim();
        }
      })(root);
      return Object.keys(out).length ? out : null;
    } catch (e) { return null; }
  }

  /**
   * 深度提取响应字段（v1.18.4）：按传入键的优先顺序在对象树内逐层查找（BFS），
   * 键名大小写不敏感、精确匹配（非子串），跳过 null/undefined/空字符串。
   * 动机：天翼不同端与不同时期的接口，同一字段可能出现在顶层、data、
   * fileFolderInfo、TaskIdResp 等任意层级；旧版 extractTaskId/taskCount 里
   * “json.data && json.taskId”这类条件判错取值位置（判 data 却读顶层），
   * 嵌套结构一律取空。统一走本函数后任意层级均可命中。
   */
  function deepPick(obj, keys) {
    var names = [];
    (Array.isArray(keys) ? keys : [keys]).forEach(function (k) {
      k = String(k).toLowerCase();
      if (names.indexOf(k) < 0) names.push(k);
    });
    var queue = [obj];
    var seen = []; // 环/自引用保护
    function pushSeen(o) {
      for (var s = 0; s < seen.length; s++) if (seen[s] === o) return false;
      seen.push(o);
      return true;
    }
    for (var ki = 0; ki < names.length; ki++) {
      queue.length = 0; queue.push(obj);
      seen.length = 0;
      for (var qi = 0; qi < queue.length; qi++) {
        var cur = queue[qi];
        if (!cur || typeof cur !== 'object' || !pushSeen(cur)) continue;
        for (var k in cur) {
          if (!Object.prototype.hasOwnProperty.call(cur, k)) continue;
          if (String(k).toLowerCase() === names[ki]) {
            var v = cur[k];
            if (v != null && String(v) !== '') return v;
          }
          if (cur[k] && typeof cur[k] === 'object') queue.push(cur[k]);
        }
      }
    }
    return undefined;
  }

  /* ══════════════ 上传任务状态与提交核查（v1.18.5） ══════════════ */

  /** 上传任务状态（批量日志与进度条显示；e.step 失败阶段也用此表 */
  var UP_STATE = {
    wait: '等待中',
    init: '正在初始化',
    check: '正在判重',
    hit: '云端已命中',
    upload: '正在上传',
    commit: '正在提交',
    ok: '已成功',
    fail: '失败',
    cancel: '已取消'
  };

  /** 给错误打上阶段标记（e.step）：批量日志据此显示“失败（正在判重）”，网络中断能看出卡在哪一步 */
  function stepErr(step, e) {
    if (e && typeof e === 'object' && !e.step) e.step = step;
    return e;
  }

  /**
   * 统一解析 checkTransSecond 判重响应（v1.18.5）。返回 { state, message }：
   *   hit       云端已有该内容，可秒传；
   *   miss      云端不存在该内容（明确未命中）；
   *   uncertain 接口响应异常/结构不认识，不能确定——绝不允许当作 miss！
   * 登录失效类错误在 uploadApi 内已轮换全部会话密钥后抛出（looksAuthError 可识别），
   * 不会走到这里，不会与“未命中”混淆。
   */
  function classifyTransCheck(resp) {
    if (!resp || typeof resp !== 'object') {
      return { state: 'uncertain', message: '判重响应为空，无法确认云端是否已有该内容' };
    }
    var v = deepPick(resp, ['fileDataExists']);
    if (v === true) return { state: 'hit' };
    if (v === false) return { state: 'miss' };
    var s = String(v == null ? '' : v).trim();
    if (s === '1') return { state: 'hit' };
    if (s === '0') return { state: 'miss' };
    var code = getRespCode(resp);
    var msg = getRespMsg(resp);
    return {
      state: 'uncertain',
      message: '判重接口返回异常，无法确认云端是否已有该内容' +
        (code ? '（接口返回 ' + code + (msg ? '：' + msg : '') + '）' : '（响应未含 fileDataExists 字段）')
    };
  }

  /**
   * 提交核查（v1.18.5 起；v1.18.6 收紧匹配；v1.18.7 区分“查询失败”与“没有文件”）。
   * commitMultiUploadFile 发出后响应丢失（网络中断/超时）时，查目标目录
   * 是否已出现本次提交的文件。返回 { state } 四态：
   *   strong  名字+大小+MD5 全一致 → 确认提交已生效（附 f）；
   *   weak    名字+大小一致但列表未提供 MD5（无法核对是否本次提交，可能是
   *           同名同大小的旧文件）→ 状态不明，交人工确认；
   *   none    查询成功但目录里没有该文件 → 提交未生效，可安全重试；
   *   error   目录查询接口本身失败 → 状态不明，禁止当作“未提交”！
   *           （否则网络抖动时盲目重试会产生重复文件）
   * 两轮核查（间隔 1s）：第一轮 strong/weak 即定论；none/error 再查一轮，
   * 以第二轮为准——提交刚生效时列表可能短暂延迟，漏判会诱导重复提交。
   * 我方 MD5 为空（理论场景）时按名字+大小作强匹配。
   */
  function verifyCommittedFile(spec) {
    // spec: { name, size, md5, folderId, familyId }
    function matchIn(r) {
      var md5 = String(spec.md5 || '').toUpperCase();
      var weak = null;
      for (var i = 0; i < r.files.length; i++) {
        var f = r.files[i];
        if (f.name !== spec.name) continue;
        if (spec.size != null && f.size !== Number(spec.size)) continue; // v1.19.0：0 字节文件也参与大小核对
        if (!md5 || f.md5 === md5) return { state: 'strong', f: f };
        if (!f.md5 && !weak) weak = f; // 名字+大小匹配但列表无 MD5：记为弱候选，不轻易认定
      }
      return weak ? { state: 'weak', f: weak } : { state: 'none' };
    }
    function listOnce() {
      return listFolderAll(spec.folderId, spec.familyId).then(matchIn, function (e) {
        // v1.18.7：查询失败 ≠ 目录里没有文件——返回 error 态，禁止当作“未提交”
        return { state: 'error', reason: (e && e.message) ? e.message : '目录查询失败' };
      });
    }
    return listOnce().then(function (m) {
      if (m.state === 'strong' || m.state === 'weak') return m;
      return sleep(1000).then(listOnce); // 未命中/查询出错都再查一轮，以第二轮为准
    });
  }

  /**
   * 带核查的 commit（v1.18.5 起；v1.18.8 成功缺 ID 也核查）。
   * 正常返回提取文件 ID；两种情况会进一步核查目标目录：
   *   ① 提交请求失败（响应丢失/超时）；② 接口正常返回但未提取到文件 ID
   *   （v1.18.8：不能直接报成功，核查目录确认后才定论）。
   * 提交请求失败时按核查四态处置：
   *   - strong（名字+大小+MD5 一致）→ 判定“提交已生效”（避免盲目重试造成
   *     重复文件，批量秒传尤其重要）；
   *   - weak / error（无法核对 MD5 / 核查接口本身失败）→ 抛“状态不明”错误
   *     提示人工确认——既不误判成功、也不贸然鼓励重试（防误判与防重复两不误）；
   *   - none（查询成功且目录里没有该文件）→ 上抛原错误（此时重试安全）。
   * 登录失效/用户中止不核查直接上抛。
   */
  function commitGuarded(doCommit, spec) {
    return doCommit().then(
      function (commitResp) {
        var fileId = commitResp ? String(deepPick(commitResp, ['userFileId', 'UserFileID', 'fileId']) || '') : '';
        if (fileId) return { fileId: fileId, verified: false };
        // v1.18.8：接口正常返回但没提取到文件 ID——不能直接报成功（响应结构
        // 变更/字段改名/缺字段都会走到这里），查目标目录核实后才能定论
        return verifyCommittedFile(spec).then(function (m) {
          if (m.state === 'strong') {
            // v1.18.9：内容匹配但条目缺有效 ID——不能当作完整成功结果
            var vid = String((m.f && m.f.id) || '');
            if (!vid) {
              var ambNoId2 = new Error('提交接口返回成功但未携带文件 ID；核查到内容一致的文件，但目录条目同样缺少文件 ID，无法作为完整成功结果，请刷新目录人工核对');
              ambNoId2.step = 'commit';
              ambNoId2.ambiguous = true;
              throw ambNoId2;
            }
            return { fileId: vid, verified: true };
          }
          var amb = new Error('提交接口返回成功但未携带文件 ID' +
            (m.state === 'weak' ? '；目录核查发现同名同大小文件，但列表未提供 MD5、无法确认是否本次提交'
              : (m.state === 'error'
                ? '；核查目录失败（' + (m.reason || '目录查询失败') + '），无法确认提交状态'
                : '；两轮核查目标目录均未发现该文件')) +
            '，提交状态不明，请刷新目录人工核对');
          amb.step = 'commit';
          amb.ambiguous = true;
          throw amb;
        });
      },
      function (e) {
        stepErr('commit', e);
        if (e && e.aborted) throw e;
        if (looksAuthError(e)) throw e;
        return verifyCommittedFile(spec).then(function (m) {
          if (m.state === 'strong') {
            // v1.18.9：内容匹配但条目缺有效 ID——不能当作完整成功结果
            var vid = String((m.f && m.f.id) || '');
            if (!vid) {
              var ambNoId = new Error('提交请求失败（' + (e && e.message ? e.message : '未知错误') +
                '）；核查到名字/大小/MD5 一致的文件，但目录条目缺少文件 ID，无法作为完整成功结果，请刷新目录人工核对');
              ambNoId.step = 'commit';
              ambNoId.ambiguous = true;
              throw ambNoId;
            }
            return { fileId: vid, verified: true };
          }
          if (m.state === 'weak' || m.state === 'error') {
            // v1.18.7：弱候选与查询失败同属“状态不明”——不判成功、不说可安全
            // 重试，一律交人工确认，防止网络抖动时盲目重试产生重复文件
            var amb = new Error((e && e.message ? e.message : '提交结果未知') +
              (m.state === 'weak'
                ? '；核查发现目标目录已有同名同大小文件，但列表未提供 MD5、无法确认是否本次提交'
                : '；提交后核查目录失败（' + (m.reason || '目录查询失败') + '），无法确认提交状态') +
              '，请刷新目录人工核对后再决定是否重试');
            amb.step = 'commit';
            amb.ambiguous = true;
            throw amb;
          }
          throw e; // state === 'none'：查询成功且目录里没有该文件 → 提交未生效（可安全重试）
        });
      }
    );
  }

  /**
   * 提取接口错误码（v1.18.7 字符串化；v1.18.8 data 层；v1.18.9 成功标记透明化）。
   * code / errorCode / res_code / error 依次取第一个非空值，先查顶层再查 data 层；
   * 数字与字符串形态均可识别，布尔/对象不作错误码。
   * 空值 / 0 / "0" / SUCCESS 均为成功态——跳过继续找，不会作为结果返回。
   * 这样 {code:'SUCCESS', data:{code:'ERROR'}} 不会被顶层 SUCCESS 掩盖
   * （v1.18.9；成功标记语义与 OpenList 189 驱动 RespErr “Code != SUCCESS”一致）。
   * 仅查顶层与已确认的 data 嵌套层，不盲目递归全树。
   */
  function getRespCode(json) {
    if (!json) return '';
    var sources = [json, (json.data && typeof json.data === 'object') ? json.data : null];
    var keys = ['code', 'errorCode', 'res_code', 'error'];
    for (var s = 0; s < sources.length; s++) {
      var obj = sources[s];
      if (!obj) continue;
      for (var i = 0; i < keys.length; i++) {
        var v = obj[keys[i]];
        if (v == null) continue;
        if (typeof v !== 'string' && typeof v !== 'number') continue; // 布尔/对象不算错误码
        var str = String(v).trim();
        // 空值与成功态（0 / "0" / SUCCESS）跳过，继续找真正的错误码
        if (!str || str === '0' || /^success$/i.test(str)) continue;
        return str;
      }
    }
    return '';
  }

  /** 错误消息：先顶层后 data 层（v1.18.9），字段集与 OpenList 189 驱动 RespErr 一致 */
  function getRespMsg(json) {
    if (!json) return '';
    var keys = ['msg', 'message', 'errorMsg', 'res_message', 'error_msg'];
    var sources = [json, (json.data && typeof json.data === 'object') ? json.data : null];
    for (var s = 0; s < sources.length; s++) {
      var obj = sources[s];
      if (!obj) continue;
      for (var i = 0; i < keys.length; i++) {
        if (obj[keys[i]]) return obj[keys[i]];
      }
    }
    return '';
  }

  /** 提取并校验 fileListAO（v1.19.0）：顶层与 data 两层；缺失/非对象直接报错，
   *  绝不当作空目录（listFolderAll 与 getFolderIdByName 共用同一结构校验） */
  function requireFileListAO(json) {
    var ao = (json && json.fileListAO) || (json && json.data && json.data.fileListAO) || null;
    if (!ao || typeof ao !== 'object') {
      throw new Error('目录列表响应缺少 fileListAO 结构（接口返回异常），不能当作空目录处理');
    }
    return ao;
  }

  function friendlyApiError(json) {
    var code = getRespCode(json);
    var msg = getRespMsg(json);
    if (/InfoSecurityErrorCode|black list|security check/i.test(code + ' ' + msg)) {
      return '内容安全审查未通过（InfoSecurityErrorCode）：秒传/哈希去重链路被安全策略拦截；真实上传链路不受此拦截';
    }
    if (/UserDayFlowOverLimited|FlowOverLimited|flow/i.test(code + ' ' + msg)) {
      return '账号当日上传流量已用尽（秒传也计入流量），请明天再试或升级套餐';
    }
    return (code ? '[' + code + '] ' : '') + (msg || '未知错误');
  }

  /** 错误是否为“内容安全拦截”（v1.18.1）：只拦秒传/哈希去重链路；
   *  真实上传（lazyCheck 模式传字节）不受此拦截——与网页版行为一致。 */
  function isSecurityBlock(e) {
    return /InfoSecurityErrorCode|black list|security check|内容安全审查/i
      .test(String(e && e.message || ''));
  }

  /** v1.18.2：uploadApi 失败时附带 endpoint 标记，打印错误时追加所在接口，定位环节 */
  function errNote(e) {
    return (e && e.endpoint) ? '（接口：' + e.endpoint + '）' : '';
  }

  /* ════════════════ 登录态自检（HTTP 状态码 / 登录页识别） ════════════════ */

  /**
   * 判断响应是否"登录已过期"（仅用于期望 JSON 的 cookie/AccessToken 接口）：
   *   - HTTP 301/302/303/307（重定向，多为跳登录页）/ 401 / 403 / 419
   *   - 响应是 HTML（GM 跟随重定向后落在登录页）
   */
  function httpAuthExpired(res) {
    if (!res) return false;
    var st = Number(res.status) || 0;
    if (st === 301 || st === 302 || st === 303 || st === 307 || st === 401 || st === 403 || st === 419) return true;
    var text = String(res.responseText || '');
    if (text && /^\s*<(?:!doctype|html)/i.test(text)) return true;
    return false;
  }

  /** 抛带 authExpired 标记的错误（上层据此失效缓存并重试） */
  function authExpiredError(message) {
    var e = new Error(message);
    e.authExpired = true;
    return e;
  }

  /** 错误/JSON 是否像"鉴权失效"（token/session 过期） */
  function looksAuthError(e) {
    if (e && e.authExpired) return true;
    return /invalid|expire|token|session|notlogin|未登录|登录已过期|accessToken/i
      .test(String(e && e.message || '') + ' ' + String(e && e.code || ''));
  }

  /* ══════════════════════ 会话与 RSA ══════════════════════ */

  var sessionKeyCache = '';
  var sessionUser = '';
  var sessionAvatarUrl = ''; // 登录用户头像 URL（briefInfo / 页面 DOM / 本地存储，多来源兕底）
  var sessionCandidates = []; // 会话密钥候选池（按可靠性排序）
  var sessionCursor = 0;      // 当前使用的候选下标
  var rsaCache = null; // { pkId, pubKey, expire }
  var sessionPoolTs = 0; // v1.19.1：候选池收集时间（TTL 自动保鲜用）
  var SESSION_POOL_TTL = 10 * 60 * 1000; // v1.19.1：超过 10 分钟重新收集——长时间上传/生成期间官方网页会轮换密钥，缓存久了必失效
  var sessionPoolPrimTried = false; // v1.19.1：当前池的首选候选是否已试过失效（是则轮换剩余候选）

  /* ── 头像（底部状态栏"已登录"处显示） ── */

  function resolveImgUrl(u) {
    u = String(u || '').trim();
    if (!u) return '';
    if (u.indexOf('//') === 0) u = 'https:' + u;
    if (u.charAt(0) === '/') {
      try { return location.origin + u; } catch (e) { return u; }
    }
    return u;
  }

  /** 从用户信息 JSON 里找头像字段（各端字段名不一，都试一遍） */
  function pickAvatarFromJson(json) {
    if (!json || typeof json !== 'object') return '';
    var d = (json.data && typeof json.data === 'object') ? json.data : json;
    var fields = ['avatar', 'avatarUrl', 'headIcon', 'icon', 'portraitUrl',
      'photo', 'photoUrl', 'userIcon', 'userAvatar', 'headUrl'];
    for (var i = 0; i < fields.length; i++) {
      var v = d[fields[i]] || json[fields[i]];
      if (typeof v === 'string' && /^https?:\/\/|^\/[^\/]/.test(v.trim())) {
        var u = resolveImgUrl(v);
        if (/^https?:\/\//.test(u)) return u;
      }
    }
    return '';
  }

  /** 从页面 DOM 找头像（右上角用户区 <img>，类名/地址含 avatar/head/portrait） */
  function scanDomAvatar() {
    try {
      var sels = [
        'img[class*="avatar" i]', '[class*="avatar" i] img',
        'img[src*="avatar" i]', 'img[class*="portrait" i]', '[class*="portrait" i] img',
        'img[class*="headImg" i]', 'img[src*="headImg" i]'
      ];
      for (var s = 0; s < sels.length; s++) {
        var list = document.querySelectorAll(sels[s]);
        for (var i = 0; i < list.length; i++) {
          var src = String(list[i].currentSrc || list[i].getAttribute('src') || '');
          if (/^https?:\/\//.test(src) && !/favicon|\.svg(\?|$)|\.ico(\?|$)/i.test(src)) {
            return resolveImgUrl(src);
          }
        }
      }
    } catch (e) {}
    return '';
  }

  /** 从 sessionStorage/localStorage 的用户信息 JSON 里找头像字段 */
  function scanStorageAvatar() {
    try {
      var stores = [window.localStorage, window.sessionStorage];
      for (var s = 0; s < stores.length; s++) {
        var st = stores[s];
        for (var i = 0; i < st.length; i++) {
          var k = st.key(i);
          var v = k ? st.getItem(k) : '';
          if (!v || v.charAt(0) !== '{') continue;
          try {
            var url = pickAvatarFromJson(JSON.parse(v));
            if (url) return url;
          } catch (e) {}
        }
      }
    } catch (e) {}
    return '';
  }

  var avatarLoadedUrl = ''; // 已渲染的头像（避免重复设 src）
  var avatarBadUrl = '';   // 加载失败的头像（不再重复尝试）

  function renderSessionAvatar(url) {
    if (!url || !ui.avatar) return;
    var u = resolveImgUrl(url);
    if (!/^https?:\/\//.test(u)) return;
    if (u === avatarLoadedUrl || u === avatarBadUrl) return;
    avatarLoadedUrl = u;
    ui.avatar.src = u;
    ui.avatar.title = sessionUser || '已登录';
    ui.avatar.style.display = '';
  }

  /** 确保"已登录"旁显示头像：briefInfo 头像 → 页面 DOM → 本地存储，找到即渲染 */
  function ensureAvatarShown() {
    if (avatarLoadedUrl) return;
    var url = sessionAvatarUrl || scanDomAvatar() || scanStorageAvatar();
    if (url) renderSessionAvatar(url);
  }

  /** 从 GM 响应头串中取指定头 */
  function getRespHeader(res, name) {
    var m = String(res && res.responseHeaders || '').match(new RegExp('^' + name + ':\\s*(.+)$', 'mi'));
    return m ? m[1].trim() : '';
  }

  /** 读取网页自身在用的会话密钥（与页面功能同源，最可靠），找不到返回 '' */
  function readSessionKeyFromPage() {
    try { if (window.__sessionKey) return String(window.__sessionKey); } catch (e) {}
    try {
      var stores = [window.sessionStorage, window.localStorage];
      for (var s = 0; s < stores.length; s++) {
        var st = stores[s];
        for (var i = 0; i < st.length; i++) {
          var k = st.key(i);
          if (!k) continue;
          var v = (st.getItem(k) || '').trim();
          if (!v) continue;
          if (k === 'sessionKey' || k === 'SESSION_KEY') return v;
          if (k.toLowerCase().indexOf('sessionkey') >= 0 && /^[A-Za-z0-9_+=\-]{8,}$/.test(v)) return v;
          if (v.indexOf('sessionKey') >= 0 && v.charAt(0) === '{') {
            try {
              var d = JSON.parse(v);
              if (d && typeof d.sessionKey === 'string' && d.sessionKey) return d.sessionKey;
            } catch (e) {}
          }
        }
      }
    } catch (e) {}
    try {
      var cookies = String(document.cookie || '').split(';');
      var names = ['SESSION_KEY', 'sessionKey', 'SESSIONKEY', 'SSON'];
      for (var c = 0; c < cookies.length; c++) {
        var ck = cookies[c].trim();
        for (var n = 0; n < names.length; n++) {
          if (ck.indexOf(names[n] + '=') === 0) {
            var val = ck.substring(names[n].length + 1);
            if (val) return val;
          }
        }
      }
    } catch (e) {}
    return '';
  }

  /**
   * 收集会话密钥候选（按可靠性排序，参考可用实现同源策略）：
   *   1. 网页自身存储（window/sessionStorage/localStorage/cookie）——页面正在用的密钥
   *   2. getUserBriefInfo.action 响应 JSON 的 sessionKey
   *   3. getUserSizeInfo.action 响应头 SessionKey
   * 不同来源的密钥对上传接口的效力可能不同，InvalidSessionKey 时逐个轮换。
   */
  function fetchSessionCandidates() {
    var list = [];
    var pageSk = readSessionKeyFromPage();
    if (pageSk) list.push(pageSk);
    return portalRequest('GET', PORTAL_BASE + '/portal/v2/getUserBriefInfo.action',
      { headers: { accept: 'application/json;charset=UTF-8' } }
    ).catch(function () { return null; }).then(function (res) {
      if (res) {
        var json = parseJsonLoose(res.responseText);
        var sk = json && (json.sessionKey || (json.data && json.data.sessionKey));
        if (sk) list.push(String(sk));
        if (json) {
          sessionUser = json.loginName || json.nickname || json.userName ||
            (json.data && (json.data.loginName || json.data.nickname)) || sessionUser;
          var av = pickAvatarFromJson(json);
          if (av) sessionAvatarUrl = av; // briefInfo 带头像字段时优先用
        }
      }
      return portalRequest('GET', PORTAL_BASE + '/portal/getUserSizeInfo.action',
        { headers: { accept: 'application/json;charset=UTF-8' } }
      ).catch(function () { return null; });
    }).then(function (r2) {
      if (r2) {
        var h = getRespHeader(r2, 'SessionKey') || getRespHeader(r2, 'sessionkey');
        if (h) list.push(h);
      }
      var seen = {};
      var out = [];
      list.forEach(function (k) {
        k = String(k || '').trim();
        if (k && !seen[k]) { seen[k] = 1; out.push(k); }
      });
      return out;
    });
  }

  function refreshSession() {
    return fetchSessionCandidates().then(function (list) {
      sessionCandidates = list;
      sessionCursor = 0;
      sessionPoolTs = Date.now(); // v1.19.1：记录收集时间，TTL 保鲜计时起点
      sessionPoolPrimTried = false;
      if (!list.length) {
        throw new Error('未获取到 SessionKey（可能未登录）：请确认已登录天翼云盘网页后刷新页面');
      }
      sessionKeyCache = list[0];
      return sessionKeyCache;
    });
  }

  /** v1.19.1：InvalidSessionKey 处理策略重写——首次失效先全量重新收集候选池
   *  （长时间上传/生成期间官方网页会轮换会话密钥，页面存储里的新密钥最可靠；
   *  旧版在陈旧候选池内逐个轮换，轮换预算耗尽仍在用过期密钥，表现为
   *  “时不时无效会话”且大文件必须重新上传）；重新收集后仍失效才轮换剩余候选。 */
  function rotateSessionKey() {
    if (sessionPoolPrimTried && sessionCursor + 1 < sessionCandidates.length) {
      sessionCursor++;
      sessionKeyCache = sessionCandidates[sessionCursor];
      rsaCache = null;
      return Promise.resolve(sessionKeyCache);
    }
    sessionKeyCache = '';
    rsaCache = null;
    return refreshSession().then(function (k) {
      sessionPoolPrimTried = true; // 新池首选候选即将重试；若再失效则轮换剩余候选
      return k;
    });
  }

  function ensureSessionKey() {
    // v1.19.1：候选池带 TTL——超时自动重新收集，长时间上传/生成期间密钥始终保持
    // 新鲜（分片之间、提交前都会走这里），避免大文件传到一半撞 InvalidSessionKey；
    // 旧版缓存后一直用到失效为止
    if (sessionKeyCache && Date.now() - sessionPoolTs < SESSION_POOL_TTL) {
      return Promise.resolve(sessionKeyCache);
    }
    return refreshSession();
  }

  /* ── 会话保活（v1.19.1）：长时间上传 / .cas 生成期间，页面若闲置，服务端会话
        会因长时间无活动过期（“上传时间太久，会话到了，无法下载/生成 .cas”的
        根因之一）。每 5 分钟轻量调用一次已验证可用的门户接口续活，官方 PC 端
        同款机制；失败静默，不弹任何提示。 ── */
  var sessionKeepAliveTimer = null;
  function startSessionKeepAlive() {
    if (sessionKeepAliveTimer) return;
    sessionKeepAliveTimer = setInterval(function () {
      portalRequest('GET', PORTAL_BASE + '/portal/v2/getUserBriefInfo.action',
        { headers: { accept: 'application/json;charset=UTF-8' } })
        .catch(function () {}); // 保活尽力而为：失败静默（下次 TTL/轮换仍会全量刷新）
    }, 5 * 60 * 1000);
  }

  /** 解析 generateRsaKey 的 XML 响应（<keyPair><pubKey>…<pkId>…），返回 {pubKey, pkId, expire, ver} */
  function parseXmlRsaKey(xmlText) {
    var out = {};
    ['pubKey', 'pkId', 'expire', 'ver'].forEach(function (name) {
      var m = String(xmlText || '').match(new RegExp('<' + name + '>([\\s\\S]*?)<\\/' + name + '>'));
      if (m) out[name] = m[1].trim();
    });
    return out;
  }

  function rsaKeyError(code, msg) {
    if (/InvalidSessionKey|SessionExpired|NotLogin|InvalidSession/i.test(code)) {
      return new Error('登录状态已过期（' + code + '），请刷新网页重新登录天翼云盘后再试');
    }
    return new Error('获取 RSA 公钥失败：' + code + (msg ? ' ' + msg : ''));
  }

  function tryEnsureRsa() {
    if (rsaCache && (!rsaCache.expire || rsaCache.expire > Date.now())) {
      return Promise.resolve(rsaCache);
    }
    return ensureSessionKey().then(function (sessionKey) {
      var ts = String(Date.now());
      // 天翼已对该接口加校验：需要 sessionKey 参数 + AppKey/Timestamp/MD5 签名头
      var signature = CryptoJS.MD5('AppKey=600100422&Timestamp=' + ts).toString(CryptoJS.enc.Hex);
      return portalRequest('GET',
        PORTAL_BASE + '/security/generateRsaKey.action?sessionKey=' + encodeURIComponent(sessionKey),
        {
          headers: {
            accept: 'application/json',
            'Sign-Type': '1',
            'Signature': signature,
            'Timestamp': ts,
            'AppKey': '600100422',
            'SessionKey': sessionKey
          }
        });
    }).then(function (res) {
      var text = String(res.responseText || '').trim();
      var pubKey = '', pkId = '', expire = 0;
      var json = parseJsonLoose(text);
      if (json && typeof json === 'object') {
        if (json.errorCode) throw rsaKeyError(json.errorCode, json.errorMsg);
        var src = (json.pubKey || json.pkId) ? json : (json.data || {});
        pubKey = src.pubKey || '';
        pkId = src.pkId || '';
        expire = Number(src.expire) || 0;
      } else if (text.charAt(0) === '<') {
        var ec = (text.match(/<errorCode>([\s\S]*?)<\/errorCode>/) || [])[1];
        if (ec) throw rsaKeyError(ec.trim(), (text.match(/<errorMsg>([\s\S]*?)<\/errorMsg>/) || [])[1]);
        var xml = parseXmlRsaKey(text);
        pubKey = xml.pubKey || '';
        pkId = xml.pkId || '';
        expire = Number(xml.expire) || 0;
      }
      if (!pubKey || !pkId) {
        throw new Error('获取 RSA 公钥失败：响应不含公钥（HTTP ' + res.status + '），响应片段：' + text.slice(0, 80) + '…。若反复出现请刷新页面重新登录');
      }
      rsaCache = { pkId: pkId, pubKey: pubKey, expire: expire || Date.now() + 240000 };
      return rsaCache;
    });
  }

  function ensureRsa() {
    var rotated = false;
    function attempt() {
      return tryEnsureRsa().catch(function (e) {
        // 会话失效：换下一个候选密钥重试一次（避免无限循环）
        if (!rotated && /InvalidSession|登录状态已过期/.test(e.message)) {
          rotated = true;
          return rotateSessionKey().then(attempt);
        }
        throw e;
      });
    }
    return attempt();
  }

  /* ══════════════════════ 上传 API（加密+签名） ══════════════════════ */

  function doUploadRequest(path, params, scheme) {
    return Promise.all([ensureSessionKey(), ensureRsa()]).then(function (arr) {
      var sessionKey = arr[0], rsa = arr[1];
      var dateMs = String(Date.now());
      var requestId = uuid();
      var key16 = randomHex(16); // 随机 AES 密钥（16 位 hex 字符）
      var encoded = Object.keys(params).map(function (k) { return k + '=' + params[k]; }).join('&');
      var paramsHex = aesEcbHex(encoded, key16);
      var signature = signHmacSha1({
        sessionKey: sessionKey,
        operate: 'GET',
        requestURI: path,
        dateMs: dateMs,
        paramsHex: paramsHex
      }, key16, scheme.order, scheme.upper);
      var encText = rsaEncryptBase64(key16, rsa.pubKey);

      var url = UPLOAD_BASE + path +
        '?params=' + encodeURIComponent(paramsHex) +
        '&' + URL_SUFFIX + Date.now() + '_' + Math.floor(Math.random() * 1e10);

      var reqHeaders = {
        accept: 'application/json;charset=UTF-8',
        'SessionKey': sessionKey,
        'Signature': signature,
        'X-Request-Date': dateMs,
        'X-Request-ID': requestId,
        'EncryptionText': encText,
        'PkId': rsa.pkId
      };

      // GM 优先（跨域 @connect）；GM 网络层失败（TM 后台栈卡死）时用页面
      // fetch 兕底——网页自身的上传流程就是从本页面跨域调该接口的，CORS 允许。
      return gmXhr({ method: 'GET', url: url, headers: reqHeaders }).catch(function (e) {
        if (e && e.aborted) throw e;
        if (typeof window.fetch !== 'function') throw e;
        return window.fetch(url, { method: 'GET', credentials: 'include', headers: reqHeaders })
          .then(function (r) {
            return r.text().then(function (text) {
              return { status: r.status, responseText: text };
            });
          })
          .catch(function (fe) {
            throw new Error('上传接口网络请求失败（GM 与页面通道均不通：' +
              ((fe && fe.message) || (e && e.message) || '网络错误') +
              '；若页面本身能浏览，请刷新页面或重启浏览器后重试）');
          });
      }).then(function (res) {
        var json = parseJsonLoose(res.responseText);
        if (!json) {
          throw new Error('上传接口响应异常（HTTP ' + res.status + '）：' + String(res.responseText || '').slice(0, 120));
        }
        return json;
      });
    });
  }

  /**
   * 调用 upload.cloud.189.cn 接口（带方案回退）。
   * 成功后记住可用签名方案；签名错误自动换方案重试；会话失效自动刷新。
   */
  /** 上传接口调用：familyId 为空走个人云 /person/*，否则走家庭云 /family/* 并附带 familyId */
  function uploadApi(path, params, familyId) {
    if (familyId) {
      path = String(path).replace(/^\/person/, '/family');
      params = Object.assign({}, params, { familyId: String(familyId) });
    }
    var order = workingScheme
      ? [workingScheme].concat(SIG_SCHEMES.filter(function (s) { return s.name !== workingScheme.name; }))
      : SIG_SCHEMES.slice();
    var sessionRotations = 0;
    var lastError = null;

    function run(i) {
      if (i >= order.length) return Promise.reject(lastError || new Error('上传接口调用失败'));
      var scheme = order[i];
      return doUploadRequest(path, params, scheme).then(function (json) {
        var code = getRespCode(json);
        if (code && /InvalidSignature|SIGNATURE/i.test(code)) {
          lastError = new Error('签名校验失败：' + code);
          return run(i + 1); // 换一种签名方案
        }
        if (code && /InvalidSessionKey|UserSessionNotExist|NotLogin|SessionExpired|未登录/i.test(code)) {
          if (sessionRotations < 3) {
            sessionRotations++;
            return rotateSessionKey().then(function () { return run(i); });
          }
          lastError = new Error('登录状态已失效（' + code + '）：已轮换全部可用会话密钥仍被拒绝，请刷新网页重新登录天翼云盘');
          return Promise.reject(lastError);
        }
        if (code && code !== 'SUCCESS') {
          var bizErr = new Error(friendlyApiError(json));
          bizErr.endpoint = path; // v1.18.2：标记失败发生的接口，日志可直接定位环节
          return Promise.reject(bizErr);
        }
        workingScheme = scheme; // 记住可用方案
        return json;
      }, function (e) {
        // v1.19.1：请求层鉴权类失败（如 generateRsaKey 返回 InvalidSessionKey）
        // 也轮换密钥重试，与响应码路径同等待遇；其余网络层错误不换方案直接上抛
        if (e && looksAuthError(e) && sessionRotations < 3) {
          sessionRotations++;
          return rotateSessionKey().then(function () { return run(i); });
        }
        return Promise.reject(e);
      });
    }
    return run(0);
  }

  /* ══════════════════════ CAS 秒传核心 ══════════════════════ */

  /**
   * 秒传单个文件。
   * item: { name, size, md5, sliceMd5? }
   * onState(state)：可选状态回调（UP_STATE 键：init/check/hit/commit/ok/fail）。
   * v1.18.5：判重四态区分（命中/未命中/未确认/登录失效）；提交带核查防重复。
   * 返回 Promise<{ ok:boolean, message:string, fileId?:string, state?:'miss' }>
   */
  function rapidUploadOne(item, folderId, overwrite, familyId, onState) {
    var size = Number(item.size);
    if (!item.name) return Promise.resolve({ ok: false, message: '缺少文件名' });
    if (!size || size <= 0) return Promise.resolve({ ok: false, message: '文件大小无效（0 字节文件无法上传）' });
    var md5 = String(item.md5 || '').trim().toUpperCase();
    if (!/^[0-9A-F]{32}$/.test(md5)) return Promise.resolve({ ok: false, message: 'MD5 无效（应为 32 位十六进制）' });

    var sliceSize = cassSliceSize(size);
    var sliceMd5 = String(item.sliceMd5 || '').trim().toUpperCase();
    if (!/^[0-9A-F]{32}$/.test(sliceMd5)) {
      if (size <= sliceSize) {
        sliceMd5 = md5; // 单分片：分片摘要 = 整体 MD5
      } else {
        return Promise.resolve({
          ok: false,
          message: '大文件缺少分片摘要 sliceMd5，无法秒传（请用本工具在持有原文件的设备上重新生成秒传码）'
        });
      }
    }

    var initParams = {
      parentFolderId: String(folderId || ROOT_FOLDER_ID),
      fileName: encodeURIComponent(item.name),
      fileSize: String(size),
      sliceSize: String(sliceSize),
      lazyCheck: '1'
    };

    if (onState) onState('init');
    return uploadApi('/person/initMultiUpload', initParams, familyId).catch(function (e) {
      throw stepErr('init', e);
    }).then(function (initResp) {
      // v1.18.4：统一深度提取（兼容顶层/data嵌套与 uploadFileID 大小写变体）
      var uploadFileId = initResp ? deepPick(initResp, ['uploadFileId', 'uploadFileID']) : '';
      if (!uploadFileId) throw stepErr('init', new Error('创建上传会话失败（未返回 uploadFileId）' + (getRespMsg(initResp) ? '：' + getRespMsg(initResp) : '')));

      if (onState) onState('check');
      return uploadApi('/person/checkTransSecond', {
        fileMd5: md5,
        sliceMd5: sliceMd5,
        uploadFileId: uploadFileId
      }, familyId).catch(function (e) {
        throw stepErr('check', e);
      }).then(function (checkResp) {
        // v1.18.5：判重四态区分——接口异常绝不当作“云端没有文件”，否则用户会误以为
        // 内容不存在而放弃秒传；登录失效类错误已由 uploadApi 轮换会话后抛出，不会到这。
        var verdict = classifyTransCheck(checkResp);
        if (verdict.state === 'uncertain') {
          throw stepErr('check', new Error(verdict.message + '，请稍后重试'));
        }
        if (verdict.state === 'miss') {
          if (onState) onState('fail');
          return { ok: false, message: '云端不存在相同内容（未命中），无法秒传', state: 'miss' };
        }
        if (onState) onState('hit');
        if (onState) onState('commit');
        return commitGuarded(function () {
          return uploadApi('/person/commitMultiUploadFile', {
            uploadFileId: uploadFileId,
            fileMd5: md5,
            sliceMd5: sliceMd5,
            lazyCheck: '1',
            isLog: '0',
            opertype: overwrite ? '3' : '1'
          }, familyId);
        }, { name: item.name, size: size, md5: md5, folderId: folderId, familyId: familyId }).then(function (r) {
          if (onState) onState('ok');
          return {
            ok: true,
            message: '秒传成功' + (r.fileId ? '（文件ID ' + r.fileId + '）' : '') +
              (r.verified ? '（已核查目标目录确认提交生效，未产生重复）' : ''),
            fileId: r.fileId
          };
        });
      });
    });
  }

  /** 批量秒传（顺序执行 + 间隔，避免触发风控）；item 带 dirPath 时自动建子目录。
   *  onLine(kind, text)：详细日志；onProgress(cur, total, label)：进度回调（可选）；
   *  shouldAbort(): 可选，返回 true 时在条目边界中止。 */
  function runRapidUpload(items, folderId, overwrite, onLine, onDone, onProgress, shouldAbort, familyId) {
    var okCount = 0, failCount = 0;
    var aborted = false;
    var i = 0;
    var dirCache = {}; // dirPath → 已建好的目录 ID（避免重复建目录）
    function targetFolderOf(item) {
      var dp = String(item.dirPath || '');
      if (!dp) return Promise.resolve(folderId);
      if (dirCache[dp]) return Promise.resolve(dirCache[dp]);
      return ensureFolderPath(dp, folderId, familyId).then(function (id) {
        dirCache[dp] = id;
        return id;
      });
    }
    function next() {
      if (shouldAbort && shouldAbort()) aborted = true;
      if (aborted || i >= items.length) {
        onLine('summary', aborted ?
          '已中止：成功 ' + okCount + ' 个，失败 ' + failCount + ' 个，剩余 ' + (items.length - i) + ' 个未处理' :
          '全部完成：成功 ' + okCount + ' 个，失败 ' + failCount + ' 个');
        if (onProgress) onProgress(items.length, items.length,
          (aborted ? '已中止' : '完成') + '：成功 ' + okCount + '，失败 ' + failCount +
          (aborted ? '，剩余 ' + (items.length - i) : ''));
        if (onDone) onDone({ ok: okCount, fail: failCount, aborted: aborted, remain: items.length - i });
        return;
      }
      var item = items[i++];
      var label = '[' + i + '/' + items.length + '] ' +
        (item.dirPath ? item.dirPath + '/' : '') + item.name + ' (' + fmtSize(item.size) + ')';
      onLine('info', '开始处理 ' + label);
      // v1.18.5：任务状态可视化——进度条实时显示 等待中/正在初始化/正在判重/云端已命中/正在提交…
      if (onProgress) onProgress(i - 1, items.length, item.name + ' · ' + UP_STATE.wait);
      return targetFolderOf(item).then(function (targetFolder) {
        return rapidUploadOne(item, targetFolder, overwrite, familyId, function (st) {
          if (onProgress) onProgress(i - 1, items.length, item.name + ' · ' + (UP_STATE[st] || st));
        });
      }).then(function (r) {
        if (r.ok) { okCount++; onLine('ok', '√ ' + label + '：' + r.message); }
        else { failCount++; onLine('err', '× ' + label + '：' + r.message); }
      }, function (e) {
        failCount++;
        // 失败带阶段标记：网络中断时能看出卡在哪一步，而非笼统的“上传失败”
        var stepTxt = e && e.step ? '（' + (UP_STATE[e.step] || e.step) + '）' : '';
        onLine('err', '× ' + label + stepTxt + '：' + (e && e.message ? e.message : '失败') + errNote(e));
      }).then(function () {
        if (onProgress) onProgress(i, items.length, item.name + '（成功 ' + okCount + ' / 失败 ' + failCount + '）');
        return sleep(300);
      }).then(next);
    }
    onLine('info', '任务开始，共 ' + items.length + ' 个文件，目标目录 ID：' + folderId +
      '，空间：' + (familyId ? '家庭云' : '个人云') + '（name 带路径的条目会自动创建对应子目录）');
    return next();
  }

  /* ══════════════════════ 秒传码解析 ══════════════════════ */

  function normalizeItem(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var name = raw.name || raw.fileName || raw.filename || raw.file_name || raw.path || '';
    var size = Number(raw.size != null ? raw.size : (raw.fileSize != null ? raw.fileSize : raw.file_size));
    var md5 = raw.md5 || raw.MD5 || raw.fileMd5 || raw.file_md5 || '';
    var sliceMd5 = raw.sliceMd5 || raw.sliceMD5 || raw.SliceMd5 || raw.SLICE_MD5 || raw.fileSliceMd5 || raw.slice_md5 || '';
    if (!name || !isFinite(size) || size <= 0 || !md5) return null;
    // 目录来源：显式 dirPath 字段优先；否则从 name 里的路径（"目录/文件名"）拆出
    var explicitDir = String(raw.dirPath || raw.dir || '').replace(/\\/g, '/').replace(/\/+$/, '');
    var full = String(name).replace(/\\/g, '/');
    var slash = full.lastIndexOf('/');
    var dirPath = explicitDir || (slash >= 0 ? full.slice(0, slash) : '');
    return {
      name: slash >= 0 ? full.slice(slash + 1) : full,
      dirPath: dirPath,
      size: size,
      md5: String(md5),
      sliceMd5: sliceMd5 ? String(sliceMd5) : ''
    };
  }

  /** 解码 cloud189:// 链接（生态格式：cloud189:// + Base64(JSON 或 管道串)），失败返回 '' */
  function decode189Link(line) {
    try {
      var b64 = String(line).replace(/^cloud189:\/\//i, '').replace(/\s+/g, '');
      if (!/^[A-Za-z0-9+/=]+$/.test(b64)) return '';
      var bin = atob(b64);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) & 0xff;
      return bytesToText(bytes);
    } catch (e) { return ''; }
  }

  function parseCodes(text) {
    var items = [];
    var errors = [];
    var raw = String(text || '').trim();
    if (!raw) return { items: items, errors: errors };

    // 整段是 JSON（对象或数组）
    var whole = parseJsonLoose(raw);
    if (whole) {
      var arr = Array.isArray(whole) ? whole : [whole];
      arr.forEach(function (o, idx) {
        var item = normalizeItem(o);
        if (item) items.push(item);
        else errors.push('第 ' + (idx + 1) + ' 个 JSON 对象字段不完整');
      });
      if (items.length) return { items: items, errors: errors };
    }

    // 逐行解析
    raw.split(/\r?\n/).forEach(function (line, lineNo) {
      line = line.trim();
      if (!line || /^#/.test(line)) return;

      var json = parseJsonLoose(line);
      if (json) {
        var item = normalizeItem(json);
        if (item) { items.push(item); return; }
        errors.push('第 ' + (lineNo + 1) + ' 行 JSON 字段不完整');
        return;
      }

      // fast://MD5:size/name
      var m = line.match(/^fast:\/\/([0-9a-fA-F]{32}):(\d+)\/(.+)$/);
      if (m) {
        items.push({ name: m[3], dirPath: '', size: Number(m[2]), md5: m[1], sliceMd5: '' });
        return;
      }

      // cloud189://base64（生态链接：内为 JSON 或 名|大小|MD5|分片MD5）
      if (/^cloud189:\/\//i.test(line)) {
        var payload189 = decode189Link(line);
        if (payload189) {
          var item189 = null;
          if (payload189.charAt(0) === '{') {
            var j189 = parseJsonLoose(payload189);
            if (j189 && !Array.isArray(j189)) item189 = normalizeItem(j189);
          } else if (payload189.indexOf('|') > 0) {
            var p189 = payload189.split('|');
            if (p189.length >= 4 && /^\d+$/.test(p189[1])) {
              var sp189 = splitPath(p189[0]);
              item189 = { name: sp189.name, dirPath: sp189.dirPath, size: Number(p189[1]), md5: p189[2], sliceMd5: p189[3] || '' };
            }
          }
          if (item189) { items.push(item189); return; }
        }
        errors.push('第 ' + (lineNo + 1) + ' 行 cloud189:// 链接无效');
        return;
      }

      // 纯 Base64 行（内为 JSON 或 管道串，生态兼容格式）
      if (/^[A-Za-z0-9+/=]+$/.test(line) && line.length % 4 === 0) {
        var b64line = decode189Link('cloud189://' + line);
        if (b64line && (b64line.charAt(0) === '{' || b64line.indexOf('|') > 0)) {
          line = b64line; // 解码后继续走下面的管道/JSON 处理
          var jsonB = parseJsonLoose(line);
          if (jsonB && !Array.isArray(jsonB)) {
            var itemB = normalizeItem(jsonB);
            if (itemB) { items.push(itemB); return; }
          }
        }
      }

      // 189|name|size|md5|sliceMd5  或无前缀的 name|size|md5|sliceMd5
      var isPrefixed = /^189\|/i.test(line);
      if (isPrefixed || line.indexOf('|') > 0) {
        var parts = isPrefixed ? line.split('|').slice(1) : line.split('|');
        if (parts.length >= 4 && /^\d+$/.test(String(parts[1]).trim())) {
          var fullName = String(parts[0]).replace(/\\/g, '/');
          var fs = fullName.lastIndexOf('/');
          items.push({
            name: fs >= 0 ? fullName.slice(fs + 1) : fullName,
            dirPath: fs >= 0 ? fullName.slice(0, fs) : '',
            size: Number(parts[1]),
            md5: parts[2],
            sliceMd5: parts[3] || ''
          });
          return;
        }
        errors.push('第 ' + (lineNo + 1) + ' 行管道格式不完整');
        return;
      }

      errors.push('第 ' + (lineNo + 1) + ' 行无法识别：' + line.slice(0, 40) + (line.length > 40 ? '…' : ''));
    });
    return { items: items, errors: errors };
  }

  /* ══════════════════════ CAS 文件解析（.cas / openlist-seed / .cas.torrent） ══════════════════════ */

  /** path 拆为 { name, dirPath }（目录结构保留，秒传时自动建子目录） */
  function splitPath(pathStr) {
    var s = String(pathStr || '').replace(/\\/g, '/');
    var i = s.lastIndexOf('/');
    return i >= 0 ? { name: s.slice(i + 1), dirPath: s.slice(0, i) } : { name: s, dirPath: '' };
  }

  function basename(pathStr) {
    return splitPath(pathStr).name;
  }

  function bytesToText(bytes) {
    try { return new TextDecoder('utf-8').decode(bytes); } catch (e) { return ''; }
  }

  function binToBytes(bin) {
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) & 0xff;
    return bytes;
  }

  /** 文本 → UTF-8 字节（bytesToText 的逆变换；v1.18.4：个别 GM 实现对
   *  responseType:'arraybuffer' 仍回文本时，用它逆向还原原始字节） */
  function textToBytes(str) {
    str = String(str || '');
    var utf8 = unescape(encodeURIComponent(str)); // UTF-16 码元 → UTF-8 字节串（一字符一字节）
    var bytes = new Uint8Array(utf8.length);
    for (var i = 0; i < utf8.length; i++) bytes[i] = utf8.charCodeAt(i) & 0xff;
    return bytes;
  }

  /** bencode 解码：int → number，字符串 → UTF-8 string，列表 → Array，字典 → Object */
  function bencodeDecode(bytes) {
    var pos = 0;
    function decodeStr(start, end) {
      return bytesToText(bytes.subarray(start, end));
    }
    function decode() {
      if (pos >= bytes.length) throw new Error('bencode 数据不完整');
      var c = bytes[pos];
      if (c === 0x69) { // i…e → 整数
        var end = bytes.indexOf(0x65, pos);
        if (end < 0) throw new Error('bencode 整数缺少结束符');
        var num = parseInt(decodeStr(pos + 1, end), 10);
        if (!isFinite(num)) throw new Error('bencode 整数无效');
        pos = end + 1;
        return num;
      }
      if (c === 0x6c) { // l…e → 列表
        pos++;
        var arr = [];
        while (bytes[pos] !== 0x65) arr.push(decode());
        pos++;
        return arr;
      }
      if (c === 0x64) { // d…e → 字典
        pos++;
        var obj = {};
        while (bytes[pos] !== 0x65) {
          var key = decode();
          if (typeof key !== 'string') throw new Error('bencode 字典键必须是字符串');
          obj[key] = decode();
        }
        pos++;
        return obj;
      }
      if (c >= 0x30 && c <= 0x39) { // <len>:<bytes> → 字符串
        var colon = bytes.indexOf(0x3a, pos);
        if (colon < 0) throw new Error('bencode 字符串缺少冒号');
        var len = parseInt(decodeStr(pos, colon), 10);
        if (!isFinite(len) || len < 0) throw new Error('bencode 字符串长度无效');
        pos = colon + 1;
        if (pos + len > bytes.length) throw new Error('bencode 字符串越界');
        var s = decodeStr(pos, pos + len);
        pos += len;
        return s;
      }
      throw new Error('bencode 非法字符 0x' + c.toString(16) + ' @' + pos);
    }
    var value = decode();
    if (pos !== bytes.length) throw new Error('bencode 存在多余数据');
    return value;
  }

  function upperHex(s) { return String(s || '').trim().toUpperCase(); }

  function isValidMd5(s) { return /^[0-9A-F]{32}$/.test(String(s || '').trim().toUpperCase()); }

  /** 逐片列表可信时推算最终分片摘要：MD5(大写逐片 MD5 用 \n 拼接)，大写输出 */
  function sliceMd5FromParts(parts) {
    if (!Array.isArray(parts) || !parts.length) return '';
    return SparkMD5.hash(parts.map(upperHex).join('\n')).toUpperCase();
  }

  /**
   * openlist-sharing-seed（JSON 或 torrent 内 x-openlist bencode）→ 秒传条目。
   * 规则对齐 OpenList buildCASFileEntry：
   *   sliceSize 由文件大小唯一决定；逐片列表仅当种子 piece_size 与 CAS 分片
   *   大小一致且片数吻合才可信；cas_slice_md5 显式值优先；单分片文件取整体 MD5。
   */
  function parseSeedToItems(seed, res) {
    var files = Array.isArray(seed && seed.files) ? seed.files : [];
    if (!files.length) { res.errors.push('种子中没有任何文件'); return; }
    var seedPieceSize = Number(seed.piece_size) || 0;
    for (var i = 0; i < files.length; i++) {
      var f = files[i] || {};
      var sp = splitPath(f.path);
      var name = sp.name;
      var dirPath = sp.dirPath;
      var size = Number(f.size);
      var md5 = upperHex(f.hashes && f.hashes.md5);
      var cloud = String(f.cas_cloud || '');
      var label = name || ('第 ' + (i + 1) + ' 项');
      if (cloud && cloud !== '189') { res.errors.push(label + '：非天翼云盘 CAS 数据（cloud=' + cloud + '），已跳过'); continue; }
      if (!name) { res.errors.push(label + '：缺少文件名（path）'); continue; }
      if (!isFinite(size) || size <= 0) { res.errors.push(name + '：文件大小无效'); continue; }
      if (!isValidMd5(md5)) { res.errors.push(name + '：缺少有效的整文件 MD5'); continue; }
      var sliceSize = cassSliceSize(size);
      var parts = null;
      var pieces = f.hashes && f.hashes.pieces && f.hashes.pieces.md5;
      if (seedPieceSize === sliceSize && Array.isArray(pieces) &&
          pieces.length === cassPartCount(size)) {
        parts = pieces;
      }
      var sliceMd5 = upperHex(f.cas_slice_md5);
      if (!sliceMd5 && parts) sliceMd5 = sliceMd5FromParts(parts);
      if (!sliceMd5 && size <= sliceSize) sliceMd5 = md5;
      if (!isValidMd5(sliceMd5)) {
        res.errors.push(name + '：大文件缺少最终分片摘要（cas_slice_md5 或按 CAS 分片大小计算的逐片 MD5），无法秒传');
        continue;
      }
      res.items.push({ name: name, dirPath: dirPath, size: size, md5: md5, sliceMd5: sliceMd5 });
    }
  }

  /**
   * .cas JSON 载荷（CASPayload，Base64 或裸 JSON）→ 秒传条目。
   * 规则对齐 OpenList casEntryToSeedFile：sliceMd5 显式值优先；
   * partsMd5/slice_md5s 仅当声明 slice_size 与 CAS 规则一致且片数吻合才可推算。
   */
  function parseCasPayloadToItems(payload, res) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      res.errors.push('CAS 载荷缺少 name 字段');
      return;
    }
    var entries = Array.isArray(payload.files) && payload.files.length
      ? payload.files
      : [payload]; // legacy 单文件五字段
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i] || {};
      var spE = splitPath(e.name);
      var name = spE.name;
      var dirPath = spE.dirPath;
      var size = Number(e.size);
      var md5 = upperHex(e.md5);
      var cloud = String(e.cloud || '');
      var label = name || ('第 ' + (i + 1) + ' 项');
      if (cloud && cloud !== '189') { res.errors.push(label + '：非天翼云盘 CAS 数据（cloud=' + cloud + '），已跳过'); continue; }
      if (!name) { res.errors.push(label + '：缺少文件名（name）'); continue; }
      if (!isFinite(size) || size <= 0) { res.errors.push(name + '：文件大小无效'); continue; }
      if (!isValidMd5(md5)) { res.errors.push(name + '：缺少有效的整文件 MD5'); continue; }
      var sliceSize = cassSliceSize(size);
      var parts = Array.isArray(e.partsMd5) && e.partsMd5.length ? e.partsMd5
        : (Array.isArray(e.slice_md5s) && e.slice_md5s.length ? e.slice_md5s : null);
      var sliceMd5 = upperHex(e.sliceMd5 || e.slice_md5 || '');
      if (!sliceMd5 && size <= sliceSize) {
        sliceMd5 = md5;
      } else if (!sliceMd5 && parts &&
                 (!Number(e.slice_size) || Number(e.slice_size) === sliceSize) &&
                 parts.length === cassPartCount(size)) {
        sliceMd5 = sliceMd5FromParts(parts);
      }
      if (!isValidMd5(sliceMd5)) {
        res.errors.push(name + '：大文件缺少最终分片摘要（sliceMd5 或与 CAS 分片规则吻合的逐片 MD5），无法秒传');
        continue;
      }
      res.items.push({ name: name, dirPath: dirPath, size: size, md5: md5, sliceMd5: sliceMd5 });
    }
  }

  /** .cas.torrent（bencode）→ 秒传条目：优先 x-openlist（多文件），其次 x-cas（单文件），最后 BT md5sum 尽力而为 */
  function parseTorrentToItems(torrent, res) {
    var got = false;
    var xOpenlist = torrent['x-openlist'];
    if (xOpenlist && typeof xOpenlist === 'object' && Array.isArray(xOpenlist.files)) {
      parseSeedToItems(xOpenlist, res);
      got = res.items.length > 0;
    }
    var info = torrent.info || {};
    var xCas = torrent['x-cas'];
    if (!got && xCas && typeof xCas === 'object') {
      var md5 = upperHex(xCas.file_md5);
      var size = Number(info.length);
      var name = String(info.name || 'file');
      if (isFinite(size) && size > 0 && isValidMd5(md5)) {
        var sliceSize = cassSliceSize(size);
        var sliceMd5 = upperHex(xCas.slice_md5);
        if (!sliceMd5 && size <= sliceSize) sliceMd5 = md5;
        if (!sliceMd5 && Array.isArray(xCas.slice_md5s) &&
            xCas.slice_md5s.length === cassPartCount(size)) {
          sliceMd5 = sliceMd5FromParts(xCas.slice_md5s);
        }
        if (isValidMd5(sliceMd5)) {
          res.items.push({ name: name, size: size, md5: md5, sliceMd5: sliceMd5 });
          got = true;
        } else {
          res.errors.push(name + '：大文件缺少最终分片摘要（slice_md5 或逐片 MD5），无法秒传');
        }
      } else {
        res.errors.push('x-cas 扩展数据不完整（缺 file_md5 / size）');
      }
    }
    if (!got && !res.items.length) {
      // 兜底：BT 标准字段（info.md5sum / files[].md5sum），只能处理单分片以内的小文件
      var rawFiles = Array.isArray(info.files) && info.files.length
        ? info.files.map(function (f) {
            return { name: basename(Array.isArray(f.path) ? f.path.join('/') : ''), size: Number(f.length), md5: String(f.md5sum || '') };
          })
        : [{ name: String(info.name || ''), size: Number(info.length), md5: String(info.md5sum || '') }];
      var anyCandidate = false;
      for (var i = 0; i < rawFiles.length; i++) {
        var f = rawFiles[i];
        if (!f.name || !isFinite(f.size) || f.size <= 0 || !isValidMd5(f.md5)) continue;
        anyCandidate = true;
        var sliceSize = cassSliceSize(f.size);
        if (f.size <= sliceSize) {
          res.items.push({ name: f.name, size: f.size, md5: f.md5.toUpperCase(), sliceMd5: f.md5.toUpperCase() });
        } else {
          res.errors.push(f.name + '：BT 种子无 CAS 分片摘要且文件大于单片（>10MiB），无法秒传');
        }
      }
      if (!anyCandidate && !res.errors.length) {
        res.errors.push('torrent 中没有可用的 MD5 信息（需要 x-cas / x-openlist 扩展或 md5sum 字段）');
      }
    }
    return res;
  }

  /**
   * CAS 文件统一入口：识别 .cas.torrent（bencode）/ .cas（Base64+JSON）/ 裸 JSON / openlist-sharing-seed。
   * bytes: Uint8Array；text: 同内容按 UTF-8 解码的文本（可为空）。
   * 返回 { items:[{name,size,md5,sliceMd5}], errors:[], format:'' }
   */
  function parseCasContent(bytes, text) {
    var res = { items: [], errors: [], format: '' };
    text = String(text || '').replace(/^\uFEFF/, '').trim();
    var firstChar = text.charAt(0);

    // 1. JSON 文本（裸 JSON / openlist-sharing-seed）
    var json = (firstChar === '{' || firstChar === '[') ? parseJsonLoose(text) : null;

    // 2. Base64 包裹的 JSON（.cas 参考实现为 base64 编码的 JSON）
    if (!json && /^[A-Za-z0-9+/\r\n=]+$/.test(text)) {
      try {
        var decoded = bytesToText(binToBytes(atob(text.replace(/\s+/g, ''))));
        var dFirst = decoded.trim().charAt(0);
        if (dFirst === '{' || dFirst === '[') json = parseJsonLoose(decoded.trim());
      } catch (e) { /* 非法 base64，忽略 */ }
    }

    if (json && typeof json === 'object') {
      if (Array.isArray(json)) {
        // 裸 JSON 数组：逐个元素按载荷/种子解析合并（支持多对象批量粘贴）
        res.format = 'cas-array';
        var anyEntry = false;
        for (var j = 0; j < json.length; j++) {
          var o = json[j];
          if (o && typeof o === 'object' && !Array.isArray(o) &&
              (o.format === 'openlist-sharing-seed' ||
               (Array.isArray(o.files) && o.files.length && o.files[0] && o.files[0].hashes))) {
            parseSeedToItems(o, res);
            anyEntry = true;
          } else {
            var before = res.items.length;
            parseCasPayloadToItems(o, res);
            if (res.items.length > before) anyEntry = true;
          }
        }
        if (!anyEntry && !res.errors.length) {
          res.errors.push('JSON 数组为空或没有可用条目');
        }
        return res;
      }
      if (json.format === 'openlist-sharing-seed' ||
          (Array.isArray(json.files) && json.files.length && json.files[0] && json.files[0].hashes && !json.files[0].md5)) {
        res.format = 'openlist-sharing-seed';
        parseSeedToItems(json, res);
        return res;
      }
      if (json.name || json.files) {
        res.format = 'cas-payload';
        parseCasPayloadToItems(json, res);
        return res;
      }
      res.errors.push('JSON 内容既不是 .cas 载荷也不是 openlist-sharing-seed 种子');
      return res;
    }

    // 3. bencode（.cas.torrent 以 'd' 开头）
    if (bytes && bytes.length && bytes[0] === 0x64) {
      try {
        res.format = 'cas-torrent';
        return parseTorrentToItems(bencodeDecode(bytes), res);
      } catch (e) {
        res.errors.push('torrent 解析失败：' + (e && e.message ? e.message : e));
        return res;
      }
    }

    res.errors.push('无法识别的 CAS 文件内容（支持 .cas JSON/Base64、openlist-sharing-seed JSON、.cas.torrent）');
    return res;
  }

  /**
   * 粘贴多段内容批量解析：优先整段（支持 JSON 数组）；整段无果且多行时，
   * 逐行各当独立载荷解析（适配"一行一个 JSON"的导出格式）。
   */
  function parseCasTextBatch(text) {
    var whole = parseCasContent(null, text);
    if (whole.items.length || !String(text || '').trim()) {
      return { items: whole.items, errors: whole.errors };
    }
    var lines = String(text).split(/\r?\n/)
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return s && s.charAt(0) !== '#'; });
    if (lines.length <= 1) {
      return { items: whole.items, errors: whole.errors };
    }
    var items = [], errors = [], anyOk = false;
    lines.forEach(function (line) {
      var r = parseCasContent(null, line);
      if (r.items.length) {
        anyOk = true;
        items = items.concat(r.items);
      } else {
        errors = errors.concat(r.errors);
      }
    });
    if (!anyOk) return { items: [], errors: errors };
    return { items: items, errors: errors };
  }

  /* ══════════════════════ 云盘文件读取与 .cas 导出（cookie 鉴权） ══════════════════════ */

  function apiGet(url) {
    function attempt() {
      return portalRequest('GET', url, { headers: { accept: 'application/json;charset=UTF-8' } })
        .then(function (res) {
        if (httpAuthExpired(res)) {
          throw authExpiredError('登录已过期（HTTP ' + res.status + '，页面可能已被登出）：请刷新天翼云盘网页重新登录后再试');
        }
        var json = parseJsonLoose(res.responseText);
        if (!json) {
          throw new Error('接口响应异常（HTTP ' + res.status + '）' +
            (String(res.responseText || '').slice(0, 80) ? '：' + String(res.responseText || '').slice(0, 80) + '…' : ''));
        }
        // v1.19.0：错误码/消息统一走 getRespCode/getRespMsg（顶层+data 层，SUCCESS/0 透明），
        // 与 apiPostForm/parseFamilyRes 共用同一套解析；旧版只看顶层 res_code 会漏判嵌套错误码
        var code = getRespCode(json);
        if (code) throw new Error('接口错误：' + (getRespMsg(json) || code));
        return json;
      });
    }
    // 网络抖动自动重试一次（登录过期等明确错误不重试）
    return attempt().catch(function (e) {
      if (looksAuthError(e)) throw e;
      return sleep(500).then(attempt);
    });
  }

  /** 从 createFolder 响应中提取新目录 ID（v1.18.4）：先试常见直接路径，
   *  再全树深度查找兜底，兼容顶层 id / data / fileFolderInfo / XML 扁平化等结构 */
  function extractCreatedFolderId(json) {
    if (!json || typeof json !== 'object') return '';
    var direct = [
      json.id, json.folderId, json.fileId,
      json.data && json.data.id, json.data && json.data.folderId, json.data && json.data.fileId,
      json.fileFolderInfo && (json.fileFolderInfo.id || json.fileFolderInfo.fileId)
    ];
    for (var i = 0; i < direct.length; i++) {
      if (direct[i] != null && String(direct[i]) !== '') return String(direct[i]);
    }
    var deep = deepPick(json, ['fileFolderId', 'folderId', 'fileId', 'id']);
    return deep == null ? '' : String(deep);
  }

  /**
   * 创建子目录（POST open/file/createFolder.action，cookie 鉴权）。
   * 已存在时通过列表按名查找返回现有 ID（幂等）。
   * v1.18.4：目录 ID 提取改走 extractCreatedFolderId；个人云补 XML 解析兜底
   * 与登录态检查；家庭云提取失败不再静默返回空 ID（旧版空 ID 会让后续上传
   * 落到错误目录），改按名查找，仍查不到则报错。
   */
  function createFolder(parentFolderId, folderName, familyId) {
    if (familyId) {
      // 家庭云：POST api.cloud.189.cn/open/family/file/createFolder.action（参数名 parentId）
      // v1.18.8：区分错误类型——登录失效/权限不足直接报错（按名查询同样会失败，
      // 兜底只会掩盖真实原因）；仅“创建可能已生效但响应丢失”或“目录已存在”类
      // 失败才按名查询兜底
      var famLastErr = null;
      return familyApiPostForm('/open/family/file/createFolder.action', {
        familyId: String(familyId),
        folderName: folderName,
        parentId: String(parentFolderId)
      }).then(function (json) {
        var id = extractCreatedFolderId(json);
        if (id) return id;
        // 响应结构不认识：不能静默给空 ID（后续上传会落到错误目录），按名查找兜底
        famLastErr = new Error('创建目录响应未包含目录 ID');
        return getFolderIdByName(parentFolderId, folderName, familyId);
      }).catch(function (e) {
        if (e && e.aborted) throw e;
        if (looksAuthError(e) ||
            /权限|无权|forbidden|denied|privilege|非家庭成员/i.test(String((e && e.message) || ''))) {
          throw e; // 登录失效/权限不足：按名查询也会失败，直接暴露真实原因
        }
        famLastErr = e; // 网络/超时/已存在类：创建可能已生效但响应丢失，按名查询兜底
        return getFolderIdByName(parentFolderId, folderName, familyId);
      }).then(function (id) {
        if (!id) {
          throw new Error('家庭云创建目录失败（未能创建或找到：' + folderName + '）' +
            (famLastErr && famLastErr.message ? '：' + famLastErr.message : ''));
        }
        return id;
      });
    }
    return portalRequest('POST', PORTAL_BASE + '/open/file/createFolder.action', {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json;charset=UTF-8',
        'Sign-Type': '1'
      },
      form: 'parentFolderId=' + encodeURIComponent(String(parentFolderId)) +
        '&folderName=' + encodeURIComponent(folderName)
    }).then(function (res) {
      if (httpAuthExpired(res)) {
        throw authExpiredError('登录已过期（HTTP ' + res.status + '，页面可能已被登出）：请刷新天翼云盘网页重新登录后再试');
      }
      var json = parseJsonLoose(res.responseText) || parseXmlToFields(res.responseText);
      var id = extractCreatedFolderId(json);
      if (id) return id;
      // 提取不到（多为“目录已存在”）：按名查找现有目录，幂等返回
      return getFolderIdByName(parentFolderId, folderName).then(function (id2) {
        if (!id2) throw new Error('创建目录失败：' +
          ((json && (json.res_message || json.errorMsg)) || '接口响应异常（HTTP ' + res.status + '）'));
        return id2;
      });
    });
  }

  /** 在目录列表中按名字查子目录 ID；家庭云走家庭接口。
   *  v1.18.9：查询失败不再吞错——只有查询成功且未找到时才返回 null；
   *  v1.19.0：结构校验（缺 fileListAO 直接报错，不当作空目录）；
   *  条目 ID 有效性校验（个人云旧版 String(list[i].id) 在缺 id 时会产生
   *  字面量 "undefined"，被后续建目录/上传流程误当有效目录 ID）。 */
  function getFolderIdByName(parentFolderId, folderName, familyId) {
    var listUrl;
    if (familyId) {
      listUrl = '/open/family/file/listFiles.action?familyId=' + encodeURIComponent(String(familyId)) +
        '&folderId=' + encodeURIComponent(String(parentFolderId)) +
        '&pageSize=100&pageNum=1&mediaType=0&iconOption=5&orderBy=3&descending=true';
      return familyGetJson(listUrl).then(function (json) {
        var list = requireFileListAO(json).folderList || [];
        for (var i = 0; i < list.length; i++) {
          if (list[i].name !== folderName) continue;
          var fid = list[i].id || list[i].fileId;
          if (fid != null && String(fid).trim() !== '') return String(fid); // 有效性校验
        }
        return null; // 查询成功且无匹配
      });
    }
    return apiGet(PORTAL_BASE + '/open/file/listFiles.action?folderId=' +
      encodeURIComponent(String(parentFolderId)) +
      '&mediaType=0&orderBy=lastOpTime&descending=true&pageNum=1&pageSize=100')
      .then(function (json) {
        var list = requireFileListAO(json).folderList || [];
        for (var i = 0; i < list.length; i++) {
          if (list[i].name !== folderName) continue;
          var fid = list[i].id || list[i].fileId; // v1.19.0：补 fileId 兼容 + 有效性校验
          if (fid != null && String(fid).trim() !== '') return String(fid);
        }
        return null; // 查询成功且无匹配
      });
  }

  /* ══════════════════════ 批量任务接口（转存后删除 .cas 用） ══════════════════════ */

  /* ════════════════ accessToken 缓存（带 TTL，鉴权失败自动失效重读） ════════════════ */

  /** 从网页本地存储读 accessToken（网页前端会存，签名用）。
   *  v1.14.0 前是"读一次永久缓存"，token 过期后家庭云接口全部悄悄失败；
   *  现在缓存 10 分钟（页面换新 token 能跟上），鉴权类失败主动失效并重读一次。 */
  var accessTokenCache = { value: '', ts: 0 };
  var ACCESS_TOKEN_TTL = 10 * 60 * 1000;

  function readAccessTokenFromStorage() {
    try {
      var t = window.localStorage.getItem('accessToken');
      if (t && t.length > 10) return t;
      for (var i = 0; i < window.localStorage.length; i++) {
        var k = window.localStorage.key(i);
        var v = k ? window.localStorage.getItem(k) : '';
        if (k && k.toLowerCase().indexOf('accesstoken') >= 0 && v && v.length > 10) return v;
      }
    } catch (e) {}
    return '';
  }

  function getAccessToken() {
    var now = Date.now();
    if (accessTokenCache.value && now - accessTokenCache.ts < ACCESS_TOKEN_TTL) {
      return accessTokenCache.value;
    }
    var fresh = readAccessTokenFromStorage();
    if (fresh) {
      accessTokenCache = { value: fresh, ts: now };
      return fresh;
    }
    return accessTokenCache.value || ''; // 存储里暂时读不到：沿用旧值（有总比没有强）
  }

  /** accessToken 判失效：连坐清空家庭 ID / 家庭根目录缓存，下次请求重建 */
  function invalidateAccessToken() {
    accessTokenCache = { value: '', ts: 0 };
    familyIdCache = '';
    familyRootFolderId = '';
  }

  /**
   * POST 表单接口（open/batch 等）。带上 WAF/服务端需要的完整要素：
   *   ① clientType/version 客户端标识参数（OpenList 所有请求同款）
   *   ② AccessToken + Timestamp + Signature=MD5(AccessToken=..&Timestamp=..&<参数按key排序>)
   *      （网页端与 OpenList 同款签名；token 取不到时退化为普通请求）
   * 鉴权类失败自动失效 token 缓存并整体重试一次。
   */
  function apiPostForm(url, params) {
    function attempt() {
      var ts = String(Date.now());
      var fullUrl = url + (url.indexOf('?') < 0 ? '?' : '&') +
        'clientType=TELEPC&version=7.2.4&channelId=web_cloud.189.cn&rand=' +
        ts + '_' + Math.floor(Math.random() * 1e10);
      // 签名串：AccessToken/Timestamp + query 与 body 参数（按 key 排序，原始值）
      var entries = [];
      var qIdx = fullUrl.indexOf('?');
      fullUrl.slice(qIdx + 1).split('&').forEach(function (kv) {
        var eq = kv.indexOf('=');
        if (eq > 0) {
          var raw = kv.slice(eq + 1);
          try { raw = decodeURIComponent(raw); } catch (e) {}
          entries.push([kv.slice(0, eq), raw]);
        }
      });
      Object.keys(params).forEach(function (k) { entries.push([k, String(params[k])]); });
      entries.sort(function (a, b) { return a[0] < b[0] ? -1 : (a[0] > b[0] ? 1 : 0); });
      var headers = {
        'Accept': 'application/json;charset=UTF-8',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Sign-Type': '1',
        'User-Agent': DEFAULT_UA,
        'Referer': 'https://cloud.189.cn/web/main'
      };
      var token = getAccessToken();
      if (token) {
        var items = ['AccessToken=' + token, 'Timestamp=' + ts];
        entries.forEach(function (e) { items.push(e[0] + '=' + e[1]); });
        headers.AccessToken = token;
        headers.Timestamp = ts;
        headers.Signature = CryptoJS.MD5(items.join('&')).toString(CryptoJS.enc.Hex).toLowerCase();
      }
      var data = Object.keys(params).map(function (k) {
        return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
      }).join('&');
      return portalRequest('POST', fullUrl, { headers: headers, form: data })
        .then(function (res) {
        if (httpAuthExpired(res)) {
          throw authExpiredError('登录已过期（HTTP ' + res.status + '）：请刷新天翼云盘网页重新登录后再试');
        }
        var json = parseJsonLoose(res.responseText);
        if (!json) json = parseXmlToFields(res.responseText); // 批量任务接口可能返回 XML（<TaskIdResp> 等）
        if (!json) {
          throw new Error('接口响应异常（HTTP ' + res.status + '）' +
            (String(res.responseText || '').slice(0, 60) ? '：' + String(res.responseText || '').slice(0, 60) : ''));
        }
        // v1.19.0：错误码/消息统一走 getRespCode/getRespMsg（顶层+data 层，SUCCESS/0 透明）
        var code = getRespCode(json);
        if (code) {
          var msg = getRespMsg(json) || code;
          if (/invalid|expire|token|session|notlogin|login/i.test(String(code) + ' ' + String(msg))) {
            throw authExpiredError('AccessToken 已失效（' + msg + '）：正在自动重取并重试');
          }
          throw new Error('接口错误：' + msg);
        }
        return json;
      });
    }
    var retried = false;
    function run() {
      return attempt().catch(function (e) {
        if (looksAuthError(e) && !retried) {
          retried = true;
          invalidateAccessToken();
          return sleep(300).then(run);
        }
        throw e;
      });
    }
    return run();
  }

  /** 创建批量任务（DELETE / CLEAR_RECYCLE 等） */
  function createBatchTask(type, taskInfos, targetFolderId) {
    return apiPostForm(PORTAL_BASE + '/open/batch/createBatchTask.action?noCache=' + Math.random(), {
      type: type,
      taskInfos: JSON.stringify(taskInfos),
      targetFolderId: targetFolderId == null ? '' : String(targetFolderId)
    });
  }

  /** 查询批量任务状态 */
  function checkBatchTask(type, taskId) {
    return apiPostForm(PORTAL_BASE + '/open/batch/checkBatchTask.action?noCache=' + Math.random(), {
      type: type,
      taskId: String(taskId)
    });
  }

  /** v1.18.4：三个提取器统一改走 deepPick——旧版 “json.data && json.taskId”
   *  类条件判错取值位置（判 data 却读顶层），嵌套结构一律取空，导致
   *  waitBatchTask 轮询不到状态只能等 30s 超时。deepPick 兼容顶层 /
   *  data / taskInfo / XML 扁平化 / 任意嵌套，且大小写变体均可命中。 */
  function extractTaskId(json) {
    var v = deepPick(json, ['taskId', 'taskID']);
    return v == null ? '' : String(v);
  }

  function extractTaskStatus(json) {
    var raw = deepPick(json, ['taskStatus']);
    return raw == null ? null : Number(raw);
  }

  function taskCount(json, key) {
    var n = Number(deepPick(json, [key]));
    return isFinite(n) ? n : 0;
  }

  /** 轮询等待批量任务完成（status=4 完成或计数达标；status<0 失败），超时 30s */
  function waitBatchTask(type, taskId, timeoutMs) {
    var deadline = Date.now() + (timeoutMs || 30000);
    function poll() {
      if (Date.now() > deadline) {
        return Promise.reject(new Error(type + ' 任务等待超时'));
      }
      return checkBatchTask(type, taskId).then(function (json) {
        var status = extractTaskStatus(json);
        var ok = taskCount(json, 'successedCount');
        var fail = taskCount(json, 'failedCount');
        var skip = taskCount(json, 'skipCount');
        var sub = taskCount(json, 'subTaskCount');
        if (status === 4) return json;
        if (sub > 0 && ok + fail + skip >= sub) {
          if (fail > 0) throw new Error(type + ' 任务失败数量：' + fail);
          return json;
        }
        if (status === 2) throw new Error('目标目录存在同名文件（任务状态=2），请先处理重名后重试');
        if (status != null && status < 0) throw new Error(type + ' 任务失败（状态码 ' + status + '）');
        return sleep(600).then(poll);
      });
    }
    return poll();
  }

  /**
   * 删除云盘文件：DELETE 批量任务（移入回收站）→ 尝试 CLEAR_RECYCLE 彻底清空。
   * DELETE 成功（已进回收站）即视为完成；CLEAR_RECYCLE 失败不影响结果（可在网页回收站手动清）。
   * familyId 为空走个人云（cloud.189.cn），否则走家庭云（api.cloud.189.cn，需 srcParentId）。
   * 返回 { recycled: true, fullyCleared: boolean }。
   */
  function deleteCloudFile(fileId, fileName, familyId, srcParentId) {
    var taskInfos;
    function runTask(type) {
      if (familyId) {
        return familyApiPostForm('/open/batch/createBatchTask.action', {
          type: type,
          taskInfos: JSON.stringify(taskInfos),
          targetFolderId: ''
        }).then(function (r) {
          var taskId = extractTaskId(r);
          if (!taskId) throw new Error('未获取到 ' + type + ' 任务ID');
          return familyApiPostForm('/open/batch/checkBatchTask.action', {
            type: type, taskId: String(taskId)
          });
        }).then(function (json) {
          var status = extractTaskStatus(json);
          if (status === 4) return json;
          if (status != null && status < 0) throw new Error(type + ' 家庭云任务失败（状态 ' + status + '）');
          return json;
        });
      }
      return createBatchTask(type, taskInfos, '').then(function (r) {
        var taskId = extractTaskId(r);
        if (!taskId) throw new Error('未获取到 ' + type + ' 任务ID');
        return waitBatchTask(type, taskId);
      });
    }
    if (familyId) {
      taskInfos = [{
        fileId: String(fileId), fileName: fileName || '', isFolder: 0,
        srcParentId: String(srcParentId || '')
      }];
    } else {
      taskInfos = [{ fileId: String(fileId), fileName: fileName || '', isFolder: 0 }];
    }
    return runTask('DELETE').then(function () {
      // 已移入回收站；继续尝试彻底清空（尽力而为）
      return runTask('CLEAR_RECYCLE').then(function () { return true; },
        function () { return false; });
    }).then(function (fullyCleared) {
      return { recycled: true, fullyCleared: !!fullyCleared };
    });
  }

  /* ══════════════════════ 家庭云支持（api.cloud.189.cn + AccessToken 签名） ══════════════════════ */

  var FAMILY_API = 'https://api.cloud.189.cn';
  var familyIdCache = '';       // 家庭 ID
  var familyRootFolderId = '';  // 家庭云根目录 ID

  /** 正在浏览家庭云页面（/web/family/） */
  function isFamilySpace() {
    return String(window.location.pathname || '').indexOf('/web/family') >= 0;
  }

  /** 家庭云模式：正在浏览家庭云页面时自动切换（避免用个人接口读家庭目录报错） */
  function familyActive() {
    return isFamilySpace();
  }

  /** 家庭云请求头：AccessToken + Timestamp + Signature=MD5(AccessToken/Timestamp/参数按key排序) */
  function familyHeaders(url, extraParams) {
    var headers = {
      'Accept': 'application/json;charset=UTF-8',
      'Sign-Type': '1',
      'User-Agent': DEFAULT_UA
    };
    var token = getAccessToken();
    if (token) {
      var ts = String(Date.now());
      var entries = [];
      var qIdx = String(url).indexOf('?');
      if (qIdx >= 0) {
        String(url).slice(qIdx + 1).split('&').forEach(function (kv) {
          var eq = kv.indexOf('=');
          if (eq > 0) {
            var raw = kv.slice(eq + 1);
            try { raw = decodeURIComponent(raw); } catch (e) {}
            entries.push([kv.slice(0, eq), raw]);
          }
        });
      }
      if (extraParams) {
        Object.keys(extraParams).forEach(function (k) {
          entries.push([k, String(extraParams[k])]);
        });
      }
      entries.sort(function (a, b) { return a[0] < b[0] ? -1 : (a[0] > b[0] ? 1 : 0); });
      var items = ['AccessToken=' + token, 'Timestamp=' + ts];
      entries.forEach(function (e) { items.push(e[0] + '=' + e[1]); });
      headers.AccessToken = token;
      headers.Timestamp = ts;
      headers.Signature = CryptoJS.MD5(items.join('&')).toString(CryptoJS.enc.Hex).toLowerCase();
    }
    return headers;
  }

  /** 家庭云 GET（签名头；token 缺失直接报错，提示刷新页面）。
   *  v1.14.0：检查 HTTP 状态码 / 登录页 HTML / errorCode 里的鉴权失效，
   *  命中时自动失效 accessToken 并整体重试一次（页面可能已换新 token）。
   *  v1.15.0：GM 网络层失败（TM 后台网络栈卡死）时改走页面 fetch 兕底。 */
  function familyGetJson(url) {
    if (!getAccessToken()) {
      return Promise.reject(new Error('未读取到 accessToken：请刷新天翼云盘网页后再操作家庭云'));
    }
    return familyWithAuthRetry(function () {
      return familySend('GET', url, null).then(parseFamilyRes);
    });
  }

  /** 家庭云 POST 表单（签名含 URL query + body 参数）；鉴权类失败自动失效重试一次 */
  function familyApiPostForm(url, params) {
    if (!getAccessToken()) {
      return Promise.reject(new Error('未读取到 accessToken：请刷新天翼云盘网页后再操作家庭云'));
    }
    return familyWithAuthRetry(function () {
      var fullUrl = url + (url.indexOf('?') < 0 ? '?' : '&') + 'noCache=' + Math.random();
      var headers = familyHeaders(fullUrl, params);
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      var data = Object.keys(params).map(function (k) {
        return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
      }).join('&');
      return familySend('POST', fullUrl, { headers: headers, form: data })
        .then(parseFamilyRes);
    });
  }

  /**
   * 家庭云请求发送：GM 优先（跨域 @connect 稳妥）；GM 网络层失败时用页面
   * fetch 兕底（站点自身允许 cloud.189.cn 页面跨域调 api.cloud.189.cn）。
   */
  function familySend(method, url, postOpts) {
    var getHeaders = familyHeaders(url);
    function viaGm() {
      if (method === 'POST') {
        return gmXhr({ method: 'POST', url: FAMILY_API + url, headers: postOpts.headers, data: postOpts.form });
      }
      return gmXhr({ method: 'GET', url: FAMILY_API + url, headers: getHeaders });
    }
    function viaFetch() {
      if (typeof window.fetch !== 'function') return Promise.reject(new Error('no-fetch'));
      var headers = method === 'POST' ? Object.assign({}, postOpts.headers) : getHeaders;
      var init = { method: method, credentials: 'include', headers: headers };
      if (method === 'POST') init.body = postOpts.form;
      return window.fetch(FAMILY_API + url, init).then(function (r) {
        return r.text().then(function (text) {
          return { status: r.status, responseText: text, responseHeaders: '', via: 'fetch' };
        });
      });
    }
    return viaGm().catch(function (e) {
      if (e && e.aborted) throw e;
      return viaFetch().catch(function (fe) {
        throw new Error('家庭云网络请求失败（GM 与页面通道均不通：' +
          ((fe && fe.message) || (e && e.message) || '网络错误') +
          '；若页面本身能浏览，请刷新页面或重启浏览器后重试）');
      });
    });
  }

  /** 家庭云响应统一解析（GM / 页面 fetch 两条通道共用） */
  function parseFamilyRes(res) {
    if (httpAuthExpired(res)) {
      throw authExpiredError('家庭云登录已过期（HTTP ' + res.status + '）：请刷新天翼云盘网页后重试');
    }
    var json = parseJsonLoose(res.responseText);
    if (!json) json = parseXmlToFields(res.responseText); // 家庭云批量任务同样可能返回 XML
    if (!json) {
      throw new Error('家庭云接口响应异常（HTTP ' + res.status + '）' +
        (String(res.responseText || '').slice(0, 60) ? '：' + String(res.responseText || '').slice(0, 60) : ''));
    }
    // v1.19.0：错误码/消息统一走 getRespCode/getRespMsg（顶层+data 层，SUCCESS/0 透明），
    // 与个人云响应解析共用同一套规则；鉴权类失败标记后交给上层失效重试
    var famCode = getRespCode(json);
    if (famCode) {
      var famMsg = getRespMsg(json) || famCode;
      if (/invalid|expire|token|session|notlogin|login/i.test(String(famCode) + ' ' + String(famMsg))) {
        throw authExpiredError('家庭云 accessToken 已失效（' + famMsg + '）：正在自动重取并重试');
      }
      throw new Error('家庭云接口错误：' + famMsg);
    }
    return json;
  }

  /** 家庭云请求统一收口：鉴权类失败自动失效 token 缓存并重试一次（页面可能已换新 token） */
  function familyWithAuthRetry(request) {
    var retried = false;
    function run() {
      return request().catch(function (e) {
        if (looksAuthError(e) && !retried) {
          retried = true;
          invalidateAccessToken();
          if (!readAccessTokenFromStorage()) {
            throw authExpiredError('家庭云 accessToken 已失效且未能从页面重新读取：请刷新天翼云盘网页后重试');
          }
          return sleep(300).then(run);
        }
        throw e;
      });
    }
    return run();
  }

  /** 获取家庭 ID（缓存） */
  function getFamilyId() {
    if (familyIdCache) return Promise.resolve(familyIdCache);
    return familyGetJson('/open/family/manage/getFamilyList.action').then(function (json) {
      var list = (json && json.familyInfoResp) || [];
      var cur = null;
      for (var i = 0; i < list.length; i++) {
        if (Number(list[i].useFlag) === 1) { cur = list[i]; break; }
      }
      if (!cur && list.length) cur = list[0];
      if (cur && cur.familyId) {
        familyIdCache = String(cur.familyId);
        return familyIdCache;
      }
      throw new Error('未获取到家庭云 ID（可能未开通家庭云）');
    });
  }

  /** 获取家庭云根目录 ID（缓存；path 数组中 fileName=家庭云 的 fileId） */
  function getFamilyRootFolderId() {
    if (familyRootFolderId) return Promise.resolve(familyRootFolderId);
    return getFamilyId().then(function (fid) {
      return familyGetJson('/open/family/file/listFiles.action?familyId=' +
        encodeURIComponent(fid) + '&folderId=&needPath=true');
    }).then(function (json) {
      var path = (json && json.path) || [];
      var rev = path.slice().reverse();
      var hit = rev.find(function (i) { return i && i.fileName === '家庭云'; }) ||
        rev.find(function (i) { return i && i.fileId && String(i.fileId) !== '-11' && String(i.fileId) !== '-16'; });
      if (hit && hit.fileId) {
        familyRootFolderId = String(hit.fileId);
        return familyRootFolderId;
      }
      throw new Error('未获取到家庭云根目录 ID');
    });
  }

  /** 预热家庭上下文（登录检测后调用） */
  function warmFamilyContext() {
    if (!familyActive()) return Promise.resolve();
    return getFamilyRootFolderId().catch(function () {});
  }

  /** 按路径逐级建目录（"a/b/c"），返回末级目录 ID；空路径返回根；支持家庭云 */
  function ensureFolderPath(dirPath, rootFolderId, familyId) {
    var parts = String(dirPath || '').split('/')
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return s && s !== '.' && s !== '..'; });
    var current = String(rootFolderId || ROOT_FOLDER_ID);
    var i = 0;
    function next() {
      if (i >= parts.length) return Promise.resolve(current);
      var name = parts[i++];
      return createFolder(current, name, familyId).then(function (id) {
        current = String(id);
        return next();
      });
    }
    return next();
  }

  /**
   * 真实上传一个小文件（.cas 等几 KB~几 MB 的文件）到指定目录。
   * 走完整链路：initMultiUpload（不带哈希，lazyCheck=1，网页版同款）
   * → checkTransSecond 探测秒传（命中则直接 commit）→ getMultiUploadUrls → PUT 分片 → commit。
   */
  /**
   * 小文件（.cas 载荷等）上传：整体载入内存，init（不带哈希）→ 判重（命中直接提交）
   * → 逐片 PUT → 提交。v1.18.5：判重四态区分；提交失败先核查目标目录防重复；
   * onState(state) 上报任务状态（init/check/hit/upload/commit/ok）。
   */
  function uploadSmallFile(fileName, blob, folderId, familyId, onState) {
    var size = blob.size;
    var sliceSize = cassSliceSize(size);
    var partCount = cassPartCount(size);
    var fileMd5 = '', partMd5s = [];
    var sliceMd5 = ''; // v1.18.3：提升到函数作用域——第一个 then 里赋值，后续 then 里使用
    var uploadFileId = '';
    var checkUncertain = false; // v1.18.5：判重未确认（接口异常/被安全拦截）→ 改走真实上传
    function commitUpload() {
      return uploadApi('/person/commitMultiUploadFile', {
        uploadFileId: uploadFileId,
        fileMd5: fileMd5,
        sliceMd5: partMd5s.length ? sliceMd5FromParts(partMd5s) : fileMd5,
        lazyCheck: '1',
        isLog: '0'
      }, familyId);
    }
    function commitSpec() {
      return { name: fileName, size: size, md5: fileMd5, folderId: folderId, familyId: familyId };
    }
    return blobToArrayBuffer(blob).then(function (buf) {
      var u8 = new Uint8Array(buf);
      fileMd5 = md5OfBytes(u8);
      if (size > sliceSize) {
        for (var k = 0; k < partCount; k++) {
          partMd5s.push(md5OfBytes(u8.subarray(k * sliceSize, Math.min((k + 1) * sliceSize, size))));
        }
      }
      sliceMd5 = partMd5s.length ? sliceMd5FromParts(partMd5s) : fileMd5; // v1.18.3：去掉 var，赋给函数作用域变量（后续 then 要用）
      // v1.18.2：init 一律不带哈希（lazyCheck=1，网页版同款）——init 带哈希会触发
      // 内容安全前置校验；秒传命中改由 checkTransSecond 探测与 commit 承担。
      function initReq() {
        var params = {
          parentFolderId: String(folderId || ROOT_FOLDER_ID),
          fileName: encodeURIComponent(fileName),
          fileSize: String(size),
          sliceSize: String(sliceSize),
          lazyCheck: '1'
        };
        return uploadApi('/person/initMultiUpload', params, familyId);
      }
      if (onState) onState('init');
      return initReq();
    }).then(function (initResp) {
      // v1.18.4：统一深度提取（旧版仅认 data.uploadFileId，缺 uploadFileID 变体）
      uploadFileId = initResp ? deepPick(initResp, ['uploadFileId', 'uploadFileID']) : '';
      if (!uploadFileId) throw stepErr('init', new Error('创建上传会话失败（未返回 uploadFileId）'));
      if (onState) onState('check');
      return uploadApi('/person/checkTransSecond', {
        fileMd5: fileMd5,
        sliceMd5: sliceMd5,
        uploadFileId: uploadFileId
      }, familyId).then(function (checkResp) {
        // v1.18.5：统一四态判重——未确认绝不当作“未命中”；本链路可安全改走真实上传
        var verdict = classifyTransCheck(checkResp);
        if (verdict.state === 'uncertain') checkUncertain = true;
        return verdict.state === 'hit' ? verdict : null;
      }).catch(function (e) {
        if (e && e.aborted) throw e;
        // 判重失败（网络异常/安全拦截）：不判“未命中”，直接改走真实上传（无重复风险）
        checkUncertain = true;
        return null;
      });
    }).then(function (verdict) {
      if (verdict && verdict.state === 'hit') {
        // 云端已有相同内容（此前传过）：直接 commit 落库
        if (onState) onState('hit');
        if (onState) onState('commit');
        return commitGuarded(commitUpload, commitSpec()).then(function (r) {
          if (onState) onState('ok');
          return { fileId: '', message: '云端已存在相同内容，已秒传入库' +
            (r.verified ? '（已核查目标目录确认提交生效）' : '') };
        });
      }
      var i = 0;
      if (onState) onState('upload');
      function uploadPart() {
        if (i >= partCount) {
          if (onState) onState('commit');
          return commitGuarded(commitUpload, commitSpec()).then(function (r) {
            if (onState) onState('ok');
            return {
              fileId: r.fileId,
              message: '上传成功' +
                (r.verified ? '（已核查目标目录确认提交生效，未产生重复）' : '') +
                (checkUncertain ? '（秒传探测未确认，已按真实上传处理）' : '')
            };
          });
        }
        var idx = i++;
        var start = idx * sliceSize;
        var end = Math.min(start + sliceSize, size);
        var partBlob = blob.slice(start, end);
        var partMd5 = partMd5s.length ? partMd5s[idx] : fileMd5;
        return uploadApi('/person/getMultiUploadUrls', {
          partInfo: (idx + 1) + '-' + hexToBase64(partMd5),
          uploadFileId: uploadFileId
        }, familyId).then(function (urlResp) {
          // 响应结构：{code, uploadUrls:{partNumber_1:{requestURL,requestHeader}}}（uploadUrls 在顶层）
          var urls = deepPick(urlResp, ['uploadUrls']) || {}; // v1.18.5：统一深度提取
          var u = urls['partNumber_' + (idx + 1)] || urls.partNumber_1;
          if (!u || !u.requestURL) {
            throw stepErr('upload', new Error('获取分片上传地址失败（第 ' + (idx + 1) + ' 片）：响应无地址' +
              (getRespCode(urlResp) ? '，接口返回 ' + getRespCode(urlResp) : '')));
          }
          var headers = {};
          String(u.requestHeader || '').split('&').forEach(function (kv) {
            var eq = kv.indexOf('=');
            if (eq > 0) headers[kv.slice(0, eq)] = kv.slice(eq + 1);
          });
          return gmXhr({ method: 'PUT', url: u.requestURL, data: partBlob, headers: headers, timeout: 300000 });
        }).then(function (res) {
          if (res.status !== 200 && res.status !== 201) {
            throw stepErr('upload', new Error('分片 PUT 失败（HTTP ' + res.status + '）' +
              String(res.responseText || '').slice(0, 80)));
          }
          return uploadPart();
        });
      }
      return uploadPart();
    });
  }

  function blobToArrayBuffer(blob) {
    if (blob.arrayBuffer) return blob.arrayBuffer();
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onerror = function () { reject(new Error('读取 Blob 失败')); };
      fr.onload = function () { resolve(fr.result); };
      fr.readAsArrayBuffer(blob);
    });
  }

  /**
   * 本地文件真实上传到云盘（大文件友好：分片读取算哈希 + 分片 PUT，全程不整载内存）。
   * 流程：hashFile（增量 MD5）→ initMultiUpload（不带哈希，lazyCheck=1，网页版同款）
   * → checkTransSecond 探测秒传（命中则直接 commit 零流量入库）
   * → getMultiUploadUrls → 逐片 PUT（blob.slice）→ commit。
   * 分片 PUT 失败时自动重建会话重试（CDN 临时 URL 可能过期）。
   * v1.18.2：完全对齐网页版协议——init 从不带哈希（旧版单分片 init 带哈希，
   * 会触发 InfoSecurityErrorCode 内容安全前置校验，网页版正因不带哈希而不受影响）；
   * 哈希被安全拦截时跳过秒传探测，直接真实上传。
   * 返回 { ok, message, rapid, entry:{name,size,md5,sliceMd5,parts,sliceSize} }。
   * onProgress(phase, cur, total, label)：phase ∈ hash | upload | commit。
   * shouldAbort(): 可选，返回 true 时在哈希/分片边界中止（reject 带 aborted 标记）。
   * v1.18.5：onState(state)（第 8 参）上报任务状态（init/check/hit/upload/commit/ok）；
   * 判重四态区分；提交失败先核查目标目录再决定是否上抛（防重复文件）。
   */
  function uploadLocalFile(file, folderId, overwrite, onProgress, shouldAbort, registerAbort, familyId, onState) {
    if (file.size <= 0) {
      return Promise.reject(new Error('空文件（0 字节）无法上传'));
    }
    function abortedErr(what) {
      var e = new Error('已停止' + what);
      e.aborted = true;
      return e;
    }
    var fileMd5 = '', sliceMd5 = '', parts = [], sliceSize = 0;
    var secFallback = false; // v1.18.2：秒传探测被安全拦截，改走真实上传（init 本身已不带哈希）
    var checkUncertain = false; // v1.18.5：探测未确认（接口异常）→ 改走真实上传（绝不当作“未命中”）
    function commitUpload(uploadFileId) {
      return uploadApi('/person/commitMultiUploadFile', {
        uploadFileId: uploadFileId,
        fileMd5: fileMd5,
        sliceMd5: sliceMd5,
        lazyCheck: '1',
        isLog: '0',
        opertype: overwrite ? '3' : '1'
      }, familyId);
    }
    function initUpload() {
      // v1.18.2：与网页版完全一致——init 从不带哈希，一律 lazyCheck=1。
      // 哈希只出现在 checkTransSecond 探测与最终 commit。此前单分片文件 init 带哈希
      // （PC 客户端式探测），会触发服务端哈希前置校验（InfoSecurityErrorCode）；
      // 网页版同文件能正常上传，正因为它从不这样做。
      var params = {
        parentFolderId: String(folderId || ROOT_FOLDER_ID),
        fileName: encodeURIComponent(file.name),
        fileSize: String(file.size),
        sliceSize: String(sliceSize),
        lazyCheck: '1'
      };
      return uploadApi('/person/initMultiUpload', params, familyId).then(function (initResp) {
        // v1.18.4：统一深度提取（兼容顶层/data嵌套与大小写变体）
        var id = initResp ? deepPick(initResp, ['uploadFileId', 'uploadFileID']) : '';
        if (!id) throw stepErr('init', new Error('创建上传会话失败（未返回 uploadFileId）' +
          (getRespMsg(initResp) ? '：' + getRespMsg(initResp) : '')));
        return id;
      });
    }
    /** 单片 PUT（带一次重试：URL 失效时重新取地址） */
    function putPart(uploadFileId, idx, attempt) {
      var start = idx * sliceSize;
      var end = Math.min(start + sliceSize, file.size);
      var partMd5 = parts.length ? parts[idx] : fileMd5;
      return uploadApi('/person/getMultiUploadUrls', {
        partInfo: (idx + 1) + '-' + hexToBase64(partMd5),
        uploadFileId: uploadFileId
      }, familyId).then(function (urlResp) {
        // 响应结构：{code, uploadUrls:{partNumber_1:{requestURL,requestHeader}}}（uploadUrls 在顶层）
        var urls = deepPick(urlResp, ['uploadUrls']) || {}; // v1.18.5：统一深度提取
        var u = urls['partNumber_' + (idx + 1)] || urls.partNumber_1;
        if (!u || !u.requestURL) {
          throw stepErr('upload', new Error('获取分片上传地址失败（第 ' + (idx + 1) + ' 片）：响应无地址' +
            (getRespCode(urlResp) ? '，接口返回 ' + getRespCode(urlResp) : '')));
        }
        var headers = {};
        String(u.requestHeader || '').split('&').forEach(function (kv) {
          var eq = kv.indexOf('=');
          if (eq > 0) headers[kv.slice(0, eq)] = kv.slice(eq + 1);
        });
        // CDN 临时 URL：只带服务端给定的头，不带 UA/Content-Type 等额外头
        return gmXhr({
          method: 'PUT', url: u.requestURL,
          data: file.slice(start, end), headers: headers, timeout: 600000,
          onAbortRegister: registerAbort
        }).then(function (res) {
          if (res.status !== 200 && res.status !== 201) {
            throw stepErr('upload', new Error('分片 PUT 失败（HTTP ' + res.status + '）' +
              String(res.responseText || '').slice(0, 80)));
          }
          return true;
        });
      }).catch(function (e) {
        if (e && e.aborted) throw e; // 中止请求：直接透传，不重试
        if (attempt < 1) {
          return sleep(1200).then(function () { return putPart(uploadFileId, idx, attempt + 1); });
        }
        throw e;
      });
    }
    return hashFile(file, function (cur, total) {
      if (onProgress) onProgress('hash', cur, total, file.name);
    }, shouldAbort).then(function (h) {
      fileMd5 = h.md5;
      sliceMd5 = h.sliceMd5;
      parts = h.parts || [];
      sliceSize = h.sliceSize;
      if (onState) onState('init');
      return initUpload().catch(function (e) { // v1.18.5：阶段标记，日志可显示“失败（正在初始化）”
        throw stepErr('init', e);
      }); // 网页版同款：init 不带哈希（lazyCheck=1），规避 init 哈希前置安全校验
    }).then(function (uploadFileId) {
      // 秒传探测：哈希只出现在 checkTransSecond 与最终 commit（网页版同款分工）；
      // v1.18.5：统一四态判重——未确认绝不当作“未命中”（真实上传链路可安全改走传字节）
      if (onState) onState('check');
      return uploadApi('/person/checkTransSecond', {
        fileMd5: fileMd5,
        sliceMd5: sliceMd5,
        uploadFileId: uploadFileId
      }, familyId).then(function (checkResp) {
        var verdict = classifyTransCheck(checkResp);
        if (verdict.state === 'uncertain') checkUncertain = true;
        return verdict;
      }).catch(function (e) {
        if (e && e.aborted) throw e;
        if (isSecurityBlock(e)) secFallback = true; else checkUncertain = true;
        return null; // 探测失败不判“未命中”：改走真实上传（传字节后 commit，无重复风险）
      }).then(function (verdict) {
        if (!secFallback && !checkUncertain && verdict && verdict.state === 'hit') {
          if (onState) onState('hit');
          if (onState) onState('commit');
          if (onProgress) onProgress('commit', 0, 1, file.name);
          return commitGuarded(function () { return commitUpload(uploadFileId); }, {
            name: file.name, size: file.size, md5: fileMd5, folderId: folderId, familyId: familyId
          }).then(function (g) {
            if (onState) onState('ok');
            return {
              rapid: true,
              message: '云端已有相同内容，秒传入库（零流量）' +
                (g.verified ? '（已核查目标目录确认提交生效，未产生重复）' : '')
            };
          });
        }
        var partCount = cassPartCount(file.size);
        var i = 0;
        if (onState) onState('upload');
        function uploadPart() {
          if (shouldAbort && shouldAbort()) return Promise.reject(abortedErr('上传'));
          if (i >= partCount) {
            if (onProgress) onProgress('upload', partCount, partCount, file.name);
            if (onState) onState('commit');
            if (onProgress) onProgress('commit', 0, 1, file.name);
            return commitGuarded(function () { return commitUpload(uploadFileId); }, {
              name: file.name, size: file.size, md5: fileMd5, folderId: folderId, familyId: familyId
            }).then(function (g) {
              if (onState) onState('ok');
              return {
                rapid: false,
                message: '上传成功' + (g.verified ? '（已核查目标目录确认提交生效，未产生重复）' : '')
              };
            });
          }
          var idx = i++;
          if (onProgress) onProgress('upload', idx + 1, partCount, file.name);
          return putPart(uploadFileId, idx, 0).then(uploadPart);
        }
        return uploadPart();
      });
    }).then(function (r) {
      return {
        ok: true,
        message: r.message +
          (secFallback ? '（秒传被安全拦截，已改走真实上传）' :
            (checkUncertain ? '（秒传探测未确认，已改走真实上传）' : '')),
        rapid: !!r.rapid,
        entry: {
          name: file.name, size: file.size, md5: fileMd5,
          sliceMd5: sliceMd5, parts: parts, sliceSize: sliceSize, create_time: ''
        }
      };
    });
  }

  /** 列出目录全部内容，自动翻页；familyId 为空走个人云，否则走家庭云 */
  function listFolderAll(folderId, familyId) {
    var files = [], folders = [], count = 0, page = 1;
    function one() {
      var req;
      if (familyId) {
        var url = '/open/family/file/listFiles.action?familyId=' + encodeURIComponent(String(familyId)) +
          '&folderId=' + encodeURIComponent(String(folderId)) +
          '&mediaType=0&iconOption=5&orderBy=3&descending=true&pageNum=' + page + '&pageSize=60';
        req = familyGetJson(url);
      } else {
        req = apiGet(PORTAL_BASE + '/open/file/listFiles.action?folderId=' + encodeURIComponent(folderId) +
          '&mediaType=0&orderBy=lastOpTime&descending=true&pageNum=' + page + '&pageSize=100');
      }
      return req.then(function (json) {
        // v1.19.0：结构校验统一走 requireFileListAO（缺失直接报错，不当作空目录；
        // 与按名查询共用，兼容顶层与 data.fileListAO 两层）
        var ao = requireFileListAO(json);
        count = Number(ao.count) || 0;
        (ao.folderList || []).forEach(function (f) {
          folders.push({ id: String(f.id || f.fileId || ''), name: String(f.name || f.fileName || ''), isFolder: true });
        });
        (ao.fileList || []).forEach(function (f) {
          files.push({
            id: String(f.id || f.fileId || ''), name: String(f.name || f.fileName || ''), size: Number(f.size || f.fileSize || 0),
            // v1.18.9 查证：字段名经 OpenList 官方 189 驱动源码（types.go Cloud189File.Md5）
            // 确认为 md5（个人云/家庭云同构），不盲目扩展别名；ID 映射补空串兜底，
            // 避免两端都缺 ID 时生成字面量 'undefined'
            md5: String(f.md5 || '').trim().toUpperCase(), isFolder: false,
            lastOpTime: f.lastOpTime || ''
          });
        });
        var pageSize = familyId ? 60 : 100;
        if (page * pageSize < count) { page++; return one(); }
        return { files: files, folders: folders };
      });
    }
    return one();
  }

  /**
   * 取文件下载地址。优先 open/file/getFileDownloadUrl.action（参考实现验证过），
   * 失败回退 portal/getFileInfo.action 的 downloadUrl。统一处理 //host 与 &amp; 转义。
   */
  function getDownloadUrl(fileId, familyId) {
    function normalize(u) {
      u = String(u || '').replace(/&amp;/g, '&');
      if (u.indexOf('//') === 0) u = 'https:' + u;
      return u;
    }
    if (familyId) {
      // 家庭云：GET api.cloud.189.cn/open/family/file/getFileDownloadUrl.action
      return familyGetJson('/open/family/file/getFileDownloadUrl.action?fileId=' +
        encodeURIComponent(String(fileId)) + '&familyId=' + encodeURIComponent(String(familyId)) + '&type=1')
        .then(function (json) {
          var u = (json && (json.fileDownloadUrl || (json.data && json.data.fileDownloadUrl))) || '';
          if (!u) throw new Error('未获取到家庭云下载地址');
          return normalize(u);
        });
    }
    return apiGet(PORTAL_BASE + '/open/file/getFileDownloadUrl.action?fileId=' + encodeURIComponent(fileId))
      .then(function (json) {
        var u = json.fileDownloadUrl || (json.data && json.data.fileDownloadUrl) || '';
        if (u) return normalize(u);
        throw new Error('empty');
      })
      .catch(function () {
        return apiGet(PORTAL_BASE + '/portal/getFileInfo.action?fileId=' + encodeURIComponent(fileId))
          .then(function (json) {
            var u = json.downloadUrl || (json.data && json.data.downloadUrl) || '';
            if (!u) throw new Error('未获取到下载地址（getFileDownloadUrl / getFileInfo 均失败）');
            return normalize(u);
          });
      });
  }

  function md5OfBytes(u8) {
    var copy = u8.slice(); // 独立 buffer，字节偏移归零
    var spark = new SparkMD5.ArrayBuffer();
    spark.append(copy.buffer);
    return spark.end().toUpperCase();
  }

  /** 十六进制 MD5 → Base64(原始字节)。getMultiUploadUrls 的 partInfo 用此格式（OpenList 同款） */
  function hexToBase64(hex) {
    var h = String(hex || '').toLowerCase().replace(/[^0-9a-f]/g, '');
    if (h.length % 2 !== 0) h = '0' + h;
    var bin = '';
    for (var i = 0; i + 1 < h.length; i += 2) {
      bin += String.fromCharCode(parseInt(h.substr(i, 2), 16));
    }
    return btoa(bin);
  }

  /**
   * 远程计算大文件 CAS 分片摘要：按 sliceSize 用 Range 请求逐片下载求 MD5。
   * 小文件（单片）直接用列表返回的整文件 MD5，不产生下载流量。
   */
  /** 远程计算大文件 CAS 分片摘要。shouldAbort(): 分片边界中止；registerAbort(fn): 注册中断当前分片请求 */
  function hashRemoteFile(file, onPart, shouldAbort, registerAbort, familyId) {
    var sliceSize = cassSliceSize(file.size);
    var count = cassPartCount(file.size);
    if (file.size <= sliceSize) {
      return Promise.resolve({ sliceMd5: file.md5, parts: [file.md5] });
    }
    function abortedErr() {
      var e = new Error('已停止计算');
      e.aborted = true;
      return e;
    }
    var durlPromise = null;
    function getUrl() {
      if (!durlPromise) durlPromise = getDownloadUrl(file.id, familyId);
      return durlPromise;
    }
    var parts = [];
    function part(i, attempt) {
      var start = i * sliceSize;
      var end = Math.min(start + sliceSize, file.size) - 1;
      return getUrl().then(function (durl) {
        return gmXhr({
          method: 'GET', url: durl, responseType: 'arraybuffer',
          headers: { Range: 'bytes=' + start + '-' + end },
          timeout: 600000,
          onAbortRegister: registerAbort
        });
      }).then(function (res) {
        if (res.status !== 206 && res.status !== 200) throw new Error('HTTP ' + res.status);
        var u8 = new Uint8Array(res.response || new ArrayBuffer(0));
        if (u8.length === 0) throw new Error('空响应');
        if (res.status === 200 && start > 0) {
          throw new Error('下载服务器不支持断点续传（Range），无法远程计算分片哈希');
        }
        if (res.status === 200 && start === 0) {
          // 服务器忽略 Range 返回了整个文件：内存可承受时切片计算
          if (u8.length < file.size) throw new Error('响应长度不足');
          if (file.size > 524288000) throw new Error('服务器不支持 Range 且文件超过 500MB，无法在浏览器内计算');
          parts = [];
          for (var k = 0; k < count; k++) {
            parts.push(md5OfBytes(u8.subarray(k * sliceSize, Math.min((k + 1) * sliceSize, file.size))));
          }
          return 'FULL';
        }
        var expect = end - start + 1;
        if (u8.length !== expect) throw new Error('分片长度不符（期望 ' + expect + '，实际 ' + u8.length + '）');
        parts.push(md5OfBytes(u8));
        return null;
      }).catch(function (e) {
        if (e && e.aborted) throw e; // 中止请求：直接透传，不重试
        if (attempt < 2) {
          durlPromise = null; // 下载地址可能过期，重新获取后重试
          return sleep(1500).then(function () { return part(i, attempt + 1); });
        }
        throw new Error('第 ' + (i + 1) + '/' + count + ' 片下载失败：' + (e && e.message ? e.message : e));
      });
    }
    var i = 0;
    function next() {
      if (shouldAbort && shouldAbort()) return Promise.reject(abortedErr());
      if (i >= count) return Promise.resolve({ sliceMd5: sliceMd5FromParts(parts), parts: parts });
      var cur = i++;
      return part(cur, 0).then(function (flag) {
        if (flag === 'FULL') i = count;
        if (onPart) onPart(cur + 1, count);
        if (shouldAbort && shouldAbort()) return Promise.reject(abortedErr());
        return next();
      });
    }
    return next();
  }

  /** 组装 .cas 载荷（单文件 legacy 五字段；多文件 files 数组），与 OpenList 参考实现字段一致 */
  function buildCasPayload(entries) {
    var now = String(Math.floor(Date.now() / 1000));
    function ent(e) {
      var o = { name: e.name, size: e.size, md5: e.md5, sliceMd5: e.sliceMd5, create_time: e.create_time || now };
      if (e.parts && e.parts.length) o.partsMd5 = e.parts;
      o.slice_size = e.sliceSize;
      o.cloud = '189';
      return o;
    }
    if (entries.length === 1) return ent(entries[0]);
    var total = 0;
    entries.forEach(function (e) { total += e.size; });
    return { name: 'cas_export_' + now, size: total, files: entries.map(ent) };
  }

  function utf8ToBase64(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function downloadTextFile(filename, text) {
    var blob = new Blob([text], { type: 'application/octet-stream' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(url);
      a.remove();
    }, 3000);
  }

  /* ══════════════════════ 本地秒传码生成 ══════════════════════ */

  /** 分片计算哈希。shouldAbort(): 可选，返回 true 时在分片边界中止（reject 带 aborted 标记） */
  function hashFile(file, onProgress, shouldAbort) {
    return new Promise(function (resolve, reject) {
      if (file.size <= 0) return reject(new Error('空文件（0 字节）无法生成秒传码'));
      var sliceSize = cassSliceSize(file.size);
      var partCount = cassPartCount(file.size);
      var whole = new SparkMD5.ArrayBuffer();
      var sliceHexs = [];
      var idx = 0;

      function readNext() {
        if (shouldAbort && shouldAbort()) {
          var stopped = new Error('已停止计算哈希');
          stopped.aborted = true;
          return reject(stopped);
        }
        if (idx >= partCount) {
          var fileMd5 = whole.end().toUpperCase();
          var sliceMd5 = fileMd5;
          if (file.size > sliceSize) {
            sliceMd5 = SparkMD5.hash(sliceHexs.join('\n')).toUpperCase();
          }
          resolve({
            name: file.name,
            size: file.size,
            md5: fileMd5,
            sliceMd5: sliceMd5,
            sliceSize: sliceSize,
            parts: sliceHexs // 逐片 MD5（大写），真实上传分片时用
          });
          return;
        }
        var start = idx * sliceSize;
        var end = Math.min(start + sliceSize, file.size);
        var partMd5 = new SparkMD5.ArrayBuffer();
        var reader = new FileReader();
        reader.onerror = function () { reject(new Error('读取文件失败')); };
        reader.onload = function () {
          try {
            var buf = reader.result;
            whole.append(buf);
            partMd5.append(buf);
            sliceHexs.push(partMd5.end().toUpperCase());
            idx++;
            if (onProgress) onProgress(idx, partCount);
            // 让出主线程刷新 UI
            setTimeout(readNext, 0);
          } catch (e) { reject(e); }
        };
        reader.readAsArrayBuffer(file.slice(start, end));
      }
      readNext();
    });
  }

  /* ══════════════════════ 目录 ID 识别 ══════════════════════ */

  var autoDetect = { lastId: '', hooked: false };
  var autoRefreshEnabled = true; // 任务成功后自动点页面“刷新”（设置⑥控制）

  /**
   * 综合识别当前目录 ID，优先级从高到低：
   *   1. 页面自身 API 调用里捕获到的 folderId（网络钩子，最可靠）
   *   2. hash 路由（#/file/-11、#/file?folderId=xx、#/xxx/file/xx 等）
   *   3. 查询串 folderId
   *   4. 个人云根目录 -11
   */
  function detectFolderId() {
    if (autoDetect.lastId) return autoDetect.lastId;
    var h = String(location.hash || '');
    var m = h.match(/folderId=(-?\d+)/i)
      || h.match(/#\/(?:[a-zA-Z0-9_-]+\/)*(?:file|folder)\/(-?\d+)/i);
    if (m) return m[1];
    var q = String(location.search || '').match(/[?&]folderId=(-?\d+)/i);
    if (q) return q[1];
    return ROOT_FOLDER_ID;
  }

  /** 从页面自身发起的请求 URL 捕获目录 ID（listFiles / getFolderInfo / createFolder 等） */
  function noteFolderFromUrl(u) {
    if (!u) return;
    u = String(u);
    if (u.indexOf('listFiles') < 0 && u.indexOf('FolderInfo') < 0 && u.indexOf('createFolder') < 0) return;
    var m = u.match(/[?&](?:folderId|parentId)=(-?\d+)/i);
    if (m) autoDetect.lastId = m[1];
  }

  /**
   * 挂钩页面 XHR/fetch，捕获浏览行为。
    * 目标目录在每次任务启动时通过 resolveTarget() 现取（个人云/家庭云双空间）：
   * 设置勾选"自动跟随"→ detectFolderId()；未勾选 → 根目录 -11。
   */
  function installFolderHook() {
    if (autoDetect.hooked) return;
    autoDetect.hooked = true;
    try {
      var oo = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function (method, url) {
        try { noteFolderFromUrl(url); } catch (e) {}
        return oo.apply(this, arguments);
      };
    } catch (e) {}
    if (typeof window.fetch === 'function') {
      try {
        var of = window.fetch;
        window.fetch = function (input, init) {
          try {
            var u = typeof input === 'string' ? input : (input && input.url) || '';
            noteFolderFromUrl(u);
          } catch (e) {}
          return of.apply(this, arguments);
        };
      } catch (e) {}
    }
    window.addEventListener('hashchange', function () { autoDetect.lastId = ''; }); // 路由切换时重新捕获
    window.addEventListener('popstate', function () { autoDetect.lastId = ''; });
  }

  /* ══════════════════════ 页面列表自动刷新 ══════════════════════ */

  /**
   * 模拟点击天翼云盘网页自身的“刷新”按钮：
   *   <div class="FileHead_file-head-button_2SEnc">刷新</div>
   * 类名尾部是构建哈希（随版本变化），所以按“类名前缀 + 文本=刷新”匹配；
   * 找到后派发 click（React 事件委托在根节点，click 会正常冒泡触发）。
   * 返回是否点到了按钮。
   */
  function clickPageRefresh() {
    var btn = null;
    try {
      var nodes = document.querySelectorAll('[class*="FileHead_file-head-button"]');
      for (var i = 0; i < nodes.length; i++) {
        if (String(nodes[i].textContent || '').replace(/\s+/g, '') === '刷新') { btn = nodes[i]; break; }
      }
      if (!btn) { // 兕底：文件头区域中文本恰为“刷新”的最内层元素
        var head = document.querySelector('[class*="FileHead_"]');
        var cands = head ? head.querySelectorAll('div,span,button,a') : [];
        for (var j = 0; j < cands.length; j++) {
          var t = String(cands[j].textContent || '').replace(/\s+/g, '');
          if (t === '刷新' && !(cands[j].children && cands[j].children.length)) { btn = cands[j]; break; }
        }
      }
    } catch (e) {}
    if (!btn) return false;
    try {
      btn.click();
      return true;
    } catch (e) {}
    try {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      return true;
    } catch (e2) { return false; }
  }

  /** 任务成功后延迟一点（等云端列表索引生效）再点页面“刷新”，并写一行日志 */
  function autoRefreshPageList() {
    if (!autoRefreshEnabled) return;
    setTimeout(function () {
      var ok = clickPageRefresh();
      logLine('muted', ok ? '已自动点击页面“刷新”，文件列表已更新' : '未找到页面“刷新”按钮，请手动刷新文件列表');
    }, 900);
  }

  /* ══════════════════════ UI ══════════════════════ */

  var PANEL_ID = 'teleagent-189cas-panel';
  var css = [
    /* 主题变量：applyTheme 修改 --c189-a/--c189-b（主色渐变两端），全部控件引用 */
    '#' + PANEL_ID + '{--c189-a:#e8383d;--c189-b:#c62828;--c189-bg:rgba(255,255,255,1);--c189-blur:0px;--c189-saturate:1;',
    '  --c189-panel-alpha:1;--c189-sub-bg:rgba(250,250,250,1);--c189-border:#e6e6e6;}',
    '#' + PANEL_ID + '{position:fixed;top:80px;right:16px;width:340px;z-index:2147483000;',
    '  font:12px/1.5 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif;color:#2c3e50;',
    '  background:var(--c189-bg);border-radius:14px;box-shadow:0 10px 36px rgba(0,0,0,.25),0 2px 8px rgba(0,0,0,.12);overflow:hidden;',
    '  display:flex;flex-direction:column;max-height:calc(100vh - 120px);',
    '  backdrop-filter:blur(var(--c189-blur)) saturate(var(--c189-saturate));',
    '  -webkit-backdrop-filter:blur(var(--c189-blur)) saturate(var(--c189-saturate));}',
    /* 玻璃效果（liquid 比 frost 更强：饱和度 + 内高光描边） */
    '#' + PANEL_ID + '.c189-liquid{box-shadow:0 10px 36px rgba(0,0,0,.25),0 0 0 1px rgba(255,255,255,.45) inset,0 2px 8px rgba(0,0,0,.12);}',
    '#' + PANEL_ID + ' .c189-head{display:flex;align-items:center;cursor:move;user-select:none;',
    '  background:linear-gradient(135deg,var(--c189-a),var(--c189-b));color:#fff;padding:10px 12px;',
    '  box-shadow:0 1px 6px rgba(0,0,0,.18);}',
    '#' + PANEL_ID + ' .c189-head .c189-title{flex:1;font-weight:600;font-size:13px;letter-spacing:.3px;',
    '  text-shadow:0 1px 2px rgba(0,0,0,.2);}',
    '#' + PANEL_ID + ' .c189-head button{background:rgba(255,255,255,.22);border:none;color:#fff;',
    '  width:22px;height:22px;border-radius:7px;cursor:pointer;margin-left:6px;font-size:12px;line-height:1;',
    '  transition:background .15s,transform .12s;}',
    '#' + PANEL_ID + ' .c189-head button:hover{background:rgba(255,255,255,.38);transform:scale(1.08);}',
    '#' + PANEL_ID + ' .c189-tabs{display:flex;border-bottom:1px solid var(--c189-border);background:var(--c189-sub-bg);}',
    '#' + PANEL_ID + ' .c189-tabs button{flex:1;padding:8px 0;border:none;background:none;cursor:pointer;',
    '  font-size:12px;color:#888;border-bottom:2px solid transparent;transition:color .15s,background .15s;}',
    '#' + PANEL_ID + ' .c189-tabs button:hover{color:#555;background:rgba(0,0,0,.03);}',
    '#' + PANEL_ID + ' .c189-tabs button.on{color:var(--c189-a);border-bottom-color:var(--c189-a);font-weight:600;background:transparent;}',
    '#' + PANEL_ID + ' .c189-body{padding:12px;overflow-y:auto;flex:1;min-height:0;}',
    '#' + PANEL_ID + ' .c189-body::-webkit-scrollbar{width:8px;}',
    '#' + PANEL_ID + ' .c189-body::-webkit-scrollbar-thumb{background:rgba(0,0,0,.18);border-radius:4px;}',
    '#' + PANEL_ID + ' label.c189-lb{display:block;margin:8px 0 4px;color:#666;font-size:11px;}',
    '#' + PANEL_ID + ' input[type=text],#' + PANEL_ID + ' textarea{width:100%;box-sizing:border-box;border:1px solid var(--c189-border);',
    '  border-radius:8px;padding:6px 8px;font:12px/1.5 Consolas,Menlo,monospace;outline:none;background:rgba(255,255,255,.75);',
    '  transition:border-color .15s,box-shadow .15s;}',
    '#' + PANEL_ID + ' input[type=text]:focus,#' + PANEL_ID + ' textarea:focus{border-color:var(--c189-a);',
    '  box-shadow:0 0 0 2px color-mix(in srgb,var(--c189-a) 18%,transparent);}',
    '#' + PANEL_ID + ' textarea{resize:vertical;}',
    '#' + PANEL_ID + ' .c189-row{display:flex;align-items:center;gap:8px;margin-top:8px;}',
    /* 主按钮：渐变 + 悬停上浮 + 按下下压 */
    '#' + PANEL_ID + ' .c189-btn{flex:1;padding:8px 0;border:none;border-radius:8px;cursor:pointer;',
    '  background:linear-gradient(135deg,var(--c189-a),var(--c189-b));color:#fff;font-size:13px;font-weight:600;',
    '  box-shadow:0 2px 8px color-mix(in srgb,var(--c189-b) 35%,transparent);letter-spacing:.5px;',
    '  transition:filter .15s,transform .12s,box-shadow .15s;}',
    '#' + PANEL_ID + ' .c189-btn:hover{filter:brightness(1.1);transform:translateY(-1px);',
    '  box-shadow:0 4px 12px color-mix(in srgb,var(--c189-b) 45%,transparent);}',
    '#' + PANEL_ID + ' .c189-btn:active{transform:translateY(1px);filter:brightness(.95);}',
    '#' + PANEL_ID + ' .c189-btn:disabled{background:#b9b9b9;box-shadow:none;cursor:not-allowed;transform:none;filter:none;}',
    /* 次按钮：描边式 + 悬停填充 */
    '#' + PANEL_ID + ' .c189-btn2{padding:6px 10px;border:1px solid var(--c189-border);border-radius:8px;background:rgba(255,255,255,.8);',
    '  cursor:pointer;font-size:12px;color:#555;transition:all .15s;}',
    '#' + PANEL_ID + ' .c189-btn2:hover{border-color:var(--c189-a);color:var(--c189-a);',
    '  background:color-mix(in srgb,var(--c189-a) 8%,transparent);transform:translateY(-1px);}',
    '#' + PANEL_ID + ' .c189-btn2:active{transform:translateY(0);}',
    '#' + PANEL_ID + ' .c189-btn2:disabled{opacity:.5;cursor:not-allowed;transform:none;}',
    '#' + PANEL_ID + ' .c189-log{margin-top:10px;max-height:none;min-height:120px;overflow:auto;background:rgba(247,247,247,.82);',
    '  border-radius:8px;padding:8px;font:11px/1.7 Consolas,Menlo,monospace;white-space:pre-wrap;word-break:break-all;',
    '  resize:vertical;}', /* 与 textarea 一致：拖右下角小三角调节高度 */
    '#' + PANEL_ID + ' .c189-log .ok{color:#2e7d32;}',
    '#' + PANEL_ID + ' .c189-log .err{color:#c62828;}',
    '#' + PANEL_ID + ' .c189-log .info{color:#1565c0;}',
    '#' + PANEL_ID + ' .c189-log .muted{color:#999;}',
    '#' + PANEL_ID + ' .c189-foot{display:flex;align-items:center;gap:6px;padding:8px 12px;',
    '  border-top:1px solid var(--c189-border);background:var(--c189-sub-bg);color:#888;font-size:11px;}',
    '#' + PANEL_ID + ' .c189-dot{width:8px;height:8px;border-radius:50%;background:#bbb;flex:none;transition:background .3s;}',
    '#' + PANEL_ID + ' .c189-dot.ok{background:#4caf50;box-shadow:0 0 6px #4caf5088;}',
    '#' + PANEL_ID + ' .c189-dot.err{background:var(--c189-a);}',
    '#' + PANEL_ID + '.c189-min .c189-body,#' + PANEL_ID + '.c189-min .c189-tabs,#' + PANEL_ID + '.c189-min .c189-foot{display:none;}',
    '#' + PANEL_ID + '.c189-min{top:auto !important;left:auto !important;right:16px !important;bottom:16px !important;height:auto !important;}',
    '#' + PANEL_ID + '.c189-min .c189-resize{display:none;}',
    /* 收起/展开动效（v1.16.0）：面板 FLIP 滑动 + 内容淡入淡出 */
    '#' + PANEL_ID + '{transition:transform .25s cubic-bezier(.22,.8,.3,1);}',
    '#' + PANEL_ID + ' .c189-tabs,#' + PANEL_ID + ' .c189-body,#' + PANEL_ID + ' .c189-foot{transition:opacity .16s ease;}',
    '#' + PANEL_ID + '.c189-fade .c189-tabs,#' + PANEL_ID + '.c189-fade .c189-body,#' + PANEL_ID + '.c189-fade .c189-foot{opacity:0;}',
    '#' + PANEL_ID + ' .c189-tip{color:#999;font-size:11px;margin-top:6px;line-height:1.6;}',
    '#' + PANEL_ID + ' .c189-chk{margin-right:4px;vertical-align:-2px;flex:none;accent-color:var(--c189-a);}',
    '#' + PANEL_ID + ' .c189-list{max-height:150px;min-height:44px;overflow:auto;border:1px solid var(--c189-border);border-radius:8px;margin-top:8px;background:rgba(255,255,255,.8);}',
    '#' + PANEL_ID + ' .c189-list .row{display:flex;align-items:center;gap:6px;padding:4px 8px;border-bottom:1px solid rgba(0,0,0,.05);font-size:12px;}',
    '#' + PANEL_ID + ' .c189-list .row:last-child{border-bottom:none;}',
    '#' + PANEL_ID + ' .c189-list .row .nm{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    '#' + PANEL_ID + ' .c189-list .row .sz{color:#888;font-size:11px;flex:none;}',
    '#' + PANEL_ID + ' .c189-list .row.dir{cursor:pointer;background:rgba(0,0,0,.02);}',
    '#' + PANEL_ID + ' .c189-list .row.dir:hover{background:color-mix(in srgb,var(--c189-a) 10%,transparent);}',
    '#' + PANEL_ID + ' .c189-list .row .c189-badge{flex:none;font-size:10px;color:#b26a00;background:#fff4e0;border-radius:4px;padding:1px 4px;}',
    '#' + PANEL_ID + ' .c189-list .err{color:#c62828;padding:6px 8px;font-size:12px;}',
    '#' + PANEL_ID + ' .c189-list .muted{color:#999;padding:6px 8px;font-size:12px;}',
    '#' + PANEL_ID + ' .c189-bar{margin-top:10px;display:none;}',
    '#' + PANEL_ID + ' .c189-bar.show{display:block;}',
    '#' + PANEL_ID + ' .c189-bar .track{background:rgba(0,0,0,.08);border-radius:4px;height:8px;overflow:hidden;}',
    '#' + PANEL_ID + ' .c189-bar .fill{background:linear-gradient(135deg,var(--c189-a),var(--c189-b));height:100%;width:0%;transition:width .3s;',
    '  border-radius:4px;}',
    '#' + PANEL_ID + ' .c189-bar .txt{text-align:center;margin-top:6px;font-size:11px;color:#888;word-break:break-all;}',
    '#' + PANEL_ID + ' .c189-sec{border:1px solid var(--c189-border);border-radius:10px;padding:10px;margin-bottom:10px;background:rgba(250,251,252,.75);}',
    '#' + PANEL_ID + ' .c189-sec-t{font-weight:600;font-size:12px;color:var(--c189-a);margin-bottom:6px;}',
    '#' + PANEL_ID + ' .c189-resize{position:absolute;right:0;bottom:0;width:16px;height:16px;cursor:nwse-resize;z-index:9;',
    '  background:linear-gradient(135deg,transparent 0 50%,color-mix(in srgb,var(--c189-a) 55%,transparent) 50% 62%,transparent 62% 72%,color-mix(in srgb,var(--c189-a) 55%,transparent) 72% 84%,transparent 84%);',
    '  border-bottom-right-radius:14px;}',
    /* 主题色块按钮 */
    '#' + PANEL_ID + ' .c189-theme-btn{width:26px;height:26px;border-radius:50%;border:2px solid transparent;cursor:pointer;',
    '  transition:transform .15s,border-color .15s,box-shadow .15s;flex:none;box-shadow:0 1px 4px rgba(0,0,0,.2);}',
    '#' + PANEL_ID + ' .c189-theme-btn:hover{transform:scale(1.15);}',
    '#' + PANEL_ID + ' .c189-theme-btn.on{border-color:#fff;box-shadow:0 0 0 2px var(--c189-a),0 1px 4px rgba(0,0,0,.25);transform:scale(1.12);}',
    '#' + PANEL_ID + ' .c189-eff-btn.on{border-color:var(--c189-a);color:var(--c189-a);font-weight:600;}',
    /* 暗黑模式（v1.17.0）：深色底浅色字；--c189-bg/--c189-sub-bg 由 applyOpacity 按模式计算 */
    '#' + PANEL_ID + '.c189-dark{--c189-bg:#1f2430;--c189-sub-bg:#171b24;--c189-border:#333b4d;color:#d7deea;}',
    '#' + PANEL_ID + '.c189-dark input[type=text],#' + PANEL_ID + '.c189-dark textarea{background:rgba(18,22,30,.85);color:#dbe2ee;}',
    '#' + PANEL_ID + '.c189-dark input[type=text]::placeholder,#' + PANEL_ID + '.c189-dark textarea::placeholder{color:#5f6a7d;}',
    '#' + PANEL_ID + '.c189-dark label.c189-lb{color:#98a3b6;}',
    '#' + PANEL_ID + '.c189-dark .c189-tabs button{color:#8b96aa;}',
    '#' + PANEL_ID + '.c189-dark .c189-tabs button:hover{color:#cfd7e4;background:rgba(255,255,255,.05);}',
    '#' + PANEL_ID + '.c189-dark .c189-btn2{background:rgba(40,47,61,.9);color:#c6cedd;border-color:#3b4457;}',
    '#' + PANEL_ID + '.c189-dark .c189-btn2:hover{color:#fff;background:rgba(52,61,79,.95);}',
    '#' + PANEL_ID + '.c189-dark .c189-btn:disabled{background:#3a4356;box-shadow:none;}',
    '#' + PANEL_ID + '.c189-dark .c189-log{background:rgba(14,17,24,.92);color:#c3cbd9;}',
    '#' + PANEL_ID + '.c189-dark .c189-log .ok{color:#66bb6a;}',
    '#' + PANEL_ID + '.c189-dark .c189-log .info{color:#64b5f6;}',
    '#' + PANEL_ID + '.c189-dark .c189-log .err{color:#ef5350;}',
    '#' + PANEL_ID + '.c189-dark .c189-log .muted{color:#6b7689;}',
    '#' + PANEL_ID + '.c189-dark .c189-list{background:rgba(18,22,30,.8);}',
    '#' + PANEL_ID + '.c189-dark .c189-list .row{border-bottom-color:rgba(255,255,255,.06);}',
    '#' + PANEL_ID + '.c189-dark .c189-list .row.dir{background:rgba(255,255,255,.04);}',
    '#' + PANEL_ID + '.c189-dark .c189-list .row .sz,#' + PANEL_ID + '.c189-dark .c189-bar .txt{color:#98a3b6;}',
    '#' + PANEL_ID + '.c189-dark .c189-list .muted,#' + PANEL_ID + '.c189-dark .c189-tip{color:#7b8699;}',
    '#' + PANEL_ID + '.c189-dark .c189-sec{background:rgba(23,27,36,.8);}',
    '#' + PANEL_ID + '.c189-dark .c189-foot{color:#8b96aa;}',
    '#' + PANEL_ID + '.c189-dark .c189-bar .track{background:rgba(255,255,255,.12);}',
    '#' + PANEL_ID + '.c189-dark .c189-body::-webkit-scrollbar-thumb{background:rgba(255,255,255,.22);}'
  ].join('\n');

  var ui = {}; // 元素引用集合
  var checkRunning = false;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function logLine(kind, text) {
    if (!ui.log) return;
    var div = el('div', kind, text);
    ui.log.appendChild(div);
    while (ui.log.childNodes.length > 600) ui.log.removeChild(ui.log.firstChild); // 上限防膨胀
    ui.log.scrollTop = ui.log.scrollHeight;
  }

  function setSessionStatus(state, text) {
    if (!ui.dot || !ui.status) return;
    ui.dot.className = 'c189-dot ' + (state || '');
    ui.status.textContent = text;
  }

  /** 底部状态栏显示个人空间容量（getUserSizeInfo，顺带含家庭云）。
   *  v1.14.0：检查 HTTP 状态码与登录页 HTML；失败先自动重试一次（清会话缓存重取），
   *  仍失败则给出"登录已过期 / 可点重新检测"的明确提示，不再无声显示"—"。 */
  function refreshCapacity() {
    if (!ui.capacity) return;
    ui.capacity.textContent = '个人空间：查询中…';
    function attempt() {
      return portalRequest('GET', PORTAL_BASE + '/portal/getUserSizeInfo.action',
        { headers: { accept: 'application/json;charset=UTF-8' } }
      ).then(function (res) {
        if (httpAuthExpired(res)) {
          throw authExpiredError('登录已过期（HTTP ' + res.status + '）：请刷新天翼云盘网页重新登录');
        }
        var json = parseJsonLoose(res.responseText);
        var ci = json && json.cloudCapacityInfo;
        if (!ci) {
          throw new Error('响应中缺少容量信息（HTTP ' + res.status + '）' +
            (String(res.responseText || '').slice(0, 80) ? '：' + String(res.responseText || '').slice(0, 80) + '…' : ''));
        }
        var used = Number(ci.usedSize) || 0;
        var total = Number(ci.totalSize) || 0;
        var free = total - used;
        ui.capacity.textContent = '个人空间：已用 ' + fmtSize(used) + ' / 总容量 ' + fmtSize(total) +
          '（剩余 ' + fmtSize(free > 0 ? free : 0) + '）';
      });
    }
    attempt().catch(function (e1) {
      // 单次自动重试：清会话缓存后重取（网关抖动/会话刚翻转时常常能自愈）
      sessionKeyCache = '';
      rsaCache = null;
      return sleep(600).then(attempt).catch(function (e2) {
        var expired = looksAuthError(e1) || looksAuthError(e2);
        ui.capacity.textContent = expired ?
          '个人空间：查询失败（登录已过期，请刷新网页重新登录）' :
          '个人空间：查询失败（可点“重新检测”重试）';
        logLine(expired ? 'err' : 'muted', '容量查询失败：' +
          ((e2 && e2.message) || (e1 && e1.message) || '未知原因'));
      });
    });
  }

  function checkSession() {
    if (checkRunning) return;
    checkRunning = true;
    setSessionStatus('', '正在检测登录状态…');
    function done() { checkRunning = false; }
    return ensureSessionKey().then(function () {
      setSessionStatus('ok', '已登录' + (sessionUser ? '：' + sessionUser : ''));
      refreshCapacity();
      ensureAvatarShown(); // 已登录：显示头像（briefInfo/DOM/本地存储多来源兕底）
      warmFamilyContext(); // 家庭云模式时预热家庭 ID 与根目录
      done();
    }, function (e) {
      setSessionStatus('err', '未登录或检测失败（请先登录天翼云盘网页）');
      logLine('err', e && e.message ? e.message : '检测失败');
      done();
    });
  }

  function buildPanel() {
    if (document.getElementById(PANEL_ID)) return;

    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    var panel = el('div');
    panel.id = PANEL_ID;
    panel.className = 'c189-min'; // 初始收起

    // ── 标题栏 ──
    var head = el('div', 'c189-head');
    var title = el('span', 'c189-title', '天翼云盘 CAS 秒传助手');
    var btnMin = el('button', null, '—');
    var btnClose = el('button', null, '×');
    head.appendChild(title);
    head.appendChild(btnMin);
    head.appendChild(btnClose);

    // ── Dock 栏（四个功能页） ──
    var tabs = el('div', 'c189-tabs');
    var tab1Btn = el('button', 'on', '秒传码入库');
    var tab2Btn = el('button', null, '生成 .cas');
    var tab3Btn = el('button', null, 'CAS 转文件');
    var tab4Btn = el('button', null, '设置');
    tabs.appendChild(tab1Btn);
    tabs.appendChild(tab2Btn);
    tabs.appendChild(tab3Btn);
    tabs.appendChild(tab4Btn);

    var body = el('div', 'c189-body');

    // ── 设置持久化 ──
    var SET_KEY = 'teleagent_189cas_settings';
    var settingsStore = (function () {
      try { return JSON.parse(localStorage.getItem(SET_KEY)) || {}; } catch (e) { return {}; }
    })();
    function saveSettings() {
      try { localStorage.setItem(SET_KEY, JSON.stringify(settingsStore)); } catch (e) {}
    }

    // ── 进度组件（每页一个：进度条 + 完成条数文本） ──
    function makeProgress(host) {
      var bar = el('div', 'c189-bar');
      var track = el('div', 'track');
      var fill = el('div', 'fill');
      var txt = el('div', 'txt', '');
      track.appendChild(fill);
      bar.appendChild(track);
      bar.appendChild(txt);
      host.appendChild(bar);
      return {
        set: function (pct, text) {
          bar.className = 'c189-bar show';
          fill.style.width = Math.max(0, Math.min(100, pct)) + '%';
          txt.textContent = text || '';
        },
        reset: function () {
          bar.className = 'c189-bar';
          fill.style.width = '0%';
          txt.textContent = '';
        }
      };
    }

    /* ═══════ Dock 1：秒传码入库 ═══════ */
    var tab1 = el('div');
    var lbCodes = el('label', 'c189-lb', '秒传码（每行一个，支持 JSON / cloud189:// / 管道串 / fast:// 格式；name 带路径自动建子目录）');
    var taCodes = el('textarea');
    taCodes.rows = 7;
    taCodes.placeholder = '{"name":"示例.mp4","size":1048576,"md5":"…32位…","sliceMd5":"…32位…"}\ncloud189://<Base64>\n示例.mp4|1048576|<MD5>|<分片MD5>\n（≤10MiB 的文件可省略分片MD5）';
    var rowBtn1 = el('div', 'c189-row');
    var btnUpload = el('button', 'c189-btn', '开始秒传');
    var btnClearCodes = el('button', 'c189-btn2', '清空');
    btnClearCodes.style.flex = '0 0 auto';
    rowBtn1.appendChild(btnUpload);
    rowBtn1.appendChild(btnClearCodes);
    btnClearCodes.addEventListener('click', function () {
      if (!taCodes.value) { logLine('muted', '秒传码输入框已是空的'); return; }
      taCodes.value = '';
      progress1.reset();
      logLine('muted', '已清空秒传码输入框');
    });
    var progress1 = makeProgress(tab1);
    tab1.appendChild(lbCodes);
    tab1.appendChild(taCodes);
    tab1.appendChild(rowBtn1);

    /* ═══════ Dock 2：生成 .cas / 秒传码（本地 + 云盘，共用一个文件口与一个输出框） ═══════ */
    var tab2 = el('div');
    tab2.style.display = 'none';

    // ── 2a 本地文件（一个文件口，两种动作：生成秒传码 / 上传转存） ──
    var secLocal = el('div', 'c189-sec');
    secLocal.appendChild(el('div', 'c189-sec-t', '本地文件'));
    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.multiple = true;
    var rowLocalActs = el('div', 'c189-row');
    var btnGenCodes = el('button', 'c189-btn2', '生成秒传码');
    var btnUploadGen = el('button', 'c189-btn', '上传到云盘并生成 .cas');
    rowLocalActs.appendChild(btnGenCodes);
    rowLocalActs.appendChild(btnUploadGen);
    secLocal.appendChild(fileInput);
    secLocal.appendChild(rowLocalActs);
    secLocal.appendChild(el('div', 'c189-tip', '同一批文件两种用法：「生成秒传码」纯本地算哈希（输出到下方结果框）；「上传到云盘并生成 .cas」上传到目标目录（设置①决定，云端已有相同内容时零流量秒传）并直接生成 .cas。'));
    tab2.appendChild(secLocal);

    // ── 2b 云盘目录生成 .cas ──
    var secCloud = el('div', 'c189-sec');
    var secCloudTitle = el('div', 'c189-sec-t', '云盘目录');
    secCloud.appendChild(secCloudTitle); // 目录 ID 动态显示在此红字后的括号里
    var rowNav = el('div', 'c189-row');
    var btnUpDir = el('button', 'c189-btn2', '返回上级');
    var btnScan = el('button', 'c189-btn', '① 扫描当前目录');
    rowNav.appendChild(btnUpDir);
    rowNav.appendChild(btnScan);
    var exportList = el('div', 'c189-list');
    var rowGen4 = el('div', 'c189-row');
    var btnSelAll = el('button', 'c189-btn2', '全选 / 全不选');
    var btnGenCas = el('button', 'c189-btn', '② 生成 .cas');
    rowGen4.appendChild(btnSelAll);
    rowGen4.appendChild(btnGenCas);
    secCloud.appendChild(rowNav);
    secCloud.appendChild(exportList);
    secCloud.appendChild(rowGen4);
    tab2.appendChild(secCloud);

    // ── 2c 生成结果（秒传码 / .cas 两路共用一个输出框） ──
    var mergeRow = el('label', 'c189-lb');
    var mergeChk = document.createElement('input');
    mergeChk.type = 'checkbox';
    mergeChk.className = 'c189-chk';
    mergeRow.appendChild(mergeChk);
    mergeRow.appendChild(document.createTextNode('多文件合并为一个 .cas（不勾选则每个文件单独一个）'));
    var fmtRow = el('label', 'c189-lb');
    var fmtLink = document.createElement('input');
    fmtLink.type = 'checkbox';
    fmtLink.className = 'c189-chk';
    fmtRow.appendChild(fmtLink);
    fmtRow.appendChild(document.createTextNode('秒传码输出为 cloud189:// 链接（不勾选输出 JSON；仅对「生成秒传码」生效）'));
    var taCasOut = el('textarea');
    taCasOut.rows = 3;
    taCasOut.readOnly = true;
    taCasOut.placeholder = '生成结果统一显示在这里（秒传码 / cloud189:// 链接 / .cas 内容）…';
    var rowOut4 = el('div', 'c189-row');
    rowOut4.style.flexWrap = 'wrap';
    var btnDlCas = el('button', 'c189-btn2', '下载 .cas');
    var btnUpCas = el('button', 'c189-btn2', '上传到云盘');
    var btnCopyJson = el('button', 'c189-btn2', '复制内容');
    var btnClearOutputs = el('button', 'c189-btn2', '清空全部');
    btnDlCas.disabled = true; // 仅在输出为 .cas 时启用
    btnUpCas.disabled = true;
    btnClearOutputs.title = '清空文件选择与生成结果（含 .cas 载荷）';
    rowOut4.appendChild(btnDlCas);
    rowOut4.appendChild(btnUpCas);
    rowOut4.appendChild(btnCopyJson);
    rowOut4.appendChild(btnClearOutputs);
    tab2.appendChild(mergeRow);
    tab2.appendChild(fmtRow);
    tab2.appendChild(taCasOut);
    tab2.appendChild(rowOut4);
    var progress2 = makeProgress(tab2);

    /* ═══════ Dock 3：CAS 转文件 ═══════ */
    var tab3 = el('div');
    tab3.style.display = 'none';
    var casFileInput = document.createElement('input');
    casFileInput.type = 'file';
    casFileInput.multiple = true;
    casFileInput.accept = '.cas,.torrent,.json,.txt,application/json,application/x-bittorrent';
    var lbCas = el('label', 'c189-lb', '或手动选择 / 粘贴 CAS 文件（可多选：.cas、openlist-sharing-seed、.cas.torrent，解析结果累积去重）');
    var taCas = el('textarea');
    taCas.rows = 3;
    taCas.placeholder = '也可直接把 .cas / 种子 JSON 文本粘贴到这里（支持一行一个，多段批量）…';
    // 长条主按钮（双态：无待传=扫描目录，有待传=开始秒传），v1.16.0 改为独占一行
    var rowBtn3 = el('div', 'c189-row');
    var btnMain3 = el('button', 'c189-btn', '扫描目录 .cas');
    rowBtn3.appendChild(btnMain3);
    // 三个次按钮并排在长条底下，均分宽度
    var rowBtn3b = el('div', 'c189-row');
    var btnParseCas = el('button', 'c189-btn2', '解析粘贴内容');
    var btnFillCodes = el('button', 'c189-btn2', '填入秒传码');
    var btnClearCas = el('button', 'c189-btn2', '清空解析结果');
    [btnParseCas, btnFillCodes, btnClearCas].forEach(function (b) {
      b.style.flex = '1';
      rowBtn3b.appendChild(b);
    });
    var progress3 = makeProgress(tab3);
    tab3.appendChild(casFileInput);
    tab3.appendChild(lbCas);
    tab3.appendChild(taCas);
    tab3.appendChild(rowBtn3);
    tab3.appendChild(rowBtn3b);

    /* ═══════ Dock 4：设置 ═══════ */
    var tab4 = el('div');
    tab4.style.display = 'none';

    // 开关 1：自动跟随当前浏览目录
    var autoRow = el('label', 'c189-lb');
    var autoChk = document.createElement('input');
    autoChk.type = 'checkbox';
    autoChk.className = 'c189-chk';
    autoChk.checked = settingsStore.auto !== false;
    autoRow.appendChild(autoChk);
    autoRow.appendChild(document.createTextNode('① 上传随当前浏览目录（不勾选时：个人云根目录 / 家庭云根目录）'));
    // 开关 2：覆盖同名
    var owRow = el('label', 'c189-lb');
    var overwriteChk = document.createElement('input');
    overwriteChk.type = 'checkbox';
    overwriteChk.className = 'c189-chk';
    overwriteChk.checked = !!settingsStore.overwrite;
    owRow.appendChild(overwriteChk);
    owRow.appendChild(document.createTextNode('② 覆盖同名文件（不勾选时同名冲突任务失败）'));
    // 开关 3：扫描随云盘当前目录（默认关；开启后云盘目录自动跟随页面浏览目录重扫）
    var scanRow = el('label', 'c189-lb');
    var scanFollowChk = document.createElement('input');
    scanFollowChk.type = 'checkbox';
    scanFollowChk.className = 'c189-chk';
    scanFollowChk.checked = !!settingsStore.followScan;
    scanFollowChk.addEventListener('change', function () {
      settingsStore.followScan = scanFollowChk.checked;
      saveSettings();
      applyFollowScanState();
      if (scanFollowChk.checked) {
        logLine('muted', '已开启③“扫描随云盘当前目录”：跟随页面浏览目录自动重新扫描（手动“扫描当前目录 / 返回上级”已停用）');
        startCloudScan(true);
      } else {
        logLine('muted', '已关闭③“扫描随云盘当前目录”：恢复手动扫描与返回上级');
      }
    });
    scanRow.appendChild(scanFollowChk);
    scanRow.appendChild(document.createTextNode('③ 扫描随云盘当前目录（开启后自动跟随页面浏览目录重新扫描；“扫描当前目录 / 返回上级”此时不可手动使用）'));
    // 开关 3：转存后删除 .cas
    var delRow = el('label', 'c189-lb');
    var delCasChk = document.createElement('input');
    delCasChk.type = 'checkbox';
    delCasChk.className = 'c189-chk';
    delCasChk.checked = !!settingsStore.delCas;
    delRow.appendChild(delCasChk);
    delRow.appendChild(document.createTextNode('⑤ 秒传成功后删除对应的 .cas / .cas.torrent 文件（移入回收站，并尽量彻底清空；有失败项时不删除）'));
    // 开关 6：任务成功后自动点击页面“刷新”按钮
    var rfRow = el('label', 'c189-lb');
    var autoRefreshChk = document.createElement('input');
    autoRefreshChk.type = 'checkbox';
    autoRefreshChk.className = 'c189-chk';
    autoRefreshChk.checked = settingsStore.autoRefresh !== false;
    autoRefreshEnabled = autoRefreshChk.checked;
    autoRefreshChk.addEventListener('change', function () {
      autoRefreshEnabled = autoRefreshChk.checked;
      settingsStore.autoRefresh = autoRefreshChk.checked;
      saveSettings();
      logLine('muted', autoRefreshChk.checked ?
        '任务成功后将自动点击页面“刷新”，立即显示新文件' :
        '已关闭自动刷新：任务成功后不再点击页面“刷新”');
    });
    rfRow.appendChild(autoRefreshChk);
    rfRow.appendChild(document.createTextNode('④ 任务成功后自动点击云盘页面的“刷新”按钮（立即显示刚秒传/上传的文件）'));
    // 开关 4 + 详细日志（面板等高后弹性占满剩余空间）
    var logHead = el('div');
    logHead.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin:8px 0 4px;';
    var lbLog = el('span');
    lbLog.style.cssText = 'color:#666;font-size:11px;';
    lbLog.textContent = '⑦ 详细日志';
    var btnClearLog = el('button', 'c189-btn2', '清空日志');
    btnClearLog.style.cssText = 'padding:3px 10px;font-size:11px;flex:none;';
    logHead.appendChild(lbLog);
    logHead.appendChild(btnClearLog);
    var logWrap = el('div', 'c189-log');
    logWrap.title = '拖动右下角小三角可调节日志框高度';
    logWrap.style.cssText = 'min-height:120px;'; // 高度由右下角拖拽调节（同 textarea），默认不挤压外观区

    btnClearLog.addEventListener('click', function () {
      logWrap.textContent = '';
    });

    /* ── 外观设置：主题色 / 玻璃效果 / 透明度 ── */
    var skinHead = el('div', 'c189-lb');
    skinHead.textContent = '⑥ 面板外观（主题色 / 玻璃效果 / 透明度 / 暗黑模式）';
    var themeRow = el('div');
    themeRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 8px;';
    var THEME_COLORS = [
      { key: 'red',    label: '天翼红', c1: '#e8383d', c2: '#c62828' },
      { key: 'blue',   label: '晴空蓝', c1: '#42a5f5', c2: '#1565c0' },
      { key: 'green',  label: '翡翠绿', c1: '#66bb6a', c2: '#2e7d32' },
      { key: 'purple', label: '星空紫', c1: '#ab47bc', c2: '#6a1b9a' },
      { key: 'orange', label: '落日橙', c1: '#ffa726', c2: '#ef6c00' },
      { key: 'cyan',   label: '碧水青', c1: '#26c6da', c2: '#00838f' },
      { key: 'pink',   label: '樱花粉', c1: '#ec407a', c2: '#ad1457' },
      { key: 'dark',   label: '暗夜黑', c1: '#546e7a', c2: '#263238' }
    ];
    var THEME_EFFECTS = [
      { key: 'solid',  label: '无' },
      { key: 'frost',  label: '毛玻璃' },
      { key: 'liquid', label: '液体玻璃' }
    ];
    var themeBtns = [];
    THEME_COLORS.forEach(function (t) {
      var b = el('button', 'c189-theme-btn');
      b.style.background = 'linear-gradient(135deg,' + t.c1 + ',' + t.c2 + ')';
      b.title = t.label;
      b.dataset.key = t.key;
      b.appendChild(document.createTextNode(''));
      themeBtns.push(b);
      themeRow.appendChild(b);
      b.addEventListener('click', function () {
        applyTheme(t.key, null);
      });
    });
    var effRow = el('div');
    effRow.style.cssText = 'display:flex;gap:6px;margin-bottom:8px;';
    var effBtns = [];
    THEME_EFFECTS.forEach(function (f) {
      var b = el('button', 'c189-btn2 c189-eff-btn');
      b.textContent = f.label;
      b.dataset.key = f.key;
      b.style.flex = '1'; // 四个按钮（含暗黑模式）均分一行，不溢出
      effBtns.push(b);
      effRow.appendChild(b);
      b.addEventListener('click', function () {
        // 暗黑与玻璃效果互斥：点效果按钮 = 退出暗黑，透明度滑杆恢复可用并切到所选效果
        if (settingsStore.dark) {
          settingsStore.dark = false;
          applyDarkMode();
          logLine('muted', '已退出暗黑模式，透明度恢复可用；玻璃效果：' + f.label);
        }
        applyTheme(null, f.key);
      });
    });
    // 暗黑模式开关（v1.17.0）：深色界面，与主题色可叠加；与透明度/玻璃效果互斥
    var darkBtn = el('button', 'c189-btn2 c189-eff-btn', '暗黑模式');
    darkBtn.title = '深色界面（透明度与玻璃效果暂停；点“无/毛玻璃/液体玻璃”退出并恢复）';
    darkBtn.style.flex = '1';
    effRow.appendChild(darkBtn);
    darkBtn.addEventListener('click', function () {
      settingsStore.dark = !settingsStore.dark;
      saveSettings();
      applyDarkMode();
      logLine('muted', settingsStore.dark ?
        '已开启暗黑模式（透明度调节暂停，点击“无/毛玻璃/液体玻璃”可退出并恢复透明度）' :
        '已关闭暗黑模式，透明度恢复可用');
    });
    var opRow = el('div');
    opRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;';
    var opLabel = el('span', null, '透明度');
    opLabel.style.cssText = 'font-size:11px;color:#666;flex:none;';
    var opSlider = document.createElement('input');
    opSlider.type = 'range';
    opSlider.min = '40';
    opSlider.max = '100';
    opSlider.step = '1';
    opSlider.value = String(settingsStore.opacity != null ? settingsStore.opacity : 100);
    opSlider.style.cssText = 'flex:1;accent-color:#e8383d;';
    var opVal = el('span', null, opSlider.value + '%');
    opVal.style.cssText = 'font-size:11px;color:#666;width:34px;flex:none;';
    opRow.appendChild(opLabel);
    opRow.appendChild(opSlider);
    opRow.appendChild(opVal);
    opSlider.addEventListener('input', function () {
      opVal.textContent = opSlider.value + '%';
      settingsStore.opacity = Number(opSlider.value);
      saveSettings();
      applyOpacity(Number(opSlider.value));
    });

    /* 主题引擎：修改 CSS 变量 --c189-a/--c189-b 与玻璃效果；持久化并立即生效 */
    function applyTheme(colorKey, effectKey) {
      if (colorKey) settingsStore.theme = colorKey;
      if (effectKey) settingsStore.effect = effectKey;
      saveSettings();
      var theme = THEME_COLORS.find(function (t) { return t.key === settingsStore.theme; }) || THEME_COLORS[0];
      panel.style.setProperty('--c189-a', theme.c1);
      panel.style.setProperty('--c189-b', theme.c2);
      panel.style.setProperty('accent-color', theme.c1); // 复选框/滑杆主题色
      opSlider.style.setProperty('accent-color', theme.c1);
      // 效果：毛玻璃 blur 8px；液体玻璃 blur 16px + 饱和 + 内高光；无效果则实底
      var eff = settingsStore.effect || 'solid';
      if (eff === 'frost') {
        panel.style.setProperty('--c189-blur', '8px');
        panel.style.setProperty('--c189-saturate', '1.1');
        panel.classList.remove('c189-liquid');
      } else if (eff === 'liquid') {
        panel.style.setProperty('--c189-blur', '16px');
        panel.style.setProperty('--c189-saturate', '1.35');
        panel.classList.add('c189-liquid');
      } else {
        panel.style.setProperty('--c189-blur', '0px');
        panel.style.setProperty('--c189-saturate', '1');
        panel.classList.remove('c189-liquid');
      }
      // 同步选中态（暗黑模式开启时效果按钮不点亮，避免“暗黑+效果”同时选中误导）
      themeBtns.forEach(function (b) {
        b.classList.toggle('on', b.dataset.key === theme.key);
      });
      effBtns.forEach(function (b) {
        b.classList.toggle('on', !settingsStore.dark && b.dataset.key === eff);
      });
    }
    /** 透明度：40%~100%（1 为全不透明；低于 100 时玻璃效果更明显）；仅亮色模式有效 */
    function applyOpacity(op) {
      var v = Math.min(100, Math.max(40, Number(op) || 100));
      panel.style.setProperty('--c189-panel-alpha', String(v / 100));
      panel.style.setProperty('--c189-bg', 'rgba(255,255,255,' + (v / 100) + ')');
      var sub = Math.max(0.35, (v / 100) - 0.12);
      panel.style.setProperty('--c189-sub-bg', 'rgba(250,250,250,' + sub + ')');
    }
    /** 暗黑模式（v1.18.0）：与透明度/玻璃效果互斥——
     *  开启：深色底固定不透明（清掉内联透明度变量，用 .c189-dark 的实底色），
     *        透明度滑杆禁用，效果按钮全部不选中（当前是暗黑）；
     *  关闭：效果按钮恢复选中态，透明度滑杆可用并按保存值重应用。 */
    function applyDarkMode() {
      var on = !!settingsStore.dark;
      panel.classList.toggle('c189-dark', on);
      darkBtn.classList.toggle('on', on);
      opSlider.disabled = on; // 暗黑模式下不提供透明度调节
      if (on) {
        ['--c189-bg', '--c189-sub-bg', '--c189-panel-alpha'].forEach(function (p) {
          panel.style.removeProperty(p); // 清内联变量，让 .c189-dark 的实底色生效
        });
        effBtns.forEach(function (b) { b.classList.toggle('on', false); }); // 暗黑时效果按钮不选中
      } else {
        applyOpacity(settingsStore.opacity != null ? settingsStore.opacity : 100);
        var eff2 = settingsStore.effect || 'solid';
        effBtns.forEach(function (b) { b.classList.toggle('on', b.dataset.key === eff2); });
      }
    }
    // 初始化应用已保存的外观
    applyTheme(null, null);
    applyDarkMode();

    /* 版本信息（作者 / 联系方式） */
    var aboutRow = el('div');
    aboutRow.style.cssText = 'text-align:center;color:#aaa;font-size:11px;margin-top:10px;line-height:1.7;';
    aboutRow.textContent = '版本 v1.19.1 · 作者：小胜子 · 联系方式：xsz0824@189.cn';

    tab4.appendChild(autoRow);
    tab4.appendChild(owRow);
    tab4.appendChild(scanRow);
    tab4.appendChild(rfRow);
    tab4.appendChild(delRow);
    tab4.appendChild(skinHead);
    tab4.appendChild(themeRow);
    tab4.appendChild(effRow);
    tab4.appendChild(opRow);
    tab4.appendChild(logHead);
    tab4.appendChild(logWrap);
    tab4.appendChild(aboutRow);
    /* 日志窗口高度可调节：与“CAS 转文件”等输出框一致——拖动日志框右下角小三角调节，
       高度持久化到设置（浏览器原生 resize 不派发事件，用 ResizeObserver 记录） */
    (function makeLogResizable() {
      function applyLogH(h) {
        logWrap.style.flex = '0 0 auto';
        logWrap.style.height = h + 'px';
        logWrap.style.maxHeight = 'none';
      }
      if (settingsStore.logH) applyLogH(settingsStore.logH);
      if (typeof ResizeObserver !== 'function') return; // 老浏览器：拖拽仍可用，只是不记忆
      var saveTimer = 0;
      var lastSaved = Number(settingsStore.logH) || 0;
      var ro = new ResizeObserver(function () {
        // 未手动拖过（无内联高度）时不记录，避免自动增高把默认高度写死
        if (!logWrap.style.height) return;
        clearTimeout(saveTimer);
        saveTimer = setTimeout(function () {
          var h = Math.round(logWrap.getBoundingClientRect().height);
          if (h > 0 && Math.abs(h - lastSaved) >= 2) {
            lastSaved = h;
            settingsStore.logH = h;
            saveSettings();
          }
        }, 250);
      });
      ro.observe(logWrap);
    })();

    body.appendChild(tab1);
    body.appendChild(tab2);
    body.appendChild(tab3);
    body.appendChild(tab4);

    // ── 底部状态栏 ──
    var foot = el('div', 'c189-foot');
    foot.style.cssText = 'flex-direction:column;align-items:stretch;gap:2px;';
    var footRow = el('div');
    footRow.style.cssText = 'display:flex;align-items:center;gap:6px;';
    var dot = el('span', 'c189-dot');
    var avatar = el('img'); // 登录头像（已登录时显示在状态点右侧）
    avatar.alt = '头像';
    avatar.title = '已登录';
    avatar.style.cssText = 'width:18px;height:18px;border-radius:50%;object-fit:cover;flex:none;display:none;' +
      'background:rgba(0,0,0,.06);box-shadow:0 0 0 1px rgba(0,0,0,.08) inset;';
    avatar.onerror = function () { // 加载失败：隐藏并把 URL 记入黑名单，避免反复重试
      avatar.style.display = 'none';
      if (avatarLoadedUrl) avatarBadUrl = avatarLoadedUrl;
      avatarLoadedUrl = '';
    };
    var status = el('span', null, '未检测');
    status.style.flex = '1';
    var btnRefresh = el('button', 'c189-btn2', '重新检测');
    footRow.appendChild(dot);
    footRow.appendChild(avatar);
    footRow.appendChild(status);
    footRow.appendChild(btnRefresh);
    var capacity = el('div');
    capacity.style.cssText = 'font-size:10px;color:#999;padding-left:2px;';
    capacity.textContent = '个人空间：—';
    foot.appendChild(footRow);
    foot.appendChild(capacity);

    panel.appendChild(head);
    panel.appendChild(tabs);
    panel.appendChild(body);
    panel.appendChild(foot);
    document.body.appendChild(panel);

    ui = {
      panel: panel, log: logWrap, dot: dot, status: status, capacity: capacity,
      avatar: avatar,
      taCodes: taCodes,
      btnUpload: btnUpload, fileInput: fileInput
    };

    // ── 目标目录：空间自动识别（浏览家庭云页面→家庭云，否则个人云）+ ①自动跟随 ──
    /** 解析目标 { folderId, familyId }：
     *  浏览家庭云页面时自动切家庭云：勾①跟随家庭页面目录，否则家庭根目录；
     *  个人云：勾①跟随浏览目录，否则 -11 */
    function resolveTarget() {
      if (isFamilySpace()) {
        return getFamilyRootFolderId().then(function (rootId) {
          var fid = autoChk.checked && autoDetect.lastId ? autoDetect.lastId : rootId;
          return { folderId: fid, familyId: familyIdCache };
        });
      }
      return Promise.resolve({
        folderId: autoChk.checked ? (detectFolderId() || ROOT_FOLDER_ID) : ROOT_FOLDER_ID,
        familyId: ''
      });
    }
    /** 同步快速版（标题等显示用；家庭根目录可能尚未就绪） */
    function getTargetFolderNow() {
      if (isFamilySpace()) {
        if (autoChk.checked && autoDetect.lastId) return autoDetect.lastId;
        return familyRootFolderId || '家庭云';
      }
      return autoChk.checked ? (detectFolderId() || ROOT_FOLDER_ID) : ROOT_FOLDER_ID;
    }

    // 标题：小胜子秒传助手（当前目录 ID），随目录变化刷新；
    // 每 5 轮（约 6 秒）补找一次头像——页面头像可能晚于脚本加载，找到即停；
    // ③扫描跟随开启时：页面浏览目录一变就自动重扫（tab2 未打开也保持数据新鲜）
    var avatarTick = 0;
    var titleTimer = setInterval(function () {
      var fid = getTargetFolderNow();
      title.textContent = '小胜子秒传助手（' + fid + '）';
      if (++avatarTick % 5 === 0) ensureAvatarShown();
      if (scanFollowChk && scanFollowChk.checked) {
        var curDir = isFamilySpace()
          ? (autoDetect.lastId || familyRootFolderId || '')
          : (detectFolderId() || ROOT_FOLDER_ID);
        if (curDir && curDir !== lastFollowDir) startCloudScan(true);
      }
    }, 1200);
    title.textContent = '小胜子秒传助手（' + getTargetFolderNow() + '）';
    ensureAvatarShown();

    // 设置开关持久化
    autoChk.addEventListener('change', function () {
      settingsStore.auto = autoChk.checked;
      saveSettings();
      logLine('muted', '上传目录：' + (autoChk.checked ?
        '随当前浏览目录（家庭云页面跟随家庭目录）' :
        (isFamilySpace() ? '固定为家庭云根目录' : '固定为个人云根目录')));
    });
    function refreshTitleNow() {
      title.textContent = '小胜子秒传助手（' + getTargetFolderNow() + '）';
    }
    overwriteChk.addEventListener('change', function () {
      settingsStore.overwrite = overwriteChk.checked;
      saveSettings();
    });
    delCasChk.addEventListener('change', function () {
      settingsStore.delCas = delCasChk.checked;
      saveSettings();
      if (delCasChk.checked) {
        logLine('muted', '已开启"秒传成功后删除 .cas/.cas.torrent"：转存全部成功时自动移入回收站并尽量彻底清空');
      }
    });

    // ── 交互逻辑（收起/展开带 FLIP 滑动 + 内容淡入淡出动效） ──
    var collapsed = true;
    var panelAnimTimer = 0;
    /** FLIP：class 切换后面板瞬移到新位置，用反向 transform 补偿后过渡回 0，形成平滑滑动 */
    function glidePanelFrom(r1) {
      var r2 = panel.getBoundingClientRect();
      var dx = r1.left - r2.left;
      var dy = r1.top - r2.top;
      if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
      panel.style.transition = 'none';
      panel.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      void panel.offsetWidth; // 强制回流：先固化"无过渡+平移"，再开过渡归零
      panel.style.transition = '';
      panel.style.transform = '';
    }
    /**
     * 展开态位置记忆（v1.18.0 重构）：
     *   - 收起的小条固定钉在右下角（.c189-min 的 !important 定位，不可拖动）；
     *   - 展开态可自由拖动，最后一次位置记在 expandedPos（内联 !important 坐标）；
     *   - 收起时清除内联定位坐标 → 回到右下角；再展开时按记忆位置放回（含视口钳制），
     *     从未拖动过则用样式表默认位置（top:80px / right:16px）。
     */
    var expandedPos = null; // { x, y } 展开态记忆位置；null=从未拖动
    function placePanel(x, y) {
      panel.style.setProperty('right', 'auto', 'important');
      panel.style.setProperty('bottom', 'auto', 'important');
      panel.style.setProperty('left', Math.round(x) + 'px', 'important');
      panel.style.setProperty('top', Math.round(y) + 'px', 'important');
    }
    /** 清除内联定位（收起时用），让 .c189-min 的右下角固定定位生效 */
    function clearInlinePos() {
      ['left', 'top', 'right', 'bottom'].forEach(function (p) {
        panel.style.removeProperty(p);
      });
    }
    /** 展开时放回记忆位置；面板超出视口则连尺寸一并收回（v1.17.0 修复保留） */
    function restoreExpandedPos() {
      if (!expandedPos) return; // 从未拖动过：保持样式表默认定位
      var w = panel.offsetWidth;
      var h = panel.offsetHeight;
      if (w > window.innerWidth - 12) {
        w = Math.max(300, window.innerWidth - 12);
        panel.style.width = w + 'px';
      }
      if (h > window.innerHeight - 12) {
        h = Math.max(200, window.innerHeight - 12);
        panel.style.height = h + 'px';
      }
      placePanel(
        Math.max(0, Math.min(expandedPos.x, window.innerWidth - w)),
        Math.max(0, Math.min(expandedPos.y, window.innerHeight - h))
      );
    }
    function togglePanel() {
      collapsed = !collapsed;
      clearTimeout(panelAnimTimer);
      if (collapsed) {
        // 收起：内容先淡出 → 面板滑向右下角固定位置
        panel.classList.add('c189-fade');
        panelAnimTimer = setTimeout(function () {
          var r1 = panel.getBoundingClientRect();
          panel.classList.add('c189-min');
          clearInlinePos(); // 清拖动坐标：小条回到右下角固定锚点
          glidePanelFrom(r1);
        }, 160);
      } else {
        // 展开：面板从右下角滑回记忆位置（没有记忆则用默认位置）→ 内容淡入
        var r0 = panel.getBoundingClientRect();
        panel.classList.remove('c189-min');
        restoreExpandedPos(); // 放回上次展开时拖到的位置，并按展开后的宽高钳制在视口内
        glidePanelFrom(r0);
        panelAnimTimer = setTimeout(function () {
          panel.classList.remove('c189-fade');
        }, 220);
      }
      if (!collapsed && !sessionKeyCache && !checkRunning) checkSession();
    }
    btnMin.addEventListener('click', togglePanel);
    title.addEventListener('dblclick', togglePanel);

    btnClose.addEventListener('click', function () {
      panel.style.display = 'none';
    });

    // 拖动（仅展开态；收起的小条固定右下角不可拖动，v1.18.0）
    (function makeDraggable() {
      var sx = 0, sy = 0, ox = 0, oy = 0, dragging = false;
      function down(e) {
        if (collapsed) return; // 收起态：小条固定在右下角，不响应拖动
        if (e.target && e.target.closest && e.target.closest('button')) return; // 按钮不触发拖动
        dragging = true;
        sx = e.clientX; sy = e.clientY;
        var r = panel.getBoundingClientRect();
        ox = r.left; oy = r.top;
        e.preventDefault();
      }
      function move(e) {
        if (!dragging) return;
        var nx = Math.max(0, Math.min(window.innerWidth - panel.offsetWidth, ox + e.clientX - sx));
        var ny = Math.max(0, Math.min(window.innerHeight - panel.offsetHeight, oy + e.clientY - sy));
        placePanel(nx, ny);
        expandedPos = { x: nx, y: ny }; // 记住展开态位置：收起再展开时回到这里
      }
      function up() { dragging = false; }
      head.addEventListener('mousedown', down);
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    })();

    // 尺寸调节：右下角手柄拖动改宽高（持久化）
    (function makeResizable() {
      var RESIZE_KEY = 'teleagent_189cas_panel_size';
      var handle = el('div', 'c189-resize');
      handle.title = '拖动调节面板大小';
      panel.appendChild(handle);
      function clampNum(v, min, max) { return Math.min(Math.max(v, min), max); }
      try {
        var saved = JSON.parse(localStorage.getItem(RESIZE_KEY));
        if (saved && saved.w && saved.h) {
          panel.style.width = clampNum(saved.w, 300, Math.min(720, window.innerWidth - 40)) + 'px';
          panel.style.height = clampNum(saved.h, 340, window.innerHeight - 100) + 'px';
        }
      } catch (e) {}
      var sx = 0, sy = 0, sw = 0, sh = 0, resizing = false;
      handle.addEventListener('mousedown', function (e) {
        resizing = true;
        sx = e.clientX; sy = e.clientY;
        var r = panel.getBoundingClientRect();
        sw = r.width; sh = r.height;
        e.preventDefault();
        e.stopPropagation();
      });
      document.addEventListener('mousemove', function (e) {
        if (!resizing) return;
        panel.style.width = clampNum(sw + e.clientX - sx, 300, Math.min(720, window.innerWidth - 40)) + 'px';
        panel.style.height = clampNum(sh + e.clientY - sy, 340, window.innerHeight - 100) + 'px';
      });
      document.addEventListener('mouseup', function () {
        if (!resizing) return;
        resizing = false;
        try {
          var r = panel.getBoundingClientRect();
          localStorage.setItem(RESIZE_KEY, JSON.stringify({
            w: Math.round(r.width), h: Math.round(r.height)
          }));
        } catch (e) {}
      });
    })();

    // 标签切换
    function switchTab(n) {
      tab1Btn.className = n === 1 ? 'on' : '';
      tab2Btn.className = n === 2 ? 'on' : '';
      tab3Btn.className = n === 3 ? 'on' : '';
      tab4Btn.className = n === 4 ? 'on' : '';
      tab1.style.display = n === 1 ? '' : 'none';
      tab2.style.display = n === 2 ? '' : 'none';
      tab3.style.display = n === 3 ? '' : 'none';
      tab4.style.display = n === 4 ? '' : 'none';
    }
    tab1Btn.addEventListener('click', function () { switchTab(1); });
    tab3Btn.addEventListener('click', function () { switchTab(3); });
    tab4Btn.addEventListener('click', function () { switchTab(4); });

    btnUpload.addEventListener('click', function () {
      var parsed = parseCodes(taCodes.value);
      parsed.errors.forEach(function (e) { logLine('err', e); });
      if (!parsed.items.length) {
        logLine('err', '没有可用的秒传码，请检查格式');
        progress1.set(0, '没有可用的秒传码');
        return;
      }
      btnUpload.disabled = true;
      progress1.reset();
      resolveTarget().then(function (t) {
        return runRapidUpload(parsed.items, t.folderId, overwriteChk.checked, logLine, function (summary) {
          btnUpload.disabled = false;
          if (summary && summary.ok > 0) autoRefreshPageList(); // 秒传成功后刷新云盘文件列表
        }, function (cur, total, label) {
          progress1.set(total ? cur / total * 100 : 0,
            cur + '/' + total + (cur < total ? ' · ' + label : ''));
        }, null, t.familyId);
      }).catch(function (e) {
        btnUpload.disabled = false;
        logLine('err', (e && e.message ? e.message : '任务启动失败'));
      });
    });

    // ── Dock2 本地：生成秒传码（写入共用输出框，可停止） ──
    var outputMode = ''; // 'codes'（秒传码/链接）| 'cas'（.cas 载荷）
    function formatGenOutput(item) {
      if (fmtLink.checked) {
        // cloud189://base64(名|大小|MD5|分片MD5)，生态通用链接格式
        return 'cloud189://' + utf8ToBase64(item.name + '|' + item.size + '|' + item.md5 + '|' + item.sliceMd5);
      }
      // 输出秒传码不含逐片列表（parts 仅上传内部使用，几百片会撑爆文本）
      return JSON.stringify({
        name: item.name, dirPath: item.dirPath || '', size: item.size,
        md5: item.md5, sliceMd5: item.sliceMd5
      });
    }

    var genCodesRunning = false;
    var genCodesCtx = null; // { aborted }

    function refreshGenCodesBtn() {
      if (genCodesRunning) {
        btnGenCodes.textContent = '■ 停止';
        btnGenCodes.disabled = false;
      } else if ((fileInput.files || []).length) {
        btnGenCodes.textContent = '生成秒传码';
        btnGenCodes.disabled = false;
      } else {
        btnGenCodes.textContent = '生成秒传码';
        btnGenCodes.disabled = true;
      }
    }

    btnGenCodes.addEventListener('click', function () {
      if (genCodesRunning) { // 停止
        if (genCodesCtx) genCodesCtx.aborted = true;
        btnGenCodes.textContent = '停止中…';
        btnGenCodes.disabled = true;
        logLine('muted', '已请求停止生成秒传码');
        // 兑底：4 秒后仍未收尾则强制恢复
        var stopCtx = genCodesCtx;
        setTimeout(function () {
          if (genCodesRunning && genCodesCtx === stopCtx) {
            genCodesRunning = false;
            genCodesCtx = null;
            refreshGenCodesBtn();
            refreshUpGenBtn();
          }
        }, 4000);
        return;
      }
      var files = Array.prototype.slice.call(fileInput.files || []);
      if (!files.length) { logLine('err', '请先选择本地文件'); return; }
      genCodesRunning = true;
      var ctx = { aborted: false };
      genCodesCtx = ctx;
      btnDlCas.disabled = true; // 秒传码输出时 ③ .cas 操作不适用
      btnUpCas.disabled = true;
      outputMode = 'codes';
      casOutputs = [];
      taCasOut.value = '';
      refreshGenCodesBtn();
      progress2.reset();
      var out = [];
      var failCount = 0;
      var i = 0;
      function finish(aborted) {
        if (genCodesCtx !== ctx) return; // 已被强制收尾接管，跳过
        genCodesRunning = false;
        genCodesCtx = null;
        taCasOut.value = out.join('\n') + (out.length ? '\n' : '');
        progress2.set(100, (aborted ? '已停止' : '完成') + '：' + out.length + '/' + files.length +
          (failCount ? '，' + failCount + ' 个失败' : ''));
        logLine(out.length ? 'ok' : 'err',
          '秒传码生成' + (aborted ? '已中止' : '完成') + '：' + out.length + ' 条（' +
          (fmtLink.checked ? 'cloud189:// 链接' : 'JSON') + '格式），可复制内容分发');
        refreshGenCodesBtn();
        refreshUpGenBtn();
      }
      (function next() {
        if (ctx.aborted || i >= files.length) { finish(ctx.aborted); return; }
        var f = files[i++];
        var idx = i;
        logLine('info', '正在计算 ' + f.name + '（' + fmtSize(f.size) + '）…');
        var basePct = (i - 1) / files.length * 100;
        progress2.set(basePct, idx + '/' + files.length + ' · ' + f.name);
        hashFile(f, function (cur, total) {
          var inner = total ? cur / total : 1;
          progress2.set(basePct + inner * (100 / files.length),
            idx + '/' + files.length + ' · ' + f.name + ' 分片 ' + cur + '/' + total);
        }, function () { return ctx.aborted; }).then(function (item) {
          out.push(formatGenOutput(item));
          return sleep(30);
        }, function (e) {
          if (e && e.aborted) {
            logLine('muted', f.name + '：已按停止请求中止');
          } else {
            failCount++;
            logLine('err', f.name + '：' + (e && e.message ? e.message : '计算失败'));
          }
        }).then(next);
      })();
    });

    // 格式开关：仅对秒传码输出生效；切换时把已有秒传码按新格式重排
    fmtLink.addEventListener('change', function () {
      if (outputMode !== 'codes' || !taCasOut.value) {
        logLine('muted', '秒传码输出格式：' + (fmtLink.checked ? 'cloud189:// 链接' : 'JSON') + '（对下次生成生效）');
        return;
      }
      var lines = taCasOut.value.split('\n').filter(function (l) { return l.trim(); });
      var reParsed = [];
      lines.forEach(function (l) {
        var item = null;
        var j = parseJsonLoose(l);
        if (j && !Array.isArray(j)) item = normalizeItem(j);
        if (!item) {
          var r = parseCodes(l);
          if (r.items.length) item = r.items[0];
        }
        if (item) reParsed.push(item);
      });
      if (reParsed.length) {
        taCasOut.value = reParsed.map(formatGenOutput).join('\n') + '\n';
        logLine('muted', '已切换为' + (fmtLink.checked ? ' cloud189:// 链接' : ' JSON') + '格式（' + reParsed.length + ' 条）');
      }
    });

    // 复制内容：秒传码或 .cas JSON 都可复制
    btnCopyJson.addEventListener('click', function () {
      if (!taCasOut.value) { logLine('muted', '暂无内容可复制'); return; }
      copyText(taCasOut.value.trim()).then(function (ok) {
        logLine(ok ? 'ok' : 'err', ok ? '内容已复制到剪贴板' : '复制失败，请手动选择复制');
      });
    });

    // ── Dock3：CAS 转文件（多来源累积，按 name+size+md5 去重） ──
    var parsedCasItems = [];   // 累积的待秒传条目
    var scannedCasFiles = [];  // [{id, name, size}]（仅扫描来源的 .cas，删除用）
    var main3Busy = false;     // 扫描或秒传进行中
    var main3Ctx = null;       // { aborted } 扫描取消标记

    function resetCasState() {
      parsedCasItems = [];
      scannedCasFiles = [];
      progress3.reset();
      refreshMain3Btn();
    }

    /** 主按钮三态：处理中→再点取消；有待传条目 → 开始秒传；无 → 扫描目录 .cas */
    function refreshMain3Btn() {
      if (main3Busy) {
        btnMain3.textContent = '取消';
        btnMain3.disabled = false; // 处理中可再点一次取消
      } else if (parsedCasItems.length) {
        btnMain3.textContent = '开始秒传（' + parsedCasItems.length + ' 条）';
        btnMain3.disabled = false;
      } else {
        btnMain3.textContent = '扫描目录 .cas';
        btnMain3.disabled = false;
      }
    }

    /** 解析摘要：明细进设置页日志，本页只留"已解析 N 条"计数 */
    function casCountText(extra) {
      return '已解析 ' + parsedCasItems.length + ' 个条目' +
        (scannedCasFiles.length ? '（扫描 ' + scannedCasFiles.length + ' 个 .cas/.cas.torrent）' : '') +
        (extra ? ' · ' + extra : '');
    }

    function appendCasResult(res, sourceLabel) {
      var added = 0;
      res.items.forEach(function (item) {
        var dup = parsedCasItems.some(function (x) {
          return x.name === item.name && x.size === item.size && x.md5 === item.md5;
        });
        if (!dup) { parsedCasItems.push(item); added++; }
      });
      // 来源与条目明细 → 设置页详细日志
      logLine('info', '来源：' + sourceLabel +
        (res.format ? '（' + res.format + '）' : '') +
        '，解析 ' + res.items.length + ' 个，新增 ' + added + ' 个');
      res.items.forEach(function (item) {
        logLine('ok', '√ ' + (item.dirPath ? item.dirPath + '/' : '') + item.name +
          ' (' + fmtSize(item.size) + ')  md5=' + item.md5.slice(0, 8) + '…');
      });
      res.errors.forEach(function (msg) {
        logLine('err', '× [' + sourceLabel + '] ' + msg);
      });
      progress3.set(0, casCountText());
      refreshMain3Btn();
      return added;
    }

    function readCasFile(file) {
      return file.arrayBuffer ? file.arrayBuffer().then(function (buf) {
        return { bytes: new Uint8Array(buf), text: bytesToText(new Uint8Array(buf)) };
      }) : new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onerror = function () { reject(new Error('读取文件失败')); };
        reader.onload = function () {
          var bytes = new Uint8Array(reader.result);
          resolve({ bytes: bytes, text: bytesToText(bytes) });
        };
        reader.readAsArrayBuffer(file);
      });
    }

    casFileInput.addEventListener('change', function () {
      var files = Array.prototype.slice.call(casFileInput.files || []);
      if (!files.length) return;
      var i = 0;
      progress3.reset();
      (function next() {
        if (i >= files.length) {
          progress3.set(100, casCountText('解析完成'));
          logLine('ok', 'CAS 文件解析完毕：共 ' + files.length + ' 个文件，累计可用 ' + parsedCasItems.length + ' 个条目，可继续追加或点“开始秒传”');
          casFileInput.value = ''; // 清空选择，便于再次选择同一批文件
          return;
        }
        var f = files[i++];
        progress3.set((i - 1) / files.length * 100, i + '/' + files.length + ' · ' + f.name);
        logLine('info', '正在解析 CAS 文件 [' + i + '/' + files.length + ']：' + f.name + ' (' + fmtSize(f.size) + ') …');
        readCasFile(f).then(function (content) {
          try {
            var res = parseCasContent(content.bytes || null, content.text || '');
            appendCasResult(res, f.name);
          } catch (e) {
            logLine('err', f.name + ' 解析异常：' + (e && e.message ? e.message : e));
          }
          return next();
        }).catch(function (e) {
          logLine('err', '读取 ' + f.name + ' 失败：' + (e && e.message ? e.message : e));
          return next();
        });
      })();
    });

    btnParseCas.addEventListener('click', function () {
      var text = taCas.value.trim();
      if (!text) { logLine('muted', '请先选择 CAS 文件或粘贴内容'); return; }
      try {
        var res = parseCasTextBatch(text);
        appendCasResult(res, '粘贴内容');
        progress3.set(100, casCountText('粘贴解析完成'));
        logLine(res.items.length ? 'ok' : 'err',
          '粘贴内容解析完成：解析出 ' + res.items.length + ' 个条目，累计可用 ' + parsedCasItems.length + ' 个');
      } catch (e) {
        logLine('err', '粘贴内容解析异常：' + (e && e.message ? e.message : e));
      }
    });

    btnClearCas.addEventListener('click', function () {
      resetCasState();
      taCas.value = '';
      casFileInput.value = '';
      logLine('muted', '已清空 CAS 解析结果');
    });

    /* 主按钮：无待传 → 扫描；有待传 → 开始秒传；处理中 → 取消（中断当前请求并中止） */
    btnMain3.addEventListener('click', function () {
      if (main3Busy) {
        if (main3Ctx) {
          main3Ctx.aborted = true;
          if (main3Ctx.cancel) main3Ctx.cancel(); // 掐断进行中的下载请求
        }
        btnMain3.textContent = '停止中…';
        btnMain3.disabled = true;
        logLine('muted', '已请求取消：中断当前处理并中止任务');
        // 兜底：4 秒后仍未收尾则强制恢复
        var stopCtx = main3Ctx;
        setTimeout(function () {
          if (main3Busy && main3Ctx === stopCtx) {
            main3Busy = false;
            main3Ctx = null;
            refreshMain3Btn();
            logLine('muted', '任务已强制取消');
          }
        }, 4000);
        return;
      }
      if (parsedCasItems.length) {
        startCasUpload();
      } else {
        startCasScan();
      }
    });

    var cas3FamilyId = '';   // Dock3 扫描/秒传/删除时所在空间（家庭云 ID 或空）
    var cas3SrcParentId = ''; // 扫描目录 ID（家庭云删除需要）

    function startCasUpload() {
      if (!parsedCasItems.length) {
        logLine('err', '请先解析 CAS 文件');
        progress3.set(0, '尚无解析条目');
        return;
      }
      main3Busy = true;
      var ctx = { aborted: false, cancel: null };
      main3Ctx = ctx;
      refreshMain3Btn();
      progress3.reset();
      resolveTarget().then(function (t) {
        if (main3Ctx !== ctx) return; // 已被取消
        return runRapidUpload(parsedCasItems.slice(), t.folderId, overwriteChk.checked, logLine, function (summary) {
          if (main3Ctx !== ctx) return; // 已被强制收尾接管，跳过
          main3Busy = false;
          main3Ctx = null;
          if (ctx.aborted) {
            logLine('muted', '秒传任务已中止（已处理部分见日志）');
          } else if (summary && summary.ok > 0 && !(summary.fail > 0)) {
            // 全部成功：清空已传条目，按钮回到扫描态
            parsedCasItems = [];
          }
          refreshMain3Btn();
          // 扫描流程：全部秒传成功时清理 .cas 种子文件；有失败项则保留种子以便重试
          var willClean = !ctx.aborted && delCasChk.checked && scannedCasFiles.length &&
            !(summary && summary.fail > 0);
          // 秒传成功后刷新云盘列表（要清理 .cas 时等清理完成再刷新，避免刷出待删文件）
          if (!willClean && summary && summary.ok > 0) autoRefreshPageList();
          if (!ctx.aborted && delCasChk.checked && scannedCasFiles.length) {
            if (summary && summary.fail > 0) {
              logLine('err', '本次有 ' + summary.fail + ' 个文件秒传失败，跳过 .cas 清理（保留种子便于重试）');
            } else {
              maybeDeleteScannedCas(function () {
                if (summary && summary.ok > 0) autoRefreshPageList();
              });
            }
          }
        }, function (cur, total, label) {
          progress3.set(total ? cur / total * 100 : 0,
            cur + '/' + total + (cur < total ? ' · ' + label : ''));
        }, null, t.familyId);
      }).catch(function (e) {
        if (main3Ctx === ctx) {
          main3Busy = false;
          main3Ctx = null;
          refreshMain3Btn();
          logLine('err', (e && e.message ? e.message : '任务启动失败'));
        }
      });
    }

    function maybeDeleteScannedCas(onFinish) {
      if (!delCasChk.checked || !scannedCasFiles.length) { if (onFinish) onFinish(); return; }
      logLine('info', '开始清理已秒传的 .cas / .cas.torrent 文件（共 ' + scannedCasFiles.length + ' 个：移入回收站，并尽量彻底清空）');
      var i = 0;
      var total = scannedCasFiles.length;
      var okCount = 0;
      var failCount = 0;
      (function next() {
        if (i >= total) {
          scannedCasFiles = [];
          var kind = okCount === total ? 'ok' : (okCount ? 'info' : 'err');
          logLine(kind, '.cas 清理完成：成功 ' + okCount + '/' + total +
            (failCount ? '，失败 ' + failCount : '') +
            (okCount && okCount < total ? '（失败的可手动删除或重试）' : ''));
          progress3.set(100, casCountText('清理完成 ' + okCount + '/' + total));
          if (onFinish) onFinish();
          return;
        }
        var f = scannedCasFiles[i++];
        progress3.set((i - 1) / total * 100, '清理 .cas ' + i + '/' + total + ' · ' + f.name);
        deleteCloudFile(f.id, f.name, cas3FamilyId, cas3SrcParentId).then(function (r) {
          okCount++;
          logLine('ok', '[清理 ' + i + '/' + total + '] 已删除 ' + f.name +
            (r && r.fullyCleared ? '（已彻底清空）' : '（已移入回收站）'));
        }).catch(function (e) {
          failCount++;
          logLine('err', '[清理 ' + i + '/' + total + '] ' + f.name + ' 删除失败：' +
            (e && e.message ? e.message : e));
        }).then(function () {
          return sleep(300);
        }).then(next);
      })();
    }

    // ── 扫描当前目录 .cas → 下载解析 → 累积待秒传 ──
    function startCasScan() {
      main3Busy = true;
      var ctx = { aborted: false, cancel: null };
      main3Ctx = ctx;
      refreshMain3Btn();
      progress3.reset();
      progress3.set(0, '正在解析目标目录…');
      resolveTarget().then(function (t) {
        if (main3Ctx !== ctx) return; // 已被取消
        cas3FamilyId = t.familyId;
        cas3SrcParentId = t.folderId;
        scanCasFolder(t.folderId, t.familyId, ctx);
      }).catch(function (e) {
        if (main3Ctx === ctx) {
          main3Busy = false;
          main3Ctx = null;
          refreshMain3Btn();
          progress3.set(0, '扫描失败');
          logLine('err', '目录扫描失败：' + (e && e.message ? e.message : e));
        }
      });
    }

    function scanCasFolder(folderId, familyId, ctx) {
      progress3.set(0, '扫描目录中…（ID ' + folderId + '，' + (familyId ? '家庭云' : '个人云') + '）');
      logLine('info', '正在扫描目录（ID ' + folderId + '，' + (familyId ? '家庭云' : '个人云') + '）中的 .cas / .cas.torrent 文件…');
      function finishScan(aborted, casCount, parsedCount) {
        if (main3Ctx !== ctx) return; // 已被强制收尾接管，跳过
        main3Busy = false;
        main3Ctx = null;
        if (aborted) {
          progress3.set(100, casCountText('已取消扫描'));
          logLine('muted', '扫描已取消：已解析 ' + (parsedCount || 0) + ' 个条目（已完成文件可用，剩余未扫描）');
        } else {
          progress3.set(100, casCountText('扫描完成'));
          logLine(parsedCount ? 'ok' : 'err',
            '目录扫描完成：' + casCount + ' 个 .cas/.cas.torrent → 可用 ' + parsedCount + ' 个条目' +
            (parsedCount ? '，点"开始秒传"执行' : '，无可转存条目') +
            (delCasChk.checked ? '（已开启"成功后删除 .cas/.cas.torrent"）' : ''));
        }
        refreshMain3Btn();
      }
      listFolderAll(folderId, familyId).then(function (r) {
        var casFiles = r.files.filter(function (f) {
          // v1.18.4：同时识别 .cas 与 .cas.torrent（旧版 /\.cas$/ 匹配不到 .cas.torrent）
          return /\.cas(\.torrent)?$/i.test(f.name) && f.size > 0 && f.size < 10 * 1024 * 1024; // 种子文件应小于 10MB
        });
        scannedCasFiles = casFiles.slice();
        if (!casFiles.length) {
          progress3.set(0, '未找到 .cas / .cas.torrent 文件（目录共 ' + r.files.length + ' 个文件）');
          logLine('err', '当前目录没有找到 .cas / .cas.torrent 文件（共 ' + r.files.length + ' 个文件）');
          if (main3Ctx === ctx) {
            main3Busy = false;
            main3Ctx = null;
            refreshMain3Btn();
          }
          return;
        }
        logLine('ok', '找到 ' + casFiles.length + ' 个 .cas / .cas.torrent 文件，开始下载并解析…');
        var i = 0;
        var parsedCount = 0;
        (function next() {
          if (ctx.aborted) { finishScan(true, casFiles.length, parsedCount); return; }
          if (i >= casFiles.length) { finishScan(false, casFiles.length, parsedCount); return; }
          var f = casFiles[i++];
          progress3.set((i - 1) / casFiles.length * 100,
            '下载解析 ' + i + '/' + casFiles.length + ' · ' + f.name);
          logLine('info', '[' + i + '/' + casFiles.length + '] 下载解析 ' + f.name + '（' + fmtSize(f.size) + '）…');
          getDownloadUrl(f.id, familyId).then(function (durl) {
            // v1.18.4：responseType 改 arraybuffer——.cas.torrent 是 bencode 二进制，
            // 旧版 'text' 通道会把 ≥0x80 的字节按 UTF-8 解码成替换字符（不可逆），
            // 且 new Uint8Array(字符串) 逐字符 ToNumber 产生全 0 垃圾字节，torrent 必然解析失败。
            return gmXhr({
              method: 'GET', url: durl, timeout: 120000, responseType: 'arraybuffer',
              onAbortRegister: function (abortFn) { ctx.cancel = abortFn; }
            }).catch(function (e) {
              if (e && e.aborted) throw e;
              if (typeof window.fetch !== 'function') throw e;
              // GM 网络层失败兜底：CDN 直链无自定义头，页面 fetch 多可直接拉取
              return window.fetch(durl, { credentials: 'omit' }).then(function (r) {
                return r.arrayBuffer().then(function (buf) {
                  return { status: r.status, response: buf };
                });
              }).catch(function (fe) {
                throw new Error('下载 .cas 失败（GM 与页面通道均不通：' +
                  ((fe && fe.message) || (e && e.message) || '网络错误') + '）');
              });
            });
          }).then(function (res) {
            if (ctx.aborted) return null; // 已取消：丢弃当前文件结果
            if (res.status !== 200) throw new Error('HTTP ' + res.status);
            // 统一规整为原始字节（与本地 readCasFile 路径对齐），文本由字节派生
            var u8 = null;
            if (res.response && res.response.byteLength != null) {
              u8 = new Uint8Array(res.response); // ArrayBuffer / TypedArray
            } else if (typeof res.response === 'string') {
              u8 = textToBytes(res.response); // 个别 GM 实现仍回文本：按 UTF-8 逆向还原
            } else if (res.responseText) {
              u8 = textToBytes(res.responseText);
            }
            if (!u8 || !u8.length) throw new Error('下载内容为空');
            var parsed = parseCasContent(u8, bytesToText(u8));
            var added = appendCasResult(parsed, f.name);
            parsedCount += added;
            return sleep(200);
          }).catch(function (e) {
            if (e && e.aborted) { if (!ctx.aborted) ctx.aborted = true; return null; } // 中止请求：置位并透传到收尾，不重试
            if (ctx.aborted) return null;
            // v1.18.6：只记录错误，不再在此调用 next()——旧版 catch 内 next() 与
            // 随后 .then 内 next() 双重推进，一次失败会裂出两条并发扫描链：
            // 日志/进度错乱、汇总计数不准，首个链先到终点时另一链还在后台跑。
            // 推进统一交给后面的 .then，保证任何结果都恰好前进一步。
            logLine('err', '  ' + f.name + ' 解析失败：' + (e && e.message ? e.message : e));
          }).then(function (r2) {
            if (r2 !== null || ctx.aborted) { next(); }
          });
        })();
      }).catch(function (e) {
        if (main3Ctx !== ctx) return; // 已被强制收尾接管，跳过
        main3Busy = false;
        main3Ctx = null;
        refreshMain3Btn();
        progress3.set(0, '扫描失败');
        logLine('err', '目录扫描失败：' + (e && e.message ? e.message : e));
      });
    }

    btnFillCodes.addEventListener('click', function () {
      if (!parsedCasItems.length) {
        logLine('muted', '暂无解析结果可填入');
        return;
      }
      taCodes.value = parsedCasItems.map(function (item) {
        return JSON.stringify({
          name: item.name, dirPath: item.dirPath || '', size: item.size,
          md5: item.md5, sliceMd5: item.sliceMd5
        });
      }).join('\n');
      switchTab(1);
      logLine('ok', '已把 ' + parsedCasItems.length + ' 条秒传码填入“秒传码入库”');
    });

    progress3.set(0, '尚未解析');

    // ── Tab4：云盘生成 .cas ──
    var exportNav = [];   // [{id, name, familyId}] 目录导航栈
    var exportRows = [];  // 当前渲染的文件行数据（含 checked 标记）
    var lastFollowDir = ''; // ③扫描跟随：上次扫描的目录 ID（变化才重扫）
    var casOutputs = [];  // 生成结果 [{filename, json}]
    var exportFamilyId = ''; // 云盘目录扫描时的空间（家庭云 ID 或空）

    function updateNavLabel() {
      var top = exportNav.length ? exportNav[exportNav.length - 1] : null;
      // 目录 ID 直接加在"云盘目录"红字后的括号里
      secCloudTitle.textContent = '云盘目录' + (top ? '（' + top.id + '）' : '') +
        (exportFamilyId ? ' · 家庭云' : '');
    }

    function renderExportList(files, folders) {
      exportRows = files;
      exportList.textContent = '';
      if (!folders.length && !files.length) {
        exportList.appendChild(el('div', 'muted', '（目录为空）'));
        return;
      }
      folders.forEach(function (f) {
        var row = el('div', 'row dir');
        row.appendChild(el('span', 'nm', '[目录] ' + f.name));
        row.appendChild(el('span', 'sz', ''));
        row.title = '点击进入：' + f.name;
        row.addEventListener('click', function () {
          if (scanFollowChk && scanFollowChk.checked) {
            // ③开启：目录导航完全跟随页面，列表内不再手动进入子目录（否则没有"返回上级"可退）
            logLine('muted', '已开启③“扫描随云盘当前目录”：请直接在云盘页面切换目录，脚本会自动跟随重扫');
            return;
          }
          exportNav.push({ id: f.id, name: f.name });
          loadExportList(f.id);
        });
        exportList.appendChild(row);
      });
      files.forEach(function (file, idx) {
        var row = el('div', 'row');
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'c189-chk';
        var usable = isValidMd5(file.md5) && file.size > 0;
        cb.checked = usable;
        cb.disabled = !usable;
        row.appendChild(cb);
        row.appendChild(el('span', 'nm', file.name));
        if (file.size > cassSliceSize(file.size)) {
          row.appendChild(el('span', 'c189-badge', '大文件·需下载计算'));
        }
        row.appendChild(el('span', 'sz', fmtSize(file.size)));
        row.title = usable ? ('md5: ' + file.md5) : '列表未返回有效 MD5，无法导出';
        cb.addEventListener('change', function () { exportRows[idx].checked = cb.checked; });
        exportRows[idx].checked = cb.checked;
        exportList.appendChild(row);
      });
    }

    function loadExportList(folderId) {
      updateNavLabel();
      exportRows = []; // 旧目录勾选立即作废：加载间隙不可拿旧数据点“生成 .cas”
      refreshGenCasBtn();
      exportList.textContent = '';
      exportList.appendChild(el('div', 'muted', '正在读取目录…'));
      listFolderAll(folderId, exportFamilyId).then(function (r) {
        renderExportList(r.files, r.folders);
        refreshGenCasBtn(); // 列表刷新后同步生成按钮状态
        logLine('ok', '目录读取完成：' + r.folders.length + ' 个子目录，' + r.files.length + ' 个文件');
      }).catch(function (e) {
        exportList.textContent = '';
        exportList.appendChild(el('div', 'err', '读取失败：' + (e && e.message ? e.message : e)));
      });
    }

    // ── Dock2 云盘节：扫描/生成/输出 ──
    /** 页面当前正在浏览的目录（不依赖①上传跟随开关，专给③扫描跟随用） */
    function currentBrowseTarget() {
      if (isFamilySpace()) {
        return getFamilyRootFolderId().then(function (rootId) {
          return { folderId: autoDetect.lastId || rootId, familyId: familyIdCache };
        });
      }
      return Promise.resolve({ folderId: detectFolderId() || ROOT_FOLDER_ID, familyId: '' });
    }
    /** 扫描云盘目录：forceFollow=true 强制扫页面当前目录（③开启时），否则按①逻辑 */
    function startCloudScan(forceFollow) {
      return (forceFollow ? currentBrowseTarget() : resolveTarget()).then(function (t) {
        exportFamilyId = t.familyId;
        exportNav = [{ id: t.folderId, name: t.familyId ? '家庭云' : '根目录' }];
        casOutputs = [];
        lastFollowDir = String(t.folderId);
        loadExportList(t.folderId);
      });
    }
    /** ③扫描跟随开关：开启时禁用手动“扫描当前目录 / 返回上级”（导航完全跟页面走） */
    function applyFollowScanState() {
      var on = !!scanFollowChk.checked;
      btnScan.disabled = on;
      btnUpDir.disabled = on;
      btnScan.title = on ? '已开启③“扫描随云盘当前目录”：自动跟随页面目录，无需手动扫描' : '';
      btnUpDir.title = on ? '已开启③“扫描随云盘当前目录”：目录跟随页面导航，不可手动返回' : '';
    }
    btnScan.addEventListener('click', function () { startCloudScan(false); });
    applyFollowScanState();

    btnUpDir.addEventListener('click', function () {
      if (exportNav.length > 1) {
        exportNav.pop();
        loadExportList(exportNav[exportNav.length - 1].id);
      } else {
        logLine('muted', '已在最上层目录');
      }
    });

    btnSelAll.addEventListener('click', function () {
      var boxes = exportList.querySelectorAll('input[type=checkbox]:not(:disabled)');
      var allOn = Array.prototype.every.call(boxes, function (b) { return b.checked; });
      Array.prototype.forEach.call(boxes, function (b) {
        b.checked = !allOn;
        b.dispatchEvent(new Event('change', { bubbles: true })); // 必须冒泡，exportList 委托监听才能收到
      });
      refreshGenCasBtn(); // 双保险：同步“生成 .cas”按钮三态（修复全选后按钮不刷新）
    });

    /* ② 生成按钮三态：
       ① 任务进行中 → "■ 停止并清空"（中止后续分片，已算哈希的文件不产出 .cas，整体清空）
       ② 有勾选文件 → "② 生成 .cas"
       ③ 无勾选但有结果 → "清空 .cas" */
    var genCasRunning = false;
    var genCasCtx = null; // { aborted, cancel }

    function refreshGenCasBtn() {
      if (genCasRunning) {
        btnGenCas.textContent = '■ 停止并清空';
        btnGenCas.disabled = false;
      } else {
        var anyChecked = exportRows.some(function (r) { return r.checked; });
        if (anyChecked) {
          btnGenCas.textContent = '② 生成 .cas';
          btnGenCas.disabled = false;
        } else if (casOutputs.length || taCasOut.value) {
          btnGenCas.textContent = '清空 .cas';
          btnGenCas.disabled = false;
        } else {
          btnGenCas.textContent = '② 生成 .cas';
          btnGenCas.disabled = true;
        }
      }
    }
    exportList.addEventListener('change', function (e) {
      if (e.target && e.target.type === 'checkbox') refreshGenCasBtn();
    });
    refreshGenCasBtn();

    function clearCasOutputs(logged) {
      casOutputs = [];
      taCasOut.value = '';
      progress2.reset();
      btnDlCas.disabled = true;
      btnUpCas.disabled = true;
      if (logged) logLine('muted', '已清空生成的 .cas 内容');
      refreshGenCasBtn();
    }

    btnGenCas.addEventListener('click', function () {
      if (genCasRunning) { // 状态①：停止并清空（中断当前分片下载，立即生效）
        if (genCasCtx) {
          genCasCtx.aborted = true;
          if (genCasCtx.cancel) genCasCtx.cancel();
        }
        btnGenCas.textContent = '停止中…';
        btnGenCas.disabled = true;
        logLine('muted', '已请求停止：中断当前分片下载并清空本次生成');
        // 兜底：4 秒后链条仍未收尾则强制恢复（防任何环节卡住）
        var stopCtx = genCasCtx;
        setTimeout(function () {
          if (genCasRunning && genCasCtx === stopCtx) {
            genCasRunning = false;
            genCasCtx = null;
            clearCasOutputs(false);
            progress2.set(0, '已停止并清空');
            logLine('muted', '任务已强制停止并清空');
            refreshGenCasBtn();
          }
        }, 4000);
        return;
      }
      var selected = exportRows.filter(function (r) { return r.checked; });
      if (!selected.length) { // 状态③：清空 .cas
        if (casOutputs.length || taCasOut.value) clearCasOutputs(true);
        else logLine('err', '请先扫描目录并勾选要生成 .cas 的文件');
        return;
      }
      // 状态②：开始生成
      genCasRunning = true;
      var ctx = { aborted: false, cancel: null };
      genCasCtx = ctx;
      btnDlCas.disabled = true;
      btnUpCas.disabled = true;
      casOutputs = [];
      outputMode = '';
      refreshGenCasBtn();
      var entries = [];
      var failCount = 0;
      var i = 0;
      var earlyStopped = ''; // v1.19.1：登录过期等原因提前结束（已完成的照常产出）
      progress2.reset();
      progress2.set(0, '准备生成…');
      function finish() {
        if (genCasCtx !== ctx) return; // 已被强制收尾接管，跳过
        genCasRunning = false;
        genCasCtx = null;
        if (ctx.aborted) {
          clearCasOutputs(false); // 停止即清空：不产出半成品
          progress2.set(0, '已停止并清空');
          logLine('muted', '已停止生成本次 .cas（已完成 ' + entries.length + '/' + selected.length + ' 个文件的哈希被丢弃）');
        } else {
          buildCasOutputsFromEntries(entries, failCount, selected.length,
            earlyStopped ? (earlyStopped + '，提前结束') : undefined);
        }
        refreshGenCasBtn();
      }
      (function next() {
        if (ctx.aborted || earlyStopped || i >= selected.length) { finish(); return; }
        var f = selected[i++];
        var sliceSize = cassSliceSize(f.size);
        var basePct = (i - 1) / selected.length * 100;
        logLine('info', '[' + i + '/' + selected.length + '] 处理 ' + f.name + '（' + fmtSize(f.size) + '）' +
          (f.size > sliceSize ? '：需远程下载计算分片哈希' : ''));
        progress2.set(basePct, i + '/' + selected.length + ' · ' + f.name);
        hashRemoteFile(f, function (cur, total) {
          var inner = total ? cur / total : 1;
          progress2.set(basePct + inner * (100 / selected.length),
            i + '/' + selected.length + ' · ' + f.name + ' 分片 ' + cur + '/' + total);
        }, function () { return ctx.aborted; }, function (abortFn) {
          ctx.cancel = abortFn; // 注册"中断当前分片下载"回调
        }, exportFamilyId).then(function (r) {
          entries.push({
            name: f.name, size: f.size, md5: f.md5, sliceMd5: r.sliceMd5,
            parts: r.parts, sliceSize: sliceSize, create_time: f.lastOpTime || ''
          });
          return sleep(100);
        }, function (e) {
          if (e && e.aborted) {
            logLine('muted', f.name + '：已按停止请求中止');
          } else if (looksAuthError(e)) {
            // v1.19.1：登录已失效——继续跑每个文件都会失败，提前结束并保留已完成的产出
            failCount++;
            earlyStopped = '登录已过期';
            logLine('err', f.name + ' 处理失败：' + (e && e.message ? e.message : e) +
              '；检测到登录已失效，提前结束本次生成（已完成 ' + entries.length +
              ' 个，.cas 照常产出），请刷新网页重新登录后再勾选剩余文件继续');
          } else {
            failCount++;
            // v1.19.1：下载类失败附可能原因提示（如文件仍在上传中/云端不完整）
            var et = String((e && e.message) || '');
            var hint = /HTTP [45]|下载|Range|长度不符|空响应/.test(et) ?
              '（该文件可能仍在上传/更新中或云端数据不完整，可稍后重试）' : '';
            logLine('err', f.name + ' 处理失败：' + (e && e.message ? e.message : e) + hint);
          }
        }).then(next);
      })();
    });

    function safeFileBase(name) {
      return String(name || 'file').replace(/\.(cas|torrent)$/i, '').replace(/[\\/:*?"<>|]/g, '_');
    }

    function casFileNameOf(entries) {
      if (entries.length === 1) return safeFileBase(entries[0].name) + '.cas';
      var ts = new Date();
      function pad(x) { return x < 10 ? '0' + x : '' + x; }
      return 'cas_export_' + entries.length + 'files_' +
        ts.getFullYear() + pad(ts.getMonth() + 1) + pad(ts.getDate()) + '-' + pad(ts.getHours()) + pad(ts.getMinutes()) + '.cas';
    }

    /** 由已算好哈希的 entries 组装 .cas 输出（本地上传转存 / 云盘目录两路共用） */
    function buildCasOutputsFromEntries(entries, failCount, totalSelected, doneLabel) {
      casOutputs = [];
      if (entries.length) {
        if (mergeChk.checked || entries.length === 1) {
          // 合并模式（或仅一个文件）：一个 .cas
          casOutputs.push({ filename: casFileNameOf(entries), json: JSON.stringify(buildCasPayload(entries)) });
        } else {
          // 每文件单独一个 .cas
          entries.forEach(function (e) {
            casOutputs.push({ filename: safeFileBase(e.name) + '.cas', json: JSON.stringify(buildCasPayload([e])) });
          });
        }
      }
      taCasOut.value = casOutputs.length === 1 ? casOutputs[0].json
        : '已生成 ' + casOutputs.length + ' 个 .cas 载荷（' + entries.length + ' 个文件，' + failCount + ' 个失败）';
      outputMode = 'cas';
      btnDlCas.disabled = false;
      btnUpCas.disabled = false;
      progress2.set(100, (doneLabel || '完成') + '：' + entries.length + '/' + totalSelected +
        (failCount ? '，' + failCount + ' 个失败' : ''));
      logLine('ok', '已生成 ' + casOutputs.length + ' 个 .cas 载荷（' + entries.length + ' 个文件' +
        (failCount ? '，' + failCount + ' 个失败' : '') + '），可下载 / 上传到云盘 / 复制内容');
      refreshGenCasBtn();
    }

    // ── Dock2 本地：上传到云盘并生成 .cas（与生成秒传码共用同一个文件口） ──
    /* 上传按钮三态：
       ① 任务进行中 → "■ 停止上传"（中断当前分片请求，已完成文件的 .cas 照常生成）
       ② 已选文件   → "上传到云盘并生成 .cas"
       ③ 无文件但有结果 → "清空结果"（清空生成结果与输出框） */
    var upGenRunning = false;
    var upGenCtx = null; // { aborted, cancel }

    function refreshUpGenBtn() {
      if (upGenRunning) {
        btnUploadGen.textContent = '■ 停止上传';
        btnUploadGen.disabled = false;
      } else if ((fileInput.files || []).length) {
        btnUploadGen.textContent = '上传到云盘并生成 .cas';
        btnUploadGen.disabled = false;
      } else if (casOutputs.length || taCasOut.value) {
        btnUploadGen.textContent = '清空结果';
        btnUploadGen.disabled = false;
      } else {
        btnUploadGen.textContent = '上传到云盘并生成 .cas';
        btnUploadGen.disabled = true;
      }
    }
    fileInput.addEventListener('change', function () {
      refreshUpGenBtn();
      refreshGenCodesBtn();
    });
    refreshUpGenBtn();
    refreshGenCodesBtn();

    btnUploadGen.addEventListener('click', function () {
      if (upGenRunning) { // 状态①：停止（中断进行中的请求，立即生效）
        if (upGenCtx) {
          upGenCtx.aborted = true;
          if (upGenCtx.cancel) upGenCtx.cancel();
        }
        btnUploadGen.textContent = '停止中…';
        btnUploadGen.disabled = true;
        logLine('muted', '已请求停止：中断当前分片并终止任务');
        // 兑底：4 秒后仍未收尾则强制恢复
        var stopCtx = upGenCtx;
        setTimeout(function () {
          if (upGenRunning && upGenCtx === stopCtx) {
            upGenRunning = false;
            upGenCtx = null;
            progress2.set(0, '已停止');
            logLine('muted', '上传任务已强制停止');
            refreshUpGenBtn();
            refreshGenCodesBtn();
          }
        }, 4000);
        return;
      }
      var files = Array.prototype.slice.call(fileInput.files || []);
      if (!files.length) { // 状态③：清空结果
        if (casOutputs.length || taCasOut.value) {
          casOutputs = [];
          outputMode = '';
          taCasOut.value = '';
          progress2.reset();
          btnDlCas.disabled = true;
          btnUpCas.disabled = true;
          logLine('muted', '已清空生成结果（输出框与 .cas 载荷）');
          refreshUpGenBtn();
        } else {
          logLine('err', '请先选择本地文件');
        }
        return;
      }
      // 状态②：开始上传
      upGenRunning = true;
      var ctx = { aborted: false, cancel: null };
      upGenCtx = ctx;
      btnDlCas.disabled = true;
      btnUpCas.disabled = true;
      progress2.reset();
      progress2.set(0, '正在解析目标目录…');
      refreshUpGenBtn();
      resolveTarget().then(function (t) {
        if (upGenCtx !== ctx) return; // 已被停止
        var folderId = t.folderId;
        var familyId = t.familyId;
        var entries = [];
        var failCount = 0;
        var i = 0;
      function finish(aborted) {
        if (upGenCtx !== ctx) { // 已被强制收尾接管：仍产出已完成的 .cas
          if (entries.length && aborted) buildCasOutputsFromEntries(entries, failCount, files.length, '已停止');
          return;
        }
        upGenRunning = false;
        upGenCtx = null;
        if (entries.length) {
          // 已完成（含被停止前完成）的文件照常组装 .cas
          buildCasOutputsFromEntries(entries, failCount, files.length, aborted ? '已停止' : '上传完成');
        } else {
          progress2.reset();
          progress2.set(0, aborted ? '已停止（无完成文件）' : '上传失败');
        }
        if (!aborted) fileInput.value = ''; // 全部跑完清空选择；停止时保留便于重试
        refreshUpGenBtn();
        refreshGenCodesBtn();
        if (entries.length) autoRefreshPageList(); // 上传成功后刷新云盘文件列表
      }
      (function next() {
        if (ctx.aborted) { finish(true); return; }
        if (i >= files.length) { finish(false); return; }
        var f = files[i++];
        var idx = i;
        logLine('info', '[' + i + '/' + files.length + '] 上传 ' + f.name + '（' + fmtSize(f.size) + '）→ 目录 ID ' + folderId +
          (familyId ? '（家庭云）' : ''));
        uploadLocalFile(f, folderId, overwriteChk.checked, function (phase, cur, total, label) {
          var basePct = (idx - 1) / files.length * 100;
          var unit = 100 / files.length;
          if (phase === 'hash') {
            progress2.set(basePct + (total ? cur / total : 1) * unit * 0.3,
              idx + '/' + files.length + ' · ' + label + ' 计算哈希 ' + cur + '/' + total);
          } else if (phase === 'commit') {
            // v1.18.5：提交阶段单独显示，网络中断时能看出卡在“正在提交”
            progress2.set(basePct + unit * 0.97,
              idx + '/' + files.length + ' · ' + label + ' ' + UP_STATE.commit);
          } else {
            progress2.set(basePct + unit * 0.3 + (total ? cur / total : 1) * unit * 0.7,
              idx + '/' + files.length + ' · ' + label + ' 上传分片 ' + cur + '/' + total);
          }
        }, function () { return ctx.aborted; }, function (abortFn) {
          ctx.cancel = abortFn; // 注册“中断当前请求”回调
        }, familyId, function (st) {
          // v1.18.5：初始化/判重/命中阶段进度条显示任务状态（上传/提交由上面的 phase 显示）
          if (st === 'init' || st === 'check' || st === 'hit') {
            progress2.set((idx - 1) / files.length * 100,
              idx + '/' + files.length + ' · ' + f.name + ' · ' + (UP_STATE[st] || st));
          }
        }).then(function (r) {
          entries.push(r.entry);
          logLine('ok', '[' + idx + '/' + files.length + '] ' + f.name + '：' + r.message);
          return sleep(200);
        }, function (e) {
          if (e && e.aborted) {
            logLine('muted', f.name + '：' + UP_STATE.cancel + '（停止于' +
              (e && e.step ? (UP_STATE[e.step] || e.step) : '当前请求') + '）');
          } else {
            failCount++;
            logLine('err', f.name + ' 上传失败' + (e && e.step ? '（' + (UP_STATE[e.step] || e.step) + '）' : '') +
              '：' + (e && e.message ? e.message : e) + errNote(e));
          }
        }).then(next);
      })();
      }); // resolveTarget().then 结束
    });

    btnDlCas.addEventListener('click', function () {
      if (!casOutputs.length) { logLine('muted', '请先生成 .cas'); return; }
      casOutputs.forEach(function (o, idx) {
        setTimeout(function () { downloadTextFile(o.filename, utf8ToBase64(o.json)); }, idx * 400);
      });
      logLine('ok', '已开始下载 ' + casOutputs.length + ' 个 .cas 文件（OpenList 参考格式：Base64 JSON）');
    });

    btnUpCas.addEventListener('click', function () {
      if (!casOutputs.length) { logLine('muted', '请先生成 .cas'); return; }
      btnUpCas.disabled = true;
      progress2.reset();
      progress2.set(0, '准备上传…');
      resolveTarget().then(function (t0) {
        // 优先用云盘目录扫描时所在的目录与空间；未扫描过则用当前目标
        var target = exportNav.length ? exportNav[exportNav.length - 1].id : t0.folderId;
        var fid = exportNav.length ? exportFamilyId : t0.familyId;
        var i = 0;
        var upOk = 0, upFail = 0; // v1.18.3：分别计数，失败不再混入"上传完成"
        (function next() {
          if (i >= casOutputs.length) {
            btnUpCas.disabled = false;
            progress2.set(100, '上传结束：成功 ' + upOk + '/' + casOutputs.length +
              (upFail ? '，失败 ' + upFail : ''));
            if (upFail) {
              logLine('err', '.cas 上传结束：成功 ' + upOk + ' 个，失败 ' + upFail + ' 个（目录 ID ' + target +
                (fid ? '，家庭云' : '') + '）；失败的文件请查看上方各条错误明细');
            } else {
              logLine('ok', '.cas 上传完成，共 ' + casOutputs.length + ' 个文件（目录 ID ' + target +
                (fid ? '，家庭云' : '') + '），可直接分享给他人');
            }
            if (upOk > 0) autoRefreshPageList(); // 上传成功后刷新云盘文件列表
            return;
          }
          var o = casOutputs[i++];
          var blob = new Blob([utf8ToBase64(o.json)], { type: 'application/octet-stream' });
          progress2.set((i - 1) / casOutputs.length * 100, '上传 ' + i + '/' + casOutputs.length + ' · ' + o.filename);
          uploadSmallFile(o.filename, blob, target, fid, function (st) {
            // v1.18.5：进度条实时显示任务状态（初始化/判重/命中/上传/提交）
            progress2.set((i - 1) / casOutputs.length * 100,
              '上传 ' + i + '/' + casOutputs.length + ' · ' + o.filename + ' · ' + (UP_STATE[st] || st));
          }).then(function (r) {
            upOk++;
            logLine('ok', '[' + i + '/' + casOutputs.length + '] ' + o.filename + '：' + r.message);
            return sleep(300);
          }).then(next).catch(function (e) {
            upFail++;
            logLine('err', '[' + i + '/' + casOutputs.length + '] ' + o.filename + ' 上传失败' +
              (e && e.step ? '（' + (UP_STATE[e.step] || e.step) + '）' : '') + '：' +
              (e && e.message ? e.message : e) + errNote(e));
            return next();
          });
        })();
      }).catch(function (e) {
        btnUpCas.disabled = false;
        logLine('err', (e && e.message ? e.message : '上传启动失败'));
      });
    });

    // 清空全部：文件选择 + 生成结果（输出框、.cas 载荷、进度）
    btnClearOutputs.addEventListener('click', function () {
      if (genCodesRunning || upGenRunning || genCasRunning) {
        logLine('err', '任务进行中，请先停止再清空');
        return;
      }
      var had = (fileInput.files && fileInput.files.length) || casOutputs.length || taCasOut.value;
      if (!had) { logLine('muted', '没有需要清空的内容'); return; }
      fileInput.value = '';
      casOutputs = [];
      outputMode = '';
      taCasOut.value = '';
      progress2.reset();
      btnDlCas.disabled = true;
      btnUpCas.disabled = true;
      refreshUpGenBtn();
      refreshGenCodesBtn();
      refreshGenCasBtn();
      logLine('muted', '已清空：文件选择与生成结果');
    });

    tab2Btn.addEventListener('click', function () {
      switchTab(2);
      // 首次进入自动扫描当前目录（③开启时跟随页面目录；按钮被禁用不能 click()）
      if (!exportRows.length && !exportNav.length) startCloudScan(scanFollowChk.checked);
    });

    // ── 状态检测 ──
    btnRefresh.addEventListener('click', function () {
      // 全量重置：会话候选池/游标/RSA/签名方案/accessToken/家庭云缓存，
      // 避免任一环的旧值把后续请求拖死（v1.15.0 前只清了 sessionKey）
      sessionKeyCache = '';
      sessionCandidates = [];
      sessionCursor = 0;
      sessionPoolTs = 0; // v1.19.1：同步重置 TTL 计时与轮换状态
      sessionPoolPrimTried = false;
      rsaCache = null;
      workingScheme = null;
      invalidateAccessToken(); // 同时清 familyIdCache / familyRootFolderId
      logLine('muted', '已重置全部会话/令牌缓存，重新检测登录状态…');
      checkSession();
    });

    logLine('muted', '脚本已加载。展开面板即可使用；秒传操作均使用你自己的登录态调用天翼云盘官方接口。');
  }

  /* ══════════════════════ 悬浮入口 & 启动 ══════════════════════ */

  function ensureEntry() {
    if (document.getElementById(PANEL_ID)) return;
    buildPanel();
    // 初始收起，只露出标题栏（保留液体玻璃效果类）
    var panel = document.getElementById(PANEL_ID);
    if (panel.className.indexOf('c189-min') < 0) panel.className = 'c189-min' +
      (panel.className.indexOf('c189-liquid') >= 0 ? ' c189-liquid' : '');
  }

  function boot() {
    if (!/cloud\.189\.cn$/.test(location.hostname)) return;
    installFolderHook(); // 越早越好：捕获页面自身的目录浏览请求
    ensureEntry();
    startSessionKeepAlive(); // v1.19.1：会话保活（每 5 分钟轻量请求，防长操作中途会话过期）
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
