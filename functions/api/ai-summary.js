const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400"
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.GEMINI_API_KEY) {
      return json({ error: "GEMINI_API_KEY 환경변수가 설정되지 않았습니다." }, 500);
    }

    const body = await request.json().catch(() => ({}));
    const question = clean(body.question);
    const followup = clean(body.followup);
    const previousQuestion = clean(body.previousQuestion);
    const previousAnswer = clean(body.previousAnswer);
    const relatedDocs = Array.isArray(body.relatedDocs) ? body.relatedDocs.slice(0, 5) : [];

    if (!question && !followup) return json({ error: "질문이 없습니다." }, 400);
    if (!relatedDocs.length) return json({ answer: "저장된 자료에서 확인되지 않습니다." }, 200);

    const docsText = relatedDocs.map((doc, index) => {
      const title = clean(doc.title).slice(0, 120);
      const category = clean(doc.category).slice(0, 60);
      const source = clean(doc.source).slice(0, 80);
      const content = clean(doc.content).slice(0, 1400);
      return `[자료 ${index + 1}]
제목: ${title}
분류: ${category}
출처: ${source}
내용: ${content}`;
    }).join("\n\n");

    const prompt = `너는 대상정보통신의 초보 직원용 업무도우미다.
반드시 아래 저장된 관련 자료만 근거로 답변한다.
자료에서 확인되지 않으면 "저장된 자료에서 확인되지 않습니다"라고 답한다.
결론 먼저, 3줄 이내, 초보 직원도 이해하기 쉽게, 불필요한 설명 없이 답한다.

이전 질문: ${previousQuestion || "-"}
이전 답변: ${previousAnswer || "-"}
현재 질문: ${followup || question}

저장된 관련 자료:
${docsText}`;

    const geminiRes = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=" + encodeURIComponent(env.GEMINI_API_KEY), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 220
        }
      })
    });

    const data = await geminiRes.json().catch(() => ({}));
    if (!geminiRes.ok || data.error) {
      return json({ error: "AI 호출 실패: " + (data.error?.message || geminiRes.status) }, 502);
    }

    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || "저장된 자료에서 확인되지 않습니다.";
    const answer = raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean).slice(0, 3).join("\n").slice(0, 500);
    return json({ answer: answer || "저장된 자료에서 확인되지 않습니다." }, 200);
  } catch (error) {
    return json({ error: error.message || "AI 처리 중 오류가 발생했습니다." }, 500);
  }
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}
