/**
 * @author yaowuliu
 * @function 获取应用的cookie或token通用脚本
 * @date 2026-04-24 18:00:00
 */

////////////////////////////////
const $ = new API("获取Cookie或Token通用脚本");
const req_url = $request.url;
const req_headers = $request.headers;
const req_body = $request.body;
let rsp_body = "{}";
// 检查 $response 是否已定义
if (typeof $response !== 'undefined' && $response !== null) {
  // 如果 $response 已定义且不为 null，则使用 $response.body
  rsp_body = $response.body;
}

// 遍历头部对象并打印每个字段和值
console.log("遍历头部对象并打印每个字段和值开始❇️");
for (const headerField in req_headers) {
  console.log(`${headerField}: ${req_headers[headerField]}`);
}
console.log("遍历头部对象并打印每个字段和值结束🍓");

try {
  /**
   * 奇瑞汽车App
   * 手机APP进入"我的"页面，即可获取cookie
   * @keyword fmz200_chery_account
   */
  if (req_url.includes("/web/user/current/details?")) {
    const regex = /access_token=([^&]*)/;
    let match = req_url.match(regex);
    const access_token = match ? match[1] : "";
    console.log(`获取到access_token：${access_token}`);
    let rsp_data = JSON.parse(rsp_body);
    if (rsp_data.data?.accountId) {
      let accountId = rsp_data.data.accountId;
      let avatarUrl = rsp_data.data.avatarUrl;
      let displayName = rsp_data.data.displayName;
      console.log("账号[" + accountId + "]获取到获取到数据：" + access_token);
      
      let cache = $.read("#fmz200_chery_account") || "[]";
      console.log("读取到缓存数据：" + cache);
      let json_data = JSON.parse(cache);
      updateOrAddObject(json_data, "accountId", accountId, "access_token", access_token, "displayName", displayName, "avatarUrl", avatarUrl);
      const cacheValue = JSON.stringify(json_data, null, "\t");

      $.write(cacheValue, '#fmz200_chery_account');
      $.notify('奇瑞汽车App 获取token成功✅', "", access_token);
    }
  }  
  
  /**
   * 什么值得买
   * 手机APP进入我的页面查看个人资料，即可获取cookie
   * @keyword SMZDM_COOKIE
   * @keyword fmz200_smzdm_cookie
   */
  if (req_url.includes("/user-api.smzdm.com/users/info")) {
    const cookie = req_headers['Cookie'] || req_headers['cookie'];
    let regex = /smzdm_id=(\d+)/;
    let match = cookie.match(regex);
    let smzdm_id = match ? match[1] : "";
    console.log(smzdm_id + "获取到获取到数据：" + cookie);

    let cache = $.read("#fmz200_smzdm_cookie") || "[]";
    console.log("读取缓存数据：" + cache);
    let json_data = JSON.parse(cache);
    updateOrAddObject(json_data, "smzdm_id", smzdm_id, "cookie", cookie);
    const cacheValue = JSON.stringify(json_data, null, "\t");

    $.write(cookie, '#SMZDM_COOKIE');
    $.write(cacheValue, '#fmz200_smzdm_cookie');
    $.notify('什么值得买 获取cookie成功✅', "", cookie);
    console.log('什么值得买 获取到的ck为：' + cookie);
  }

  /**
   * 拼多多果园
   */
  if (req_url.includes("/proxy/api/api/server/_stm")) {
    const cookieValue = req_headers["Cookie"] || req_headers["cookie"];
    const token = cookieValue.match(/PDDAccessToken=.+?/);
    if (token) {
      $.write(token, '#ddgyck');
      $.write(token, '#fmz200_pdd_token');
      $.notify('拼多多果园 token获取成功', token, token);
      console.log('拼多多果园 获取到的ck为：' + token);
    }
  }

  /**
   * 美团获取token
   */
  if (req_url.includes("/user/v1/info/auditting") || req_url.includes("/mapi/usercenter")) {
    console.log('美团获取token 开始');
    const token = req_headers['token'] || req_headers['Token'];
    if (!token) {
      $.done();
    }
    console.log("获取到token：" + token);
    $.write(token, '#meituanCookie');
    $.notify('美团获取token成功✅', "单账号更新成功，多账号更新中", token);
    
    console.log("开始更新多账号");
    let data = JSON.parse(rsp_body);
    if (data.user) {
      let uid = data.user.id;
      let username = data.user.username;
      
      let cache = $.read("#fmz200_meituan_cookie") || "[]";
      let json_data = JSON.parse(cache);
      updateOrAddObject(json_data, "meituan_id", uid, "username", username, "token", token);
      const cacheValue = JSON.stringify(json_data, null, "\t");

      $.write(cacheValue, '#fmz200_meituan_cookie');
      $.notify('美团多账号更新token成功✅', "", "");
    }
  }

  /**
   * 微博获取cookie
   */
  if (req_url.includes("/users/show")) {
    console.log('微博获取cookie 开始');
    let uidPattern = /uid=(\d+)/;
    let match = req_url.match(uidPattern);

    if (match) {
      let uid = match[1];
      let cache = $.read("#fmz200_weibo_token") || "[]";
      let json_data = JSON.parse(cache);
      updateOrAddObject(json_data, "weibo_id", uid, "signin_url", req_url, "headers", req_headers);
      const cacheValue = JSON.stringify(json_data, null, "\t");
      
      $.write(cacheValue, '#fmz200_weibo_token');
      $.notify('微博获取cookie 成功✅', "你可以在日志中查看本次获取的数据", "");
    } else {
      $.notify('微博获取cookie 未获取到UID❗️', "你可以在日志中查看本次获取的数据", "");
    }
  }

  /**
   * 顺丰速运
   */
  if (req_url.includes("/mcs-mimp/share/weChat/shareGiftReceiveRedirect") || req_url.includes("/mcs-mimp/share/app/shareRedirect")) {
    console.log('顺丰速运 开始');
    $.write(req_url, '#sfsyBee');
    $.write(req_url, '#fmz200_sf_bee');
    $.notify('顺丰速运 获取成功✅', req_url, req_url);
  }

  /**
   * 滴滴获取token
   */
  if (req_url.includes("/api/game/plant/newWatering")) {
    console.log('滴滴果园token 开始');
    let data = JSON.parse(req_body);
    let uid = data.uid;
    let newToken = data.token;

    let cache = $.read("#fmz200_didi_fruit") || "{}";
    let json_data = parseDataString(cache);
    updateToken(uid, newToken, json_data);
    let string_data = convertDataToString(json_data);

    $.write(string_data, '#ddgyToken');
    $.write(string_data, '#fmz200_didi_fruit');
    $.notify('滴滴果园token 获取成功✅', string_data, string_data);
  }

  /**
   * 滴滴打车
   */
  if (req_url.includes("/login/v5/signInByOpenid")) {
    console.log('滴滴打车 开始');
    let data = JSON.parse(rsp_body);
    let uid = data.uid;
    let ticket = data.ticket;

    let cache = $.read("#fmz200_didi_ticket") || "";
    let json_data = parseDataString(cache);
    updateToken(uid, ticket, json_data);
    let string_data = convertDataToString(json_data);

    $.write(string_data, '#fmz200_didi_ticket');
    $.notify('滴滴打车 获取成功✅', string_data, string_data);
  }

  /**
   * 晓晓优选 获取cookie
   */
  if (req_url.includes("xxyx-client-api.xiaoxiaoyouxuan.com/my")) {
    console.log('晓晓优选 开始');
    const token = req_headers['xx-token'];
    let rsp_data = JSON.parse(rsp_body).data;
    if (token && rsp_data) {
      let mobile = rsp_data.mobile;
      let username = rsp_data.nick;
      let avatar = rsp_data.avatar;

      let cache = $.read("#fmz200_xxyx_token") || "[]";
      let json_data = JSON.parse(cache);
      updateOrAddObject(json_data, "mobile", mobile, "username", username, "token", token, "avatar", avatar);
      const cacheValue = JSON.stringify(json_data, null, "\t");
      
      $.write(cacheValue, '#fmz200_xxyx_token');
      $.notify('晓晓优选token 获取成功✅', '', '');
    }
  }

  /**
   * PingMe (WeTalk 多账号版)
   * 存储键值: pingme_accounts_v1 (严格保持 Task 脚本所需格式)
   */
  if (req_url.includes("/app/queryBalanceAndBonus")) {
    console.log('\n--- 🕵️ PingMe/WeTalk 抓取插件触发 ---');
    
    const params = parseRawQuery(req_url);
    const fp = getFingerprint(params); // 计算唯一指纹ID
    const snapHeaders = normalizeHeaderNameMap(req_headers || {});
    
    // 读取存储结构
    const STORE_KEY = 'pingme_accounts_v1';
    let cache = $.read(`#${STORE_KEY}`);
    let store = cache ? JSON.parse(cache) : { version: 1, accounts: {}, order: [] };
    
    const existed = !!store.accounts[fp];
    const alias = existed ? store.accounts[fp].alias : ("账号" + (store.order.length + 1));

    // 写入结构化数据
    store.accounts[fp] = {
        id: fp,
        alias: alias,
        uaSeed: existed ? store.accounts[fp].uaSeed : store.order.length,
        baseUA: snapHeaders['user-agent'] || snapHeaders['User-Agent'] || '',
        capture: {
            url: req_url,
            paramsRaw: params,
            headers: snapHeaders
        },
        createdAt: existed ? store.accounts[fp].createdAt : Date.now(),
        updatedAt: Date.now()
    };

    if (!existed) store.order.push(fp);
    
    // 保存至本地
    $.write(JSON.stringify(store, null, 2), `#${STORE_KEY}`);

    console.log(`✅ 抓取成功！[${alias}] ID: ${fp}`);
    console.log("--- 🕵️ PingMe/WeTalk 抓取插件结束 ---\n");

    $.notify('PingMe/WeTalk 抓取成功 ✅', `${alias} 数据已入库\nID: ${fp}`, '');
  }
} catch (e) {
  console.log('脚本运行出现错误：' + e.message);
  $.notify('获取Cookie脚本运行出现错误❗️', "", "");
}
$.done();

