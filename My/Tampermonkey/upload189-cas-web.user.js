// ==UserScript==
    // @name         天翼云盘秒传助手
    // @namespace    http://tampermonkey.net/
    // @version      1.4.0
    // @description  天翼云盘秒传助手 - 支持秒传上传、扫描CAS转存、家庭接口上传、设置页与详细日志
    // @author       liyk
    // @match        https://cloud.189.cn/*
    // @match        https://m.cloud.189.cn/*
    // @grant        GM_xmlhttpRequest
    // @grant        GM_setValue
    // @grant        GM_getValue
    // @grant        GM_notification
    // @grant        GM_registerMenuCommand
    // @grant        GM_unregisterMenuCommand
    // @grant        GM_addStyle
    // @connect      cloud.189.cn
    // @connect      api.cloud.189.cn
    // @connect      upload.cloud.189.cn
    // @connect      ctyun.cn
    // @connect      ctyunxs.cn
    // @connect      cloudcube.telecomjs.com
    // @connect      cloudcube.wuxi.cn
    // @connect      mini189.cn
    // @connect      *
    // @run-at       document-end
    // ==/UserScript==

    (function() {
        'use strict';

        // ============== 常量定义 ==============
        const WEB_URL = 'https://cloud.189.cn';
        const API_URL = 'https://api.cloud.189.cn';
        const UPLOAD_URL = 'https://upload.cloud.189.cn';
        const AppID = '8025431004';
        const UserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36';
        const STORAGE_KEYS = {
            activeTab: 'cloud189_active_tab',
            deleteCasAfterUpload: 'cloud189_delete_cas_after_upload',
            familyRequestContext: 'cloud189_family_request_context',
            renameByCasFileName: 'cloud189_rename_by_cas_filename',
            forceFamilyUpload: 'cloud189_force_family_upload'
        };

        // ============== 工具函数 ==============
        const Utils = {
            deleteLogger: null,

            setDeleteLogger(logger) {
                this.deleteLogger = typeof logger === 'function' ? logger : null;
            },

            logDelete(message, detail = '') {
                const text = detail ? `${message} ${detail}` : message;
                console.log('[删除日志]', text);
                if (this.deleteLogger) this.deleteLogger(text);
            },

            async md5(data) {
                const encoder = new TextEncoder();
                const buffer = data instanceof ArrayBuffer ? data : encoder.encode(data);
                const hashBuffer = await crypto.subtle.digest('MD5', buffer).catch(() => null);
                if (!hashBuffer) {
                    return this.sparkMD5(data);
                }
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
            },

            sparkMD5(data) {
                return this.simpleMD5(data);
            },

            simpleMD5(string) {
                function md5cycle(x, k) {
                    var a = x[0], b = x[1], c = x[2], d = x[3];
                    a = ff(a, b, c, d, k[0], 7, -680876936);d = ff(d, a, b, c, k[1], 12, -389564586);c = ff(c, d, a, b, k[2], 17, 606105819);b = ff(b, c, d, a, k[3], 22, -1044525330);
                    a = ff(a, b, c, d, k[4], 7, -176418897);d = ff(d, a, b, c, k[5], 12, 1200080426);c = ff(c, d, a, b, k[6], 17, -1473231341);b = ff(b, c, d, a, k[7], 22, -45705983);
                    a = ff(a, b, c, d, k[8], 7, 1770035416);d = ff(d, a, b, c, k[9], 12, -1958414417);c = ff(c, d, a, b, k[10], 17, -42063);b = ff(b, c, d, a, k[11], 22, -1990404162);
                    a = ff(a, b, c, d, k[12], 7, 1804603682);d = ff(d, a, b, c, k[13], 12, -40341101);c = ff(c, d, a, b, k[14], 17, -1502002290);b = ff(b, c, d, a, k[15], 22, 1236535329);
                    a = gg(a, b, c, d, k[1], 5, -165796510);d = gg(d, a, b, c, k[6], 9, -1069501632);c = gg(c, d, a, b, k[11], 14, 643717713);b = gg(b, c, d, a, k[0], 20, -373897302);
                    a = gg(a, b, c, d, k[5], 5, -701558691);d = gg(d, a, b, c, k[10], 9, 38016083);c = gg(c, d, a, b, k[15], 14, -660478335);b = gg(b, c, d, a, k[4], 20, -405537848);
                    a = gg(a, b, c, d, k[9], 5, 568446438);d = gg(d, a, b, c, k[14], 9, -1019803690);c = gg(c, d, a, b, k[3], 14, -187363961);b = gg(b, c, d, a, k[8], 20, 1163531501);
                    a = gg(a, b, c, d, k[13], 5, -1444681467);d = gg(d, a, b, c, k[2], 9, -51403784);c = gg(c, d, a, b, k[7], 14, 1735328473);b = gg(b, c, d, a, k[12], 20, -1926607734);
                    a = hh(a, b, c, d, k[5], 4, -378558);d = hh(d, a, b, c, k[8], 11, -2022574463);c = hh(c, d, a, b, k[11], 16, 1839030562);b = hh(b, c, d, a, k[14], 23, -35309556);
                    a = hh(a, b, c, d, k[1], 4, -1530992060);d = hh(d, a, b, c, k[4], 11, 1272893353);c = hh(c, d, a, b, k[7], 16, -155497632);b = hh(b, c, d, a, k[10], 23, -1094730640);
                    a = hh(a, b, c, d, k[13], 4, 681279174);d = hh(d, a, b, c, k[0], 11, -358537222);c = hh(c, d, a, b, k[3], 16, -722521979);b = hh(b, c, d, a, k[6], 23, 76029189);
                    a = hh(a, b, c, d, k[9], 4, -640364487);d = hh(d, a, b, c, k[12], 11, -421815835);c = hh(c, d, a, b, k[15], 16, 530742520);b = hh(b, c, d, a, k[2], 23, -995338651);
                    a = ii(a, b, c, d, k[0], 6, -198630844);d = ii(d, a, b, c, k[7], 10, 1126891415);c = ii(c, d, a, b, k[14], 15, -1416354905);b = ii(b, c, d, a, k[5], 21, -57434055);
                    a = ii(a, b, c, d, k[12], 6, 1700485571);d = ii(d, a, b, c, k[3], 10, -1894986606);c = ii(c, d, a, b, k[10], 15, -1051523);b = ii(b, c, d, a, k[1], 21, -2054922799);
                    a = ii(a, b, c, d, k[8], 6, 1873313359);d = ii(d, a, b, c, k[15], 10, -30611744);c = ii(c, d, a, b, k[6], 15, -1560198380);b = ii(b, c, d, a, k[13], 21, 1309151649);
                    a = ii(a, b, c, d, k[4], 6, -145523070);d = ii(d, a, b, c, k[11], 10, -1120210379);c = ii(c, d, a, b, k[2], 15, 718787259);b = ii(b, c, d, a, k[9], 21, -343485551);
                    x[0] = add32(a, x[0]);x[1] = add32(b, x[1]);x[2] = add32(c, x[2]);x[3] = add32(d, x[3]);
                }
                function cmn(q, a, b, x, s, t) { a = add32(add32(a, q), add32(x, t)); return add32((a << s) | (a >>> (32 - s)), b); }
                function ff(a, b, c, d, x, s, t) { return cmn((b & c) | ((~b) & d), a, b, x, s, t); }
                function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & (~d)), a, b, x, s, t); }
                function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
                function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | (~d)), a, b, x, s, t); }
                function md51(s) {
                    var n = s.length, state = [1732584193, -271733879, -1732584194, 271733878], i;
                    for (i = 64; i <= s.length; i += 64) { md5cycle(state, md5blk(s.substring(i - 64, i))); }
                    s = s.substring(i - 64);
                    var tail = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
                    for (i = 0; i < s.length; i++) tail[i >> 2] |= s.charCodeAt(i) << ((i % 4) << 3);
                    tail[i >> 2] |= 0x80 << ((i % 4) << 3);
                    if (i > 55) { md5cycle(state, tail); for (i = 0; i < 16; i++) tail[i] = 0; }
                    tail[14] = n * 8; md5cycle(state, tail); return state;
                }
                function md5blk(s) {
                    var md5blks = [], i;
                    for (i = 0; i < 64; i += 4) { md5blks[i >> 2] = s.charCodeAt(i) + (s.charCodeAt(i + 1) << 8) + (s.charCodeAt(i + 2) << 16) + (s.charCodeAt(i + 3) << 24); }
                    return md5blks;
                }
                var hex_chr = '0123456789abcdef'.split('');
                function rhex(n) { var s = '', j = 0; for (; j < 4; j++) s += hex_chr[(n >> (j * 8 + 4)) & 0x0F] + hex_chr[(n >> (j * 8)) & 0x0F]; return s; }
                function hex(x) { for (var i = 0; i < x.length; i++) x[i] = rhex(x[i]); return x.join(''); }
                function add32(a, b) { return (a + b) & 0xFFFFFFFF; }
                return hex(md51(string)).toUpperCase();
            },

            base64Encode(str) {
                try { return btoa(unescape(encodeURIComponent(str))); }
                catch (e) { return btoa(str); }
            },

            base64Decode(str) {
                try { return decodeURIComponent(escape(atob(str))); }
                catch (e) { return atob(str); }
            },

            randomUUID() {
                return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                    const r = Math.random() * 16 | 0;
                    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
                });
            },

            randomString(length = 16) {
                const chars = '0123456789abcdef';
                let result = '';
                for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
                return result;
            },

            timestamp() { return Date.now(); },

            // 统一 JSON 字段名
            normalizeJsonItem(jsonData) {
                return {
                    md5: jsonData.md5 || jsonData.MD5 || jsonData.fileMd5 || jsonData.file_md5 || '',
                    slice_md5: jsonData.slice_md5 || jsonData.sliceMd5 || jsonData.SliceMd5 || jsonData.SLICE_MD5 || '',
                    size: jsonData.size || jsonData.fileSize || jsonData.file_size || 0,
                    name: jsonData.name || jsonData.fileName || jsonData.file_name || jsonData.path || '',
                    cloud: jsonData.cloud || '189'
                };
            },

            getFileSuffix(name) {
                if (!name) return '';
                const cleanName = String(name).split('/').pop();
                const lastDot = cleanName.lastIndexOf('.');
                if (lastDot <= 0) return '';
                return cleanName.substring(lastDot);
            },

            mergeCasFileName(casFileName, parsedName) {
                const baseName = String(casFileName || '').replace(/\.cas$/i, '');
                const baseSuffix = this.getFileSuffix(baseName).toLowerCase();
                const parsedSuffix = this.getFileSuffix(parsedName).toLowerCase();

                if (!parsedSuffix || baseSuffix === parsedSuffix) {
                    return baseName;
                }

                return `${baseName}${parsedSuffix}`;
            },

            // ★ 解析 CAS 文件内容（Base64 编码的 JSON）
            parseCasContent(content) {
                content = content.trim();
                
                // 尝试1: 直接就是 JSON
                if (content.startsWith('{')) {
                    try {
                        const json = JSON.parse(content);
                        return this.normalizeJsonItem(json);
                    } catch (e) {}
                }
                
                // 尝试2: Base64 编码的 JSON
                try {
                    const decoded = this.base64Decode(content);
                    if (decoded.startsWith('{')) {
                        const json = JSON.parse(decoded);
                        return this.normalizeJsonItem(json);
                    }
                } catch (e) {}
                
                // 尝试3: 可能有多行，取第一行有效的
                const lines = content.split(/[\n\r]+/).filter(l => l.trim());
                for (const line of lines) {
                    try {
                        const decoded = this.base64Decode(line.trim());
                        if (decoded.startsWith('{')) {
                            const json = JSON.parse(decoded);
                            return this.normalizeJsonItem(json);
                        }
                    } catch (e) {}
                    // 也试试直接 JSON
                    try {
                        if (line.trim().startsWith('{')) {
                            const json = JSON.parse(line.trim());
                            return this.normalizeJsonItem(json);
                        }
                    } catch (e) {}
                }
                
                // 尝试4: 管道格式
                if (content.includes('|')) {
                    const parts = content.split('|');
                    if (parts.length >= 4) {
                        return {
                            md5: parts[2].toUpperCase(),
                            slice_md5: parts[3].toUpperCase(),
                            size: parseInt(parts[1]),
                            name: parts[0],
                            cloud: '189'
                        };
                    }
                }
                
                return null;
            },

            parseRapidLink(link) {
                try {
                    let data = link.trim();
                    
                    // 多行 Base64
                    if (!data.startsWith('{') && !data.startsWith('[') && !data.includes('|')) {
                        const lines = data.split(/[\n\r]+/).map(l => l.trim()).filter(l => l.length > 0);
                        
                        if (lines.length > 1) {
                            const results = [];
                            for (const line of lines) {
                                let lineData = line.startsWith('cloud189://') ? line.substring(12) : line;
                                try {
                                    const decoded = this.base64Decode(lineData);
                                    if (decoded.startsWith('{')) {
                                        const jsonData = JSON.parse(decoded);
                                        const normalized = this.normalizeJsonItem(jsonData);
                                        const parsed = this.parseJsonItem(normalized);
                                        if (parsed) results.push(parsed);
                                    } else if (decoded.includes('|')) {
                                        const parts = decoded.split('|');
                                        if (parts.length >= 4) {
                                            results.push({ fileName: parts[0], fileSize: parseInt(parts[1]), fileMd5: parts[2].toUpperCase(), sliceMd5: parts[3].toUpperCase(), dirPath: '', fullPath: parts[0] });
                                        }
                                    }
                                } catch (e) {}
                            }
                            if (results.length > 0) return results.length === 1 ? results[0] : { isArray: true, items: results };
                        }
                        
                        // 单行 Base64
                        let singleLine = data.startsWith('cloud189://') ? data.substring(12) : data;
                        try {
                            if (/^[A-Za-z0-9+/=]+$/.test(singleLine)) {
                                const decoded = this.base64Decode(singleLine);
                                if (decoded.startsWith('{')) {
                                    const json = JSON.parse(decoded);
                                    const normalized = this.normalizeJsonItem(json);
                                    return this.parseJsonItem(normalized);
                                } else if (decoded.startsWith('[')) {
                                    const arr = JSON.parse(decoded);
                                    if (Array.isArray(arr)) {
                                        const results = arr.map(item => this.parseJsonItem(this.normalizeJsonItem(item))).filter(Boolean);
                                        if (results.length > 0) return results.length === 1 ? results[0] : { isArray: true, items: results };
                                    }
                                } else if (decoded.includes('|')) {
                                    data = decoded;
                                }
                            }
                        } catch (e) {}
                    }
                    
                    // JSON 数组
                    if (data.startsWith('[') && data.endsWith(']')) {
                        try {
                            const arr = JSON.parse(data);
                            if (Array.isArray(arr)) {
                                const results = arr.map(item => this.parseJsonItem(this.normalizeJsonItem(item))).filter(Boolean);
                                if (results.length > 0) return { isArray: true, items: results };
                            }
                        } catch (e) {}
                    }
                    
                    // JSON 对象
                    if (data.startsWith('{') && data.endsWith('}')) {
                        try {
                            const json = JSON.parse(data);
                            return this.parseJsonItem(this.normalizeJsonItem(json));
                        } catch (e) {}
                    }
                    
                    // cloud189:// 前缀
                    if (data.startsWith('cloud189://')) data = data.substring(12);
                    
                    // Base64 管道格式
                    if (!data.includes('|') && /^[A-Za-z0-9+/=]+$/.test(data)) {
                        try { data = this.base64Decode(data); } catch (e) {}
                    }
                    
                    // 管道格式
                    const parts = data.split('|');
                    if (parts.length >= 4) {
                        return { fileName: parts[0], fileSize: parseInt(parts[1]), fileMd5: parts[2].toUpperCase(), sliceMd5: parts[3].toUpperCase(), dirPath: '', fullPath: parts[0] };
                    }
                    
                    return null;
                } catch (e) {
                    console.error('解析秒传链接失败:', e);
                    return null;
                }
            },

            parseJsonItem(jsonData) {
                const md5 = jsonData.md5 || jsonData.MD5 || jsonData.fileMd5 || jsonData.file_md5 || '';
                const sliceMd5 = jsonData.slice_md5 || jsonData.sliceMd5 || jsonData.SliceMd5 || jsonData.SLICE_MD5 || '';
                const size = jsonData.size || jsonData.fileSize || jsonData.file_size || 0;
                const name = jsonData.name || jsonData.fileName || jsonData.file_name || jsonData.path || '';
                const cloud = jsonData.cloud || '189';

                if (md5 && sliceMd5 && size && name) {
                    if (cloud && cloud !== '189') return null;
                    const lastSlash = name.lastIndexOf('/');
                    return {
                        fileName: lastSlash >= 0 ? name.substring(lastSlash + 1) : name,
                        fileSize: parseInt(size),
                        fileMd5: md5.toUpperCase(),
                        sliceMd5: sliceMd5.toUpperCase(),
                        dirPath: lastSlash >= 0 ? name.substring(0, lastSlash) : '',
                        fullPath: name
                    };
                }
                if (md5 && size && name && !sliceMd5) {
                    console.warn(`[秒传] 缺少 sliceMd5: ${name}`);
                }
                return null;
            },

            generateRapidLink(fileName, fileSize, fileMd5, sliceMd5) {
                return `cloud189://${this.base64Encode(`${fileName}|${fileSize}|${fileMd5}|${sliceMd5}`)}`;
            }
        };

        // ============== RSA ==============
        const RSA = {
            formatPublicKey(publicKey) {
                publicKey = publicKey.replace('-----BEGIN PUBLIC KEY-----', '').replace('-----END PUBLIC KEY-----', '').replace(/[\n\r ]/g, '').trim();
                return `-----BEGIN PUBLIC KEY-----\n${publicKey}\n-----END PUBLIC KEY-----`;
            },
            async encryptWithJSEncrypt(publicKey, data) {
                if (typeof JSEncrypt === 'undefined') await this.loadJSEncrypt();
                const jsEncrypt = new JSEncrypt();
                jsEncrypt.setPublicKey(this.formatPublicKey(publicKey));
                const encrypted = jsEncrypt.encrypt(data);
                if (!encrypted) throw new Error('RSA 加密失败');
                return encrypted;
            },
            loadJSEncrypt() {
                return new Promise((resolve, reject) => {
                    if (typeof JSEncrypt !== 'undefined') { resolve(); return; }
                    const script = document.createElement('script');
                    script.src = 'https://cdn.jsdelivr.net/npm/jsencrypt@3.3.2/bin/jsencrypt.min.js';
                    script.onload = resolve;
                    script.onerror = () => reject(new Error('加载 JSEncrypt 库失败'));
                    document.head.appendChild(script);
                });
            },
            async encrypt(publicKey, data) {
                const b64 = await this.encryptWithJSEncrypt(publicKey, data);
                return Array.from(atob(b64)).map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
            },
            async encryptBase64(publicKey, data) { return await this.encryptWithJSEncrypt(publicKey, data); }
        };

        // ============== CryptoHelper ==============
        const CryptoHelper = {
            async aesEncrypt(data, key) {
                const params = Object.entries(data).map(([k, v]) => `${k}=${v}`).join('&');
                const lib = await this.loadCryptoJS();
                return lib.AES.encrypt(lib.enc.Utf8.parse(params), lib.enc.Utf8.parse(key), { mode: lib.mode.ECB, padding: lib.pad.Pkcs7 }).ciphertext.toString().toUpperCase();
            },
            async hmacSha1(data, key) {
                const params = Object.entries(data).map(([k, v]) => `${k}=${v}`).join('&');
                const lib = await this.loadCryptoJS();
                return lib.HmacSHA1(params, key).toString().toUpperCase();
            },
            _cryptoJSPromise: null,
            async loadCryptoJS() {
                if (window.CryptoJSLoaded) return window.CryptoJSLoaded;
                if (this._cryptoJSPromise) return this._cryptoJSPromise;
                this._cryptoJSPromise = new Promise((resolve, reject) => {
                    if (typeof CryptoJS !== 'undefined' && CryptoJS.AES) { window.CryptoJSLoaded = CryptoJS; resolve(CryptoJS); return; }
                    const script = document.createElement('script');
                    script.src = 'https://cdn.jsdelivr.net/npm/crypto-js@4.2.0/crypto-js.min.js';
                    script.onload = () => { window.CryptoJSLoaded = CryptoJS; resolve(CryptoJS); };
                    script.onerror = () => reject(new Error('加载 CryptoJS 库失败'));
                    document.head.appendChild(script);
                });
                return this._cryptoJSPromise;
            }
        };

        const AES = { async encrypt(data, key) { return await CryptoHelper.aesEncrypt(data, key); } };
        const HMAC = { async sha1(data, key) { return await CryptoHelper.hmacSha1(data, key); } };

        // ============== Cloud189Client ==============
        class Cloud189Client {
            constructor() {
                this.sessionKey = null;
                this.accessToken = null;
                this.rsaKey = null;
                this.familyId = null;
                this.familyRootFolderId = null;
                this.parentFolderId = '-11';
                this.familyRequestContext = this.getStoredFamilyRequestContext();
                this.activeUploadFamilyMode = false;
            }

            getSessionKey() {
                if (window.__sessionKey) { this.sessionKey = window.__sessionKey; return this.sessionKey; }
                try {
                    const sk = sessionStorage.getItem('sessionKey');
                    if (sk) { this.sessionKey = sk; return sk; }
                    for (let i = 0; i < sessionStorage.length; i++) {
                        const key = sessionStorage.key(i);
                        if (key && key.toLowerCase().includes('sessionkey')) { const v = sessionStorage.getItem(key); if (v) { this.sessionKey = v; return v; } }
                    }
                } catch (e) {}
                try {
                    const at = localStorage.getItem('accessToken');
                    if (at) this.accessToken = at;
                    for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        const value = localStorage.getItem(key);
                        if (key && key.toLowerCase().includes('accesstoken') && value) this.accessToken = value;
                        if (value && value.includes('sessionKey')) {
                            try { const d = JSON.parse(value); if (d.sessionKey) { this.sessionKey = d.sessionKey; return d.sessionKey; } } catch (e) {}
                        }
                    }
                } catch (e) {}
                const cookies = document.cookie.split(';').map(c => c.trim());
                for (const cookie of cookies) {
                    for (const name of ['SESSION_KEY', 'sessionKey', 'SESSIONKEY', 'SSON']) {
                        if (cookie.startsWith(name + '=')) { this.sessionKey = cookie.substring(name.length + 1); return this.sessionKey; }
                    }
                }
                const scripts = document.querySelectorAll('script');
                for (const script of scripts) {
                    const content = script.textContent || script.innerHTML;
                    if (content && content.includes('sessionKey')) {
                        for (const pattern of [/sessionKey\s*[=:]\s*["']([^"']+)["']/i, /"sessionKey"\s*:\s*"([^"]+)"/i]) {
                            const match = content.match(pattern);
                            if (match && match[1]) { this.sessionKey = match[1]; return this.sessionKey; }
                        }
                    }
                }
                try {
                    const urlSk = new URLSearchParams(window.location.search).get('sessionKey');
                    if (urlSk) { this.sessionKey = urlSk; return urlSk; }
                } catch (e) {}
                try { if (window.top && window.top !== window && window.top.__sessionKey) { this.sessionKey = window.top.__sessionKey; return this.sessionKey; } } catch (e) {}
                return null;
            }

            getCurrentFolderId(useFamilyPath = false) {
                if (useFamilyPath && this.isFamilySpace()) {
                    const pathname = window.location.pathname || '';
                    if (pathname.includes('/web/family/file/folder/home')) {
                        this.parentFolderId = '';
                        return '';
                    }
                    let match = pathname.match(/\/web\/family\/file\/folder\/([^\/\?]+)/);
                    if (match) {
                        const folderId = match[1] === 'home' ? '' : match[1];
                        this.parentFolderId = folderId;
                        return folderId;
                    }
                }
                const pathname = window.location.pathname;
                let match = pathname.match(/\/folder\/([^\/\?]+)/);
                if (match) { this.parentFolderId = match[1]; return match[1]; }
                match = window.location.hash.match(/folder[\/=]([^&\/]+)/);
                if (match) { this.parentFolderId = match[1]; return match[1]; }
                const fp = new URLSearchParams(window.location.search);
                const fid = fp.get('folderId') || fp.get('currentFolderId');
                if (fid) { this.parentFolderId = fid; return fid; }
                return this.parentFolderId;
            }

            isFamilySpace() {
                return String(window.location.pathname || '').includes('/web/family');
            }

            shouldUseFamilyUpload(forceFamilyUpload = false) {
                return this.isFamilySpace() || forceFamilyUpload;
            }

            getAccessToken() {
                if (this.accessToken) return this.accessToken;
                try {
                    const token = localStorage.getItem('accessToken');
                    if (token) {
                        this.accessToken = token;
                        return token;
                    }
                    for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        const value = localStorage.getItem(key);
                        if (key && key.toLowerCase().includes('accesstoken') && value) {
                            this.accessToken = value;
                            return value;
                        }
                    }
                } catch (e) {}
                return null;
            }

            getStoredFamilyRequestContext() {
                try {
                    const raw = sessionStorage.getItem(STORAGE_KEYS.familyRequestContext) || localStorage.getItem(STORAGE_KEYS.familyRequestContext);
                    return raw ? JSON.parse(raw) : null;
                } catch (e) {
                    return null;
                }
            }

            buildFamilySignature(url, accessToken = '', extraParams = null) {
                if (!url || !accessToken) return null;
                try {
                    const parsedUrl = new URL(url, API_URL);
                    const signEntries = Array.from(parsedUrl.searchParams.entries());
                    if (extraParams && typeof extraParams === 'object') {
                        for (const [key, value] of Object.entries(extraParams)) {
                            signEntries.push([key, value == null ? '' : String(value)]);
                        }
                    }
                    signEntries.sort((a, b) => a[0].localeCompare(b[0]));
                    const timestamp = Utils.timestamp().toString();
                    const signItems = [`AccessToken=${accessToken}`, `Timestamp=${timestamp}`];
                    for (const [key, value] of signEntries) signItems.push(`${key}=${value}`);
                    return {
                        timestamp,
                        signature: Utils.simpleMD5(signItems.join('&')).toLowerCase(),
                        signText: signItems.join('&')
                    };
                } catch (e) {
                    return null;
                }
            }

            buildFamilyHeaders(url = '', extraParams = null) {
                this.familyRequestContext = this.getStoredFamilyRequestContext() || this.familyRequestContext;
                const headers = {
                    'Accept': 'application/json;charset=UTF-8',
                    'Sign-Type': '1',
                    'User-Agent': UserAgent
                };
                const accessToken = this.getAccessToken();
                if (accessToken) headers.AccessToken = accessToken;
                if (this.familyRequestContext?.browserId) headers['Browser-Id'] = this.familyRequestContext.browserId;
                const signatureInfo = this.buildFamilySignature(url, accessToken, extraParams);
                if (signatureInfo) {
                    headers.Signature = signatureInfo.signature;
                    headers.Timestamp = signatureInfo.timestamp;
                }
                return headers;
            }

            async familyFetchJson(url) {
                const headers = this.buildFamilyHeaders(url);
                const responseText = await new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: 'GET',
                        url,
                        headers,
                        onload: r => {
                            if (r.status >= 200 && r.status < 300) resolve(r.responseText);
                            else reject(new Error(`HTTP ${r.status}`));
                        },
                        onerror: () => reject(new Error('家庭接口请求失败'))
                    });
                });
                return JSON.parse(responseText);
            }

            async getCurrentFamilyId() {
                if (this.familyId) return this.familyId;
                const accessToken = this.getAccessToken();
                if (!accessToken) return null;
                const result = await this.familyFetchJson(`${API_URL}/open/family/manage/getFamilyList.action`);
                const familyList = result.familyInfoResp || [];
                const currentFamily = familyList.find(item => item.useFlag === 1) || familyList[0];
                this.familyId = currentFamily?.familyId ? String(currentFamily.familyId) : null;
                return this.familyId;
            }

            async saveFamilyFileToPersonal(fileId, targetFolderId = '-11', fileName = '') {
                return await this.copyFamilyFileToPersonal(fileId, fileName, targetFolderId);
            }

            async createFamilyBatchTask(type, taskInfos, targetFolderId = '', extraParams = {}) {
                const familyId = await this.getCurrentFamilyId();
                if (!familyId) throw new Error('无法获取 familyId');

                const requestUrl = `${API_URL}/open/batch/createBatchTask.action`;
                const requestParams = {
                    type,
                    taskInfos: JSON.stringify(taskInfos),
                    targetFolderId: targetFolderId == null ? '' : String(targetFolderId),
                    familyId: String(familyId),
                    ...Object.fromEntries(Object.entries(extraParams).map(([key, value]) => [key, value == null ? '' : String(value)]))
                };
                const requestHeaders = {
                    ...this.buildFamilyHeaders(requestUrl, requestParams),
                    'Content-Type': 'application/x-www-form-urlencoded'
                };
                const postData = Object.entries(requestParams)
                    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
                    .join('&');

                Utils.logDelete(`[家庭批量任务:${type}] 请求地址:`, requestUrl);
                Utils.logDelete(`[家庭批量任务:${type}] 请求头:`, JSON.stringify(requestHeaders));
                Utils.logDelete(`[家庭批量任务:${type}] 请求体:`, postData);

                const responseText = await new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: 'POST',
                        url: requestUrl,
                        headers: requestHeaders,
                        data: postData,
                        onload: r => resolve(typeof r.responseText === 'string' ? r.responseText : ''),
                        onerror: () => reject(new Error(`${type} 任务创建失败`))
                    });
                });
                Utils.logDelete(`[家庭批量任务:${type}] 原始响应:`, responseText || '<empty>');

                const result = responseText.trim() ? JSON.parse(responseText) : {};
                if ((result.res_code != null && result.res_code !== 0) || result.errorCode) {
                    throw new Error(result.errorMsg || result.res_message || `${type} 任务创建失败`);
                }
                return result;
            }

            async checkFamilyBatchTask(type, taskId) {
                const requestUrl = `${API_URL}/open/batch/checkBatchTask.action`;
                const requestParams = { type, taskId: String(taskId) };
                const requestHeaders = {
                    ...this.buildFamilyHeaders(requestUrl, requestParams),
                    'Content-Type': 'application/x-www-form-urlencoded'
                };
                const postData = Object.entries(requestParams)
                    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
                    .join('&');

                const responseText = await new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: 'POST',
                        url: requestUrl,
                        headers: requestHeaders,
                        data: postData,
                        onload: r => resolve(typeof r.responseText === 'string' ? r.responseText : ''),
                        onerror: () => reject(new Error(`${type} 任务状态查询失败`))
                    });
                });
                Utils.logDelete(`[家庭批量任务:${type}] 状态响应:`, responseText || '<empty>');

                const result = responseText.trim() ? JSON.parse(responseText) : {};
                if ((result.res_code != null && result.res_code !== 0) || result.errorCode) {
                    throw new Error(result.errorMsg || result.res_message || `${type} 任务状态查询失败`);
                }
                return result;
            }

            extractBatchTaskId(result) {
                return result?.taskId || result?.data?.taskId || result?.taskID || result?.data?.taskID || '';
            }

            extractBatchTaskStatus(result) {
                const raw = result?.taskStatus ?? result?.data?.taskStatus ?? result?.taskInfo?.taskStatus ?? result?.batchTask?.taskStatus;
                return raw == null ? null : Number(raw);
            }

            async waitFamilyBatchTask(type, taskId, timeoutMs = 30000) {
                const startedAt = Date.now();
                while (Date.now() - startedAt < timeoutMs) {
                    const result = await this.checkFamilyBatchTask(type, taskId);
                    const status = this.extractBatchTaskStatus(result);
                    const successedCount = Number(result?.successedCount ?? result?.data?.successedCount ?? 0);
                    const failedCount = Number(result?.failedCount ?? result?.data?.failedCount ?? 0);
                    const skipCount = Number(result?.skipCount ?? result?.data?.skipCount ?? 0);
                    const subTaskCount = Number(result?.subTaskCount ?? result?.data?.subTaskCount ?? 0);

                    if (status === 4) return result;
                    if (subTaskCount > 0 && successedCount + failedCount + skipCount >= subTaskCount) {
                        if (failedCount > 0) throw new Error(`${type} 任务失败，失败数量: ${failedCount}`);
                        return result;
                    }
                    if (status === 2) throw new Error('目标目录存在同名文件，请先处理重名后重试');
                    if (status != null && status < 0) throw new Error(`${type} 任务失败`);
                    if (status != null && ![0, 1, 3, 4].includes(status)) {
                        throw new Error(`${type} 任务失败，状态码: ${status}`);
                    }
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
                throw new Error(`${type} 任务等待超时`);
            }

            async copyFamilyFileToPersonal(fileId, fileName = '', targetFolderId = '-11') {
                if (!fileId) throw new Error('缺少家庭文件ID');
                const taskInfos = [{
                    fileId: String(fileId),
                    fileName: fileName || '',
                    isFolder: 0
                }];
                const createResult = await this.createFamilyBatchTask('COPY', taskInfos, targetFolderId || '-11', {
                    groupId: 'null',
                    copyType: '2',
                    shareId: 'null'
                });
                const taskId = this.extractBatchTaskId(createResult);
                if (!taskId) throw new Error('未获取到 COPY 任务ID');
                return await this.waitFamilyBatchTask('COPY', taskId);
            }

            async deleteFamilyFilePermanently(fileId, fileName = '', srcParentId = '') {
                const taskInfos = [{
                    fileId: String(fileId),
                    fileName: fileName || '',
                    isFolder: 0,
                    srcParentId: String(srcParentId ?? '')
                }];

                const deleteResult = await this.createFamilyBatchTask('DELETE', taskInfos, '', {});
                const deleteTaskId = this.extractBatchTaskId(deleteResult);
                if (!deleteTaskId) throw new Error('未获取到 DELETE 任务ID');
                await this.waitFamilyBatchTask('DELETE', deleteTaskId);

                const clearResult = await this.createFamilyBatchTask('CLEAR_RECYCLE', taskInfos, '', {});
                const clearTaskId = this.extractBatchTaskId(clearResult);
                if (!clearTaskId) throw new Error('未获取到 CLEAR_RECYCLE 任务ID');
                await this.waitFamilyBatchTask('CLEAR_RECYCLE', clearTaskId);
            }

            async getFamilyRootFolderId() {
                if (this.familyRootFolderId) return this.familyRootFolderId;
                const familyId = await this.getCurrentFamilyId();
                if (!familyId) return '';
                try {
                    const result = await this.familyFetchJson(`${API_URL}/open/family/file/listFiles.action?familyId=${encodeURIComponent(familyId)}&folderId=&needPath=true`);
                    const pathItems = Array.isArray(result.path) ? result.path : [];
                    const familyRoot = [...pathItems].reverse().find(item => item && item.fileId && item.fileName === '家庭云')
                        || [...pathItems].reverse().find(item => item && item.fileId && item.fileId !== '-11' && item.fileId !== '-16');
                    this.familyRootFolderId = familyRoot?.fileId ? String(familyRoot.fileId) : '';
                    return this.familyRootFolderId;
                } catch (e) {
                    return '';
                }
            }

            async checkLogin() { return true; }

            async fetchSessionKey() {
                try {
                    const sk = sessionStorage.getItem('sessionKey');
                    if (sk) { this.sessionKey = sk; return sk; }
                    const resp = await fetch(`${WEB_URL}/api/portal/getUserSizeInfo.action`, { method: 'GET', credentials: 'include' });
                    const skh = resp.headers.get('SessionKey') || resp.headers.get('sessionkey');
                    if (skh) { this.sessionKey = skh; return skh; }
                    return null;
                } catch (e) { return null; }
            }

            parseXmlResponse(xmlString) {
                const result = {};
                const doc = new DOMParser().parseFromString(xmlString, 'text/xml');
                const ec = doc.querySelector('errorCode');
                if (ec) { result.errorCode = ec.textContent; const em = doc.querySelector('errorMsg'); if (em) result.errorMsg = em.textContent; return result; }
                for (const name of ['pubKey', 'pkId', 'expire', 'ver']) {
                    const el = doc.querySelector(name) || doc.querySelector(`keyPair > ${name}`);
                    if (el) result[name] = name === 'expire' ? parseInt(el.textContent) : el.textContent;
                }
                return result;
            }

            async generateRsaKey() {
                if (this.rsaKey && this.rsaKey.expire > Date.now()) return this.rsaKey;
                let sk = this.getSessionKey();
                if (!sk) sk = await this.fetchSessionKey();
                if (!sk) throw new Error('无法获取 SessionKey');
                const ts = Utils.timestamp().toString();
                const signParams = { AppKey: '600100422', Timestamp: ts };
                const paramStr = Object.entries(signParams).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => `${k}=${v}`).join('&');
                const signature = Utils.simpleMD5(paramStr);
                const responseText = await new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: 'GET', url: `${WEB_URL}/api/security/generateRsaKey.action?sessionKey=${encodeURIComponent(sk)}`,
                        headers: { 'Sign-Type': '1', 'Signature': signature, 'Timestamp': ts, 'AppKey': '600100422', 'SessionKey': sk, 'User-Agent': UserAgent, 'Accept': 'application/json' },
                        onload: r => resolve(r.responseText), onerror: e => reject(new Error('请求失败'))
                    });
                });
                let result = responseText.trim().startsWith('{') ? JSON.parse(responseText) : this.parseXmlResponse(responseText);
                if (result.errorCode) throw new Error(result.errorCode === 'InvalidSessionKey' ? '登录已过期' : result.errorMsg || result.errorCode);
                if (!result.pubKey) throw new Error('RSA 密钥无效');
                this.rsaKey = { pubKey: result.pubKey, pkId: result.pkId, expire: result.expire || (Date.now() + 300000), ver: result.ver };
                return this.rsaKey;
            }

            gmFetch(url, options = {}) {
                return new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: options.method || 'GET', url, headers: options.headers || {}, data: options.body,
                        onload: r => resolve({ ok: r.status >= 200 && r.status < 300, status: r.status, text: () => Promise.resolve(r.responseText), json: () => Promise.resolve(JSON.parse(r.responseText)) }),
                        onerror: e => reject(new Error('请求失败'))
                    });
                });
            }

            async buildUploadRequest(params, requestUri, method = 'GET') {
                const rsaKey = await this.generateRsaKey();
                const sk = this.getSessionKey();
                const uuid = Utils.randomString(16);
                const ts = Utils.timestamp().toString();
                const encryptedParams = await AES.encrypt(params, uuid);
                const encryptionText = await RSA.encryptBase64(rsaKey.pubKey, uuid);
                const signature = await HMAC.sha1({ SessionKey: sk, Operate: method, RequestURI: requestUri, Date: ts, params: encryptedParams }, uuid);
                return {
                    url: `${UPLOAD_URL}${requestUri}?params=${encryptedParams}`,
                    headers: { 'X-Request-Date': ts, 'X-Request-ID': Utils.randomUUID(), 'SessionKey': sk, 'EncryptionText': encryptionText, 'PkId': rsaKey.pkId, 'Signature': signature, 'User-Agent': UserAgent }
                };
            }

            partSize(fileSize) {
                const D = 10485760;
                if (fileSize > D * 2 * 999) return Math.max(Math.ceil(fileSize / 1999 / D), 5) * D;
                if (fileSize > D * 999) return D * 2;
                return D;
            }

            async initMultiUpload(parentFolderId, fileName, fileSize, sliceSize, fileMd5, sliceMd5) {
                const params = { parentFolderId, fileName: encodeURIComponent(fileName), fileSize, sliceSize };
                if (this.activeUploadFamilyMode) {
                    const familyId = await this.getCurrentFamilyId();
                    if (familyId) params.familyId = familyId;
                }
                if (fileMd5 && sliceMd5) { params.fileMd5 = fileMd5; params.sliceMd5 = sliceMd5; } else { params.lazyCheck = '1'; }
                const uri = this.activeUploadFamilyMode ? '/family/initMultiUpload' : '/person/initMultiUpload';
                const { url, headers } = await this.buildUploadRequest(params, uri);
                return await (await this.gmFetch(url, { headers })).json();
            }

            async checkTransSecond(fileMd5, sliceMd5, uploadFileId) {
                const uri = this.activeUploadFamilyMode ? '/family/checkTransSecond' : '/person/checkTransSecond';
                const { url, headers } = await this.buildUploadRequest({ fileMd5, sliceMd5, uploadFileId }, uri);
                return await (await this.gmFetch(url, { headers })).json();
            }

            async commitMultiUpload(uploadFileId, fileMd5, sliceMd5) {
                const uri = this.activeUploadFamilyMode ? '/family/commitMultiUploadFile' : '/person/commitMultiUploadFile';
                const { url, headers } = await this.buildUploadRequest({ uploadFileId, fileMd5, sliceMd5, lazyCheck: 1, opertype: '3' }, uri);
                return await (await this.gmFetch(url, { headers })).json();
            }

            async createFolder(parentFolderId, folderName) {
                const responseText = await new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: 'POST', url: `${WEB_URL}/api/open/file/createFolder.action`,
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json;charset=UTF-8', 'Sign-Type': '1', 'User-Agent': UserAgent },
                        data: `parentFolderId=${parentFolderId}&folderName=${encodeURIComponent(folderName)}`,
                        onload: r => resolve(r.responseText), onerror: e => reject(new Error('创建文件夹失败'))
                    });
                });
                const result = responseText.trim().startsWith('{') ? JSON.parse(responseText) : this.parseXmlResponse(responseText);
                if (result.res_code === 0) return result.id;
                if (result.res_message?.includes('已存在')) return await this.getFolderIdByName(parentFolderId, folderName);
                if (result.id || result.folderId) return result.id || result.folderId;
                return await this.getFolderIdByName(parentFolderId, folderName);
            }

            async getFolderIdByName(parentFolderId, folderName) {
                try {
                    const responseText = await new Promise((resolve, reject) => {
                        GM_xmlhttpRequest({
                            method: 'GET', url: `${WEB_URL}/api/open/file/listFiles.action?folderId=${parentFolderId}&mediaType=0&orderBy=lastOpTime&descending=true&pageNum=1&pageSize=60`,
                            headers: { 'Accept': 'application/json;charset=UTF-8', 'Sign-Type': '1', 'User-Agent': UserAgent },
                            onload: r => resolve(r.responseText), onerror: e => reject(e)
                        });
                    });
                    const result = JSON.parse(responseText);
                    for (const item of (result.fileListAO?.folderList || [])) {
                        if (item.name === folderName) return item.id;
                    }
                    return null;
                } catch (e) { return null; }
            }

            async createPersonalBatchTask(type, taskInfos, targetFolderId = '', extraParams = {}) {
                const requestUrl = `${WEB_URL}/api/open/batch/createBatchTask.action?noCache=${Math.random()}`;
                const requestParams = {
                    type,
                    taskInfos: JSON.stringify(taskInfos),
                    targetFolderId: targetFolderId == null ? '' : String(targetFolderId),
                    ...Object.fromEntries(Object.entries(extraParams).map(([key, value]) => [key, value == null ? '' : String(value)]))
                };
                const requestHeaders = {
                    'Accept': 'application/json;charset=UTF-8',
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Sign-Type': '1',
                    'User-Agent': UserAgent
                };
                const postData = Object.entries(requestParams)
                    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
                    .join('&');

                Utils.logDelete(`[个人批量任务:${type}] 请求地址:`, requestUrl);
                Utils.logDelete(`[个人批量任务:${type}] 请求头:`, JSON.stringify(requestHeaders));
                Utils.logDelete(`[个人批量任务:${type}] 请求体:`, postData);

                const responseText = await new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: 'POST',
                        url: requestUrl,
                        headers: requestHeaders,
                        data: postData,
                        onload: r => resolve(typeof r.responseText === 'string' ? r.responseText : ''),
                        onerror: () => reject(new Error(`${type} 任务创建失败`))
                    });
                });
                Utils.logDelete(`[个人批量任务:${type}] 原始响应:`, responseText || '<empty>');

                const result = responseText.trim() ? JSON.parse(responseText) : {};
                if ((result.res_code != null && result.res_code !== 0) || result.errorCode) {
                    throw new Error(result.errorMsg || result.res_message || `${type} 任务创建失败`);
                }
                return result;
            }

            async checkPersonalBatchTask(type, taskId) {
                const requestUrl = `${WEB_URL}/api/open/batch/checkBatchTask.action?noCache=${Math.random()}`;
                const requestHeaders = {
                    'Accept': 'application/json;charset=UTF-8',
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Sign-Type': '1',
                    'User-Agent': UserAgent
                };
                const postData = `type=${encodeURIComponent(type)}&taskId=${encodeURIComponent(String(taskId))}`;

                const responseText = await new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: 'POST',
                        url: requestUrl,
                        headers: requestHeaders,
                        data: postData,
                        onload: r => resolve(typeof r.responseText === 'string' ? r.responseText : ''),
                        onerror: () => reject(new Error(`${type} 任务状态查询失败`))
                    });
                });
                Utils.logDelete(`[个人批量任务:${type}] 状态响应:`, responseText || '<empty>');

                const result = responseText.trim() ? JSON.parse(responseText) : {};
                if ((result.res_code != null && result.res_code !== 0) || result.errorCode) {
                    throw new Error(result.errorMsg || result.res_message || `${type} 任务状态查询失败`);
                }
                return result;
            }

            async waitPersonalBatchTask(type, taskId, timeoutMs = 30000) {
                const startedAt = Date.now();
                while (Date.now() - startedAt < timeoutMs) {
                    const result = await this.checkPersonalBatchTask(type, taskId);
                    const status = this.extractBatchTaskStatus(result);
                    const successedCount = Number(result?.successedCount ?? result?.data?.successedCount ?? 0);
                    const failedCount = Number(result?.failedCount ?? result?.data?.failedCount ?? 0);
                    const skipCount = Number(result?.skipCount ?? result?.data?.skipCount ?? 0);
                    const subTaskCount = Number(result?.subTaskCount ?? result?.data?.subTaskCount ?? 0);

                    if (status === 4) return result;
                    if (subTaskCount > 0 && successedCount + failedCount + skipCount >= subTaskCount) {
                        if (failedCount > 0) throw new Error(`${type} 任务失败，失败数量: ${failedCount}`);
                        return result;
                    }
                    if (status === 2) throw new Error('目标目录存在同名文件，请先处理重名后重试');
                    if (status != null && status < 0) throw new Error(`${type} 任务失败`);
                    if (status != null && ![0, 1, 3, 4].includes(status)) {
                        throw new Error(`${type} 任务失败，状态码: ${status}`);
                    }
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
                throw new Error(`${type} 任务等待超时`);
            }

            async deletePersonalFilePermanently(fileId, fileName = '') {
                const taskInfos = [{
                    fileId: String(fileId),
                    fileName: fileName || '',
                    isFolder: 0
                }];

                const deleteResult = await this.createPersonalBatchTask('DELETE', taskInfos, '', {});
                const deleteTaskId = this.extractBatchTaskId(deleteResult);
                if (!deleteTaskId) throw new Error('未获取到 DELETE 任务ID');
                await this.waitPersonalBatchTask('DELETE', deleteTaskId);

                const clearResult = await this.createPersonalBatchTask('CLEAR_RECYCLE', taskInfos, '', {});
                const clearTaskId = this.extractBatchTaskId(clearResult);
                if (!clearTaskId) throw new Error('未获取到 CLEAR_RECYCLE 任务ID');
                await this.waitPersonalBatchTask('CLEAR_RECYCLE', clearTaskId);
            }

            async deleteFile(fileId, fileName = '', options = {}) {
                if (this.isFamilySpace() || options.forceFamilySpace) {
                    const familyId = await this.getCurrentFamilyId();
                    if (!familyId) throw new Error('无法获取 familyId');

                    const srcParentId = options.srcParentId || this.getCurrentFolderId(true) || await this.getFamilyRootFolderId();
                    Utils.logDelete('[家庭删除] 开始删除:', `${fileName || fileId} (srcParentId=${srcParentId})`);
                    await this.deleteFamilyFilePermanently(fileId, fileName, srcParentId);
                    Utils.logDelete('[家庭删除] 删除成功:', `${fileName || fileId}`);
                    return { success: true };
                }

                Utils.logDelete('[个人删除] 开始删除:', `${fileName || fileId}`);
                await this.deletePersonalFilePermanently(fileId, fileName);
                Utils.logDelete('[个人删除] 删除成功:', `${fileName || fileId}`);
                return { success: true };
            }

            // ★★★ 获取文件下载链接 ★★★
            async getFileDownloadUrl(fileId) {
                try {
                    if (this.isFamilySpace()) {
                        const familyId = await this.getCurrentFamilyId();
                        if (!familyId) throw new Error('无法获取 familyId');
                        const result = await this.familyFetchJson(`${API_URL}/open/family/file/getFileDownloadUrl.action?fileId=${encodeURIComponent(fileId)}&familyId=${encodeURIComponent(familyId)}&type=1`);
                        return result.fileDownloadUrl ? result.fileDownloadUrl.replace(/&amp;/g, '&') : null;
                    }
                    const responseText = await new Promise((resolve, reject) => {
                        GM_xmlhttpRequest({
                            method: 'GET',
                            url: `${WEB_URL}/api/open/file/getFileDownloadUrl.action?fileId=${fileId}`,
                            headers: { 'Accept': 'application/json;charset=UTF-8', 'Sign-Type': '1', 'User-Agent': UserAgent },
                            onload: r => resolve(r.responseText),
                            onerror: e => reject(new Error('获取下载链接失败'))
                        });
                    });
                    const result = JSON.parse(responseText);
                    return result.fileDownloadUrl || null;
                } catch (e) {
                    console.error('[下载链接] 失败:', e);
                    return null;
                }
            }

            // ★★★ 下载文件内容（用于读取 CAS 小文件）★★★
            async downloadFileContent(fileId) {
                const downloadUrl = await this.getFileDownloadUrl(fileId);
                if (!downloadUrl) throw new Error('无法获取下载链接');
                
                return new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: 'GET',
                        url: downloadUrl,
                        headers: { 'User-Agent': UserAgent },
                        onload: function(response) {
                            resolve(response.responseText);
                        },
                        onerror: function(error) {
                            reject(new Error('下载文件失败'));
                        }
                    });
                });
            }

            // ★★★ 扫描 CAS 文件并解析秒传信息 ★★★
            async scanCasFiles(folderId, onProgress = null, renameByCasFileName = true) {
                const results = [];
                const familyId = this.isFamilySpace() ? await this.getCurrentFamilyId() : null;
                const effectiveFolderId = familyId && !folderId ? await this.getFamilyRootFolderId() : folderId;
                
                const fetchPage = async (pageNum = 1) => {
                    if (familyId) {
                        return await this.familyFetchJson(`${API_URL}/open/family/file/listFiles.action?pageSize=60&pageNum=${pageNum}&mediaType=0&familyId=${encodeURIComponent(familyId)}&folderId=${encodeURIComponent(effectiveFolderId || '')}&iconOption=5&orderBy=3&descending=true`);
                    }
                    const responseText = await new Promise((resolve, reject) => {
                        GM_xmlhttpRequest({
                            method: 'GET',
                            url: `${WEB_URL}/api/open/file/listFiles.action?folderId=${effectiveFolderId}&mediaType=0&orderBy=lastOpTime&descending=true&pageNum=${pageNum}&pageSize=60`,
                            headers: { 'Accept': 'application/json;charset=UTF-8', 'Sign-Type': '1', 'User-Agent': UserAgent },
                            onload: r => resolve(r.responseText),
                            onerror: e => reject(new Error('获取文件列表失败'))
                        });
                    });
                    return JSON.parse(responseText);
                };
                
                let result = await fetchPage(1);
                const fileListAO = result.fileListAO || {};
                let allFiles = [...(fileListAO.fileList || [])];
                const totalCount = fileListAO.count || 0;
                
                // 翻页
                if (totalCount > 60) {
                    for (let p = 2; p <= Math.ceil(totalCount / 60); p++) {
                        const pr = await fetchPage(p);
                        allFiles.push(...(pr.fileListAO?.fileList || []));
                    }
                }
                
                // 筛选 .cas 文件
                const casFiles = allFiles.filter(f => f.name && f.name.toLowerCase().endsWith('.cas'));
                
                if (casFiles.length === 0) {
                    throw new Error('当前目录没有找到 .cas 文件');
                }
                
                if (onProgress) onProgress('info', `找到 ${casFiles.length} 个 CAS 文件，开始解析...`, 0, casFiles.length);
                
                for (let i = 0; i < casFiles.length; i++) {
                    const casFile = casFiles[i];
                    if (onProgress) onProgress('downloading', casFile.name, i + 1, casFiles.length);
                    
                    try {
                        // 下载 CAS 文件内容
                        const content = await this.downloadFileContent(casFile.id);
                        
                        // 解析内容
                        const parsed = Utils.parseCasContent(content);
                        
                        if (parsed && parsed.md5 && parsed.slice_md5) {
                            const realFileName = renameByCasFileName
                                ? Utils.mergeCasFileName(casFile.name, parsed.name)
                                : parsed.name;
                            
                            results.push({
                                md5: parsed.md5.toUpperCase(),
                                slice_md5: parsed.slice_md5.toUpperCase(),
                                size: parseInt(parsed.size),
                                name: realFileName,
                                cloud: '189',
                                _casFile: casFile.name,
                                _casFileId: casFile.id
                            });
                        } else {
                            console.warn(`[CAS] ${casFile.name} 解析失败或缺少关键字段:`, parsed);
                            results.push({
                                _error: true,
                                _casFile: casFile.name,
                                _reason: parsed ? '缺少 md5 或 slice_md5' : '无法解析内容',
                                _rawContent: content.substring(0, 200)
                            });
                        }
                    } catch (e) {
                        console.error(`[CAS] ${casFile.name} 下载失败:`, e);
                        results.push({
                            _error: true,
                            _casFile: casFile.name,
                            _reason: e.message
                        });
                    }
                    
                    // 延迟避免请求过快
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
                
                return results;
            }

            async ensureFolderPath(dirPath, rootFolderId = '-11') {
                if (!dirPath || dirPath.trim() === '') return rootFolderId;
                let currentFolderId = rootFolderId;
                for (const folderName of dirPath.split('/').filter(p => p.trim())) {
                    let fid = await this.getFolderIdByName(currentFolderId, folderName);
                    if (!fid) fid = await this.createFolder(currentFolderId, folderName);
                    if (!fid) throw new Error(`无法创建文件夹: ${folderName}`);
                    currentFolderId = fid;
                }
                return currentFolderId;
            }

            async rapidUpload(fileName, fileSize, fileMd5, sliceMd5, parentFolderId = null, dirPath = '', options = {}) {
                try {
                    const forceFamilyUpload = !!options.forceFamilyUpload && !this.isFamilySpace();
                    const useFamilyUpload = this.shouldUseFamilyUpload(forceFamilyUpload);
                    let uploadFolderId = parentFolderId;
                    let targetFolderId = parentFolderId;

                    if (forceFamilyUpload) {
                        let personalBaseFolderId = parentFolderId;
                        if (!personalBaseFolderId && !this.isFamilySpace()) {
                            personalBaseFolderId = this.getCurrentFolderId(false) || '-11';
                        }
                        if (!personalBaseFolderId && this.isFamilySpace()) {
                            throw new Error('当前在家庭云页面时，请填写个人目标文件夹ID');
                        }
                        if (dirPath && dirPath.trim()) {
                            personalBaseFolderId = await this.ensureFolderPath(dirPath, personalBaseFolderId);
                        }
                        targetFolderId = personalBaseFolderId || '-11';
                        if (this.isFamilySpace()) {
                            uploadFolderId = this.getCurrentFolderId(true) || await this.getFamilyRootFolderId();
                        } else {
                            uploadFolderId = await this.getFamilyRootFolderId();
                        }
                    } else {
                        let baseFolderId = parentFolderId;
                        if (!baseFolderId) {
                            if (useFamilyUpload) {
                                if (this.isFamilySpace()) {
                                    const currentFamilyFolderId = this.getCurrentFolderId(true);
                                    baseFolderId = currentFamilyFolderId || await this.getFamilyRootFolderId();
                                } else {
                                    baseFolderId = await this.getFamilyRootFolderId();
                                }
                            } else {
                                baseFolderId = this.getCurrentFolderId(false);
                            }
                        }
                        if (dirPath && dirPath.trim()) baseFolderId = await this.ensureFolderPath(dirPath, baseFolderId);
                        uploadFolderId = baseFolderId;
                        targetFolderId = baseFolderId;
                    }

                    const sliceSize = this.partSize(fileSize);
                    this.activeUploadFamilyMode = useFamilyUpload;
                    Utils.logDelete('[上传] 接口模式:', forceFamilyUpload ? '家庭接口(转个人)' : (useFamilyUpload ? '家庭接口' : '个人接口'));
                    Utils.logDelete('[上传] 上传目录ID:', String(uploadFolderId ?? ''));
                    Utils.logDelete('[上传] 最终目标目录ID:', String(targetFolderId ?? ''));
                    const initResult = await this.initMultiUpload(uploadFolderId, fileName, fileSize, sliceSize, sliceMd5 = sliceMd5);
                    if (initResult.errorCode) throw new Error(initResult.errorCode === 'InvalidSessionKey' ? '登录已过期' : initResult.errorMsg || initResult.errorCode);
                    if (initResult.code !== 'SUCCESS') throw new Error(initResult.msg || '初始化失败');
                    const uploadFileId = initResult.data.uploadFileId;
                    const checkResult = await this.checkTransSecond(fileMd5, sliceMd5, uploadFileId);
                    if (checkResult.errorCode) throw new Error(checkResult.errorMsg || checkResult.errorCode);
                    if (!checkResult.data?.fileDataExists) throw new Error('文件不存在于云端，无法秒传');
                    const commitResult = await this.commitMultiUpload(uploadFileId, fileMd5, sliceMd5);
                    if (commitResult.errorCode) throw new Error(commitResult.errorMsg || commitResult.errorCode);
                    if (commitResult.code !== 'SUCCESS') throw new Error(commitResult.msg || '提交失败');
                    const uploadedFileId = commitResult.file?.userFileId || commitResult.file?.fileId || commitResult.data?.fileId || null;
                    if (forceFamilyUpload && uploadedFileId) {
                        await this.copyFamilyFileToPersonal(uploadedFileId, fileName, targetFolderId || '-11');
                        try {
                            await this.deleteFile(uploadedFileId, fileName, { forceFamilySpace: true, srcParentId: uploadFolderId });
                        } catch (deleteError) {
                            Utils.logDelete('[上传] 家庭源文件删除失败:', deleteError.message || String(deleteError));
                        }
                        return { success: true, userFileId: uploadedFileId, message: '秒传成功，已转存到个人空间' };
                    }
                    return { success: true, userFileId: uploadedFileId, message: useFamilyUpload && !this.isFamilySpace() ? '秒传成功，已转存到个人空间' : '秒传成功' };
                } catch (error) {
                    return { success: false, message: error.message };
                } finally {
                    this.activeUploadFamilyMode = false;
                }
            }

            // ★★★ 获取文件列表（用于导出） ★★★
            async getAllFilesRecursive(folderId, basePath = '', onProgress = null) {
                const allFiles = [];
                const fetchPage = async (pageNum) => {
                    const responseText = await new Promise((resolve, reject) => {
                        GM_xmlhttpRequest({
                            method: 'GET', url: `${WEB_URL}/api/open/file/listFiles.action?folderId=${folderId}&mediaType=0&orderBy=lastOpTime&descending=true&pageNum=${pageNum}&pageSize=60`,
                            headers: { 'Accept': 'application/json;charset=UTF-8', 'Sign-Type': '1', 'User-Agent': UserAgent },
                            onload: r => resolve(r.responseText), onerror: e => reject(e)
                        });
                    });
                    const result = JSON.parse(responseText);
                    if (result.res_code !== 0) throw new Error(result.res_message || '获取文件列表失败');
                    return result;
                };
                let result = await fetchPage(1);
                const fileListAO = result.fileListAO || {};
                const files = fileListAO.fileList || [];
                const folders = fileListAO.folderList || [];
                for (const file of files) {
                    const fullPath = basePath ? `${basePath}/${file.name}` : file.name;
                    allFiles.push({ md5: file.md5 || '', slice_md5: file.sliceMd5 || file.slice_md5 || '', size: file.size || 0, name: fullPath, cloud: '189' });
                    if (onProgress) onProgress('file', fullPath, allFiles.length);
                }
                for (const folder of folders) {
                    const folderPath = basePath ? `${basePath}/${folder.name}` : folder.name;
                    if (onProgress) onProgress('folder', folderPath, allFiles.length);
                    allFiles.push(...(await this.getAllFilesRecursive(folder.id, folderPath, onProgress)));
                }
                return allFiles;
            }
        }

        // ============== UI ==============
        const UI = {
            addStyles() {
                GM_addStyle(`
                    .cloud189-rapid-panel { position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.3);z-index:999999;min-width:500px;max-width:640px;max-height:85vh;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;display:flex;flex-direction:column; }
                    .cloud189-rapid-panel-header { display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #eee;background:linear-gradient(135deg,#667eea,#764ba2);border-radius:12px 12px 0 0;color:#fff; }
                    .cloud189-rapid-panel-title { font-size:18px;font-weight:600; }
                    .cloud189-rapid-panel-close { width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,.2);border:none;color:#fff;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center; }
                    .cloud189-rapid-panel-close:hover { background:rgba(255,255,255,.3); }
                    .cloud189-rapid-panel-body { padding:20px; overflow-y:auto; }
                    .cloud189-rapid-tabs { display:flex;margin-bottom:20px;border-bottom:2px solid #eee;flex-wrap:wrap; }
                    .cloud189-rapid-tab { padding:10px 16px;cursor:pointer;border:none;background:none;font-size:13px;color:#666;border-bottom:2px solid transparent;margin-bottom:-2px;transition:all .2s; }
                    .cloud189-rapid-tab.active { color:#667eea;border-bottom-color:#667eea;font-weight:600; }
                    .cloud189-rapid-tab:hover:not(.active) { color:#333; }
                    .cloud189-rapid-content { display:none; }
                    .cloud189-rapid-content.active { display:block; }
                    .cloud189-rapid-form-group { margin-bottom:16px; }
                    .cloud189-rapid-label { display:block;margin-bottom:6px;font-size:13px;color:#666;font-weight:500; }
                    .cloud189-rapid-input { width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:6px;font-size:14px;box-sizing:border-box; }
                    .cloud189-rapid-input:focus { outline:none;border-color:#667eea; }
                    .cloud189-rapid-textarea { width:100%;min-height:120px;padding:10px 12px;border:1px solid #ddd;border-radius:6px;font-size:13px;resize:vertical;font-family:monospace;box-sizing:border-box; }
                    .cloud189-rapid-textarea:focus { outline:none;border-color:#667eea; }
                    #detail-log-box { min-height:180px;border-color:#cfd8dc;background:#fafcff; }
                    .cloud189-rapid-btn { width:100%;padding:12px;border:none;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;transition:all .2s; }
                    .cloud189-rapid-btn-primary { background:linear-gradient(135deg,#667eea,#764ba2);color:#fff; }
                    .cloud189-rapid-btn-secondary { background:#f5f7fb;color:#334155;border:1px solid #dbe3f0; }
                    .cloud189-rapid-btn-secondary:hover { background:#eaf0fb; }
                    .cloud189-rapid-btn-primary:hover { opacity:.9;transform:translateY(-1px); }
                    .cloud189-rapid-btn-primary:disabled { opacity:.6;cursor:not-allowed;transform:none; }
                    .cloud189-rapid-btn-success { background:linear-gradient(135deg,#43a047,#2e7d32);color:#fff;margin-top:10px; }
                    .cloud189-rapid-btn-success:hover { opacity:.9; }
                    .cloud189-rapid-btn-success:disabled { opacity:.6;cursor:not-allowed; }
                    .cloud189-rapid-result { margin-top:16px;padding:12px;border-radius:6px;font-size:13px; }
                    .cloud189-rapid-result-success { background:#e8f5e9;color:#2e7d32;border:1px solid #c8e6c9; }
                    .cloud189-rapid-result-error { background:#ffebee;color:#c62828;border:1px solid #ffcdd2; }
                    .cloud189-rapid-info { background:#f5f5f5;padding:12px;border-radius:6px;font-size:12px;color:#666;margin-bottom:16px; }
                    .cloud189-rapid-info code { background:#e0e0e0;padding:2px 6px;border-radius:3px;font-family:monospace; }
                    .cloud189-rapid-overlay { position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.5);z-index:999998; }
                    .cloud189-rapid-loading { display:inline-block;width:16px;height:16px;border:2px solid #fff;border-radius:50%;border-top-color:transparent;animation:spin .8s linear infinite;margin-right:8px;vertical-align:middle; }
                    @keyframes spin { to { transform:rotate(360deg); } }
                    .cloud189-rapid-float-btn { position:fixed;right:20px;bottom:80px;width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;border:none;box-shadow:0 4px 12px rgba(102,126,234,.4);cursor:pointer;z-index:99999;display:flex;align-items:center;justify-content:center;font-size:24px;transition:transform .2s,box-shadow .2s; }
                    .cloud189-rapid-float-btn:hover { transform:scale(1.1);box-shadow:0 6px 16px rgba(102,126,234,.5); }
                    .cloud189-rapid-toast { position:fixed;top:20px;right:20px;background:#323232;color:#fff;padding:12px 20px;border-radius:6px;z-index:9999999;animation:slideIn .3s ease; }
                    @keyframes slideIn { from { transform:translateX(100%);opacity:0; } to { transform:translateX(0);opacity:1; } }
                `);
            },

            showToast(message, duration = 3000) {
                const toast = document.createElement('div');
                toast.className = 'cloud189-rapid-toast';
                toast.textContent = message;
                document.body.appendChild(toast);
                setTimeout(() => toast.remove(), duration);
            },

            showPanel() {
                try {
                    document.querySelectorAll('.cloud189-rapid-panel,.cloud189-rapid-overlay').forEach(el => el.remove());
                    if (!document.body) { alert('页面未加载完成'); return; }

                    const overlay = document.createElement('div');
                    overlay.className = 'cloud189-rapid-overlay';
                    document.body.appendChild(overlay);

                    const client = new Cloud189Client();
                    const panel = document.createElement('div');
                    panel.className = 'cloud189-rapid-panel';
                    const activeTab = GM_getValue(STORAGE_KEYS.activeTab, 'parse');
                    const deleteCasAfterUpload = GM_getValue(STORAGE_KEYS.deleteCasAfterUpload, false);
                    const renameByCasFileName = GM_getValue(STORAGE_KEYS.renameByCasFileName, true);
                    const forceFamilyUpload = GM_getValue(STORAGE_KEYS.forceFamilyUpload, false);
                    panel.innerHTML = `
                    <div class="cloud189-rapid-panel-header">
                        <span class="cloud189-rapid-panel-title">🚀 天翼云盘秒传助手 v1.4.0</span>
                        <button class="cloud189-rapid-panel-close">×</button>
                    </div>
                    <div class="cloud189-rapid-panel-body">
                        <div id="login-status" style="padding:10px;margin-bottom:16px;border-radius:6px;font-size:13px;background:#e3f2fd;color:#1565c0;border:1px solid #bbdefb;">检测中...</div>
                        <div class="cloud189-rapid-tabs">
                            <button class="cloud189-rapid-tab ${activeTab === 'parse' ? 'active' : ''}" data-tab="parse">📤 秒传上传</button>
                            <button class="cloud189-rapid-tab ${activeTab === 'cas' ? 'active' : ''}" data-tab="cas">📂 扫描CAS转存</button>
                            <button class="cloud189-rapid-tab ${activeTab === 'settings' ? 'active' : ''}" data-tab="settings">⚙ 设置</button>
                        </div>

                        <!-- 秒传上传 -->
                        <div class="cloud189-rapid-content ${activeTab === 'parse' ? 'active' : ''}" data-content="parse">
                            <div class="cloud189-rapid-info">
                                支持格式：<br>
                                1. <code>文件名|文件大小|MD5|sliceMD5</code><br>
                                2. <code>cloud189://base64编码</code><br>
                                3. JSON格式: <code>{"md5":"...", "slice_md5":"...", "size":123, "name":"路径/文件名.mkv", "cloud":"189"}</code><br>
                                4. JSON数组: <code>[{"md5":"...", ...}, ...]</code><br>
                                5. <code>.cas</code> 文件内容（支持直接粘贴或多选本地文件自动批量上传）<br>
                                <small>兼容 <code>sliceMd5</code> 和 <code>slice_md5</code> 两种字段名</small>
                            </div>
                            <div class="cloud189-rapid-form-group">
                                <label class="cloud189-rapid-label">秒传链接 / Base64 / JSON</label>
                                <textarea class="cloud189-rapid-textarea" id="rapid-link-input" placeholder="粘贴秒传链接、JSON、JSON数组或 .cas 内容..."></textarea>
                            </div>
                            <div class="cloud189-rapid-form-group">
                                <button class="cloud189-rapid-btn cloud189-rapid-btn-secondary" id="import-cas-btn">选择本地 .cas 文件并自动上传</button>
                                <input type="file" id="cas-file-input" accept=".cas,.txt" multiple style="display:none;">
                            </div>
                            <div class="cloud189-rapid-form-group">
                                <label class="cloud189-rapid-label">目标文件夹ID（可选）</label>
                                <input type="text" class="cloud189-rapid-input" id="target-folder-id" placeholder="-11 为根目录，留空=当前目录">
                            </div>
                            <button class="cloud189-rapid-btn cloud189-rapid-btn-primary" id="rapid-upload-btn">开始秒传</button>
                            <div id="upload-progress" style="display:none;margin-top:16px;">
                                <div style="background:#f0f0f0;border-radius:4px;height:8px;overflow:hidden;">
                                    <div id="progress-bar" style="background:linear-gradient(135deg,#667eea,#764ba2);height:100%;width:0%;transition:width .3s;"></div>
                                </div>
                                <div id="progress-text" style="text-align:center;margin-top:8px;font-size:13px;color:#666;">0/0</div>
                            </div>
                            <div class="cloud189-rapid-result" id="rapid-upload-result" style="display:none;"></div>
                        </div>

                        <!-- ★★★ 扫描 CAS 文件 ★★★ -->
                        <div class="cloud189-rapid-content ${activeTab === 'cas' ? 'active' : ''}" data-content="cas">
                            <div class="cloud189-rapid-info">
                                <b>一键流程：</b>扫描当前目录的 <code>.cas</code> 文件 → 下载并解析内容 → 提取真实视频的 md5/sliceMd5 → 批量秒传<br>
                                <small style="color:#e65100;">CAS 文件里存着真实视频的秒传信息（Base64 编码的 JSON），包含 sliceMd5</small>
                            </div>
                            <div class="cloud189-rapid-form-group">
                                <label class="cloud189-rapid-label">目标转存文件夹ID（可选，留空=当前目录）</label>
                                <input type="text" class="cloud189-rapid-input" id="cas-target-folder" placeholder="-11 为根目录">
                            </div>
                            <button class="cloud189-rapid-btn cloud189-rapid-btn-primary" id="cas-scan-btn">① 扫描 CAS 文件</button>
                            <textarea class="cloud189-rapid-textarea" id="cas-result" style="margin-top:12px;" placeholder="扫描结果会显示在这里..."></textarea>
                            <button class="cloud189-rapid-btn cloud189-rapid-btn-success" id="cas-upload-btn" disabled>② 批量秒传上面的文件</button>
                            <div id="cas-progress" style="display:none;margin-top:12px;">
                                <div style="background:#f0f0f0;border-radius:4px;height:8px;overflow:hidden;">
                                    <div id="cas-progress-bar" style="background:linear-gradient(135deg,#43a047,#2e7d32);height:100%;width:0%;transition:width .3s;"></div>
                                </div>
                                <div id="cas-progress-text" style="text-align:center;margin-top:8px;font-size:13px;color:#666;">0/0</div>
                            </div>
                            <div class="cloud189-rapid-result" id="cas-upload-result" style="display:none;"></div>
                        </div>

                        <div class="cloud189-rapid-content ${activeTab === 'settings' ? 'active' : ''}" data-content="settings">
                            <div class="cloud189-rapid-info">
                                这里统一管理开关和查看详细日志。
                            </div>
                            <div class="cloud189-rapid-form-group">
                                <label class="cloud189-rapid-label" style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                                    <input type="checkbox" id="force-family-upload" style="width:auto;" ${forceFamilyUpload ? 'checked' : ''}>
                                    始终使用家庭接口上传
                                </label>
                                <div class="cloud189-rapid-info" style="margin-top:8px;margin-bottom:0;">
                                    仅在个人云页面生效。打开后会先使用家庭接口上传，再转存到当前/指定个人目录；在家庭云页面会自动回到正常家庭上传逻辑。
                                </div>
                            </div>
                            <div class="cloud189-rapid-form-group">
                                <label class="cloud189-rapid-label" style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                                    <input type="checkbox" id="delete-cas-after-upload" style="width:auto;" ${deleteCasAfterUpload ? 'checked' : ''}>
                                    秒传成功后删除对应 .cas 文件
                                </label>
                            </div>
                            <div class="cloud189-rapid-form-group">
                                <label class="cloud189-rapid-label" style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                                    <input type="checkbox" id="rename-by-cas-filename" style="width:auto;" ${renameByCasFileName ? 'checked' : ''}>
                                    使用 .cas 文件名重命名
                                </label>
                                <div class="cloud189-rapid-info" style="margin-top:8px;margin-bottom:0;">
                                    打开后沿用当前逻辑：优先用 <code>.cas</code> 文件名合并扩展名；关闭后直接使用 Base64/JSON 里解析出的原始名称。
                                </div>
                            </div>
                            <div class="cloud189-rapid-form-group" style="margin-top:12px;">
                                <label class="cloud189-rapid-label">详细日志</label>
                                <textarea class="cloud189-rapid-textarea" id="detail-log-box" placeholder="上传、转存、删除日志会显示在这里..."></textarea>
                            </div>
                        </div>
                    </div>`;

                    document.body.appendChild(panel);
                    this.bindPanelEvents(panel, overlay, client);
                } catch (e) {
                    console.error('[秒传助手] 显示面板失败:', e);
                    alert('显示面板失败: ' + e.message);
                }
            },

            bindPanelEvents(panel, overlay, client) {
                // 登录状态
                const loginDiv = panel.querySelector('#login-status');
                const sk = client.getSessionKey();
                if (sk) {
                    loginDiv.style.background = '#e8f5e9'; loginDiv.style.color = '#2e7d32'; loginDiv.style.borderColor = '#c8e6c9';
                    loginDiv.innerHTML = `✓ 已登录 (${sk.substring(0, 8)}...)`;
                } else {
                    loginDiv.style.background = '#fff3e0'; loginDiv.style.color = '#e65100'; loginDiv.style.borderColor = '#ffe0b2';
                    loginDiv.innerHTML = '⚠ 未检测到 sessionKey，请刷新页面';
                }

                // 关闭
                const close = () => { panel.remove(); overlay.remove(); };
                panel.querySelector('.cloud189-rapid-panel-close').onclick = close;
                overlay.onclick = close;

                // Tab 切换
                panel.querySelectorAll('.cloud189-rapid-tab').forEach(tab => {
                    tab.onclick = () => {
                        panel.querySelectorAll('.cloud189-rapid-tab').forEach(t => t.classList.remove('active'));
                        tab.classList.add('active');
                        panel.querySelectorAll('.cloud189-rapid-content').forEach(c => c.classList.toggle('active', c.dataset.content === tab.dataset.tab));
                        GM_setValue(STORAGE_KEYS.activeTab, tab.dataset.tab);
                    };
                });

                // ========== 秒传上传 ==========
                const uploadBtn = panel.querySelector('#rapid-upload-btn');
                const resultDiv = panel.querySelector('#rapid-upload-result');
                const uploadProgress = panel.querySelector('#upload-progress');
                const progressBar = panel.querySelector('#progress-bar');
                const progressText = panel.querySelector('#progress-text');
                const rapidLinkInput = panel.querySelector('#rapid-link-input');
                const importCasBtn = panel.querySelector('#import-cas-btn');
                const casFileInput = panel.querySelector('#cas-file-input');
                const forceFamilyUploadCheckbox = panel.querySelector('#force-family-upload');

                if (forceFamilyUploadCheckbox) {
                    forceFamilyUploadCheckbox.onchange = () => {
                        GM_setValue(STORAGE_KEYS.forceFamilyUpload, forceFamilyUploadCheckbox.checked);
                    };
                }

                const startUpload = async () => {
                    const linkInput = panel.querySelector('#rapid-link-input').value.trim();
                    const folderId = panel.querySelector('#target-folder-id').value.trim() || null;
                    const forceFamilyUpload = forceFamilyUploadCheckbox ? forceFamilyUploadCheckbox.checked : false;
                    if (!linkInput) { this.showToast('请输入内容'); return; }
                    const parsed = Utils.parseRapidLink(linkInput);
                    if (!parsed) { this.showToast('格式无法识别'); return; }

                    if (parsed.isArray) {
                        uploadBtn.disabled = true; uploadProgress.style.display = 'block'; resultDiv.style.display = 'none';
                        const results = []; let ok = 0, fail = 0;
                        for (let i = 0; i < parsed.items.length; i++) {
                            const item = parsed.items[i];
                            progressBar.style.width = `${(i+1)/parsed.items.length*100}%`;
                            progressText.textContent = `${i+1}/${parsed.items.length} - ${item.fileName}`;
                            const r = await client.rapidUpload(item.fileName, item.fileSize, item.fileMd5, item.sliceMd5, folderId, item.dirPath || '', { forceFamilyUpload });
                            results.push({ fileName: item.fileName, ...r }); r.success ? ok++ : fail++;
                            await new Promise(resolve => setTimeout(resolve, 500));
                        }
                        uploadBtn.disabled = false; uploadBtn.textContent = '开始秒传'; uploadProgress.style.display = 'none';
                        resultDiv.style.display = 'block';
                        resultDiv.className = `cloud189-rapid-result ${ok ? 'cloud189-rapid-result-success' : 'cloud189-rapid-result-error'}`;
                        resultDiv.innerHTML = `完成！成功:${ok} 失败:${fail}<div style="margin-top:12px;max-height:200px;overflow-y:auto;">${results.map(r=>`<div style="padding:4px 0;border-bottom:1px solid #eee;font-size:12px;">${r.success?'✓':'✗'} ${r.fileName} - ${r.message}</div>`).join('')}</div>`;
                        if (ok) setTimeout(() => location.reload(), 1500);
                    } else {
                        uploadBtn.disabled = true; uploadBtn.innerHTML = '<span class="cloud189-rapid-loading"></span>秒传中...'; resultDiv.style.display = 'none';
                        const r = await client.rapidUpload(parsed.fileName, parsed.fileSize, parsed.fileMd5, parsed.sliceMd5, folderId, parsed.dirPath || '', { forceFamilyUpload });
                        uploadBtn.disabled = false; uploadBtn.textContent = '开始秒传';
                        resultDiv.style.display = 'block';
                        resultDiv.className = `cloud189-rapid-result ${r.success ? 'cloud189-rapid-result-success' : 'cloud189-rapid-result-error'}`;
                        resultDiv.textContent = r.success ? `✓ ${r.message}` : `✗ ${r.message}`;
                        if (r.success) { this.showToast('秒传成功！'); setTimeout(() => location.reload(), 1500); }
                    }
                };

                importCasBtn.onclick = () => {
                    casFileInput.click();
                };

                casFileInput.onchange = async (event) => {
                    const files = Array.from(event.target.files || []);
                    if (files.length === 0) return;

                    try {
                        const items = [];
                        for (const file of files) {
                            const content = (await file.text()).trim();
                            if (!content) continue;

                            const parsed = Utils.parseRapidLink(content);
                            if (!parsed) throw new Error(`${file.name} 格式错误`);

                            if (parsed.isArray) items.push(...parsed.items);
                            else items.push(parsed);
                        }

                        if (items.length === 0) throw new Error('未读取到有效的 .cas 内容');

                        rapidLinkInput.value = JSON.stringify(
                            items.map(item => ({
                                md5: item.fileMd5,
                                slice_md5: item.sliceMd5,
                                size: item.fileSize,
                                name: item.fullPath || item.fileName,
                                cloud: '189'
                            })),
                            null,
                            2
                        );

                        this.showToast(`已导入 ${files.length} 个文件，开始自动上传`);
                        await startUpload();
                    } catch (error) {
                        console.error('[秒传] 读取 .cas 文件失败:', error);
                        this.showToast(error.message || '读取 .cas 文件失败');
                    } finally {
                        casFileInput.value = '';
                    }
                };

                uploadBtn.onclick = startUpload;

                // ========== ★ 扫描 CAS 文件 ★ ==========
                let casData = []; // 存储解析后的有效数据
                const casScanBtn = panel.querySelector('#cas-scan-btn');
                const casUploadBtn = panel.querySelector('#cas-upload-btn');
                const casResultBox = panel.querySelector('#cas-result');
                const casUploadResult = panel.querySelector('#cas-upload-result');
                const casProgress = panel.querySelector('#cas-progress');
                const casProgressBar = panel.querySelector('#cas-progress-bar');
                const casProgressText = panel.querySelector('#cas-progress-text');
                const deleteCasCheckbox = panel.querySelector('#delete-cas-after-upload');
                const renameByCasFileNameCheckbox = panel.querySelector('#rename-by-cas-filename');
                const forceFamilyUploadForCas = panel.querySelector('#force-family-upload');
                const detailLogBox = panel.querySelector('#detail-log-box');

                const appendDetailLog = (message) => {
                    if (!detailLogBox) return;
                    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
                    detailLogBox.value += `[${time}] ${message}\n`;
                    detailLogBox.scrollTop = detailLogBox.scrollHeight;
                };

                Utils.setDeleteLogger(appendDetailLog);

                deleteCasCheckbox.onchange = () => {
                    GM_setValue(STORAGE_KEYS.deleteCasAfterUpload, deleteCasCheckbox.checked);
                };

                if (renameByCasFileNameCheckbox) {
                    renameByCasFileNameCheckbox.onchange = () => {
                        GM_setValue(STORAGE_KEYS.renameByCasFileName, renameByCasFileNameCheckbox.checked);
                    };
                }

                casScanBtn.onclick = async () => {
                    casScanBtn.disabled = true;
                    casScanBtn.innerHTML = '<span class="cloud189-rapid-loading"></span>扫描中...';
                    casResultBox.value = '正在扫描...';
                    if (detailLogBox) detailLogBox.value = '';
                    appendDetailLog('开始扫描当前目录中的 .cas 文件');
                    casUploadBtn.disabled = true;
                    casData = [];

                    try {
                        const folderId = client.getCurrentFolderId(client.isFamilySpace());
                        const renameByCasFileName = renameByCasFileNameCheckbox ? renameByCasFileNameCheckbox.checked : true;
                        const results = await client.scanCasFiles(
                            folderId,
                            (type, name, current, total) => {
                                casResultBox.value = `[${current}/${total}] ${type === 'downloading' ? '下载' : ''} ${name}`;
                                appendDetailLog(`扫描进度 ${current}/${total}: ${type === 'downloading' ? '下载' : '处理'} ${name}`);
                            },
                            renameByCasFileName
                        );

                        // 分离成功和失败的
                        const validItems = results.filter(r => !r._error);
                        const errorItems = results.filter(r => r._error);

                        casData = validItems;

                        let output = '';
                        if (validItems.length > 0) {
                            output += `✓ 成功解析 ${validItems.length} 个文件:\n`;
                            output += JSON.stringify(validItems.map(v => ({ md5: v.md5, slice_md5: v.slice_md5, size: v.size, name: v.name, cloud: v.cloud })), null, 2);
                        }
                        if (errorItems.length > 0) {
                            output += `\n\n✗ ${errorItems.length} 个文件解析失败:\n`;
                            errorItems.forEach(e => { output += `  ${e._casFile}: ${e._reason}\n`; });
                        }

                        casResultBox.value = output;
                        casUploadBtn.disabled = validItems.length === 0;
                        appendDetailLog(`扫描完成，可用 ${validItems.length} 个，失败 ${errorItems.length} 个`);

                        this.showToast(`扫描完成: ${validItems.length} 可用, ${errorItems.length} 失败`);

                    } catch (e) {
                        casResultBox.value = '扫描失败: ' + e.message;
                        appendDetailLog(`扫描失败: ${e.message}`);
                        this.showToast(e.message);
                    }

                    casScanBtn.disabled = false;
                    casScanBtn.textContent = '① 扫描 CAS 文件';
                };

                casUploadBtn.onclick = async () => {
                    if (casData.length === 0) { this.showToast('没有可用数据'); return; }

                    const targetFolder = panel.querySelector('#cas-target-folder').value.trim() || null;
                    const deleteCasAfterUpload = panel.querySelector('#delete-cas-after-upload').checked;
                    const forceFamilyUpload = forceFamilyUploadForCas ? forceFamilyUploadForCas.checked : false;
                    if (detailLogBox) detailLogBox.value = '';
                    appendDetailLog(`开始批量秒传，共 ${casData.length} 个文件`);
                    appendDetailLog(`始终使用家庭接口上传开关: ${forceFamilyUpload ? '开' : '关'}`);
                    appendDetailLog(`删除 .cas 开关: ${deleteCasAfterUpload ? '开' : '关'}`);
                    casUploadBtn.disabled = true;
                    casProgress.style.display = 'block';
                    casUploadResult.style.display = 'none';

                    const results = []; let ok = 0, fail = 0;

                    for (let i = 0; i < casData.length; i++) {
                        const item = casData[i];
                        casProgressBar.style.width = `${(i+1)/casData.length*100}%`;
                        casProgressText.textContent = `${i+1}/${casData.length} - ${item.name}`;

                        // 解析路径
                        const lastSlash = item.name.lastIndexOf('/');
                        const fileName = lastSlash >= 0 ? item.name.substring(lastSlash + 1) : item.name;
                        const dirPath = lastSlash >= 0 ? item.name.substring(0, lastSlash) : '';

                        appendDetailLog(`开始处理: ${item.name}`);
                        const r = await client.rapidUpload(fileName, item.size, item.md5, item.slice_md5, targetFolder, dirPath, { forceFamilyUpload });
                        appendDetailLog(`${r.success ? '秒传成功' : '秒传失败'}: ${item.name} -> ${r.message}`);
                        if (r.success && deleteCasAfterUpload && item._casFileId) {
                            try {
                                appendDetailLog(`开始删除 .cas: ${item._casFile || `${fileName}.cas`}`);
                                await client.deleteFile(item._casFileId, item._casFile || `${fileName}.cas`);
                                appendDetailLog(`删除 .cas 成功: ${item._casFile || `${fileName}.cas`}`);
                            } catch (deleteError) {
                                appendDetailLog(`删除 .cas 失败: ${item._casFile || `${fileName}.cas`} -> ${deleteError.message}`);
                                r.message += `；删除 .cas 失败: ${deleteError.message}`;
                            }
                        }
                        results.push({ fileName: item.name, ...r }); r.success ? ok++ : fail++;
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }

                    casProgress.style.display = 'none';
                    casUploadBtn.disabled = false;
                    casUploadResult.style.display = 'block';
                    casUploadResult.className = `cloud189-rapid-result ${ok ? 'cloud189-rapid-result-success' : 'cloud189-rapid-result-error'}`;
                    casUploadResult.innerHTML = `完成！成功:${ok} 失败:${fail}<div style="margin-top:12px;max-height:200px;overflow-y:auto;">${results.map(r=>`<div style="padding:4px 0;border-bottom:1px solid #eee;font-size:12px;">${r.success?'✓':'✗'} ${r.fileName} - ${r.message}</div>`).join('')}</div>`;
                    appendDetailLog(`批量任务完成，成功 ${ok} 个，失败 ${fail} 个`);

                    if (ok) { this.showToast(`${ok} 个文件秒传成功！`); setTimeout(() => location.reload(), 2000); }
                };

            },

            createFloatButton() {
                if (document.querySelector('.cloud189-rapid-float-btn')) return;
                if (!document.body) { setTimeout(() => this.createFloatButton(), 500); return; }
                const btn = document.createElement('button');
                btn.className = 'cloud189-rapid-float-btn';
                btn.innerHTML = '⚡'; btn.title = '秒传助手';
                btn.onclick = () => this.showPanel();
                document.body.appendChild(btn);
            }
        };

        // ============== 初始化 ==============
        function installFamilyRequestHook() {
            const persistCapturedContext = (detail = {}) => {
                const headers = detail.headers || {};
                const context = {
                    browserId: headers['Browser-Id'] || headers['browser-id'] || headers.browserId || '',
                    accessToken: headers.accesstoken || headers.AccessToken || ''
                };
                if (!context.browserId && !context.accessToken) return;
                try {
                    const serialized = JSON.stringify({
                        ...context,
                        url: detail.url || '',
                        updatedAt: Date.now()
                    });
                    sessionStorage.setItem(STORAGE_KEYS.familyRequestContext, serialized);
                    localStorage.setItem(STORAGE_KEYS.familyRequestContext, serialized);
                } catch (e) {}
            };

            document.addEventListener('cloud189-family-request', event => {
                persistCapturedContext(event.detail || {});
            });

            const script = document.createElement('script');
            script.textContent = `
                (function() {
                    if (window.__cloud189FamilyHookInstalled) return;
                    window.__cloud189FamilyHookInstalled = true;
                    function shouldCapture(url) {
                        return typeof url === 'string' && url.indexOf('/open/family/') !== -1;
                    }
                    function normalizeHeaders(input) {
                        const result = {};
                        if (!input) return result;
                        try {
                            if (typeof Headers !== 'undefined' && input instanceof Headers) {
                                input.forEach(function(value, key) { result[key] = value; });
                                return result;
                            }
                        } catch (e) {}
                        if (Array.isArray(input)) {
                            input.forEach(function(entry) {
                                if (Array.isArray(entry) && entry.length >= 2) result[String(entry[0])] = entry[1];
                            });
                            return result;
                        }
                        if (typeof input === 'object') {
                            Object.keys(input).forEach(function(key) { result[key] = input[key]; });
                        }
                        return result;
                    }
                    function emit(url, headers) {
                        try {
                            document.dispatchEvent(new CustomEvent('cloud189-family-request', {
                                detail: { url: url, headers: normalizeHeaders(headers) }
                            }));
                        } catch (e) {}
                    }
                    if (window.fetch) {
                        const originalFetch = window.fetch;
                        window.fetch = function(input, init) {
                            const url = typeof input === 'string' ? input : (input && input.url) || '';
                            if (shouldCapture(url)) {
                                const requestHeaders = {};
                                if (input && input.headers) Object.assign(requestHeaders, normalizeHeaders(input.headers));
                                if (init && init.headers) Object.assign(requestHeaders, normalizeHeaders(init.headers));
                                emit(url, requestHeaders);
                            }
                            return originalFetch.apply(this, arguments);
                        };
                    }
                    const originalOpen = XMLHttpRequest.prototype.open;
                    const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
                    const originalSend = XMLHttpRequest.prototype.send;
                    XMLHttpRequest.prototype.open = function(method, url) {
                        this.__cloud189RequestUrl = url;
                        this.__cloud189RequestHeaders = {};
                        return originalOpen.apply(this, arguments);
                    };
                    XMLHttpRequest.prototype.setRequestHeader = function(key, value) {
                        try {
                            if (this.__cloud189RequestHeaders) this.__cloud189RequestHeaders[key] = value;
                        } catch (e) {}
                        return originalSetRequestHeader.apply(this, arguments);
                    };
                    XMLHttpRequest.prototype.send = function() {
                        if (shouldCapture(this.__cloud189RequestUrl)) {
                            emit(this.__cloud189RequestUrl, this.__cloud189RequestHeaders || {});
                        }
                        return originalSend.apply(this, arguments);
                    };
                })();
            `;
            document.documentElement.appendChild(script);
            script.remove();
        }

        function init() {
            console.log('[天翼云盘秒传助手] v1.4.0 已加载');
            installFamilyRequestHook();
            UI.addStyles();
            setTimeout(() => UI.createFloatButton(), 1000);
            GM_registerMenuCommand('打开秒传助手', () => UI.showPanel());
            document.addEventListener('keydown', (e) => { if (e.ctrlKey && e.shiftKey && e.key === 'R') { e.preventDefault(); UI.showPanel(); } });
        }

        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
        else init();

    })();
