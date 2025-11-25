// Loon 插件专用 - 强制修改 orderStatus + 覆盖 orderNow
// 完美等价于浏览器控制台那行代码，且更强

let body = $response.body;

// 只处理 JS 文件
if (!body || !$response.headers?.['Content-Type']?.includes('javascript')) {
    $done({});
}

const injectCode = `
// === Loon 插件注入代码开始 ===
setTimeout(() => {
    const root = document.querySelector('.shellUnionMemberBox');
    if (!root || !root.__vue__) {
        console.log("Loon: Vue 未加载，1秒后重试...");
        setTimeout(arguments.callee, 1000);
        return;
    }

    const vm = root.__vue__;

    // 1. 强制改为可订购状态（你最想要的这行）
    if (vm.orderStatus !== undefined) {
        vm.orderStatus = 0;
        console.log("Loon 成功：orderStatus 已强制为 0");
    }

    // 2. 彻底覆盖点击事件，任何时间点都能弹出订购确认窗
    vm.orderNow = function () {
        console.log("Loon: orderNow 被调用");

        // 登录检查（保留原逻辑）
        if (window.l && l.a && typeof l.a.getRightsToken === "function" && !l.a.getRightsToken()) {
            this.productUrl?.pageTo?.("/loginRights");
            return;
        }

        this.showConfirmWindow = true;
        this.getERMsg?.();
        this.userCode = null;
        this.smsCodeText = "点击获取验证码";
        console.log("Loon 成功：订购确认窗已强制弹出");
    };

    // 自动勾选协议
    setTimeout(() => {
        if (!vm.checked) vm.checked = true;
    }, 600);

    console.log("Loon 插件已完全激活！按钮现在随时可点");
}, 1500);
// === Loon 插件注入代码结束 ===
`;

// 把代码追加到原 JS 文件最下面（webpack 打包的 JS 允许追加）
body += "\n\n" + injectCode;

$done({ body });