// ==============================
// 辅助函数区域
// ==============================

// 将数据字符串解析为对象
function parseDataString(dataString) {
  let data = {};
  let parts = dataString.split(/[\n@]/);
  parts.forEach(part => {
    let [uid, token] = part.split("&");
    if (uid && token) {
      data[uid] = token;
    }
  });
  return data;
}

function updateOrAddObject(collection, ...args) {
  if (args.length % 2 !== 0) {
    throw new Error('Arguments must be provided in pairs.');
  }

  for (let i = 0; i < args.length; i += 2) {
    const id = args[i];
    const key = args[i + 1];
    const index = collection.findIndex(obj => obj[id] === key);

    if (index !== -1) {
      for (let j = i + 2; j < args.length; j += 2) {
        const id2 = args[j];
        const value = args[j + 1];
        collection[index][id2] = value;
      }
    } else {
      const newObj = {};
      for (let j = i; j < args.length; j += 2) {
        newObj[args[j]] = args[j + 1];
      }
      collection.push(newObj);
      break;
    }
  }
}

function updateToken(uidToUpdate, newToken, data) {
  if (data.hasOwnProperty(uidToUpdate)) {
    data[uidToUpdate] = newToken;
  } else {
    data[uidToUpdate] = newToken;
  }
}

function convertDataToString(data) {
  let result = "";
  for (let uid in data) {
    if (data.hasOwnProperty(uid)) {
      result += `${uid}&${data[uid]}@`;
    }
  }
  return result.slice(0, -1);
}

