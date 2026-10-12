// @vitest-environment jsdom
/**
 * 流式「正在输出」指示：末尾只显示实时 token 速度（token/s）。
 * 不再显示总输出 token（交给底部统计条），也不再显示网速 / 「网络等待」。
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
	it("只显示实时 token/s，不显示网速与网络等待", async () => {
		const { container } = render(
			<ChatWindow
				messages={[streaming]}
				tools={{}}
				isStreaming
				getStreamMetrics={getMetrics({ tokensPerSecond: 42, bytesPerSecond: 131072, idleMs: 200, active: true })}
			/>,
		);
		await waitFor(() => expect(container.textContent).toContain("42 tok/s"), { timeout: READY_TIMEOUT_MS });
		expect(container.textContent).not.toContain("KB/s");
		expect(container.textContent).not.toContain("网络等待");
	});

	it("速率为 0 时不显示 token 数字，也不显示网络等待", async () => {
		const { container } = render(
			<ChatWindow
				messages={[streaming]}
				tools={{}}
				isStreaming
				getStreamMetrics={getMetrics({ idleMs: 8000, active: false })}
			/>,
		);
		// 等指示器出现（有英文状态词），确认组件确实渲染了
		await waitFor(() => expect(container.textContent).toContain("Working for"), { timeout: READY_TIMEOUT_MS });
		expect(container.textContent).not.toContain("tok/s");
		expect(container.textContent).not.toContain("网络等待");
	});
});
