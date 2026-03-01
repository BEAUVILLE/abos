(function(){
  "use strict";

  const SUPPORT_WA = "+221771342889";

  // Supabase Storage
  const BUCKET = "pay-proofs";
  const PUBLIC_FOLDER = "proofs";
  const MAX_MB = 8;

  // Wait page locale
  const WAIT_PAGE = "/abos/wait.html";

  const $ = (id) => document.getElementById(id);

  function setMsg(text, ok){
    const el = $("payMsg");
    if(!el) return;
    el.textContent = text || "";
    el.className = "msg " + (ok ? "ok" : "bad");
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

  function safeExtFromFile(file){
    const name = String(file?.name || "").toLowerCase();
    const m = name.match(/\.([a-z0-9]+)$/);
    return (m && m[1]) ? m[1] : "jpg";
  }

  function requireEnv(){
    const url = (window.DIGIY_SUPABASE_URL || "").trim();
    const key = (window.DIGIY_SUPABASE_ANON_KEY || "").trim();
    if(!url) throw new Error("Config manquante: DIGIY_SUPABASE_URL");
    if(!key) throw new Error("Config manquante: DIGIY_SUPABASE_ANON_KEY");
    if(!window.supabase) throw new Error("Supabase JS non chargé");
    return { url, key };
  }

  function getUrlDefaults(){
    const qp = new URLSearchParams(location.search);
    return {
      module: (qp.get("module") || "POS").trim(),
      plan: (qp.get("plan") || "standard").trim(),
      amount: Number(String(qp.get("amount")||"").replace(/[^\d]/g,"") || 0),
      city: (qp.get("city") || "").trim(),
      pro_name: (qp.get("pro_name") || "").trim(),
      reference: (qp.get("reference") || "").trim()
    };
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

  async function createPaymentRPC(sb, payload){
    // ⚡ IMPORTANT : on passe par la RPC SECURITY DEFINER → pas de RLS 401
    const { data, error } = await sb.rpc("digiy_pay_create_payment", payload);
    if(error) throw error;
    if(!data?.ok) throw new Error(data?.error || "rpc_failed");
    return data;
  }

  function redirectWait(ref){
    location.href = WAIT_PAGE + "?ref=" + encodeURIComponent(ref);
  }

  async function onSend(){
    try{
      setMsg("", true);

      const { url, key } = requireEnv();
      const sb = window.supabase.createClient(url, key, {
        auth:{ persistSession:false, autoRefreshToken:false, detectSessionInUrl:false }
      });

      const phoneEl = $("payPhone");
      const slugEl  = $("paySlug");
      const amtEl   = $("payAmount");
      const fileEl  = $("proofFile");

      const defaults = getUrlDefaults();

      const phone = normalizePhone(phoneEl?.value || "");
      if(!phone){
        setMsg("❌ Téléphone obligatoire (ex: 221771234567).", false);
        focusField(phoneEl);
        return;
      }

      const amount = Number(String(amtEl?.value || defaults.amount || 0).replace(/[^\d]/g,"") || 0);
      if(!amount || amount < 100){
        setMsg("❌ Montant invalide. Mets un montant (ex: 12900).", false);
        focusField(amtEl);
        return;
      }

      let slug = normalizeSlug(slugEl?.value || "");
      if(!slug || slug.length < 3){
        slug = genSlug(defaults.module || "digiy");
        if(slugEl) slugEl.value = slug;
        const s = $("slugAuto");
        if(s) s.textContent = "Slug auto : " + slug;
      }

      const file = fileEl?.files?.[0];
      if(!file){
        setMsg("❌ Sélectionne la capture Wave (image).", false);
        focusField(fileEl);
        return;
      }
      if(!/^image\//.test(file.type)){
        setMsg("❌ Image uniquement (jpg/png).", false);
        return;
      }
      if(file.size > MAX_MB * 1024 * 1024){
        setMsg(`❌ Fichier trop lourd (max ${MAX_MB}MB).`, false);
        return;
      }

      setMsg("⏳ Upload preuve…", true);

      const ext = safeExtFromFile(file);
      const proofPath = `${PUBLIC_FOLDER}/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;

      await uploadStorageREST({
        url,
        key,
        bucket: BUCKET,
        path: proofPath,
        file
      });

      setMsg("⏳ Création paiement (cockpit)…", true);

      // ✅ Construire une reference si pas donnée
      const ref = (defaults.reference || ("DIGIY-" + Math.random().toString(16).slice(2, 10).toUpperCase()));

      const rpcPayload = {
        p_city: defaults.city || null,
        p_amount: amount,
        p_pro_name: defaults.pro_name || null,
        p_pro_phone: phone,
        p_reference: ref,
        p_module: (defaults.module || "POS"),
        p_plan: (defaults.plan || "standard"),
        p_boost_code: null,
        p_boost_amount_xof: null,
        p_slug: slug,
        p_meta: { proof_path: proofPath, source: "payer.html" }
      };

      const created = await createPaymentRPC(sb, rpcPayload);

      setMsg("✅ Preuve envoyée. Redirection…", true);

      // 👉 Redirect wait avec la ref officielle (celle que tu confirmes au cockpit)
      redirectWait(created.reference || ref);

    }catch(e){
      console.error(e);
      setMsg("❌ " + (e?.message || "Erreur"), false);
    }
  }

  document.addEventListener("DOMContentLoaded", ()=>{
    const btn = $("btnSendProof");
    if(btn){
      btn.addEventListener("click", onSend);
    }else{
      console.warn("btnSendProof introuvable (ID mismatch)");
    }
  });

})();
