// cmcc_ydqn.js - 四川移动请你权益随时领（纯净版：只改 orderStatus=0）
let body = $response.body;
if (!body || typeof body !== 'string') $done({});

const inject = `
// === 四川移动请你权益随时领（纯净版）===
(() => {
    let lastStatus = null;
    setInterval(() => {
        try {
            const box = document.querySelector('.shellUnionMemberBox');
            if (box && box.__vue__ && box.__vue__.hasOwnProperty('orderStatus')) {
                const current = box.__vue__.orderStatus;
                if (current !== 0 && current !== lastStatus) {
                    box.__vue__.orderStatus = 0;
                    box.__vue__.$forceUpdate?.();  // 强制刷新 UI
                    lastStatus = current;
                    console.log("cmcc_ydqn.js：已强制 orderStatus=0，按钮变红");
                }
            }
        } catch (e) {
            // 忽略错误
        }
    }, 50);  // 50ms 轮询，点击卡片秒红
})();
`;

body += "\n\n" + inject;
$done({ body });