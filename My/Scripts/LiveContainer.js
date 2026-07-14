// 身份校验：如果响应体不是我们预期的 JSON 结构，直接跳过处理
if (!$response.body || !$response.body.includes("com.livecontainer.source.nightly")) {
    $done({ body: $response.body });
    return;
}

const targetIpa = "https://github.com/LiveContainer/LiveContainer/releases/download/nightly/LiveContainer+SideStore.ipa";

let body = JSON.parse($response.body);

if (body.apps && body.apps.length > 0) {
    body.apps[0].name = "LC+SideStore (nightly)";
    body.apps[0].downloadURL = targetIpa;
    body.apps[0].versions[0].downloadURL = targetIpa

}

$done({ body: JSON.stringify(body) });