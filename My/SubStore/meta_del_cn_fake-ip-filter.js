function main(config) {
  // 优先处理标准位置：dns.fake-ip-filter
  if (config.dns && Array.isArray(config.dns["fake-ip-filter"])) {
    config.dns["fake-ip-filter"] = config.dns["fake-ip-filter"].filter(item => {
      return item !== "geosite:cn" && item !== "rule-set:cn";
    });
  }
  
  return config;
}