/**
 * WeTalk_task.js - Egern schedule script
 * Runs check-in and video bonus for all stored accounts.
 * * env (all configurable via module settings UI):
 * TASK_ENABLED      "true"/"false" master switch
 * ENABLE_CHECKIN    "true"/"false" run check-in
 * ENABLE_VIDEO      "true"/"false" run video bonus
 * MAX_VIDEO         number         max video rounds per account (default 5)
 * VIDEO_DELAY_MS    number         delay between videos in ms (default 8000)
 * ACCOUNT_GAP_MS    number         delay between accounts in ms (default 3500)
 */

// ── MD5 ──────────────────────────────────────────────────────────────────────
function MD5(s) {
    function RL(v, n) { return (v << n) | (v >>> (32 - n)); }
    function AU(x, y) {
        var x4 = x & 0x40000000, y4 = y & 0x40000000, x8 = x & 0x80000000, y8 = y & 0x80000000;
        var r = (x & 0x3FFFFFFF) + (y & 0x3FFFFFFF);
        if (x4 & y4) return r ^ 0x80000000 ^ x8 ^ y8;
        if (x4 | y4) return (r & 0x40000000) ? (r ^ 0xC0000000 ^ x8 ^ y8) : (r ^ 0x40000000 ^ x8 ^ y8);
        return r ^ x8 ^ y8;
    }
    function F(x, y, z) { return (x & y) | ((~x) & z); }
    function G(x, y, z) { return (x & z) | (y & (~z)); }
    function H(x, y, z) { return x ^ y ^ z; }
    function I(x, y, z) { return y ^ (x | (~z)); }
    function FF(a, b, c, d, x, s, ac) { a = AU(a, AU(AU(F(b, c, d), x), ac)); return AU(RL(a, s), b); }
    function GG(a, b, c, d, x, s, ac) { a = AU(a, AU(AU(G(b, c, d), x), ac)); return AU(RL(a, s), b); }
    function HH(a, b, c, d, x, s, ac) { a = AU(a, AU(AU(H(b, c, d), x), ac)); return AU(RL(a, s), b); }
    function II(a, b, c, d, x, s, ac) { a = AU(a, AU(AU(I(b, c, d), x), ac)); return AU(RL(a, s), b); }
    function CWA(str) {
        var ml = str.length, t1 = ml + 8, t2 = (t1 - (t1 % 64)) / 64, nw = (t2 + 1) * 16;
        var wa = Array(nw).fill(0), bp = 0, bc = 0;
        while (bc < ml) { var wc = (bc - (bc % 4)) / 4; bp = (bc % 4) * 8; wa[wc] |= str.charCodeAt(bc) << bp; bc++; }
        var wc = (bc - (bc % 4)) / 4; bp = (bc % 4) * 8; wa[wc] |= 0x80 << bp;
        wa[nw - 2] = ml << 3; wa[nw - 1] = ml >>> 29; return wa;
    }
    function W2H(v) { var r = ''; for (var i = 0; i <= 3; i++) { var b = (v >>> (i * 8)) & 255; var t = '0' + b.toString(16); r += t.substr(t.length - 2, 2); } return r; }
    var x = CWA(s), a = 0x67452301, b = 0xEFCDAB89, c = 0x98BADCFE, d = 0x10325476;
    var S11 = 7, S12 = 12, S13 = 17, S14 = 22, S21 = 5, S22 = 9, S23 = 14, S24 = 20;
    var S31 = 4, S32 = 11, S33 = 16, S34 = 23, S41 = 6, S42 = 10, S43 = 15, S44 = 21;
    for (var k = 0; k < x.length; k += 16) {
        var AA = a, BB = b, CC = c, DD = d;
        a = FF(a, b, c, d, x[k + 0], S11, 0xD76AA478); d = FF(d, a, b, c, x[k + 1], S12, 0xE8C7B756); c = FF(c, d, a, b, x[k + 2], S13, 0x242070DB); b = FF(b, c, d, a, x[k + 3], S14, 0xC1BDCEEE);
        a = FF(a, b, c, d, x[k + 4], S11, 0xF57C0FAF); d = FF(d, a, b, c, x[k + 5], S12, 0x4787C62A); c = FF(c, d, a, b, x[k + 6], S13, 0xA8304613); b = FF(b, c, d, a, x[k + 7], S14, 0xFD469501);
        a = FF(a, b, c, d, x[k + 8], S11, 0x698098D8); d = FF(d, a, b, c, x[k + 9], S12, 0x8B44F7AF); c = FF(c, d, a, b, x[k + 10], S13, 0xFFFF5BB1); b = FF(b, c, d, a, x[k + 11], S14, 0x895CD7BE);
        a = FF(a, b, c, d, x[k + 12], S11, 0x6B901122); d = FF(d, a, b, c, x[k + 13], S12, 0xFD987193); c = FF(c, d, a, b, x[k + 14], S13, 0xA679438E); b = FF(b, c, d, a, x[k + 15], S14, 0x49B40821);
        a = GG(a, b, c, d, x[k + 1], S21, 0xF61E2562); d = GG(d, a, b, c, x[k + 6], S22, 0xC040B340); c = GG(c, d, a, b, x[k + 11], S23, 0x265E5A51); b = GG(b, c, d, a, x[k + 0], S24, 0xE9B6C7AA);
        a = GG(a, b, c, d, x[k + 5], S21, 0xD62F105D); d = GG(d, a, b, c, x[k + 10], S22, 0x02441453); c = GG(c, d, a, b, x[k + 15], S23, 0xD8A1E681); b = GG(b, c, d, a, x[k + 4], S24, 0xE7D3FBC8);
        a = GG(a, b, c, d, x[k + 9], S21, 0x21E1CDE6); d = GG(d, a, b, c, x[k + 14], S22, 0xC33707D6); c = GG(c, d, a, b, x[k + 3], S23, 0xF4D50D87); b = GG(b, c, d, a, x[k + 8], S24, 0x455A14ED);
        a = GG(a, b, c, d, x[k + 13], S21, 0xA9E3E905); d = GG(d, a, b, c, x[k + 2], S22, 0xFCEFA3F8); c = GG(c, d, a, b, x[k + 7], S23, 0x676F02D9); b = GG(b, c, d, a, x[k + 12], S24, 0x8D2A4C8A);
        a = HH(a, b, c, d, x[k + 5], S31, 0xFFFA3942); d = HH(d, a, b, c, x[k + 8], S32, 0x8771F681); c = HH(c, d, a, b, x[k + 11], S33, 0x6D9D6122); b = HH(b, c, d, a, x[k + 14], S34, 0xFDE5380C);
        a = HH(a, b, c, d, x[k + 1], S31, 0xA4BEEA44); d = HH(d, a, b, c, x[k + 4], S32, 0x4BDECFA9); c = HH(c, d, a, b, x[k + 7], S33, 0xF6BB4B60); b = HH(b, c, d, a, x[k + 10], S34, 0xBEBFBC70);
        a = HH(a, b, c, d, x[k + 13], S31, 0x289B7EC6); d = HH(d, a, b, c, x[k + 0], S32, 0xEAA127FA); c = HH(c, d, a, b, x[k + 3], S33, 0xD4EF3085); b = HH(b, c, d, a, x[k + 6], S34, 0x04881D05);
        a = HH(a, b, c, d, x[k + 9], S31, 0xD9D4D039); d = HH(d, a, b, c, x[k + 12], S32, 0xE6DB99E5); c = HH(c, d, a, b, x[k + 15], S33, 0x1FA27CF8); b = HH(b, c, d, a, x[k + 2], S34, 0xC4AC5665);
        a = II(a, b, c, d, x[k + 0], S41, 0xF4292244); d = II(d, a, b, c, x[k + 7], S42, 0x432AFF97); c = II(c, d, a, b, x[k + 14], S43, 0xAB9423A7); b = II(b, c, d, a, x[k + 5], S44, 0xFC93A039);
        a = II(a, b, c, d, x[k + 12], S41, 0x655B59C3); d = II(d, a, b, c, x[k + 3], S42, 0x8F0CCC92); c = II(c, d, a, b, x[k + 10], S43, 0xFFEFF47D); b = II(b, c, d, a, x[k + 1], S44, 0x85845DD1);
        a = II(a, b, c, d, x[k + 8], S41, 0x6FA87E4F); d = II(d, a, b, c, x[k + 15], S42, 0xFE2CE6E0); c = II(c, d, a, b, x[k + 6], S43, 0xA3014314); b = II(b, c, d, a, x[k + 13], S44, 0x4E0811A1);
        a = II(a, b, c, d, x[k + 4], S41, 0xF7537E82); d = II(d, a, b, c, x[k + 11], S42, 0xBD3AF235); c = II(c, d, a, b, x[k + 2], S43, 0x2AD7D2BB); b = II(b, c, d, a, x[k + 9], S44, 0xEB86D391);
        a = AU(a, AA); b = AU(b, BB); c = AU(c, CC); d = AU(d, DD);
    }
    return (W2H(a) + W2H(b) + W2H(c) + W2H(d)).toLowerCase();
}

