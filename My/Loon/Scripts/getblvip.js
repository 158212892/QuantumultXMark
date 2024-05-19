const config = {
	headers: {}
  };
  
  config.headers = $request.headers;
  var nessary_headers = {};
  // nessary_headers.buvid = config.headers.buvid;
  nessary_headers.Authorization = config.headers.Authorization !== undefined ? config.headers.Authorization : config.headers.authorization;
  nessary_headers['User-Agent'] = config.headers['User-Agent'] != undefined ? config.headers['User-Agent'] : config.headers['user-agent'];

let blvip = JSON.stringify(nessary_headers);
$.setdata(blvip, 'blvip');
console.log(blvip);
  $notification.post("BiliBili Cookie获取", "获取成功", JSON.stringify(nessary_headers));
  $done({});