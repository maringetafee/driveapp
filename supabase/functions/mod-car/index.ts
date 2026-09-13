// DriveRank — Mod Car (fase 4, IA opcional).
// Recibe una foto de coche + un prompt de estilo y devuelve una versión
// modificada SOLO estéticamente, usando la API de edición de imágenes de
// OpenAI. No hace nada funcional al coche real, es puramente visual para el
// perfil/feed.
//
// Setup necesario antes de que esto funcione (el usuario debe hacerlo):
//   1. Tener un proyecto Supabase con la CLI vinculada (`supabase link`).
//   2. `supabase secrets set OPENAI_API_KEY=sk-...`
//   3. `supabase functions deploy mod-car`
//
// Sin esos tres pasos, la función responde 500 con un mensaje explicando qué falta.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { imageBase64, prompt } = await req.json();
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return jsonResponse({ error: 'Falta imageBase64 (foto del coche en base64).' }, 400);
    }
    if (!prompt || typeof prompt !== 'string') {
      return jsonResponse({ error: 'Falta prompt (estilo deseado).' }, 400);
    }

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) {
      return jsonResponse(
        { error: 'OPENAI_API_KEY no está configurada. Ejecuta: supabase secrets set OPENAI_API_KEY=sk-...' },
        500
      );
    }

    const imageBytes = Uint8Array.from(atob(imageBase64), (c) => c.charCodeAt(0));
    const imageBlob = new Blob([imageBytes], { type: 'image/png' });

    const form = new FormData();
    form.append('model', 'gpt-image-1');
    form.append('image', imageBlob, 'car.png');
    form.append(
      'prompt',
      `Foto de coche real modificada solo estéticamente al estilo: ${prompt}. ` +
        'Mantén el mismo coche, ángulo de cámara y fondo; cambia únicamente llantas, ' +
        'pintura, altura o kit estético. Es una visualización, no una modificación real.'
    );
    form.append('size', '1024x1024');

    const openaiRes = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      return jsonResponse({ error: `OpenAI: ${errText}` }, 502);
    }

    const openaiData = await openaiRes.json();
    const resultBase64 = openaiData?.data?.[0]?.b64_json;
    if (!resultBase64) {
      return jsonResponse({ error: 'OpenAI no devolvió ninguna imagen.' }, 502);
    }

    return jsonResponse({ imageBase64: resultBase64 });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Error desconocido.' }, 500);
  }
});
