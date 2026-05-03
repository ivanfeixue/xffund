export async function onRequest(context) {
  var H = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };
  if (context.request.method === "OPTIONS") return new Response(null, { headers: H });

  var url = new URL(context.request.url);
  var code = (url.searchParams.get("code") || "").trim();
  var size = parseInt(url.searchParams.get("size") || "60");
  if (size > 500) size = 500;

  if (!code || !/^\d{6}$/.test(code)) {
    return new Response(JSON.stringify({ error: "invalid code" }), { status: 400, headers: H });
  }

  var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36";

  try {
    var r = await fetch("https://api.fund.eastmoney.com/f10/lsjz?fundCode=" + code + "&pageIndex=1&pageSize=" + size, {
      headers: { "User-Agent": UA, "Referer": "https://fundf10.eastmoney.com/" }
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    var j = await r.json();
    var navs = {};
    if (j.Data && j.Data.LSJZList) {
      j.Data.LSJZList.forEach(function(item) {
        navs[item.FSRQ] = parseFloat(item.DWJZ);
      });
    }
    return new Response(JSON.stringify(navs), { headers: H });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 502, headers: H });
  }
}