function normalizeHeaderNameMap(headers) {
  const out = {};
  Object.keys(headers || {}).forEach(k => out[k] = headers[k]);
  return out;
}

function parseRawQuery(url) {
  const query = (url.split('?')[1] || '').split('#')[0];
  const rawMap = {};
  query.split('&').forEach(pair => {
    if (!pair) return;
    const idx = pair.indexOf('=');
    if (idx < 0) return;
    const k = pair.slice(0, idx);
    const v = pair.slice(idx + 1);
    rawMap[k] = v;
  });
  return rawMap;
}

// ── MD5 算法 (确保生成唯一 ID) ──
function MD5(s) {
    function RL(v,n){return(v<<n)|(v>>>(32-n));}
    function AU(x,y){
        var x4=x&0x40000000,y4=y&0x40000000,x8=x&0x80000000,y8=y&0x80000000;
        var r=(x&0x3FFFFFFF)+(y&0x3FFFFFFF);
        if(x4&y4)return r^0x80000000^x8^y8;
        if(x4|y4)return(r&0x40000000)?(r^0xC0000000^x8^y8):(r^0x40000000^x8^y8);
        return r^x8^y8;
    }
    function F(x,y,z){return(x&y)|((~x)&z);}
    function G(x,y,z){return(x&z)|(y&(~z));}
    function H(x,y,z){return x^y^z;}
    function I(x,y,z){return y^(x|(~z));}
    function FF(a,b,c,d,x,s,ac){a=AU(a,AU(AU(F(b,c,d),x),ac));return AU(RL(a,s),b);}
    function GG(a,b,c,d,x,s,ac){a=AU(a,AU(AU(G(b,c,d),x),ac));return AU(RL(a,s),b);}
    function HH(a,b,c,d,x,s,ac){a=AU(a,AU(AU(H(b,c,d),x),ac));return AU(RL(a,s),b);}
    function II(a,b,c,d,x,s,ac){a=AU(a,AU(AU(I(b,c,d),x),ac));return AU(RL(a,s),b);}
    function CWA(str){
        var ml=str.length,t1=ml+8,t2=(t1-(t1%64))/64,nw=(t2+1)*16;
        var wa=Array(nw).fill(0),bp=0,bc=0;
        while(bc<ml){var wc=(bc-(bc%4))/4;bp=(bc%4)*8;wa[wc]|=str.charCodeAt(bc)<<bp;bc++;}
        var wc=(bc-(bc%4))/4;bp=(bc%4)*8;wa[wc]|=0x80<<bp;
        wa[nw-2]=ml<<3;wa[nw-1]=ml>>>29;return wa;
    }
    function W2H(v){var r='';for(var i=0;i<=3;i++){var b=(v>>>(i*8))&255;var t='0'+b.toString(16);r+=t.substr(t.length-2,2);}return r;}
    var x=CWA(s),a=0x67452301,b=0xEFCDAB89,c=0x98BADCFE,d=0x10325476;
    var S11=7,S12=12,S13=17,S14=22,S21=5,S22=9,S23=14,S24=20;
    var S31=4,S32=11,S33=16,S34=23,S41=6,S42=10,S43=15,S44=21;
    for(var k=0;k<x.length;k+=16){
        var AA=a,BB=b,CC=c,DD=d;
        a=FF(a,b,c,d,x[k+0],S11,0xD76AA478);d=FF(d,a,b,c,x[k+1],S12,0xE8C7B756);c=FF(c,d,a,b,x[k+2],S13,0x242070DB);b=FF(b,c,d,a,x[k+3],S14,0xC1BDCEEE);
        a=FF(a,b,c,d,x[k+4],S11,0xF57C0FAF);d=FF(d,a,b,c,x[k+5],S12,0x4787C62A);c=FF(c,d,a,b,x[k+6],S13,0xA8304613);b=FF(b,c,d,a,x[k+7],S14,0xFD469501);
        a=FF(a,b,c,d,x[k+8],S11,0x698098D8);d=FF(d,a,b,c,x[k+9],S12,0x8B44F7AF);c=FF(c,d,a,b,x[k+10],S13,0xFFFF5BB1);b=FF(b,c,d,a,x[k+11],S14,0x895CD7BE);
        a=FF(a,b,c,d,x[k+12],S11,0x6B901122);d=FF(d,a,b,c,x[k+13],S12,0xFD987193);c=FF(c,d,a,b,x[k+14],S13,0xA679438E);b=FF(b,c,d,a,x[k+15],S14,0x49B40821);
        a=GG(a,b,c,d,x[k+1],S21,0xF61E2562);d=GG(d,a,b,c,x[k+6],S22,0xC040B340);c=GG(c,d,a,b,x[k+11],S23,0x265E5A51);b=GG(b,c,d,a,x[k+0],S24,0xE9B6C7AA);
        a=GG(a,b,c,d,x[k+5],S21,0xD62F105D);d=GG(d,a,b,c,x[k+10],S22,0x02441453);c=GG(c,d,a,b,x[k+15],S23,0xD8A1E681);b=GG(b,c,d,a,x[k+4],S24,0xE7D3FBC8);
        a=GG(a,b,c,d,x[k+9],S21,0x21E1CDE6);d=GG(d,a,b,c,x[k+14],S22,0xC33707D6);c=GG(c,d,a,b,x[k+3],S23,0xF4D50D87);b=GG(b,c,d,a,x[k+8],S24,0x455A14ED);
        a=GG(a,b,c,d,x[k+13],S21,0xA9E3E905);d=GG(d,a,b,c,x[k+2],S22,0xFCEFA3F8);c=GG(c,d,a,b,x[k+7],S23,0x676F02D9);b=GG(b,c,d,a,x[k+12],S24,0x8D2A4C8A);
        a=HH(a,b,c,d,x[k+5],S31,0xFFFA3942);d=HH(d,a,b,c,x[k+8],S32,0x8771F681);c=HH(c,d,a,b,x[k+11],S33,0x6D9D6122);b=HH(b,c,d,a,x[k+14],S34,0xFDE5380C);
        a=HH(a,b,c,d,x[k+1],S31,0xA4BEEA44);d=HH(d,a,b,c,x[k+4],S32,0x4BDECFA9);c=HH(c,d,a,b,x[k+7],S33,0xF6BB4B60);b=HH(b,c,d,a,x[k+10],S34,0xBEBFBC70);
        a=HH(a,b,c,d,x[k+13],S31,0x289B7EC6);d=HH(d,a,b,c,x[k+0],S32,0xEAA127FA);c=HH(c,d,a,b,x[k+3],S33,0xD4EF3085);b=HH(b,c,d,a,x[k+6],S34,0x04881D05);
        a=HH(a,b,c,d,x[k+9],S31,0xD9D4D039);d=HH(d,a,b,c,x[k+12],S32,0xE6DB99E5);c=HH(c,d,a,b,x[k+15],S33,0x1FA27CF8);b=HH(b,c,d,a,x[k+2],S34,0xC4AC5665);
        a=II(a,b,c,d,x[k+0],S41,0xF4292244);d=II(d,a,b,c,x[k+7],S42,0x432AFF97);c=II(c,d,a,b,x[k+14],S43,0xAB9423A7);b=II(b,c,d,a,x[k+5],S44,0xFC93A039);
        a=II(a,b,c,d,x[k+12],S41,0x655B59C3);d=II(d,a,b,c,x[k+3],S42,0x8F0CCC92);c=II(c,d,a,b,x[k+10],S43,0xFFEFF47D);b=II(b,c,d,a,x[k+1],S44,0x85845DD1);
        a=II(a,b,c,d,x[k+8],S41,0x6FA87E4F);d=II(d,a,b,c,x[k+15],S42,0xFE2CE6E0);c=II(c,d,a,b,x[k+6],S43,0xA3014314);b=II(b,c,d,a,x[k+13],S44,0x4E0811A1);
        a=II(a,b,c,d,x[k+4],S41,0xF7537E82);d=II(d,a,b,c,x[k+11],S42,0xBD3AF235);c=II(c,d,a,b,x[k+2],S43,0x2AD7D2BB);b=II(b,c,d,a,x[k+9],S44,0xEB86D391);
        a=AU(a,AA);b=AU(b,BB);c=AU(c,CC);d=AU(d,DD);
    }
    return(W2H(a)+W2H(b)+W2H(c)+W2H(d)).toLowerCase();
}

