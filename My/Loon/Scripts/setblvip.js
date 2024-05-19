/*
脚本作者：
脚本日期：
引用地址：
*/
var headers = $request['headers'];
delete headers["Authorization"];
delete headers["User-Agent"];
const blvip = JSON.parse($.getEnv('blvip'));
// headers['buvid'] = $persistentStore.read("Bilibili_buvid");
// headers['authorization'] = blvip['Authorization'];
// headers['user-agent'] = blvip['User-Agent'];
headers['authorization'] = "identify_v1 f9ac921ff9edba94386c8f3eef3eec51CjCaD7KJdpTiqnZDUxHoLglrYAU7W9aGIVeVWoK1dA_pA2zGwbC4I61WMFj3sU7PTE8SVnFmUmE3WFhPYWQwY2VUZzB1SkpVZFJKdnFFVXFTMkRFN3ZlZXpQdU9hMFRFV1h6dnZ6OEUwYW5hbjM5T2cxU1d4UUFmRE12NFlQc09UT2xwMmRqY25BIIEC";
headers['user-agent'] = 'bili-blue/77800100 os/ios model/iPhone 15 Pro mobi_app/iphone_b osVer/17.5 network/2 grpc-objc-cronet/1.47.0 grpc-c/25.0.0 (ios; cronet_http)';
$done({ 'headers': headers });