export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { messages } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: '잘못된 요청 형식입니다.' });
  }

  const TAX_KEYWORDS = [
    '세금','세법','소득세','법인세','부가세','부가가치세',
    '양도세','양도소득세','종합소득세','원천세','원천징수',
    '증여세','상속세','취득세','재산세','종부세','종합부동산세',
    '공제','세액공제','필요경비','비용처리','손금',
    '세율','과세','면세','영세율','감면',
    '신고','납부','환급','경정','수정신고','기한후신고',
    '세무조사','가산세','불복','이의신청','심판청구',
    '4대보험','사대보험','국민연금','건강보험','고용보험','산재',
    '근로소득','사업소득','기타소득','퇴직소득','금융소득',
    '연말정산','간이세액표','세금계산서','전자세금계산서',
    '현금영수증','신용카드매출','매입세액','매출세액',
    '부동산','임대소득','임대업','분양권','입주권',
    '법인','개인사업자','폐업','개업','사업자등록',
    '기장','복식부기','간편장부','추계','표준소득률',
    '감가상각','접대비','업무용승용차',
    '급여','퇴직금','퇴직연금','IRP','근로장려금','자녀장려금',
    '개정','신설','변경','최신','2024년','2025년','2026년',
    '간이과세','일반과세','과세유형','면세사업자',
  ];

  const lastUser = [...messages].reverse().find(m => m.role === 'user');
  const userText = typeof lastUser?.content === 'string' ? lastUser.content : '';
  const isTaxRelated = TAX_KEYWORDS.some(kw => userText.includes(kw));

  const systemPrompt = `당신은 센텀세무회계의 AI 세무상담 어시스턴트입니다. 경기도 화성시 소재 공인 세무사 사무실입니다.

【답변 원칙】
1. ${isTaxRelated ? '웹서치 결과를 반드시 활용하여 최신 세법 기준으로 답변하세요.' : '세무·회계 질문에 정확하게 답변하세요.'}
2. 법령 근거(소득세법, 법인세법 등 조항)를 가능한 한 명시하세요.
3. 세율·공제한도·신고기한 등 수치는 정확히 안내하세요.
4. 복잡한 개인 상황은 "031-890-8082로 문의해 주세요"로 안내하세요.
5. 답변 말미에 "※ 정확한 적용은 담당 세무사와 상담하시기 바랍니다."를 붙이세요.
6. 한국어로 친절하고 명확하게 답변하세요.`;

  const requestBody = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    system: systemPrompt,
    messages,
    ...(isTaxRelated && {
      tools: [{
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 3,
      }],
    }),
  };

  try {
    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05',
      },
      body: JSON.stringify(requestBody),
    });

    if (!apiRes.ok) {
      const errData = await apiRes.json().catch(() => ({}));
      console.error('Anthropic API Error:', errData);
      return res.status(apiRes.status).json({
        error: errData?.error?.message || 'API 오류가 발생했습니다.',
      });
    }

    const data = await apiRes.json();

    const replyText = data.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim();

    const usedWebSearch = data.content.some(
      b => b.type === 'tool_use' && b.name === 'web_search'
    );

    if (usedWebSearch) {
      console.log(`[WebSearch] 실행 | "${userText.substring(0, 50)}"`);
    }

    return res.status(200).json({
      content: [{ text: replyText }],
      used_web_search: usedWebSearch,
    });

  } catch (err) {
    console.error('Handler Error:', err);
    return res.status(500).json({ error: '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' });
  }
}
