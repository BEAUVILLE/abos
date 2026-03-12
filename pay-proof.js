(function(){
  "use strict";

  const SUPPORT_WA = "+221771342889";

  const BUCKET = "pay-proofs";
  const PUBLIC_FOLDER = "proofs";
  const MAX_MB = 8;

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

  function normalizeModule(raw){
    const v = String(raw || "").trim().toUpperCase();
    const alias = {
      DRIVER: "DRIVER",
      LOC: "LOC",
      RESA: "RESTO_RESA",
      RESA_TABLE: "RESTO_RESA",
      RESTO_RESA: "RESTO_RESA",
      POS: "POS_PRO",
      POS_PRO: "POS_PRO",
      CAISSE: "POS_PRO",
      CAISSE_BOUTIQUE: "POS_PRO",
      MARKET: "MARKET",
      BUILD: "BUILD",
      MULTI_SERVICE: "BUILD",
      EXPLORE: "EXPLORE"
    };
    return alias[v] || v || "";
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
    const url =
      (window.DIGIY_SUPABASE_URL || window.DIGIY_SUPABASE__?.url || "").trim();
    const key =
      (window.DIGIY_SUPABASE_ANON_KEY || window.DIGIY_SUPABASE_ANON || window.DIGIY_SUPABASE__?.anon || "").trim();

    if(!url) throw new Error("Config manquante: DIGIY_SUPABASE_URL");
    if(!key) throw new Error("Config manquante: DIGIY_SUPABASE_ANON_KEY");
    if(!window.supabase) throw new Error("Supabase JS non chargé");

    return { url, key };
  }

  function qp(){
    return new URLSearchParams(location.search);
  }

  function getUrlDefaults(){
    const q = qp();

    const moduleRaw =
      q.get("base_module") ||
      q.get("module") ||
      "POS_PRO";

    const boostCode =
      (q.get("boost_code") || q.get("boost") || "").trim();

    const boostAmount =
      Number(String(q.get("boost_amount_xof") || q.get("boost_amount") || "").replace(/[^\d]/g,"") || 0);

    return {
      module: normalizeModule(moduleRaw),
      public_label: (q.get("public_label") || "").trim(),
      plan: (q.get("plan") || "standard").trim(),
      amount: Number(String(q.get("amount") || "").replace(/[^\d]/g,"") || 0),
      city: (q.get("city") || "").trim(),
      pro_name: (q.get("pro_name") || "").trim(),
      reference: (q.get("reference") || q.get("ref") || "").trim(),
      code: (q.get("code") || "").trim(),
      boost_code: boostCode,
      boost_amount_xof: boostAmount,
      phone: normalizePhone(q.get("phone") || ""),
      slug: normalizeSlug(q.get("slug") || "")
    };
  }

  function prefillFields(){
    const defaults = getUrlDefaults();

    const amountEl = $("payAmount");
    const phoneEl = $("payPhone");
    const slugEl = $("paySlug");
    const slugAutoEl = $("slugAuto");

    if(amountEl && defaults.amount && !amountEl.value){
      amountEl.value = String(defaults.amount);
    }
    if(phoneEl && defaults.phone && !phoneEl.value){
      phoneEl.value = defaults.phone;
    }
    if(slugEl && defaults.slug && !slugEl.value){
      slugEl.value = defaults.slug;
    }

    if(slugAutoEl){
      const line = [];
      if(defaults.public_label) line.push("Module: " + defaults.public_label);
      else if(defaults.module) line.push("Module: " + defaults.module);
      if(defaults.plan) line.push("Plan: " + defaults.plan);
      if(defaults.code) line.push("CODE " + defaults.code);
      if(defaults.boost_code) line.push("BOOST " + defaults.boost_code);
      slugAutoEl.textContent = line.join(" • ");
    }
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

    try{
      return JSON.parse(text);
    }catch(_){
      return { ok:true, raw:text };
    }
  }

  async function createPaymentRPC(sb, payload){
    const { data, error } = await sb.rpc("digiy_pay_create_payment", payload);
    if(error) throw error;
    if(!data?.ok) throw new Error(data?.error || "rpc_failed");
    return data;
  }

  function buildWaitUrl(ref, defaults, phone, slug, amount){
    const u = new URL("./wait.html", window.location.href);

    u.searchParams.set("ref", ref);

    if(defaults.module) u.searchParams.set("module", defaults.module);
    if(defaults.public_label) u.searchParams.set("public_label", defaults.public_label);
    if(defaults.plan) u.searchParams.set("plan", defaults.plan);
    if(defaults.code) u.searchParams.set("code", defaults.code);
    if(defaults.boost_code) u.searchParams.set("boost_code", defaults.boost_code);
    if(amount) u.searchParams.set("amount", String(amount));
    if(phone) u.searchParams.set("phone", phone);
    if(slug) u.searchParams.set("slug", slug);

    return u.toString();
  }

  function redirectWait(ref, defaults, phone, slug, amount){
    location.href = buildWaitUrl(ref, defaults, phone, slug, amount);
  }

  async function onSend(){
    const btn = $("btnSendProof");

    try{
      setMsg("", true);
      if(btn) btn.disabled = true;

      const { url, key } = requireEnv();

      const sb = window.supabase.createClient(url, key, {
        auth:{
          persistSession:false,
          autoRefreshToken:false,
          detectSessionInUrl:false
        }
      });

      const phoneEl = $("payPhone");
      const slugEl  = $("paySlug");
      const amtEl   = $("payAmount");
      const fileEl  = $("proofFile");

      const defaults = getUrlDefaults();

      const phone = normalizePhone(phoneEl?.value || defaults.phone || "");
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

      let slug = normalizeSlug(slugEl?.value || defaults.slug || "");
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
        setMsg("❌ Image uniquement (jpg/png/webp).", false);
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

      const ref = defaults.reference || ("DIGIY-" + Math.random().toString(16).slice(2, 10).toUpperCase());

      const rpcPayload = {
        p_city: defaults.city || null,
        p_amount: amount,
        p_pro_name: defaults.pro_name || null,
        p_pro_phone: phone,
        p_reference: ref,
        p_module: defaults.module || "POS_PRO",
        p_plan: defaults.plan || "standard",
        p_boost_code: defaults.boost_code || null,
        p_boost_amount_xof: defaults.boost_amount_xof || null,
        p_slug: slug,
        p_meta: {
          proof_path: proofPath,
          source: "payer.html",
          code: defaults.code || null,
          boost_code: defaults.boost_code || null,
          public_label: defaults.public_label || null
        }
      };

      const created = await createPaymentRPC(sb, rpcPayload);
      const finalRef = created.reference || ref;

      setMsg("✅ Preuve envoyée. Redirection…", true);

      redirectWait(finalRef, defaults, phone, slug, amount);

    }catch(e){
      console.error(e);
      setMsg("❌ " + (e?.message || "Erreur"), false);
    }finally{
      if(btn) btn.disabled = false;
    }
  }

  document.addEventListener("DOMContentLoaded", ()=>{
    prefillFields();

    const btn = $("btnSendProof");
    if(btn){
      btn.addEventListener("click", onSend);
    }else{
      console.warn("btnSendProof introuvable (ID mismatch)");
    }
  });

})();
