import { describe, expect, it } from "vitest";
import { createStreamMetrics } from "../src/lib/stream-metrics";

describe("createStreamMetrics", () => {
	it("没有数据时全为 0", () => {
		const metrics = createStreamMetrics(5000);
		expect(metrics.snapshot(1000)).toEqual({ tokensPerSecond: 0, bytesPerSecond: 0, idleMs: 0, active: false });
	});

	it("按窗口算 token/s 与字节/s（字符 / 4 估 token）", () => {
		const metrics = createStreamMetrics(5000);
		metrics.record(100, 8, 1000);
		metrics.record(100, 8, 2000);
		metrics.record(100, 8, 3000);
		const snap = metrics.snapshot(3000);
		// 2 秒内：新增 16 字符 = 4 token → 2 tok/s；新增 200 字节 → 100 B/s
		expect(snap.tokensPerSecond).toBeCloseTo(2, 5);
		expect(snap.bytesPerSecond).toBeCloseTo(100, 5);
		expect(snap.idleMs).toBe(0);
		expect(snap.active).toBe(true);
	});

	it("数据停了以后速率随时间衰减、idleMs 增长", () => {
		const metrics = createStreamMetrics(5000);
		metrics.record(100, 8, 1000);
		metrics.record(100, 8, 2000);
		metrics.record(100, 8, 3000);
		// now 比最后一次数据晚 2 秒：分母变大 → 速率衰减
		const decayed = metrics.snapshot(5000);
		expect(decayed.tokensPerSecond).toBeCloseTo(1, 5);
		expect(decayed.bytesPerSecond).toBeCloseTo(50, 5);
		expect(decayed.idleMs).toBe(2000);
		expect(decayed.active).toBe(true);
		// 超过整个窗口没有数据 → 归零
		const gone = metrics.snapshot(10000);
		expect(gone.tokensPerSecond).toBe(0);
		expect(gone.bytesPerSecond).toBe(0);
		expect(gone.active).toBe(false);
		expect(gone.idleMs).toBe(7000);
	});

	it("同一采样间隔内的多次 record 合并成一个采样点，累计值不丢", () => {
		const metrics = createStreamMetrics(5000);
		metrics.record(50, 4, 1000);
		metrics.record(50, 4, 1050);
		metrics.record(50, 4, 1100);
		metrics.record(50, 4, 1300);
		const snap = metrics.snapshot(1300);
		// 基点 t=1000（150B/12c），最新 t=1300（200B/16c）：0.3s → 50B / 0.3s
		expect(snap.bytesPerSecond).toBeCloseTo(50 / 0.3, 3);
		expect(snap.idleMs).toBe(0);
	});

	it("reset 后回到初始状态", () => {
		const metrics = createStreamMetrics(5000);
		metrics.record(100, 8, 1000);
		metrics.record(100, 8, 2000);
		metrics.reset();
		expect(metrics.snapshot(2000)).toEqual({ tokensPerSecond: 0, bytesPerSecond: 0, idleMs: 0, active: false });
	});
});
