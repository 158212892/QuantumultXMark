function main(config, $arguments, scriptUrl) {
    const DEFAULT_AUTH_KEY = "";
    const DEFAULT_TS_DISABLE = "false";

    // 解析远程脚本 #hash 参数
    let hashArgs = {};
    if (scriptUrl && scriptUrl.includes("#")) {
        const hashStr = scriptUrl.split("#")[1];
        new URLSearchParams(hashStr).forEach((v, k) => {
            hashArgs[k] = v;
        });
    }

    // 真实可用优先级：$arguments(面板) > hash(#) > 默认值
    const userAuthKey = ($arguments?.ts_authkey ?? "").trim() || (hashArgs.ts_authkey ?? "").trim() || DEFAULT_AUTH_KEY;
    const tsDisableRaw = ($arguments?.ts_disable ?? "").trim() || (hashArgs.ts_disable ?? "").trim() || DEFAULT_TS_DISABLE;
    const tsDisable = tsDisableRaw.toLowerCase() === "true";

    if (tsDisable) {
        console.log("[Inject] ts_disable=true，跳过 Tailscale 注入");
        return config;
    }

    const tsProxyItem = {
        name: "ts-node",
        type: "tailscale",
        "auth-key": userAuthKey,
        ephemeral: false
    };

    const tsGroupItem = {
        name: "Tailscale",
        type: "select",
        proxies: ["ts-node", "DIRECT"],
        "ssid-policy": {
            "GL-MT6000-581": "DIRECT",
            "GL-MT6000-581-5G": "DIRECT",
            "default": "ts-node",
            "cellular": "ts-node"
        }
    };
    const tsRuleItem = "IP-CIDR,192.168.1.0/24,Tailscale,no-resolve";

    if (!Array.isArray(config.proxies)) config.proxies = [];
    if (!Array.isArray(config["proxy-groups"])) config["proxy-groups"] = [];
    if (!Array.isArray(config.rules)) config.rules = [];

    config.proxies = config.proxies.filter(p => p.name !== tsProxyItem.name);
    config.proxies.unshift(tsProxyItem);

    config["proxy-groups"] = config["proxy-groups"].filter(g => g.name !== tsGroupItem.name);
    config["proxy-groups"].unshift(tsGroupItem);

    config.rules = config.rules.filter(r => r !== tsRuleItem);
    config.rules.unshift(tsRuleItem);

    console.log("[Inject] Tailscale injected, auth‑key len:", userAuthKey.length);
    return config;
}
