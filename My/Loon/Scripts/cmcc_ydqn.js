// Loon 插件 JS - 基于文档 script-response-body 示例
// 拦截 JS 响应，注入 Vue 修改代码（orderStatus=0 + 强制弹窗）

let body = $response.body;

// 只处理 JS 响应
if (!body || typeof body !== 'string') {
    $done({});
    return;
}

const injectCode = `
// === Loon 插件注入（等同浏览器控制台） ===
(function() {
    'use strict';
    setTimeout(() => {
        const root = document.querySelector('.shellUnionMemberBox');
        if (!root || !root.__vue__) {
            console.log('Loon: Vue 未加载，重试...');
            return setTimeout(arguments.callee, 1000);  // 文档建议：重试机制
        }
        const vm = root.__vue__;

        // 核心：你的控制台代码
        vm.orderStatus = 0;
        console.log('Loon 已强制改为可订购状态 (orderStatus=0)');

        // 增强：覆盖 orderNow 确保弹窗
        vm.orderNow = function() {
            if (window.l && l.a && typeof l.a.getRightsToken === 'function' && !l.a.getRightsToken()) {
                this.productUrl?.pageTo?.('/loginRights');
                return;
            }
            this.showConfirmWindow = true;
            this.getERMsg?.();
            this.userCode = null;
            this.smsCodeText = '点击获取验证码';
            console.log('Loon: 订购确认窗已弹出');
        };

        // 自动勾选（可选，提升体验）
        setTimeout(() => { if (!vm.checked) vm.checked = true; }, 500);

        console.log('Loon 插件注入完成！');
    }, 2000);  // 你的原始延迟
})();
// === 注入结束 ===
`;

// 追加到 JS 文件末尾（webpack 兼容，文档示例类似）
body += '\n\n' + injectCode;

$done({ body });