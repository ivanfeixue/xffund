export async function onRequest(context) {
  var H = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };
  if (context.request.method === "OPTIONS") return new Response(null, { headers: H });

  var url = new URL(context.request.url);
  var code = url.searchParams.get("code");
  var size = parseInt(url.searchParams.get("size") || "30");
  if (!code || !/^\d{6}$/.test(code)) {
    return new Response(JSON.stringify({ error: "无效代码" }), { status: 400, headers: H });
  }
  size = Math.min(Math.max(size, 5), 90);

  var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36";

  try {
    var r = await fetch("https://api.fund.eastmoney.com/f10/lsjz?fundCode=" + code + "&pageIndex=1&pageSize=" + size, {
      headers: { "User-Agent": UA, "Referer": "https://fundf10.eastmoney.com/" }
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    var j = await r.json();
    if (!j.Data || !j.Data.LSJZList) throw new Error("无数据");

    var result = {};
    // 倒序排列（从旧到新）
    var list = j.Data.LSJZList.slice().reverse();
    list.forEach(function(item) {
      result[item.FSRQ] = parseFloat(item.DWJZ);
    });

    return new Response(JSON.stringify(result), { headers: H });
  } catch(e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: H });
  }
}
