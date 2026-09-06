！// Tailscale inject script for Sub‑Store File‑Manager Script‑Action
// Usage: xxx/tailscale.js#ts_authkey=tskey-auth-xxxx&ts_disable=1
function main(config, args, scriptUrl) {
    const DEFAULT_AUTH_KEY = "";
    const DEFAULT_TS_DISABLE = "0";

    // 解析 #hash 参数，与 shiteThings 模板逻辑完全一致
    const hashParam = {};
    if (typeof scriptUrl === "string" && scriptUrl.includes("#")) {
        const hashContent = scriptUrl.split("#")[1];
        new URLSearchParams(hashContent).forEach((val, key) => {
            hashParam[key] = val;
        });
    }

    // 读取参数：hash > 默认值
    const inputAuthKey = (hashParam.ts_authkey ?? "").trim() || DEFAULT_AUTH_KEY;
    const inputDisableFlag = (hashParam.ts_disable ?? "").trim() || DEFAULT_TS_DISABLE;
    // 1 = 禁用注入，0 = 启用注入（默认0）
    const TS_DISABLE = inputDisableFlag === "1";

    if (TS_DISABLE) {
        console.log("[Inject] ts_disable=1，跳过 Tailscale 注入");
        return config;
    }

    const tsProxy = {
        name: "ts-node",
        type: "tailscale",
        "auth-key": inputAuthKey,
        ephemeral: false
    };

    const tsGroup = {
        name: "Tailscale",
        type: "select",
        proxies: ["ts-node", "DIRECT"],
        "ssid-policy": {
            "GL-MT6000-581": "DIRECT",
            "GL-MT6000-581-5G": "DIRECT",
            "default": "ts-node",
            "cellular": "ts-node",
        icon: "https://cdn.jsdelivr.net/gh/dkaser/unraid-tailscale/logo.png"
        }
    };

    const tsRule = "IP-CIDR,192.168.1.0/24,Tailscale,no-resolve";

    // 数组兜底初始化
    if (!Array.isArray(config.proxies)) config.proxies = [];
    if (!Array.isArray(config["proxy-groups"])) config["proxy-groups"] = [];
    if (!Array.isArray(config.rules)) config.rules = [];

    // 删除旧项，向前插入，避免重复
    config.proxies = config.proxies.filter(item => item.name !== tsProxy.name);
    config.proxies.unshift(tsProxy);

    config["proxy-groups"] = config["proxy-groups"].filter(item => item.name !== tsGroup.name);
    config["proxy-groups"].unshift(tsGroup);

    config.rules = config.rules.filter(r => r !== tsRule);
    config.rules.unshift(tsRule);

    console.log("[Inject] Finished, auth‑key length:", inputAuthKey.length);
    return config;
}