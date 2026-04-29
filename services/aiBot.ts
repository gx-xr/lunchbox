/**
 * services/aiBot.ts
 * ✅ EMA 전략 (EvaluateEmaStrategy)
 */
 
export type TradeSignal = 'None' | 'Buy' | 'Sell';
 
export interface MacdResult {
  macd: number;
  signal: number;
  histogram: number;
}
 
export interface BollingerBand {
  upper: number;
  middle: number;
  lower: number;
}
 
export interface CandleBar {
  date: string;   // yyyyMMdd
  time: string;   // HHmmss
  close: number;
}
 
// ── EMA 계산 ─────────────────────────────────────────────────
function calculateEMA(prices: number[], period: number): number[] {
  if (prices.length < period) return [];
 
  const k = 2 / (period + 1);
  const ema: number[] = [];
 
  // 첫 EMA = SMA
  const sma = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  ema.push(sma);
 
  for (let i = period; i < prices.length; i++) {
    const value = prices[i] * k + ema[ema.length - 1] * (1 - k);
    ema.push(value);
  }
 
  return ema;
}
 
// ── MACD 계산 ────────────────────────────────────────────────
function calculateMACD(
  prices: number[],
  fast = 12,
  slow = 26,
  signal = 9
): MacdResult | null {
  if (prices.length < slow + signal) return null;
 
  const emaFast = calculateEMA(prices, fast);
  const emaSlow = calculateEMA(prices, slow);
 
  const offset = slow - fast;
  const macdLine: number[] = [];
  for (let i = offset; i < emaFast.length; i++) {
    macdLine.push(emaFast[i] - emaSlow[i - offset]);
  }
 
  const signalLine = calculateEMA(macdLine, signal);
  if (signalLine.length === 0) return null;
 
  const macd = macdLine[macdLine.length - 1];
  const sig = signalLine[signalLine.length - 1];
 
  return {
    macd,
    signal: sig,
    histogram: macd - sig,
  };
}
 
// ── RSI 계산 ─────────────────────────────────────────────────
function calculateRSI(prices: number[], period = 14): number {
  if (prices.length <= period) return 50;
 
  let gain = 0;
  let loss = 0;
 
  for (let i = 1; i <= period; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) gain += diff;
    else loss -= diff;
  }
 
  let avgGain = gain / period;
  let avgLoss = loss / period;
 
  for (let i = period + 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    const g = diff > 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
  }
 
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}
 
// ── 볼린저 밴드 계산 ─────────────────────────────────────────
function calculateBollinger(
  prices: number[],
  period = 20,
  multiplier = 2
): BollingerBand | null {
  if (prices.length < period) return null;
 
  const recent = prices.slice(-period);
  const ma = recent.reduce((a, b) => a + b, 0) / period;
  const variance = recent.reduce((sum, p) => sum + (p - ma) ** 2, 0) / period;
  const stdDev = Math.sqrt(variance);
 
  return {
    middle: ma,
    upper: ma + multiplier * stdDev,
    lower: ma - multiplier * stdDev,
  };
}
 
// ── AiBot 클래스 ─────────────────────────────────────────────
export class AiBot {
  private closePrices: number[];
 
  constructor(candles: CandleBar[]) {
    this.closePrices = candles
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
      .map(c => c.close);
  }
 
  get latestClosePrice(): number {
    if (this.closePrices.length === 0) throw new Error('가격 데이터가 없습니다.');
    return this.closePrices[this.closePrices.length - 1];
  }
 
  // ── EMA 전략 ─────────────────────────────────────────────
    // EMA9 vs EMA26 크로스 + 기울기
  evaluateEmaStrategy(): TradeSignal {
    const prices = this.closePrices;
    if (prices.length < 30) return 'None';
 
    const emaFast = calculateEMA(prices, 9);   // EMA9
    const emaSlow = calculateEMA(prices, 26);  // EMA26
 
    if (emaFast.length < 3 || emaSlow.length < 2) return 'None';
 
    const fastLast = emaFast[emaFast.length - 1];
    const fastPrev = emaFast[emaFast.length - 2];
    const fastPrev3 = emaFast[emaFast.length - 3];
    const slowLast = emaSlow[emaSlow.length - 1];
    const slowPrev = emaSlow[emaSlow.length - 2];
 
    // 추세 판단 (골든크로스 / 데드크로스)
    const emaUpTrend = fastLast > slowLast && fastPrev <= slowPrev;
    const emaDownTrend = fastLast < slowLast && fastPrev >= slowPrev;
 
    // 기울기
    const emaFastRising = fastLast > fastPrev3;
    const emaFastFalling = fastLast < fastPrev3;
 
    if (emaUpTrend && emaFastRising) return 'Buy';
    if (emaDownTrend && emaFastFalling) return 'Sell';
 
    return 'None';
  }
 
  // ── EMA + MACD 복합 전략 ─────────────────────────────────
  evaluateEmaMacdStrategy(): TradeSignal {
    const prices = this.closePrices;
    if (prices.length < 40) return 'None';
 
    const emaFast = calculateEMA(prices, 9);
    const emaSlow = calculateEMA(prices, 26);
    const macd = calculateMACD(prices);
 
    if (!macd || emaFast.length < 3 || emaSlow.length < 2) return 'None';
 
    const fastLast = emaFast[emaFast.length - 1];
    const fastPrev = emaFast[emaFast.length - 2];
    const fastPrev3 = emaFast[emaFast.length - 3];
    const slowLast = emaSlow[emaSlow.length - 1];
    const slowPrev = emaSlow[emaSlow.length - 2];
 
    const emaUpTrend = fastLast > slowLast && fastPrev <= slowPrev;
    const emaDownTrend = fastLast < slowLast && fastPrev >= slowPrev;
    const emaFastRising = fastLast > fastPrev3;
    const emaFastFalling = fastLast < fastPrev3;
 
    const macdGoldenCross = macd.histogram > 0 && macd.macd > macd.signal;
    const macdDeadCross = macd.histogram < 0 && macd.macd < macd.signal;
 
    if (emaUpTrend && emaFastRising && macdGoldenCross) return 'Buy';
    if (emaDownTrend && emaFastFalling && macdDeadCross) return 'Sell';
 
    return 'None';
  }
 
  calculateRSI(period = 14): number {
    return calculateRSI(this.closePrices, period);
  }
 
  calculateMACD(): MacdResult | null {
    return calculateMACD(this.closePrices);
  }
 
  calculateBollinger(period = 20, multiplier = 2): BollingerBand | null {
    return calculateBollinger(this.closePrices, period, multiplier);
  }
}