// ── constants ────────────────────────────────────────────────────────────────
var SECRET = '0fOiukQq7jXZV2GRi9LGlO';
var API_HOST = 'api.wetalkapp.com';
var STORE_KEY = 'wetalk_accounts_v1';

var IOS_VER = ['17.5.1', '17.6.1', '17.4.1', '17.2.1', '16.7.8', '17.6', '17.3.1', '18.0.1', '17.1.2', '16.6.1'];
var IOS_SC = ['2.00', '3.00', '3.00', '2.00', '3.00'];
var MODELS = ['iPhone14,3', 'iPhone13,3', 'iPhone15,3', 'iPhone16,1', 'iPhone14,7', 'iPhone13,2', 'iPhone15,2', 'iPhone12,1'];
var CFN = ['1410.0.3', '1494.0.7', '1568.100.1', '1209.1', '1474.0.4', '1568.200.2'];
var DARWIN = ['22.6.0', '23.5.0', '23.6.0', '24.0.0', '22.4.0'];

// ── helpers ──────────────────────────────────────────────────────────────────
function pick(arr, seed) { return arr[seed % arr.length]; }

function buildUA(base, seed) {
    var iv = pick(IOS_VER, seed), sc = pick(IOS_SC, seed + 1), mo = pick(MODELS, seed + 2),
        cf = pick(CFN, seed + 3), dw = pick(DARWIN, seed + 4);
    if (base && typeof base === 'string') {
        var ua = base, ok = false;
        if (/iOS \d+(\.\d+){0,2}/.test(ua)) { ua = ua.replace(/iOS \d+(\.\d+){0,2}/, 'iOS ' + iv); ok = true; }
        if (/Scale\/\d+(\.\d+)?/.test(ua)) { ua = ua.replace(/Scale\/\d+(\.\d+)?/, 'Scale/' + sc); ok = true; }
        if (/iPhone\d+,\d+/.test(ua)) { ua = ua.replace(/iPhone\d+,\d+/, mo); ok = true; }
        if (/CFNetwork\/[\d.]+/.test(ua)) { ua = ua.replace(/CFNetwork\/[\d.]+/, 'CFNetwork/' + cf); ok = true; }
        if (/Darwin\/[\d.]+/.test(ua)) { ua = ua.replace(/Darwin\/[\d.]+/, 'Darwin/' + dw); ok = true; }
        if (ok) return ua;
    }
    return 'WeTalk/30.6.0 (com.innovationworks.wetalk; build:28; iOS ' + iv + ') Alamofire/5.4.3';
}

