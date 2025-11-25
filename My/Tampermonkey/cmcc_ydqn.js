// ==UserScript==
// @name         四川移动请你权益随时领（纯净版）
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  只改 orderStatus=0，啥都不碰，点击任意权益卡都可领
// @author       互联网好心人
// @match        https://www.hsh.139sc.com/h5mall/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';
    setInterval(() => {
        try {
            const box = document.querySelector('.shellUnionMemberBox');
            if (box && box.__vue__ && box.__vue__.hasOwnProperty('orderStatus') && box.__vue__.orderStatus !== 0) {
                box.__vue__.orderStatus = 0;
            }
        } catch(e) {}
    }, 100);
})();