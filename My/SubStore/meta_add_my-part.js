function main(config) {
  // ========== 全局配置 ==========
  Object.assign(config, {
    mode: "rule",
    "mixed-port": 7890,
    udp: true,
    ipv6: true,
    "allow-lan": true,
    "skip-auth-prefixes": [
      "127.0.0.1/8",
      "::1/128",
      "192.168.1.0/24",
      "192.168.31.0/24",
      "192.168.100.0/24",
      "172.23.0.0/16",
      "172.17.0.0/16",
      "172.18.0.0/16",
      "172.19.0.0/16",
      "192.168.8.0/24"
    ],
    "external-controller": "127.0.0.1:9090",
    secret: "",
    "external-ui": "ui",
    "external-ui-url": "https://github.com/Zephyruso/zashboard/releases/latest/download/dist-no-fonts.zip"
  });
  // ========== TUN ==========
  config.tun = {
    ...(config.tun || {}),
    enable: false,
    stack: "mips"
  };
  // ========== DNS ==========
  config.dns = {
    ...(config.dns || {}),
    enable: true,
    ipv6: true
  };

  // ========== 规则集基础模板（已修正 behavior: ipcidr，mihomo 内核标准值） ==========
  // classical：支持完整规则行 DOMAIN‑SUFFIX / DOMAIN‑KEYWORD / IP‑CIDR 混合
  const baseProviderClassical = {
    type: "http",
    interval: 86400,
    behavior: "classical",
    format: "text"
  };
  // domain：仅纯域名/后缀列表，不带规则前缀，性能最优
  const baseProviderDomain = {
    type: "http",
    interval: 86400,
    behavior: "domain",
    format: "text"
  };
  // ipcidr：仅纯IP‑CIDR网段列表，不带 IP‑CIDR, 前缀；⚠️内核字段为 ipcidr（无横杠）
  const baseProviderIpcidr = {
    type: "http",
    interval: 86400,
    behavior: "ipcidr",
    format: "text"
  };

  // ========== 策略组工具 ==========
  const groups = Array.isArray(config["proxy-groups"]) ? config["proxy-groups"] : [];
  // 把内置出口/关键字排除，避免误命中
  const RESERVED = ["DIRECT", "REJECT", "PASS", "COMPATIBLE"];
  function isUsableName(name) {
    return typeof name === "string" && name.trim() !== "" && !RESERVED.includes(name);
  }
  // 按关键字列表顺序（不区分大小写）返回第一个命中的策略组名
  function matchGroupByKeywords(keywords) {
    for (const kw of keywords) {
      const lower = kw.toLowerCase();
      const hit = groups.find(g => isUsableName(g.name) && g.name.toLowerCase().includes(lower));
      if (hit) return hit.name;
    }
    return null;
  }
  // ========== 1. 兜底策略组（myProxy 出口）==========
  const fallbackKeywords = [
    "默认",
    "剩余",
    "其他",
    "自动",
    "漏网",
    "兜底",
    "default",
    "catch-all",
    "others",
    "auto",
    "fallback",
    "final"
  ];
  // 找不到兜底组时退化为 DIRECT，避免返回不存在的 "FINAL"
  const proxyTarget = matchGroupByKeywords(fallbackKeywords) || "DIRECT";
  // ========== 2. AppleAI 出口（AI / 美国 / US 多关键字逐级匹配）==========
  // 注意：这里判断 "AI" 用区分大小写的 includes，避免 "Tailscale" 这类含 ai 子串的组被误判
  const aiMatchers = [
    (n) => n.includes("AI"),                // 1) 大写 AI：Gpt‑AI / AI / AI节点
    (n) => n.includes("人工智能"),
    (n) => n.includes("GPT") || n.includes("gpt"),
    (n) => n.includes("美国"),              // 2) 中文「美国」
    (n) => /\bUS\b/i.test(n) || n.includes("US"), // 3) US / 🇺🇸 US
    (n) => n.includes("🇺🇸")
  ];
  let aiTarget = null;
  for (const matcher of aiMatchers) {
    const hit = groups.find(g => isUsableName(g.name) && matcher(g.name));
    if (hit) {
      aiTarget = hit.name;
      break;
    }
  }
  // 全部没命中时，回退到兜底组，保证规则出口一定有效
  if (!aiTarget) aiTarget = proxyTarget;
  // ========== 3. 自定义规则 ==========
  const customRules = [
    // 影视爬虫与播放源专属分流
    "RULE-SET,vod_direct_rule,DIRECT",
    `RULE-SET,vod_proxy_rule,${proxyTarget}`,
    "RULE-SET,myDirect,DIRECT",
    "RULE-SET,myReject,REJECT",
    `RULE-SET,myProxy,${proxyTarget}`,
    `RULE-SET,AppleAI,${aiTarget}`,
    "RULE-SET,PanVod,DIRECT",
    "RULE-SET,ResourceSite,DIRECT",
    "RULE-SET,ResourceSite1,DIRECT"
  ];
  const existRules = (config.rules || []).filter(r => !customRules.includes(String(r)));
  config.rules = [...customRules, ...existRules];

  // ========== 4. 规则集 path 全部统一为 ./rule_set/ 目录，url带 ghfast.top镜像 ==========
  config["rule-providers"] = {
    ...(config["rule-providers"] || {}),
    // 新增：影视vod规则集
    vod_direct_rule: {
      ...baseProviderClassical,
      url: "https://ghfast.top/https://raw.githubusercontent.com/GodLike631/Shadow-Rocket/refs/heads/main/hdys_vod_direct.yaml",
      path: "./rule_set/hdys_vod_direct.yaml"
    },
    vod_proxy_rule: {
      ...baseProviderClassical,
      url: "https://ghfast.top/https://raw.githubusercontent.com/GodLike631/Shadow-Rocket/refs/heads/main/hdys_vod_proxy.yaml",
      path: "./rule_set/hdys_vod_proxy.yaml"
    },
    // 自定义规则‑domain类型
    myDirect: {
      ...baseProviderDomain,
      path: "./rule_set/myDirect.list",
      url: "https://ghfast.top/https://github.com/158212892/QuantumultXMark/raw/main/My/RuleSet/myDirect.list"
    },
    myReject: {
      ...baseProviderDomain,
      path: "./rule_set/myReject.list",
      url: "https://ghfast.top/https://github.com/158212892/QuantumultXMark/raw/main/My/RuleSet/myReject.list"
    },
    myProxy: {
      ...baseProviderDomain,
      path: "./rule_set/myProxy.list",
      url: "https://ghfast.top/https://github.com/158212892/QuantumultXMark/raw/main/My/RuleSet/myProxy.list"
    },
    // AppleAI classical
    AppleAI: {
      ...baseProviderClassical,
      path: "./rule_set/AppleAI.list",
      url: "https://ghfast.top/https://raw.githubusercontent.com/ddgksf2013/Filter/refs/heads/master/AppleIntelligence.list"
    },
    // 网盘点播 classical
    PanVod: {
      ...baseProviderClassical,
      path: "./rule_set/PanVod.list",
      url: "https://ghfast.top/https://raw.githubusercontent.com/eulac-dev/Proxy/refs/heads/main/Shadowrocket/Rules/PanVod.list"
    },
    // 资源站 classical
    ResourceSite: {
      ...baseProviderClassical,
      path: "./rule_set/ResourceSite.list",
      url: "https://ghfast.top/https://raw.githubusercontent.com/eulac-dev/Proxy/refs/heads/main/Shadowrocket/Rules/ResourceSite.list"
    },
    ResourceSite1: {
      ...baseProviderClassical,
      path: "./rule_set/ResourceSite1.list",
      url: "https://ghfast.top/https://github.com/158212892/QuantumultXMark/raw/refs/heads/main/My/RuleSet/ResourceSite1.list"
    }
  };

  return config;
}