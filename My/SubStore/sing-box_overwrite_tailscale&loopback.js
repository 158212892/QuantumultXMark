// sub‑store 模板脚本: inject‑tailscale‑to‑final‑json.js
// 仅用于流水线【模板脚本】，禁止用作快捷脚本
// 参数: auth_key 填入tailscale auth key
log(`🚀 Tailscale前置注入(成品JSON)开始`)
const parser = ProxyUtils.JSON5 || JSON
const { auth_key } = $arguments || {}

// 拦截空输入
if (!$content || typeof $content !== "string" || $content.trim() === "") {
    throw new Error("❌输入$content为空！请放在流水线模板脚本中使用，不可直接运行快捷脚本；上游需要输出完整sing‑box JSON")
}

let config
try {
    config = parser.parse($content)
} catch (e) {
    log(`原始输入片段(前200字符): ${$content.slice(0,200)}`)
    log(`解析报错: ${e.message ?? e}`)
    throw new Error(`❌输入不是合法JSON/JSON5，原始解析错误：${e.message}`)
}

// ========== Tailscale配置片段，auth_key由参数传入 ==========
const tailscaleEndpoint = {
    "type": "tailscale",
    "tag": "ts-ep",
    "auth_key": auth_key || "",
    "accept_routes": true,
    "ssh_server": true
}

if (!auth_key) {
    log(`⚠️ 未传入auth_key参数，请在模板参数增加 &auth_key=你的key`)
} else {
    log(`✅ 使用传入的auth_key`)
}

const tailscaleDnsServer = {
    "type": "tailscale",
    "tag": "ts-dns",
    "endpoint": "ts-ep",
    "accept_search_domain": true
}

const tailscaleDnsRule = {
    "preferred_by": "ts-dns",
    "server": "ts-dns"
}

const tailscaleRouteRule = {
    "preferred_by": "ts-ep",
    "outbound": "ts-ep"
}
// =====================================

// endpoints 头部插入
if (!Array.isArray(config.endpoints)) config.endpoints = []
const epIdx = config.endpoints.findIndex(e => e.tag === "ts-ep")
if (epIdx > -1) config.endpoints.splice(epIdx, 1)
config.endpoints.unshift(tailscaleEndpoint)
log(`✅ ts‑ep 插入 endpoints 头部`)

// dns.servers 头部插入
if (!config.dns) config.dns = {}
if (!Array.isArray(config.dns.servers)) config.dns.servers = []
const dnsSrvIdx = config.dns.servers.findIndex(s => s.tag === "ts-dns")
if (dnsSrvIdx > -1) config.dns.servers.splice(dnsSrvIdx, 1)
config.dns.servers.unshift(tailscaleDnsServer)
log(`✅ ts‑dns 插入 dns.servers 头部`)

// dns.rules 头部插入
if (!Array.isArray(config.dns.rules)) config.dns.rules = []
const dnsRuleIdx = config.dns.rules.findIndex(r => r.server === "ts-dns")
if (dnsRuleIdx > -1) config.dns.rules.splice(dnsRuleIdx, 1)
config.dns.rules.unshift(tailscaleDnsRule)
log(`✅ ts‑dns rule 插入 dns.rules 头部`)

// route.rules 头部插入
if (!config.route) config.route = {}
if (!Array.isArray(config.route.rules)) config.route.rules = []
const routeIdx = config.route.rules.findIndex(r =>
    r.outbound === "ts-ep" && r.preferred_by === "ts-ep"
)
if (routeIdx > -1) config.route.rules.splice(routeIdx, 1)
config.route.rules.unshift(tailscaleRouteRule)
log(`✅ tailscale route规则插入 route.rules 头部`)

// ========= 新增：给TUN inbound注入 loopback_address =========
if (Array.isArray(config.inbounds)) {
    let tunCount = 0
    for (const inbound of config.inbounds) {
        if (inbound.type === "tun") {
            inbound.loopback_address = "10.7.0.1"
            tunCount++
        }
    }
    if (tunCount > 0) {
        log(`✅ 已为 ${tunCount} 个TUN入站设置 loopback_address="10.7.0.1"`)
    } else {
        log(`ℹ️ 未找到任何TUN inbound，跳过loopback_address注入`)
    }
} else {
    log(`ℹ️ 配置无inbounds数组，跳过loopback_address注入`)
}

$content = JSON.stringify(config, null, 2)

function log(v) {
    console.log(`[📦 inject‑ts‑final] ${v}`)
}
log(`🔚 脚本执行完成`)
