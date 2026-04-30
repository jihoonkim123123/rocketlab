/**
 * GitHub Actions용 포트폴리오 보고서 생성 및 텔레그램 전송 스크립트
 */

// 메인 실행 함수
async function main() {
  console.log('🚀 보고서 생성 및 전송 프로세스 시작');
  
  try {
    // 1. 데이터 수집 (기존 로직 활용)
    const marketData = await fetchMarketData();
    const holdings = await fetchPortfolioData();
    const news = await fetchMarketNews();
    console.log('✓ 모든 데이터 수집 완료');
    
    // 2. Grok API 분석 호출
    const analysis = await callGrokAPI({
      marketData,
      holdings,
      news,
      timestamp: new Date().toISOString()
    });
    console.log('✓ Grok 분석 완료');
    
    // 3. 텔레그램용 HTML 메시지 구성
    const htmlMessage = generateTelegramHTML(analysis, marketData);
    
    // 4. 텔레그램 전송
    await sendTelegramMessage(htmlMessage);
    console.log('📊 텔레그램 보고서 전송 성공!');
    
  } catch (error) {
    console.error('❌ 프로세스 중 오류 발생:', error);
    process.exit(1);
  }
}

// --- 데이터 수집 함수 (기존 index.js 기반) ---

async function fetchMarketData() {
  const tickers = ['RKLB', 'HOOD', 'GEV', 'TEM', 'TSLA', 'LEU', 'QCOM', 'POET', 'FLNC'];
  const key = process.env.ALPHA_VANTAGE_KEY;
  const data = {};
  
  for (const ticker of tickers) {
    try {
      const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${ticker}&apikey=${key}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json['Global Quote']) {
        const quote = json['Global Quote'];
        data[ticker] = {
          price: parseFloat(quote['05. price']),
          changePercent: quote['10. change percent']
        };
      }
    } catch (e) { console.error(`${ticker} 수집 실패:`, e); }
  }
  return data;
}

async function fetchPortfolioData() {
  // 포트폴리오 데이터를 GitHub Secrets에 JSON 형태로 넣어두거나 여기서 직접 수정 가능합니다.
  return [
    { tk: 'RKLB', shares: 425, buyPrice: 17.2 },
    { tk: 'HOOD', shares: 100, buyPrice: 22.5 },
    { tk: 'TSLA', shares: 7, buyPrice: 290 }
    // ... 나머지 종목
  ];
}

async function fetchMarketNews() {
  const key = process.env.NEWS_API_KEY;
  const url = `https://newsapi.org/v2/everything?q=(Fed OR market)&sortBy=publishedAt&language=en&pageSize=5&apiKey=${key}`;
  try {
    const res = await fetch(url);
    const json = await res.json();
    return json.articles || [];
  } catch (e) { return []; }
}

// --- Grok API 호출 (기존 index.js 기반) ---

async function callGrokAPI(data) {
  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.GROK_API_KEY}`
    },
    body: JSON.stringify({
      model: 'grok-4-1-fast',
      messages: [
        {
          role: 'system',
          content: '당신은 전문 자산 관리자입니다. 한국어로 보고서 핵심 요약을 제공하세요. 텔레그램 전송용이므로 가독성 좋게 이모지를 섞어주세요.'
        },
        {
          role: 'user',
          content: `다음 데이터를 분석해줘: ${JSON.stringify(data)}`
        }
      ]
    })
  });

  const result = await response.json();
  return result.choices[0].message.content;
}

// --- 텔레그램 전송 로직 ---

function generateTelegramHTML(analysis, marketData) {
  const now = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  
  return `
<b>🚀 오늘의 AI 포트폴리오 분석</b>
📅 <i>${now}</i>

<b>[📊 주요 종목 현황]</b>
${Object.entries(marketData).slice(0, 5).map(([tk, d]) => `• <code>${tk}</code>: $${d.price} (${d.changePercent})`).join('\n')}

<b>[🤖 Grok 심층 분석]</b>
${analysis}

<a href="https://github.com/${process.env.GITHUB_REPOSITORY}">🔗 상세 로그 확인하기</a>
  `;
}

async function sendTelegramMessage(html) {
  const token = process.env.TELEGRAM_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: html,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    })
  });
  
  if (!res.ok) throw new Error(`텔레그램 전송 실패: ${await res.text()}`);
}

// 실행
main();
