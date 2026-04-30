/**
 * src/index.js
 * 제미나이(Gemini) API 기반 주식 분석 및 텔레그램 보고서 전송 스크립트
 */

async function main() {
  console.log('🚀 주식 보고서 생성 프로세스 시작');
  
  try {
    // 1. 데이터 수집
    const marketData = await fetchMarketData();
    const holdings = await fetchPortfolioData();
    const news = await fetchMarketNews();
    console.log('✓ 시장 데이터 및 뉴스 수집 완료');
    
    // 2. 제미나이(Gemini) API 분석 호출
    const analysisText = await callGeminiAPI({
      marketData,
      holdings,
      news,
      timestamp: new Date().toISOString()
    });
    console.log('✓ 제미나이 AI 분석 완료');
    
    // 3. 텔레그램용 HTML 메시지 생성
    const finalHtml = generateTelegramHTML(analysisText, marketData);
    
    // 4. 텔레그램 전송
    await sendTelegramMessage(finalHtml);
    console.log('📊 텔레그램 보고서 전송 성공!');
    
  } catch (error) {
    console.error('❌ 실행 중 오류 발생:', error);
    process.exit(1); // 오류 발생 시 GitHub Actions에 실패 알림
  }
}

/**
 * 주가 데이터 수집 (Alpha Vantage API)
 */
async function fetchMarketData() {
  // 분석할 종목 리스트 (원하는 대로 수정 가능)
  const tickers = ['TSLA', 'NVDA', 'AAPL', 'MSFT', 'GOOGL'];
  const apiKey = process.env.ALPHA_VANTAGE_KEY;
  const data = {};
  
  for (const ticker of tickers) {
    try {
      const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${ticker}&apikey=${apiKey}`;
      const res = await fetch(url);
      const json = await res.json();
      
      if (json['Global Quote']) {
        const quote = json['Global Quote'];
        data[ticker] = {
          price: parseFloat(quote['05. price']).toFixed(2),
          changePercent: quote['10. change percent']
        };
      }
    } catch (e) {
      console.error(`${ticker} 데이터 수집 실패:`, e);
    }
  }
  return data;
}

/**
 * 내 포트폴리오 데이터 (비중 확인용)
 */
async function fetchPortfolioData() {
  // 본인의 실제 보유 종목으로 수정하세요
  return [
    { tk: 'TSLA', shares: 10, buyPrice: 180.50 },
    { tk: 'NVDA', shares: 5, buyPrice: 450.20 }
  ];
}

/**
 * 시황 뉴스 수집 (NewsAPI)
 */
async function fetchMarketNews() {
  const apiKey = process.env.NEWS_API_KEY;
  const url = `https://newsapi.org/v2/everything?q=(stock market OR Fed OR economy)&sortBy=publishedAt&language=en&pageSize=5&apiKey=${apiKey}`;
  
  try {
    const res = await fetch(url);
    const json = await res.json();
    return (json.articles || []).map(a => a.title);
  } catch (e) {
    console.error('뉴스 수집 실패:', e);
    return [];
  }
}

/**
 * 제미나이(Gemini) API 분석 호출
 */
async function callGeminiAPI(data) {
  const apiKey = process.env.GEMINI_API_KEY;
  // Gemini 1.5 Flash 모델 사용 (빠르고 무료 티어 넉넉함)
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  const prompt = `
    당신은 전문 주식 투자 전략가입니다. 아래 제공된 데이터를 분석하여 투자 보고서를 작성하세요.
    
    [데이터]
    - 현재 주가: ${JSON.stringify(data.marketData)}
    - 보유 종목: ${JSON.stringify(data.holdings)}
    - 주요 뉴스: ${data.news.join(', ')}
    
    [요구사항]
    1. 한국어로 작성할 것.
    2. 텔레그램 메시지용이므로 가독성 좋게 이모지를 사용할 것.
    3. 핵심 요약, 종목별 의견, 리스크 요인을 포함할 것.
    4. HTML 태그(<b>, <i>, <code>)를 적절히 섞어 가독성을 높일 것.
  `;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    })
  });

  const result = await response.json();
  if (!result.candidates) {
    console.error('Gemini 응답 오류:', JSON.stringify(result));
    throw new Error('Gemini API 응답을 받지 못했습니다.');
  }
  return result.candidates[0].content.parts[0].text;
}

/**
 * 텔레그램 메시지 HTML 구성
 */
function generateTelegramHTML(analysisText, marketData) {
  const now = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  
  return `
<b>🚀 AI 주식 분석 보고서</b>
📅 <i>일시: ${now}</i>

<b>[📈 주요 종목 현황]</b>
${Object.entries(marketData).map(([tk, d]) => `• <code>${tk}</code>: <b>$${d.price}</b> (${d.changePercent})`).join('\n')}

<b>[🤖 AI 추론 분석]</b>
${analysisText}

<a href="https://github.com/${process.env.GITHUB_REPOSITORY}">🔍 실행 로그 확인</a>
  `;
}

/**
 * 텔레그램 메시지 전송
 */
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

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`텔레그램 전송 실패: ${errText}`);
  }
}

// 실행 시작
main();
