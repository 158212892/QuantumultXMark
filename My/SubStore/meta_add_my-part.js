
function main(config) {
  const groups = config["proxy-groups"] || [];

  // 动态查找兜底策略组（不区分大小写）
  const keywords = [
    "final",
    "fallback",
    "default",
    "catch-all",
    "others",
    "兜底",
    "漏网",
    "默认",
    "剩余",
    "其他",
    "全局",
    "自动",
    "auto"
  ];

  let proxyTarget = "FINAL";

  for (const keyword of keywords) {
    const matched = groups.find(group =>
      typeof group.name === "string" &&
      group.name.toLowerCase().includes(keyword.toLowerCase())
    );

    if (matched) {
      proxyTarget = matched.name;
      break;
    }
  }

  // 自定义规则
  const customRules = [
    "RULE-SET,myDirect,DIRECT",
    "RULE-SET,myReject,REJECT",
    `RULE-SET,myProxy,${proxyTarget}`
  ];

  config.rules = [
    ...customRules,
    ...(config.rules || [])
  ];

  // 自定义规则集
  config["rule-providers"] = {
    ...(config["rule-providers"] || {}),

    myDirect: {
      type: "http",
      interval: 86400,
      behavior: "classical",
      path: "./rule_set/myDirect.list",
      format: "text",
      url: "https://ghfast.top/https://github.com/158212892/QuantumultXMark/raw/main/My/RuleSet/myDirect.list"
    },

    myReject: {
      type: "http",
      interval: 86400,
      behavior: "classical",
      path: "./rule_set/myReject.list",
      format: "text",
      url: "https://ghfast.top/https://github.com/158212892/QuantumultXMark/raw/main/My/RuleSet/myReject.list"
    },

    myProxy: {
      type: "http",
      interval: 86400,
      behavior: "classical",
      path: "./rule_set/myProxy.list",
      format: "text",
      url: "https://ghfast.top/https://github.com/158212892/QuantumultXMark/raw/main/My/RuleSet/myProxy.list"
    }
  };

  return config;
}
