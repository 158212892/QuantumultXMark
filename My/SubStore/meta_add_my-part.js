function main(config) {
  // 自定义规则
  const customRules = [
    "RULE-SET,myDirect,DIRECT",
    "RULE-SET,myReject,REJECT",
    "RULE-SET,myProxy,FINAL"
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