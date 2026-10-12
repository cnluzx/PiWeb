// @vitest-environment jsdom
/**
 * 流式「正在输出」指示：末尾不再是只显示一个累计 token 数，而是实时 token/s（+网速）；
 * 长时间收不到数据（且没有工具在跑）时显式给出「网络等待」，补上网络问题的弱反馈。
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { ChatWindow } from "@/components/ChatWindow";
import type { StreamMetrics } from "@/lib/stream-metrics";
import type { WebMessage } from "@/lib/types";

afterEach(cleanup);

const READY_TIMEOUT_MS = 20_000;

const streaming = {
	role: "assistant",
	id: "a1",
	content: [{ type: "text", text: "正在输出一段回答。" }],
	stopReason: "pending",
	timestamp: 1,
} as unknown as WebMessage;

function getMetrics(overrides: Partial<StreamMetrics>): () => StreamMetrics {
	const value: StreamMetrics = { tokensPerSecond: 0, bytesPerSecond: 0, idleMs: 0, active: false, ...overrides };
	return () => value;
}

describe("流式吞吐指示", () => {
	it("显示实时 token/s 与入站速率（网速）", async () => {
		const { container } = render(
			<ChatWindow
				messages={[streaming]}
				tools={{}}
				isStreaming
				getStreamMetrics={getMetrics({ tokensPerSecond: 42, bytesPerSecond: 131072, idleMs: 200, active: true })}
			/>,
		);
		await waitFor(() => expect(container.textContent).toContain("42 tok/s"), { timeout: READY_TIMEOUT_MS });
		expect(container.textContent).toContain("128 KB/s");
	});

	it("长时间没有数据且无工具在跑时显示「网络等待」", async () => {
		const { container } = render(
			<ChatWindow
				messages={[streaming]}
				tools={{}}
				isStreaming
				getStreamMetrics={getMetrics({ idleMs: 5000, active: false })}
			/>,
		);
		await waitFor(() => expect(container.textContent).toContain("网络等待 5s"), { timeout: READY_TIMEOUT_MS });
	});
});
