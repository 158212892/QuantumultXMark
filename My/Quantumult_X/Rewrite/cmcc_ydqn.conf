// Quantumult X 重写注入脚本 - 中国移动请你无忧行权益强制可领
if ($response.body) {
  let body = $response.body;
  // 防止被压缩后找不到，强制加个标记让 Vue 重新执行
  if (body.includes('shellUnionMemberBox') || body.includes('orderStatus')) {
    const script = `
      <script>
      setTimeout(() => {
        const app = document.querySelector('.shellUnionMemberBox') || document.querySelector('#app');
        if (!app || !app.__vue__) return setTimeout(arguments.callee, 500);
        const vm = app.__vue__;
        
        // 强制改状态为可订购
        if (vm.hasOwnProperty('orderStatus')) vm.orderStatus = 0;
        if (vm.hasOwnProperty('isOrder')) vm.isOrder = false;

        // 强制覆盖点击事件
        vm.orderNow = function() {
          if (window.l && l.a && typeof l.a.getRightsToken === 'function' && !l.a.getRightsToken()) {
            this.productUrl?.pageTo?.("/loginRights");
            return;
          }
          this.showConfirmWindow = true;
          this.getERMsg?.();
          this.userCode = null;
          this.smsCodeText = "点击获取验证码";
          console.log("Quantumult X 已强制弹出订购窗");
        };

        // 自动勾选协议
        setTimeout(() => { if (vm.checked !== true) vm.checked = true; }, 800);
        console.log("Quantumult X 无忧行权益已激活！");
      }, 1000);
      </script>
    `;
    if (body.includes('</body>')) {
      body = body.replace('</body>', script + '</body>');
    } else {
      body += script;
    }
  }
  $done({ body });
}