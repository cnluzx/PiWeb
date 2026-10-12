/**
 * 流式吞吐度量：给「正在输出」的指示器提供实时速率，用来替代只显示一个累计 token 数。
 *
 * 记录两样东西（都在客户端测）：
 *   - 入站字节：每个事件负载的长度之和 —— 也就是「网速」，卡顿时它会掉到 0；
 *   - 输出字符：delta 事件里新增的正文/思考字符，除以 4 估成 token（与 SDK estimateTokens 同一口径）。
 *
 * 速率按滑动窗口算，并且分母用「当前时刻」，所以数据一停，速率就会随时间衰减到 0，
 * 配合 idleMs（距最近一次收到事件多久）就能把网络卡顿显式地表达出来。
 *
 * 纯逻辑、无 React 依赖，方便单测。
 */

export interface StreamMetrics {
	/** 最近窗口的输出速率（token/s，按字符 / 4 估算） */
	tokensPerSecond: number;
	/** 最近窗口的入站字节速率（B/s） */
	bytesPerSecond: number;
	/** 距最近一次收到事件的时间（毫秒）；没有收到过任何事件时为 0 */
	idleMs: number;
	/** 窗口内是否还在持续收数据 */
	active: boolean;
}

export const DEFAULT_METRIC_WINDOW_MS = 5000;
/** 采样最小间隔：事件很密的时候不必每条都留一个采样点 */
const SAMPLE_MIN_INTERVAL_MS = 200;
const MAX_SAMPLES = 400;
/** 字符 → token 的经验换算，与 SDK 的 estimateTokens 一致 */
const CHARS_PER_TOKEN = 4;

export interface StreamMetricsTracker {
	/** 每个到达的事件调用一次：dataLength 是负载长度，deltaChars 是本次新增的输出字符数 */
	record(dataLength: number, deltaChars: number, now: number): void;
	/** 取当前窗口内的速率快照（now 一般传 Date.now()） */
	snapshot(now: number): StreamMetrics;
	/** 换会话 / 重连时清零 */
	reset(): void;
}

export function createStreamMetrics(windowMs: number = DEFAULT_METRIC_WINDOW_MS): StreamMetricsTracker {
	let bytes = 0;
	let chars = 0;
	let lastAt = 0;
	let samples: Array<{ t: number; bytes: number; chars: number }> = [];

	return {
		reset(): void {
			bytes = 0;
			chars = 0;
			lastAt = 0;
			samples = [];
		},

		record(dataLength: number, deltaChars: number, now: number): void {
			if (Number.isFinite(dataLength) && dataLength > 0) bytes += dataLength;
			if (Number.isFinite(deltaChars) && deltaChars > 0) chars += deltaChars;
			lastAt = now;
			const last = samples[samples.length - 1];
			if (!last || now - last.t >= SAMPLE_MIN_INTERVAL_MS) {
				samples.push({ t: now, bytes, chars });
				if (samples.length > MAX_SAMPLES) samples.splice(0, samples.length - MAX_SAMPLES);
			} else {
				// 同一采样间隔内只更新累计值，让窗口里始终有最新数据
				last.bytes = bytes;
				last.chars = chars;
			}
		},

		snapshot(now: number): StreamMetrics {
			const idleMs = lastAt ? Math.max(0, now - lastAt) : 0;
			if (samples.length === 0) {
				return { tokensPerSecond: 0, bytesPerSecond: 0, idleMs, active: false };
			}
			const cutoff = now - windowMs;
			const latest = samples[samples.length - 1];
			// 窗口内最早的采样点作为基线；全都过期说明已经停了整个窗口
			let base: { t: number; bytes: number; chars: number } | undefined;
			for (const sample of samples) {
				if (sample.t >= cutoff) {
					base = sample;
					break;
				}
			}
			if (!base || !latest || latest.t < base.t) {
				return { tokensPerSecond: 0, bytesPerSecond: 0, idleMs, active: false };
			}
			// 分母用 now：数据停了以后分母继续变大，速率自然衰减到 0（而不是停在上一段的速度）
			const seconds = Math.max(0.25, (now - base.t) / 1000);
			return {
				tokensPerSecond: Math.max(0, (latest.chars - base.chars) / CHARS_PER_TOKEN / seconds),
				bytesPerSecond: Math.max(0, (latest.bytes - base.bytes) / seconds),
				idleMs,
				active: idleMs < windowMs,
			};
		},
	};
}
