export async function onRequest() {
  return new Response(JSON.stringify({
    status: "ok",
    time: new Date().toISOString(),
    runtime: "cloudflare-pages-functions"
  }), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
