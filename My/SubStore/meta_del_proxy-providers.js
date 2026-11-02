function main(config) {
    // 直接清空整个 proxy-providers 对象（全部删除）
    if (config["proxy-providers"]) {
        delete config["proxy-providers"];
    }
    return config;
}