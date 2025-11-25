// ==UserScript==
// @name         四川移动权益自动可领（优化纯净版）
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  自动将 orderStatus 强制改为 0，使所有权益卡可点击领取（纯净版，不修改其他逻辑）
// @author       互联网好心人 + GPT
// @match        https://www.hsh.139sc.com/h5mall/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    /** 尝试将 orderStatus 改为 0 */
    function patchStatus() {
        try {
            const el = document.querySelector('.shellUnionMemberBox');
            if (!el || !el.__vue__) return;

            const vm = el.__vue__;
            if (vm.hasOwnProperty('orderStatus') && vm.orderStatus !== 0) {
                vm.orderStatus = 0;
                console.log('[权益补丁] 已将 orderStatus 修正为 0');
            }
        } catch (e) {}
    }

    /** 每 300ms 检查一次，避免频繁占用 CPU */
    const timer = setInterval(patchStatus, 300);

    /** 页面结构变更时再次尝试（轻量级观察） */
    const observer = new MutationObserver(() => patchStatus());
    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });

})();