// Quantumult X 脚本头部声明（非必须，但推荐）
// By @QX-Script
// 作用：修改云存储类型

// 1. 获取原始响应体
var body = $response.body;

try {
    // 2. 将字符串解析为 JSON 对象
    var obj = JSON.parse(body);

    // 3. 核心逻辑：查找并修改字段
    // 检查数据结构是否存在，防止报错
    if (obj.data && 
        obj.data.cloud_storage_info && 
        obj.data.cloud_storage_info.cloud_storage_type === 9001) {
        
        // 打印日志（可在 QX 日志中查看）
        console.log("🔍 Quantumult X 拦截成功");
        console.log("🔄 原值:", obj.data.cloud_storage_info.cloud_storage_type);
        
        // 执行修改
        obj.data.cloud_storage_info.cloud_storage_type = 4;
        
        console.log("✅ 新值:", obj.data.cloud_storage_info.cloud_storage_type);
    }

    // 4. 将修改后的对象转回字符串
    body = JSON.stringify(obj);

} catch (e) {
    // 捕获 JSON 解析错误
    console.log("❌ 脚本错误:", e.message);
    // 如果出错，保持原响应不变
}

// 5. 必须调用 $done() 结束脚本并回传数据
// 如果不传 body，QX 会使用原始响应
$done({body: body});
