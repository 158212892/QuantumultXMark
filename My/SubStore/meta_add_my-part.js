
function main(config) {
  // 全局配置
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

  // TUN 配置
  config.tun = {
    ...(config.tun || {}),
    enable: false
  };

  // DNS 配置
  config.dns = {
    ...(config.dns || {}),
    enable: true,
    ipv6: true
  };

  // 自定义代理节点
  // proxies:
  //   - name: ts-node
  //     type: tailscale
  //     auth-key: ""
  //     udp: true

  // 自定义策略组
  // proxy-groups:
  //   - name: Tailscale
  //     type: select
  //     proxies:
  //       - ts-node
  //       - DIRECT

  // 动态识别兜底策略组
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

  const groups = config["proxy-groups"] || [];

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
