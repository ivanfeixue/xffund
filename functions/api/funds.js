export async function onRequest(context) {
  var H = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };
  if (context.request.method === "OPTIONS") return new Response(null, { headers: H });

  var codes = (new URL(context.request.url).searchParams.get("codes") || "")
    .split(",").map(function(c){return c.trim()}).filter(function(c){return /^\d{6}$/.test(c)}).slice(0, 50);
  if (!codes.length) return new Response(JSON.stringify({ error: "无有效代码" }), { status: 400, headers: H });

  var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36";
  var results = {};

  // 批量查名称（只请求一次基金列表）
  var nameMap = {};
  try {
    var rName = await fetch("https://fund.eastmoney.com/js/fundcode_search.js", {
      headers: { "User-Agent": UA, "Referer": "https://fund.eastmoney.com/" }
    });
    if (rName.ok) {
      var tName = await rName.text();
      codes.forEach(function(code) {
        var m = tName.match(new RegExp('"' + code + '","[^"]*","([^"]*)"'));
        if (m && m[1]) nameMap[code] = m[1];
      });
    }
  } catch (e) {}

  // 批量获取净值（fundgz 主源，lsjz 备用），同时获取 prevNav
  await Promise.all(codes.map(function(code) {
    return fetch("https://fundgz.1234567.com.cn/js/" + code + ".js?rt=" + Date.now(), {
      headers: { "User-Agent": UA, "Referer": "https://fund.eastmoney.com/" }, redirect: "follow"
    }).then(function(r) { return r.text(); }).then(function(text) {
      var s = text.indexOf("{"), e = text.lastIndexOf("}");
      if (s >= 0 && e > s) {
        var d = JSON.parse(text.substring(s, e + 1));
        if (d.dwjz) {
          results[code] = {
            code: d.fundcode || code,
            name: d.name || nameMap[code] || "",
            nav: parseFloat(d.dwjz),
            navDate: d.jzrq || "",
            prevNav: null,
            prevNavDate: "",
            source: "fundgz"
          };
          return;
        }
      }
      throw new Error("parse");
    }).catch(function() {
      // 备用: lsjz，顺带取前一日净值
      return fetch("https://api.fund.eastmoney.com/f10/lsjz?fundCode=" + code + "&pageIndex=1&pageSize=2", {
        headers: { "User-Agent": UA, "Referer": "https://fundf10.eastmoney.com/" }
      }).then(function(r) { return r.json(); }).then(function(j) {
        if (j.Data && j.Data.LSJZList && j.Data.LSJZList.length > 0) {
          var l = j.Data.LSJZList;
          results[code] = {
            code: code,
            name: nameMap[code] || "",
            nav: parseFloat(l[0].DWJZ),
            navDate: l[0].FSRQ || "",
            prevNav: l.length >= 2 ? parseFloat(l[1].DWJZ) : null,
            prevNavDate: l.length >= 2 ? (l[1].FSRQ || "") : "",
            source: "lsjz"
          };
        }
      }).catch(function() {});
    });
  }));

  // 并发补充 prevNav（仅对 fundgz 成功的条目）
  var needPrev = codes.filter(function(c) {
    return results[c] && results[c].prevNav === null;
  });
  if (needPrev.length > 0) {
    await Promise.all(needPrev.map(function(code) {
      return fetch("https://api.fund.eastmoney.com/f10/lsjz?fundCode=" + code + "&pageIndex=1&pageSize=2", {
        headers: { "User-Agent": UA, "Referer": "https://fundf10.eastmoney.com/" }
      }).then(function(r) { return r.json(); }).then(function(j) {
        if (j.Data && j.Data.LSJZList && j.Data.LSJZList.length >= 2 && results[code]) {
          results[code].prevNav = parseFloat(j.Data.LSJZList[1].DWJZ);
          results[code].prevNavDate = j.Data.LSJZList[1].FSRQ || "";
        }
      }).catch(function() {});
    }));
  }

  return new Response(JSON.stringify(results), { headers: H });
}
