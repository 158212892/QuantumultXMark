/**
 * WeTalk_capture.js - Egern 专用抓取脚本
 * 存储键值: wetalk_accounts_v1 (严格保持 Task 脚本所需格式)
 */

// ── MD5 算法 (必须与 WeTalk_task.js 完全一致以确保指纹相同) ──
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

// ── 辅助函数 ──
const STORE_KEY = 'wetalk_accounts_v1';

function parseQuery(url) {
    var q = (url.split('?')[1] || '').split('#')[0];
    var m = {};
    q.split('&').forEach(function(p){
        if (!p) return;
        var idx = p.indexOf('=');
        if (idx < 0) return;
        m[p.slice(0, idx)] = p.slice(idx + 1);
    });
    return m;
}

// 严格按照 WeTalk_task.js 中的 fingerprint 逻辑提取 id
function getFingerprint(params) {
    var drop = { sign:1, signDate:1, timestamp:1, ts:1, nonce:1, random:1, reqTime:1, reqId:1, requestId:1 };
    var base = Object.keys(params).filter(function(k){ return !drop[k]; })
               .sort().map(function(k){ return k+'='+params[k]; }).join('&');
    return MD5(base).slice(0, 12); // 取 MD5 前 12 位作为 id
}

export default async function (ctx) {
    const url = ctx.request.url;
    const hdrs = ctx.request.headers;

    if (url.includes("/app/queryBalanceAndBonus")) {
        console.log("\n--- 🕵️ WeTalk 抓取插件触发 ---");
        
        // 遍历日志 ❇️
        console.log("遍历头部对象并打印每个字段和值开始❇️");
        let snapHeaders = {};
        for (const key in hdrs) {
            console.log(`${key}: ${hdrs[key]}`);
            snapHeaders[key] = hdrs[key];
        }
        console.log("遍历头部对象并打印每个字段和值结束🍓");

        const params = parseQuery(url);
        const fp = getFingerprint(params); // 计算 id
        
        // 读取存储结构
        let store = ctx.storage.getJSON(STORE_KEY) || { version: 1, accounts: {}, order: [] };
        const existed = !!store.accounts[fp];
        const alias = existed ? store.accounts[fp].alias : ("账号" + (store.order.length + 1));

        // 写入 WeTalk_task.js 所需的数据字段
        store.accounts[fp] = {
            id: fp,
            alias: alias,
            uaSeed: existed ? store.accounts[fp].uaSeed : store.order.length,
            baseUA: snapHeaders['user-agent'] || snapHeaders['User-Agent'] || '',
            capture: {
                url: url,
                paramsRaw: params,
                headers: snapHeaders
            },
            createdAt: existed ? store.accounts[fp].createdAt : Date.now(),
            updatedAt: Date.now()
        };

        if (!existed) store.order.push(fp);
        ctx.storage.setJSON(STORE_KEY, store);

        console.log(`✅ 抓取成功！[${alias}] ID: ${fp}`);
        console.log("--- 🕵️ WeTalk 抓取插件结束 ---\n");

        // 参考官方通知格式
        ctx.notify({
            title: 'WeTalk 抓取成功 ✅',
            body: `${alias} 数据已入库\nID: ${fp}`,
            sound: true,
            action: {
                type: 'clipboard',
                text: fp
            }
        });
    }
}
