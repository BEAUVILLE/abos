// pay-proof.js v4
// ✅ Upload preuve -> Supabase Storage
// ✅ Création payment via RPC digiy_pay_create_payment (évite RLS)
// ✅ Redirection WAIT standard: wait.html?ref=REFERENCE
(function(){
  "use strict";

  const SUPPORT_WA = "+221771342889";
  const BUCKET = "pay-proofs";
  const PUBLIC_FOLDER = "proofs";
  const MAX_MB = 8;

  // ✅ Standard WAIT (même dossier que index.html)
  const WAIT_PAGE = "./wait.html";

  const $ = (id) => document.getElementById(id);

  function setMsg(text, ok){
    const el = $("payMsg");
    if(!el) return;
    el.textContent = text;
    el.style.color = ok ? "#22c55e" : "#ef4444";
  }

  function focusField(el){
    try{
      if(!el) return;
      el.scrollIntoView({ behavior:"smooth", block:"center" });
      el.focus({ preventScroll:true });
      el.style.outline = "2px solid rgba(239,68,68,.8)";
      setTimeout(()=>{ el.style.outline = ""; }, 900);
    }catch(_){}
  }

  function wa(msg){
    const num = SUPPORT_WA.replace(/\+/g,"");
    location.href = "https://wa.me/" + num + "?text=" + encodeURIComponent(msg);
  }

  function safeName(name){
    return String(name || "proof")
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9._-]/g, "");
  }

  function normalizePhone(raw){
    const v = String(raw || "").trim();
    const digits = v.replace(/[^\d]/g, "");
    if(digits.length < 9) return "";
    return digits;
  }

  function normalizeSlug(raw){
    return String(raw || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function genSlug(prefix){
    const p = normalizeSlug(prefix || "digiy") || "digiy";
    const rand = Math.random().toString(16).slice(2, 10);
    return `${p}-${rand}`;
  }

  function getOrder(){
    try{
      const fn = window.DIGIY_PAY_STATE?.getOrder;
      if(typeof fn === "function") return fn() || {};
    }catch(_){}
    return {};
  }

  function requireSupabaseEnv(){
    const url = (window.DIGIY_SUPABASE_URL || "").trim();
    const key = (window.DIGIY_SUPABASE_ANON_KEY || "").trim();
    if(!url) throw new Error("SUPABASE_URL manquant (window.DIGIY_SUPABASE_URL)");
    if(!key) throw new Error("ANON KEY manquante (window.DIGIY_SUPABASE_ANON_KEY)");
    return { url, key };
  }

  function requireSupabaseClient(){
    if(!window.supabase?.createClient) throw new Error("Supabase JS non chargée (window.supabase)");
    const { url, key } = requireSupabaseEnv();
    return window.supabase.createClient(url, key, {
      auth:{ persistSession:false, autoRefreshToken:false, detectSessionInUrl:false }
    });
  }

  async function uploadStorageREST({ url, key, bucket, path, file }){
    const endpoint = `${url}/storage/v1/object/${encodeURIComponent(bucket)}/${path}`;

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "apikey": key,
        "Content-Type": file.type || "application/octet-stream",
        "x-upsert": "false"
      },
      body: file
    });

    const text = await res.text();
    if(!res.ok){
      let msg = text;
      try{
        const j = JSON.parse(text);
        msg = j?.message || j?.error || text;
      }catch(_){}
      throw new Error(`Upload refusé (${res.status}) : ${msg}`);
    }

    try{ return JSON.parse(text); } catch(_){ return { ok:true, raw:text }; }
  }

  function makeReference(module){
    const m = String(module||"DIGIY").toUpperCase().replace(/[^A-Z0-9_]/g,"").slice(0,16) || "DIGIY";
    const rand = Math.random().toString(16).slice(2, 8).toUpperCase();
    return `DIGIY-${m}-${Date.now()}-${rand}`;
  }

  function buildWaMessage(order, proofPath, reference){
    const phone = order.phone || "";
    const module = order.module || "";
    const plan = order.plan || "";
    const amount = order.amount || 0;
    const slug = order.slug || "";
    const boost = order.boost_code || "";

    let msg = "DIGIY — Preuve paiement Wave (UPLOAD)\n\n";
    msg += "Bénéficiaire: JB BEAUVILLE\n";
    msg += "Support: " + SUPPORT_WA + "\n\n";
    if(phone) msg += "Téléphone client: " + phone + "\n";
    if(module) msg += "Module: " + module + "\n";
    if(plan) msg += "Plan: " + plan + "\n";
    if(amount) msg += "Montant TOTAL: " + amount + " FCFA\n";
    if(boost) msg += "BOOST: " + boost + "\n";
    if(slug) msg += "Slug: " + slug + "\n";
    if(reference) msg += "Référence: " + reference + "\n";
    msg += "\nPreuve (Storage path):\n" + proofPath + "\n\n";
    msg += "Merci de valider & activer. — DIGIY";
    return msg;
  }

  function redirectToWait(reference){
    const q = new URLSearchParams();
    q.set("ref", reference);
    location.href = WAIT_PAGE + "?" + q.toString();
  }

  async function uploadAndPrepare(){
    try{
      const { url, key } = requireSupabaseEnv();

      const fileInput = $("proofFile");
      const file = fileInput?.files?.[0];
      if(!file) throw new Error("Sélectionne la capture Wave");

      if(!/^image\//.test(file.type)) throw new Error("Image uniquement (jpg/png)");
      if(file.size > MAX_MB * 1024 * 1024) throw new Error(`Fichier trop lourd (max ${MAX_MB}MB)`);

      const order = getOrder();

      // ✅ Obligatoires: module, plan, amount
      if(!order.amount || !order.plan || !order.module){
        throw new Error("Choisis un module dans la grille avant l’upload.");
      }

      // ✅ Téléphone obligatoire
      const phoneEl = $("payPhone") || $("phone");
      const slugEl  = $("paySlug")  || $("slug");

      const phone = normalizePhone(order.phone || phoneEl?.value || "");
      if(!phone){
        setMsg("❌ Téléphone obligatoire (ex: 221771234567).", false);
        focusField(phoneEl);
        throw new Error("Téléphone obligatoire.");
      }

      // ✅ Slug auto si vide
      let slug = normalizeSlug(order.slug || slugEl?.value || "");
      if(!slug || slug.length < 3){
        slug = genSlug(String(order.module||"digiy").toLowerCase());
        try{
          if(slugEl) slugEl.value = slug;
          const out = $("slugAuto");
          if(out) out.textContent = "Slug auto : " + slug;
        }catch(_){}
      }

      // ✅ 1) Upload Storage
      const ext = safeName(file.name).split(".").pop() || "jpg";
      const proofPath = `${PUBLIC_FOLDER}/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;

      setMsg("⏳ Upload en cours…", false);

      await uploadStorageREST({ url, key, bucket: BUCKET, path: proofPath, file });

      // ✅ 2) Création payment via RPC (évite RLS)
      const sb = requireSupabaseClient();

      const reference = makeReference(order.module);

      const meta = {
        proof_path: proofPath,
        code: order.code || null,
        ui: "abos",
        created_from: location.href
      };

      const { data, error } = await sb.rpc("digiy_pay_create_payment", {
        p_city: null,
        p_amount: Number(order.amount || 0),
        p_pro_name: null,
        p_pro_phone: phone,
        p_reference: reference,                    // ✅ IMPORTANT (signature)
        p_module: String(order.module || ""),
        p_plan: String(order.plan || ""),
        p_boost_code: order.boost_code || null,
        p_boost_amount_xof: Number(order.boost_amount_xof || 0),
        p_slug: slug,
        p_meta: meta
      });

      if(error) throw error;
      if(!data?.ok) throw new Error(data?.error || "create_payment_failed");

      // ✅ 3) WhatsApp admin
      const waMsg = buildWaMessage({ ...order, phone, slug }, proofPath, reference);
      wa(waMsg);

      // ✅ 4) Redirect WAIT standard
      setMsg("✅ Preuve envoyée. Validation en cours…", true);
      setTimeout(()=> redirectToWait(reference), 600);

      if(fileInput) fileInput.value = "";

    }catch(e){
      console.error(e);
      setMsg("❌ " + (e?.message || "Erreur"), false);
    }
  }

  document.addEventListener("DOMContentLoaded", ()=>{
    const btn = $("btnSendProof");
    if(btn) btn.addEventListener("click", uploadAndPrepare);
  });

})();
