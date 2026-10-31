import { getStore } from "@netlify/blobs";

const DEFAULT_PRICES = [
  { cp: 80, price: 297000, tag: "فوری ۱۲ ساعت", discount: 0, active: true },
  { cp: 240, price: 837000, tag: "فوری ۱۲ ساعت", discount: 0, active: true },
  { cp: 480, price: 1674000, tag: "فوری ۱۲ ساعت", discount: 0, active: true },
  { cp: 880, price: 3024000, tag: "فوری ۱۲ ساعت", discount: 0, active: true },
  { cp: 1300, price: 4657500, tag: "فوری ۱۲ ساعت", discount: 0, active: true },
  { cp: 2400, price: 7249500, tag: "فوری ۱۲ ساعت", discount: 0, active: true },
  { cp: 5000, price: 14742000, tag: "فوری ۱۲ ساعت", discount: 0, active: true },
  { cp: 5880, price: 17818650, tag: "فوری ۱۲ ساعت", discount: 0, active: true },
  { cp: 7400, price: 22003650, tag: "فوری ۱۲ ساعت", discount: 0, active: true },
  { cp: 10800, price: 31453650, tag: "فوری ۱۲ ساعت", discount: 0, active: true },
  { cp: 80, price: 276750, tag: "فوری ۲ تا ۵ روز", discount: 0, active: true },
  { cp: 240, price: 816750, tag: "فوری ۲ تا ۵ روز", discount: 0, active: true },
  { cp: 560, price: 1910250, tag: "فوری ۲ تا ۵ روز", discount: 0, active: true },
  { cp: 1120, price: 3832650, tag: "فوری ۲ تا ۵ روز", discount: 0, active: true },
  { cp: 2400, price: 7215750, tag: "فوری ۲ تا ۵ روز", discount: 0, active: true },
  { cp: 5880, price: 17745750, tag: "فوری ۲ تا ۵ روز", discount: 0, active: true },
  { cp: 10800, price: 31399650, tag: "فوری ۲ تا ۵ روز", discount: 0, active: true }
];
const DEFAULT_RULES = "متن قوانین رو از پنل ادمین عوض کن.";

const res = (code, body) => ({
  statusCode: code,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(body)
});
const clip = (s, n) => String(s == null ? "" : s).slice(0, n);

export const handler = async (event, context) => {
  const store = getStore("gamestore");
  const q = event.queryStringParameters || {};
  const action = q.action || "";
  let body = {};
  try { body = event.body ? JSON.parse(event.body) : {}; } catch (e) { return res(400, { error: "bad json" }); }
  const isAdmin = !!(context.clientContext && context.clientContext.user);

  const getState = async () => (await store.get("state", { type: "json" })) || { prices: DEFAULT_PRICES, offers: [], rules: DEFAULT_RULES };
  const getChat = async (id) => (await store.get("chat_" + id, { type: "json" })) || [];
  const getIndex = async () => (await store.get("chatIndex", { type: "json" })) || [];

  try {
    switch (action) {
      case "state": {
        const s = await getState();
        return res(200, {
          prices: s.prices.filter(p => p.active !== false),
          offers: s.offers.filter(o => o.active !== false),
          rules: s.rules
        });
      }
      case "presence": {
        const id = clip(body.id, 64);
        if (!id) return res(400, { error: "id" });
        const p = (await store.get("presence", { type: "json" })) || {};
        const now = Date.now();
        p[id] = now;
        for (const k of Object.keys(p)) if (now - p[k] > 120000) delete p[k];
        await store.setJSON("presence", p);
        return res(200, { ok: true });
      }
      case "chat": {
        const id = clip(body.id || q.id, 64);
        if (!id) return res(400, { error: "id" });
        return res(200, { messages: await getChat(id) });
      }
      case "msg": {
        const id = clip(body.id, 64), text = clip(body.text, 500).trim();
        if (!id || !text) return res(400, { error: "bad" });
        const msgs = await getChat(id);
        msgs.push({ sender: "customer", body: text, at: Date.now() });
        await store.setJSON("chat_" + id, msgs.slice(-200));
        const idx = await getIndex();
        if (!idx.includes(id)) { idx.unshift(id); await store.setJSON("chatIndex", idx.slice(0, 500)); }
        return res(200, { ok: true });
      }
      case "ticket": {
        const t = (await store.get("tickets", { type: "json" })) || [];
        t.unshift({ id: Date.now().toString(36), name: clip(body.name, 60), message: clip(body.message, 1000), status: "new", at: Date.now() });
        await store.setJSON("tickets", t.slice(0, 300));
        return res(200, { ok: true });
      }
      case "admin_data": {
        if (!isAdmin) return res(401, { error: "login" });
        const s = await getState();
        const pres = (await store.get("presence", { type: "json" })) || {};
        return res(200, {
          state: s,
          online: Object.keys(pres).filter(k => Date.now() - pres[k] < 70000),
          chats: await getIndex(),
          tickets: (await store.get("tickets", { type: "json" })) || []
        });
      }
      case "admin_chat": {
        if (!isAdmin) return res(401, { error: "login" });
        return res(200, { messages: await getChat(clip(body.id, 64)) });
      }
      case "admin_reply": {
        if (!isAdmin) return res(401, { error: "login" });
        const id = clip(body.id, 64), text = clip(body.text, 500).trim();
        if (!id || !text) return res(400, { error: "bad" });
        const msgs = await getChat(id);
        msgs.push({ sender: "admin", body: text, at: Date.now() });
        await store.setJSON("chat_" + id, msgs.slice(-200));
        return res(200, { ok: true });
      }
      case "admin_save": {
        if (!isAdmin) return res(401, { error: "login" });
        const s = body.state;
        if (!s || !Array.isArray(s.prices) || !Array.isArray(s.offers)) return res(400, { error: "bad state" });
        await store.setJSON("state", { prices: s.prices.slice(0, 100), offers: s.offers.slice(0, 100), rules: clip(s.rules, 5000) });
        return res(200, { ok: true });
      }
      case "admin_ticket": {
        if (!isAdmin) return res(401, { error: "login" });
        const t = (await store.get("tickets", { type: "json" })) || [];
        const x = t.find(v => v.id === body.id);
        if (x) x.status = body.status === "done" ? "done" : "new";
        await store.setJSON("tickets", t);
        return res(200, { ok: true });
      }
      default:
        return res(404, { error: "unknown action" });
    }
  } catch (e) {
    return res(500, { error: e.message });
  }
};
