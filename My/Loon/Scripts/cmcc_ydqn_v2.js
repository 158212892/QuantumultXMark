// cmcc_ydqn_终极版.js —— 点击 pro_item 永远生效版
let body = $response.body;
if (!body) $done({});

// 全局变量，确保每次注入都重新启动轮询（不会被覆盖
const inject = `
// === 四川移动请你权益随时领（终极不失效版）===
(() => {
    // 防止重复注入
    if (window.__CMCC_YDQN_FIXED) return;
    window.__CMCC_YDQN_FIXED = true;

    const forceOrderStatusZero();
    function forceOrderStatusZero() {
        setInterval(() => {
            try {
                const box = document.querySelector('.shellUnionMemberBox');
                if (box && box.__vue__ && box.__vue__.hasOwnProperty('orderStatus')) {
                    if (box.__vue__.orderStatus !== 0) {
                        box.__vue__.orderStatus = 0;
                        box.__vue__.$forceUpdate?.();
                        console.log("终极版：已强制 orderStatus=0（点击 pro_item 后依然生效）");
                    }
                }
            } catch (e) {}
        }, 80);  // 80ms 轮询，极快响应
    }

    // 即使后续 JS 重新创建 Vue 实例，也要重新启动（保险）
    new MutationObserver((mutations) => {
        let needRestart = false;
        for (let m of mutations) {
            if (m.addedNodes.length) {
                for (let node of m.addedNodes) {
                    if (node.querySelector && node.querySelector('.shellUnionMemberBox')) {
                        needRestart = true;
                        break;
                    }
                }
            }
        }
        if (needRestart && !window.__CMCC_YDQN_RUNNING) {
            window.__CMCC_YDQN_RUNNING = true;
            setTimeout(() => {
                window.__CMCC_YDQN_FIXED = false;  // 允许重新注入
                forceOrderStatusZero();
            }, 300);
        }
    }).observe(document.body || document.documentElement, {
        childList: true,
        subtree: true
    });
})();
`;

body += "\n\n" + inject;
$done({ body });