const config = {
  headers: {}
};

config.headers = $request.headers;
var nessary_headers = {};
// nessary_headers.buvid = config.headers.buvid;
nessary_headers.Authorization = config.headers.Authorization !== undefined ? config.headers.Authorization : config.headers.authorization;
nessary_headers['User-Agent'] = config.headers['User-Agent'] != undefined ? config.headers['User-Agent'] : config.headers['user-agent'];

// $persistentStore.write(nessary_headers.buvid, "Bilibili_buvid");
$persistentStore.write(nessary_headers.Authorization, "Bilibili_Authorization");
$persistentStore.write(nessary_headers['User-Agent'], "Bilibili_User-Agent");

$notification.post("BiliBili Cookie获取", "获取&存储成功", JSON.stringify(nessary_headers));
$done({});