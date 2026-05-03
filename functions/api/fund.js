export async function onRequest(context) {
  var H = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS"
  };
  if (context.request.method === "OPTIONS") return new Response(null, { headers: H });

  var code = new URL(context.request.url).searchParams.get("code");
  if (code) code = code.trim();
  if (!code || !/^\d{6}$/.test(code)) {
    return new Response(JSON.stringify({ error: "请提供6位数字基金代码" }), { status: 400, headers: H });
  }

  var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36";
  var errs = [];

  // 源1: fundgz（名称+净值+估算值）
  try {
    var r1 = await fetch("https://fundgz.1234567.com.cn/js/" + code + ".js?rt=" + Date.now(), {
      headers: { "User-Agent": UA, "Referer": "https://fund.eastmoney.com/" }, redirect: "follow"
    });
    if (r1.ok) {
      var t1 = await r1.text();
      var s1 = t1.indexOf("{"), e1 = t1.lastIndexOf("}");
      if (s1 >= 0 && e1 > s1) {
        var d1 = JSON.parse(t1.substring(s1, e1 + 1));
        if (d1.dwjz) {
          // 尝试获取前一日净值
          var prevNav = null, prevNavDate = "";
          try {
            var rh = await fetch("https://api.fund.eastmoney.com/f10/lsjz?fundCode=" + code + "&pageIndex=1&pageSize=2", {
              headers: { "User-Agent": UA, "Referer": "https://fundf10.eastmoney.com/" }
            });
            if (rh.ok) {
              var jh = await rh.json();
              if (jh.Data && jh.Data.LSJZList && jh.Data.LSJZList.length >= 2) {
                prevNav = parseFloat(jh.Data.LSJZList[1].DWJZ);
                prevNavDate = jh.Data.LSJZList[1].FSRQ || "";
              }
            }
          } catch(ex) {}
          return jr({
            code: d1.fundcode || code,
            name: d1.name || "",
            nav: parseFloat(d1.dwjz),
            navDate: d1.jzrq || "",
            prevNav: prevNav,
            prevNavDate: prevNavDate,
            estimatedNav: d1.gsz ? parseFloat(d1.gsz) : null,
            fundType: d1.fundType || "",
            source: "fundgz"
          }, H);
        }
      }
    }
    errs.push("fundgz");
  } catch (ex) { errs.push("fundgz:" + ex.message); }

  // 源2: 东方财富移动端（名称+净值+基金类型）
  try {
    var r2 = await fetch("https://fundmobapi.eastmoney.com/FundMNewApi/FundMNFInfo?plat=Android&appType=ttjj&product=EFund&Version=1&FundCode=" + code, {
      headers: { "User-Agent": UA, "Referer": "https://mpservice.com/" }, redirect: "follow"
    });
    if (r2.ok) {
      var j2 = await r2.json();
      if (j2.ErrCode === 0 && j2.Datas) {
        var d2 = j2.Datas;
        var prevNav2 = null, prevNavDate2 = "";
        try {
          var rh2 = await fetch("https://api.fund.eastmoney.com/f10/lsjz?fundCode=" + code + "&pageIndex=1&pageSize=2", {
            headers: { "User-Agent": UA, "Referer": "https://fundf10.eastmoney.com/" }
          });
          if (rh2.ok) {
            var jh2 = await rh2.json();
            if (jh2.Data && jh2.Data.LSJZList && jh2.Data.LSJZList.length >= 2) {
              prevNav2 = parseFloat(jh2.Data.LSJZList[1].DWJZ);
              prevNavDate2 = jh2.Data.LSJZList[1].FSRQ || "";
            }
          }
        } catch(ex) {}
        return jr({
          code: d2.FCODE || code,
          name: d2.SHORTNAME || "",
          nav: parseFloat(d2.DWJZ),
          navDate: d2.FSRQ || "",
          prevNav: prevNav2,
          prevNavDate: prevNavDate2,
          fundType: d2.FTYPE || "",
          estimatedNav: d2.GSZ ? parseFloat(d2.GSZ) : null,
          source: "eastmoney"
        }, H);
      }
      errs.push("eastmoney:" + (j2.ErrMsg || j2.ErrCode));
    } else { errs.push("eastmoney:HTTP" + r2.status); }
  } catch (ex) { errs.push("eastmoney:" + ex.message); }

  // 源3: 东方财富lsjz（净值+前日净值）+ fundcode_search.js（名称）
  var nav = 0, navDate = "", prevNav3 = null, prevNavDate3 = "";
  try {
    var r3 = await fetch("https://api.fund.eastmoney.com/f10/lsjz?fundCode=" + code + "&pageIndex=1&pageSize=2", {
      headers: { "User-Agent": UA, "Referer": "https://fundf10.eastmoney.com/" }
    });
    if (r3.ok) {
      var j3 = await r3.json();
      if (j3.Data && j3.Data.LSJZList && j3.Data.LSJZList.length > 0) {
        nav = parseFloat(j3.Data.LSJZList[0].DWJZ);
        navDate = j3.Data.LSJZList[0].FSRQ || "";
        if (j3.Data.LSJZList.length >= 2) {
          prevNav3 = parseFloat(j3.Data.LSJZList[1].DWJZ);
          prevNavDate3 = j3.Data.LSJZList[1].FSRQ || "";
        }
      }
    }
    if (!nav) errs.push("lsjz:无数据");
  } catch (ex) { errs.push("lsjz:" + ex.message); }

  if (nav > 0) {
    var name = "";
    try {
      var rName = await fetch("https://fund.eastmoney.com/js/fundcode_search.js", {
        headers: { "User-Agent": UA, "Referer": "https://fund.eastmoney.com/" }
      });
      if (rName.ok) {
        var tName = await rName.text();
        var mName = tName.match(new RegExp('"' + code + '","[^"]*","([^"]*)"'));
        if (mName && mName[1]) name = mName[1];
      }
    } catch (ex) {}
    return jr({
      code: code,
      name: name,
      nav: nav,
      navDate: navDate,
      prevNav: prevNav3,
      prevNavDate: prevNavDate3,
      fundType: "",
      source: "lsjz" + (name ? "+基金列表" : "")
    }, H);
  }

  return jr({ error: "所有数据源均失败", details: errs }, H, 502);
}

function jr(data, H, status) {
  return new Response(JSON.stringify(data), { status: status || 200, headers: H });
}
