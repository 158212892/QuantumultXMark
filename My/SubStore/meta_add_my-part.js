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
    enable: false
  };

  // ========== DNS ==========
  config.dns = {
    ...(config.dns || {}),
    enable: true,
    ipv6: true
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
    (n) => n.includes("AI"),                // 1) 大写 AI：Gpt-AI / AI / AI节点
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

  // ========== 3. 自定义规则（与原 YAML 顺序一致）==========
  const customRules = [
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

  // ========== 4. 规则集 ==========
  const baseProvider = {
    type: "http",
    interval: 86400,
    behavior: "classical",
    format: "text"
  };

  config["rule-providers"] = {
    ...(config["rule-providers"] || {}),

    // 自定义规则
    myDirect: {
      type: "http",
      interval: 86400,
      behavior: "domain",
      path: "./rule_set/myDirect.list",
      format: "text",
      url: "https://ghfast.top/https://github.com/158212892/QuantumultXMark/raw/main/My/RuleSet/myDirect.list"
    },
    myReject: {
      type: "http",
      interval: 86400,
      behavior: "domain",
      path: "./rule_set/myReject.list",
      format: "text",
      url: "https://ghfast.top/https://github.com/158212892/QuantumultXMark/raw/main/My/RuleSet/myReject.list"
    },
    myProxy: {
      type: "http",
      interval: 86400,
      behavior: "domain",
      path: "./rule_set/myProxy.list",
      format: "text",
      url: "https://ghfast.top/https://github.com/158212892/QuantumultXMark/raw/main/My/RuleSet/myProxy.list"
    },

    // AppleAI
    AppleAI: {
      ...baseProvider,
      path: "./rule_set/AppleAI.list",
      url: "https://ghfast.top/https://raw.githubusercontent.com/ddgksf2013/Filter/refs/heads/master/AppleIntelligence.list"
    },
    // 网盘点播
    PanVod: {
      ...baseProvider,
      path: "./rule_set/PanVod.list",
      url: "https://ghfast.top/https://raw.githubusercontent.com/eulac-dev/Proxy/refs/heads/main/Shadowrocket/Rules/PanVod.list"
    },
    // 资源站
    ResourceSite: {
      ...baseProvider,
      path: "./rule_set/ResourceSite.list",
      url: "https://ghfast.top/https://raw.githubusercontent.com/eulac-dev/Proxy/refs/heads/main/Shadowrocket/Rules/ResourceSite.list"
    },
    ResourceSite1: {
      ...baseProvider,
      path: "./rule_set/ResourceSite1.list",
      url: "https://ghfast.top/https://github.com/158212892/QuantumultXMark/raw/refs/heads/main/My/RuleSet/ResourceSite1.list"
    }
  };

  return config;
}