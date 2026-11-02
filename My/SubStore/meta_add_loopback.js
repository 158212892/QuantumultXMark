function main(config) {
    if (!config.tun) {
        config.tun = {};
    }
    config.tun["loopback-address"] = [
        "10.7.0.1"
    ];
    return config;
}