// ── 严格按照 fingerprint 逻辑提取 id ──
function getFingerprint(params) {
    var drop = { sign:1, signDate:1, timestamp:1, ts:1, nonce:1, random:1, reqTime:1, reqId:1, requestId:1 };
    var base = Object.keys(params).filter(function(k){ return !drop[k]; })
               .sort().map(function(k){ return k+'='+params[k]; }).join('&');
    return MD5(base).slice(0, 12); // 取 MD5 前 12 位作为 id
}

/*********************************** API *************************************/
function ENV() { const e = "undefined" != typeof $task, t = "undefined" != typeof $loon, s = "undefined" != typeof $httpClient && !t, i = "function" == typeof require && "undefined" != typeof $jsbox; return { isQX: e, isLoon: t, isSurge: s, isNode: "function" == typeof require && !i, isJSBox: i, isRequest: "undefined" != typeof $request, isScriptable: "undefined" != typeof importModule } } function HTTP(e = { baseURL: "" }) { const { isQX: t, isLoon: s, isSurge: i, isScriptable: n, isNode: o } = ENV(), r = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&\/\/=]*)/; const u = {}; return ["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS", "PATCH"].forEach(l => u[l.toLowerCase()] = (u => (function (u, l) { l = "string" == typeof l ? { url: l } : l; const h = e.baseURL; h && !r.test(l.url || "") && (l.url = h ? h + l.url : l.url); const a = (l = { ...e, ...l }).timeout, c = { onRequest: () => { }, onResponse: e => e, onTimeout: () => { }, ...l.events }; let f, d; if (c.onRequest(u, l), t) f = $task.fetch({ method: u, ...l }); else if (s || i || o) f = new Promise((e, t) => { (o ? require("request") : $httpClient)[u.toLowerCase()](l, (s, i, n) => { s ? t(s) : e({ statusCode: i.status || i.statusCode, headers: i.headers, body: n }) }) }); else if (n) { const e = new Request(l.url); e.method = u, e.headers = l.headers, e.body = l.body, f = new Promise((t, s) => { e.loadString().then(s => { t({ statusCode: e.response.statusCode, headers: e.response.headers, body: s }) }).catch(e => s(e)) }) } const p = a ? new Promise((e, t) => { d = setTimeout(() => (c.onTimeout(), t(`${u} URL: ${l.url} exceeds the timeout ${a} ms`)), a) }) : null; return (p ? Promise.race([p, f]).then(e => (clearTimeout(d), e)) : f).then(e => c.onResponse(e)) })(l, u))), u } function API(e = "untitled", t = !1) { const { isQX: s, isLoon: i, isSurge: n, isNode: o, isJSBox: r, isScriptable: u } = ENV(); return new class { constructor(e, t) { this.name = e, this.debug = t, this.http = HTTP(), this.env = ENV(), this.node = (() => { if (o) { return { fs: require("fs") } } return null })(), this.initCache(); Promise.prototype.delay = function (e) { return this.then(function (t) { return ((e, t) => new Promise(function (s) { setTimeout(s.bind(null, t), e) }))(e, t) }) } } initCache() { if (s && (this.cache = JSON.parse($prefs.valueForKey(this.name) || "{}")), (i || n) && (this.cache = JSON.parse($persistentStore.read(this.name) || "{}")), o) { let e = "root.json"; this.node.fs.existsSync(e) || this.node.fs.writeFileSync(e, JSON.stringify({}), { flag: "wx" }, e => console.log(e)), this.root = {}, e = `${this.name}.json`, this.node.fs.existsSync(e) ? this.cache = JSON.parse(this.node.fs.readFileSync(`${this.name}.json`)) : (this.node.fs.writeFileSync(e, JSON.stringify({}), { flag: "wx" }, e => console.log(e)), this.cache = {}) } } persistCache() { const e = JSON.stringify(this.cache, null, 2); s && $prefs.setValueForKey(e, this.name), (i || n) && $persistentStore.write(e, this.name), o && (this.node.fs.writeFileSync(`${this.name}.json`, e, { flag: "w" }, e => console.log(e)), this.node.fs.writeFileSync("root.json", JSON.stringify(this.root, null, 2), { flag: "w" }, e => console.log(e))) } write(e, t) { if (this.log(`SET ${t}`), -1 !== t.indexOf("#")) { if (t = t.substr(1), n || i) return $persistentStore.write(e, t); if (s) return $prefs.setValueForKey(e, t); o && (this.root[t] = e) } else this.cache[t] = e; this.persistCache() } read(e) { return this.log(`READ ${e}`), -1 === e.indexOf("#") ? this.cache[e] : (e = e.substr(1), n || i ? $persistentStore.read(e) : s ? $prefs.valueForKey(e) : o ? this.root[e] : void 0) } delete(e) { if (this.log(`DELETE ${e}`), -1 !== e.indexOf("#")) { if (e = e.substr(1), n || i) return $persistentStore.write(null, e); if (s) return $prefs.removeValueForKey(e); o && delete this.root[e] } else delete this.cache[e]; this.persistCache() } notify(e, t = "", l = "", h = {}) { const a = h["open-url"], c = h["media-url"]; if (s && $notify(e, t, l, h), n && $notification.post(e, t, l + `${c ? "\n多媒体:" + c : ""}`, { url: a }), i) { let s = {}; a && (s.openUrl = a), c && (s.mediaUrl = c), "{}" === JSON.stringify(s) ? $notification.post(e, t, l) : $notification.post(e, t, l, s) } if (o || u) { const s = l + (a ? `\n点击跳转: ${a}` : "") + (c ? `\n多媒体: ${c}` : ""); if (r) { require("push").schedule({ title: e, body: (t ? t + "\n" : "") + s }) } else console.log(`${e}\n${t}\n${s}\n\n`) } } log(e) { this.debug && console.log(`[${this.name}] LOG: ${this.stringify(e)}`) } info(e) { console.log(`[${this.name}] INFO: ${this.stringify(e)}`) } error(e) { console.log(`[${this.name}] ERROR: ${this.stringify(e)}`) } wait(e) { return new Promise(t => setTimeout(t, e)) } done(e = {}) { console.log('done!'); s || i || n ? $done(e) : o && !r && "undefined" != typeof $context && ($context.headers = e.headers, $context.statusCode = e.statusCode, $context.body = e.body) } stringify(e) { if ("string" == typeof e || e instanceof String) return e; try { return JSON.stringify(e, null, 2) } catch (e) { return "[object Object]" } } }(e, t) }
/*****************************************************************************/