function utcDate() {
    var n = new Date(), pad = function (x) { return String(x).padStart(2, '0'); };
    return n.getUTCFullYear() + '-' + pad(n.getUTCMonth() + 1) + '-' + pad(n.getUTCDate()) +
        ' ' + pad(n.getUTCHours()) + ':' + pad(n.getUTCMinutes()) + ':' + pad(n.getUTCSeconds());
}

function signedParams(capture) {
    var p = {};
    Object.keys(capture.paramsRaw || {}).forEach(function (k) {
        if (k !== 'sign' && k !== 'signDate') p[k] = capture.paramsRaw[k];
    });
    p.signDate = utcDate();
    var base = Object.keys(p).sort().map(function (k) { return k + '=' + p[k]; }).join('&');
    p.sign = MD5(base + SECRET);
    return p;
}

function buildUrl(path, capture) {
    var p = signedParams(capture);
    var qs = Object.keys(p).map(function (k) { return k + '=' + encodeURIComponent(p[k]); }).join('&');
    return 'https://' + API_HOST + '/app/' + path + '?' + qs;
}

function buildHeaders(capture, ua) {
    var out = {};
    var snap = capture.headers || {};
    Object.keys(snap).forEach(function (k) { out[k] = snap[k]; });
    ['content-length', 'Content-Length', ':authority', ':method', ':path', ':scheme'].forEach(function (k) { delete out[k]; });
    out['Host'] = API_HOST;
    out['Accept'] = out['Accept'] || out['accept'] || 'application/json';
    Object.keys(out).forEach(function (k) { if (k.toLowerCase() === 'user-agent') delete out[k]; });
    out['User-Agent'] = ua;
    return out;
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

// ── single account ───────────────────────────────────────────────────────────
async function runAccount(ctx, acc, idx, total, opts) {
    var label = '[' + (idx + 1) + '/' + total + ' ' + (acc.alias || acc.id) + ']';
    var ua = buildUA(acc.baseUA, acc.uaSeed);
    var headers = buildHeaders(acc.capture, ua);
    var lines = [label];

    async function api(path) {
        var resp = await ctx.http.get(buildUrl(path, acc.capture), { headers: headers });
        return resp.json();
    }

    // balance before
    try {
        var d = await api('queryBalanceAndBonus');
        lines.push(d.retcode === 0 ? ('[Balance] ' + d.result.balance + ' Coins') : ('[Query failed] ' + d.retmsg));
    } catch (e) { lines.push('[Query error] ' + (e.message || 'req failed')); }

    // check-in
    if (opts.enableCheckin) {
        try {
            var d = await api('checkIn');
            if (d.retcode === 0) {
                lines.push('[CheckIn OK] ' + ((d.result && d.result.bonusHint) || d.retmsg || '').replace(/\n/g, ' '));
            } else {
                lines.push('[CheckIn] ' + d.retmsg);
            }
        } catch (e) { lines.push('[CheckIn error] ' + (e.message || 'req failed')); }
    }

    // video bonus
    if (opts.enableVideo) {
        for (var i = 1; i <= opts.maxVideo; i++) {
            await sleep(i === 1 ? 1500 : opts.videoDelay);
            try {
                var d = await api('videoBonus');
                if (d.retcode === 0) {
                    lines.push('[Video ' + i + '] +' + ((d.result && d.result.bonus) || '?') + ' Coins');
                } else {
                    lines.push('[Video ' + i + ' stop] ' + d.retmsg);
                    break;
                }
            } catch (e) {
                lines.push('[Video ' + i + ' error] ' + (e.message || 'req failed'));
                break;
            }
        }
    }

    // balance after
    try {
        var d = await api('queryBalanceAndBonus');
        if (d.retcode === 0) lines.push('[New Balance] ' + d.result.balance + ' Coins');
    } catch (e) { }

    return lines.join('\n');
}

// ── main ─────────────────────────────────────────────────────────────────────
export default async function (ctx) {
    // master switch
    if ((ctx.env.TASK_ENABLED || 'true') === 'false') {
        return;
    }

    var opts = {
        enableCheckin: (ctx.env.ENABLE_CHECKIN || 'true') !== 'false',
        enableVideo: (ctx.env.ENABLE_VIDEO || 'true') !== 'false',
        maxVideo: parseInt(ctx.env.MAX_VIDEO || '5', 10) || 5,
        videoDelay: parseInt(ctx.env.VIDEO_DELAY_MS || '8000', 10) || 8000,
        accountGap: parseInt(ctx.env.ACCOUNT_GAP_MS || '3500', 10) || 3500
    };

    var store = ctx.storage.getJSON(STORE_KEY);
    if (!store || !store.accounts || !store.order || !store.order.length) {
        ctx.notify({
            title: 'WeTalk - No accounts',
            body: 'Open WeTalk app first to capture account params.'
        });
        return;
    }

    var ids = store.order.filter(function (id) { return !!store.accounts[id]; });
    var total = ids.length;
    var results = [];

    for (var i = 0; i < ids.length; i++) {
        var acc = store.accounts[ids[i]];
        try {
            var text = await runAccount(ctx, acc, i, total, opts);
            results.push(text);
        } catch (e) {
            results.push('[' + (i + 1) + '/' + total + ' ' + (acc.alias || acc.id) + ']\n[Error] ' + (e.message || String(e)));
        }
        if (i < ids.length - 1) await sleep(opts.accountGap);
    }

    ctx.notify({
        title: 'WeTalk - Done (' + total + ' accounts)',
        body: results.join('\n---\n')
    });
}
