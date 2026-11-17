
function main(config) {
  // Stash兼容
  const groups = config["proxy-groups"] || [];

  for (const group of groups) {
    if (group.type === "load-balance") {
      group.strategy = "consistent-hashing";
    }

    // 将不兼容的 PASS 替换为 DIRECT
    if (Array.isArray(group.proxies)) {
      group.proxies = group.proxies.map(proxy =>
        proxy === "PASS" ? "DIRECT" : proxy
      );
    }
  }

  return config;
}
