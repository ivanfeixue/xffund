export async function onRequest(context) {
  const url = new URL(context.request.url);
  const code = url.searchParams.get("code") || "110022";

  const sources = [
    { name: "东方财富移动端", fn: () => srcEastmoney(code) },
    { name: "fundgz实时(HTTPS)", fn: () => srcFundgz(code) },
    { name: "东方财富lsjz", fn: () => srcLsjz(code) },
    { name: "蛋卷基金", fn: () => srcDanjuan(code) },
    { name: "AllCity", fn: () => srcAllCity(code) }
  ];

  const results = [];
  for (const src of sources) {
    const t0 = Date.now();
    try {
      const data = await src.fn();
      results.push({
        name: src.name,
        ok: !!(data && data.nav > 0),
        ms: Date.now() - t0,
        data: data
      });
    } catch (e) {
      results.push({
        name: src.name,
        ok: false,
        ms: Date.now() - t0,
        error: e.message
      });
    }
  }

  // Cloudflare 请求元数据（看是从哪个国家/机房发出的）
  const cf = context.request.cf || {};

  return new Response(JSON.stringify({
    code: code,
    cf: { country: cf.country, colo: cf.colo, timezone: cf.timezone },
    results: results
  }, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}

// ---- 5个上游源 ----

async function srcEastmoney(code) {
  const r = await fetch(
    "https://fundmobapi.eastmoney.com/FundMNewApi/FundMNFInfo" +
    "?plat=Android&appType=ttjj&product=EFund&Version=1&FundCode=" + code,
    {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Referer": "https://mpservice.com/",
        "Origin": "https://mpservice.com"
      },
      redirect: "follow"
    }
  );
  if (!r.ok) throw new Error("HTTP " + r.status + " " + r.statusText);
  const j = await r.json();
  if (j.ErrCode !== 0 || !j.Datas) throw new Error("ErrCode=" + j.ErrCode + " " + (j.ErrMsg || "无数据"));
  const d = j.Datas;
  return {
    code: d.FCODE, name: d.SHORTNAME,
    nav: parseFloat(d.DWJZ), navDate: d.FSRQ,
    estimatedNav: d.GSZ ? parseFloat(d.GSZ) : null,
    source: "东方财富移动端"
  };
}

async function srcFundgz(code) {
  const r = await fetch(
    "https://fundgz.1234567.com.cn/js/" + code + ".js?rt=" + Date.now(),
    {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://fund.eastmoney.com/",
        "Accept": "*/*"
      },
      redirect: "follow"
    }
  );
  if (!r.ok) throw new Error("HTTP " + r.status);
  const text = await r.text();
  const m = text.match(/jsonpgz$$(\{.*?\})$$/s);
  if (!m) throw new Error("JSONP解析失败: " + text.slice(0, 80));
  const d = JSON.parse(m[1]);
  return {
    code: d.fundcode, name: d.name,
    nav: parseFloat(d.dwjz), navDate: d.jzrq,
    estimatedNav: d.gsz ? parseFloat(d.gsz) : null,
    source: "fundgz实时"
  };
}

async function srcLsjz(code) {
  const r = await fetch(
    "https://api.fund.eastmoney.com/f10/lsjz?fundCode=" + code + "&pageIndex=1&pageSize=1",
    {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://fundf10.eastmoney.com/",
        "Accept": "application/json"
      }
    }
  );
  if (!r.ok) throw new Error("HTTP " + r.status);
  const j = await r.json();
  if (!j.Data || !j.Data.LSJZList || !j.Data.LSJZList.length) throw new Error("无历史净值数据");
  const latest = j.Data.LSJZList[0];
  return {
    code: code, name: j.Data.FundType || "",
    nav: parseFloat(latest.DWJZ), navDate: latest.FSRQ,
    source: "东方财富lsjz"
  };
}

async function srcDanjuan(code) {
  const r = await fetch(
    "https://danjuanfunds.com/djapi/fund/detail/" + code,
    {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json"
      }
    }
  );
  if (!r.ok) throw new Error("HTTP " + r.status);
  const j = await r.json();
  if (j.result_code !== 0 || !j.data) throw new Error("code=" + j.result_code);
  const d = j.data;
  const fd = d.fund_derived || {};
  return {
    code: code, name: d.fd_name || "",
    nav: parseFloat(fd.unit_nav || fd.nav || 0), navDate: fd.nav_date || "",
    source: "蛋卷基金"
  };
}

async function srcAllCity(code) {
  const r = await fetch("https://api.doctorxiong.club/v1/fund?code=" + code, {
    headers: { "Accept": "application/json" }
  });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const j = await r.json();
  if (j.code !== 0 || !j.data) throw new Error("code=" + j.code);
  const d = j.data;
  return {
    code: d.code, name: d.name,
    nav: parseFloat(d.netWorth), navDate: d.worthDate || d.dayDate,
    source: "AllCity"
  };
}
