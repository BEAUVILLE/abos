<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <title>Confirmation paiement — DIGIY</title>

  <script>
    window.DIGIY_SUPABASE_URL = "https://wesqmwjjtsefyjnluosj.supabase.co";
    window.DIGIY_SUPABASE_ANON_KEY = "sb_publishable_tGHItRgeWDmGjnd0CK1DVQ_BIep4Ug3";
  </script>
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>

  <style>
    body{
      margin:0;
      font-family:system-ui;
      background:#04110d;
      color:#f3fff7;
      display:flex;
      align-items:center;
      justify-content:center;
      min-height:100vh;
      padding:16px;
    }

    .card{
      width:100%;
      max-width:520px;
      background:#0b1f18;
      border-radius:20px;
      padding:20px;
      border:1px solid rgba(255,255,255,.08);
    }

    h1{
      margin:0 0 10px;
      font-size:22px;
      color:#facc15;
      text-align:center;
    }

    .info{
      text-align:center;
      font-size:14px;
      color:rgba(255,255,255,.7);
      margin-bottom:20px;
    }

    .box{
      background:#04110d;
      border-radius:16px;
      padding:14px;
      margin-bottom:14px;
      border:1px solid rgba(255,255,255,.06);
    }

    input, textarea{
      width:100%;
      padding:12px;
      border-radius:12px;
      border:none;
      outline:none;
      font-size:14px;
      background:#071a13;
      color:#fff;
      margin-top:6px;
    }

    input[type="file"]{
      padding:8px;
    }

    .btn{
      width:100%;
      padding:14px;
      border-radius:999px;
      border:none;
      font-weight:900;
      background:#22c55e;
      color:#032215;
      cursor:pointer;
      margin-top:10px;
    }

    .btn:disabled{
      opacity:.5;
      cursor:not-allowed;
    }

    .msg{
      margin-top:12px;
      font-size:13px;
      text-align:center;
    }
  </style>
</head>
<body>

  <div class="card">
    <h1>💳 Confirmation paiement</h1>
    <div class="info">
      Tu as effectué un paiement ? Confirme ici.
    </div>

    <div class="box">
      <label>📱 Ton numéro</label>
      <input id="phone" placeholder="Ex : 771234567">
    </div>

    <div class="box">
      <label>💰 Montant (FCFA)</label>
      <input id="amount" type="number" placeholder="Ex : 5000">
    </div>

    <div class="box">
      <label>🧾 Preuve (capture écran)</label>
      <input id="file" type="file" accept="image/*">
    </div>

    <div class="box">
      <label>📝 Note (optionnel)</label>
      <textarea id="note" placeholder="Ex : paiement Wave effectué"></textarea>
    </div>

    <button id="btnSend" class="btn">📤 Envoyer la confirmation</button>

    <div id="msg" class="msg"></div>
  </div>

  <script>
    const sb = window.supabase.createClient(
      window.DIGIY_SUPABASE_URL,
      window.DIGIY_SUPABASE_ANON_KEY
    );

    const params = new URLSearchParams(location.search);
    const proCode = (params.get("pro") || "").toUpperCase();

    const btn = document.getElementById("btnSend");
    const msg = document.getElementById("msg");

    btn.onclick = async () => {
      btn.disabled = true;
      msg.textContent = "Envoi en cours...";

      try{
        const phone = document.getElementById("phone").value.trim();
        const amount = document.getElementById("amount").value.trim();
        const note = document.getElementById("note").value.trim();
        const file = document.getElementById("file").files[0];

        if(!phone || !amount){
          throw new Error("Champs obligatoires manquants");
        }

        let fileUrl = null;

        if(file){
          const fileName = Date.now() + "_" + file.name;

          const { error: uploadError } = await sb
            .storage
            .from("pay-proofs")
            .upload(fileName, file);

          if(uploadError){
            throw uploadError;
          }

          const { data } = sb
            .storage
            .from("pay-proofs")
            .getPublicUrl(fileName);

          fileUrl = data.publicUrl;
        }

        const { error: insertError } = await sb
          .from("digiy_pay_proofs")
          .insert({
            pro_code: proCode,
            customer_phone: phone,
            amount_xof: parseInt(amount),
            note: note,
            proof_url: fileUrl
          });

        if(insertError){
          throw insertError;
        }

        msg.textContent = "✅ Confirmation envoyée";

        setTimeout(() => {
          window.location.href = "./wait.html?pro=" + proCode;
        }, 1200);

      }catch(e){
        console.error(e);
        msg.textContent = "❌ Erreur : " + e.message;
        btn.disabled = false;
      }
    };
  </script>

</body>
</html>
