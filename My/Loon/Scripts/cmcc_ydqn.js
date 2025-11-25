// 四川移动请你 - 接口重写版：直接改 queryRecevie 返回的 orderStatus = 0
let body = $response.body;

try {
    let obj = JSON.parse(body);

    // 强制改状态为可领（0 = 未领取可领，13 也行）
    if (obj.data && obj.data.hasOwnProperty('orderStatus')) {
        obj.data.orderStatus = 0;
        console.log("Loon成功：接口返回 orderStatus 已强制改为 0");
    }

    // 可选：额外保险，有些字段也影响按钮显示
    if (obj.data) {
        obj.data.isOrder = false;        // 未订购
        obj.data.activityStatus = 1;     // 活动中（1=进行中）
        obj.data.recevieStatus = 0;      // 可领取
    }

    // 可选：直接把整个权益设为“可领取”状态
    if (obj.data && obj.data.rightsList) {
        obj.data.rightsList.forEach(item => {
            item.orderStatus = 0;
            item.isOrder = false;
        });
    }

    body = JSON.stringify(obj);
} catch (e) {
    console.log("Loon警告：JSON解析失败，跳过修改", e);
}

$done({ body });