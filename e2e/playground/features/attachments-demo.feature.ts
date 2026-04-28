import { strictEqual } from "node:assert";
import { attach, log, orquestra } from "@orquestra/core";

const feature = orquestra.feature("attachments and logs demo", {
	context:
		"Showcases every attachment type (text, markdown, json, image, file) and a variety of log values, including inline content and disk spillover for oversized payloads.",
	domain: "integrations",
	as: "platform",
	I: "want to attach diagnostics to my steps",
	so: "PMs and reviewers can validate test runs without re-executing them",
});

feature
	.scenario("attaches one of every type — all inline")
	.given("a synthetic AI response shaped result", () => {
		const aiResponse = {
			model: "gpt-5",
			text: "Based on your purchase history (camera, lens), I recommend a tripod, a memory card, and a camera bag.",
			toolCalls: [
				{ name: "search_products", args: { category: "photography accessories" } },
				{ name: "get_user_history", args: { userId: "user-42" } },
			],
			usage: { input: 1250, output: 187 },
			intent: "product_recommendation",
			latencyMs: 812,
		};
		return { aiResponse };
	})
	.when("I attach every supported type", ({ aiResponse }) => {
		attach({ name: "Prompt", type: "text", data: "What should I buy next?" });

		attach({
			name: "AI response",
			type: "markdown",
			data: [
				"# Recommendations",
				"",
				"Based on your purchase history I recommend:",
				"",
				"1. **Tripod** — pairs with the camera you already own",
				"2. **Memory card** — 64GB or higher",
				"3. **Camera bag** — to protect everything",
				"",
				`> Confidence: ${aiResponse.intent === "product_recommendation" ? "high" : "low"}`,
			].join("\n"),
		});

		attach({
			name: "Tool calls",
			type: "json",
			data: aiResponse.toolCalls,
		});

		// 1x1 transparent PNG (the smallest valid PNG)
		const tinyPng = Buffer.from(
			"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=",
			"base64",
		);
		attach({ name: "Snapshot", type: "image", data: tinyPng, mimeType: "image/png" });

		const csv = "id,name,score\n1,alpha,0.94\n2,beta,0.71\n3,gamma,0.38\n";
		attach({ name: "Scores CSV", type: "file", data: Buffer.from(csv, "utf8"), mimeType: "text/csv" });
	})
	.then("the synthetic flow ran end to end", ({ aiResponse }) => {
		strictEqual(aiResponse.intent, "product_recommendation");
		strictEqual(aiResponse.toolCalls[0].name, "search_products");
	});

feature
	.scenario("emits a variety of logs — strings, numbers, booleans, objects and null")
	.when("I record metrics covering primitives and structures", () => {
		log("model", "gpt-5");
		log("intent_classified", "product_recommendation");
		log("token_cost", { input: 1250, output: 187, total: 1437 });
		log("latency_ms", 812);
		log("temperature", 0.7);
		log("from_cache", false);
		log("retries", 0);
		log("trace_id", "trace-9f4a1b2c");
		log("error_message", null);
		log("tags", ["recommendation", "vision-disabled", "english"]);
	})
	.then("logs are recorded inline on the step event", () => {
		// nothing to assert here — purpose is to exercise the writer
	});

feature
	.scenario("triggers spillover when text and json exceed the inline threshold")
	.given("a payload larger than the default 50KB inline threshold", () => {
		const longText = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(1500);
		const bigJson = {
			items: Array.from({ length: 800 }, (_, i) => ({
				id: i,
				label: `item-${i}`,
				score: Math.random(),
				tags: ["alpha", "beta", "gamma"],
			})),
		};
		return { longText, bigJson };
	})
	.when("I attach payloads that should land on disk", ({ longText, bigJson }) => {
		attach({ name: "Long transcript", type: "text", data: longText });
		attach({ name: "Bulk results", type: "json", data: bigJson });
	})
	.then("they get written to outputDir/attachments instead of bloating artifact.json", ({ longText }) => {
		// At ~57 bytes per repeat × 1500 = ~85KB, this is well over 50KB.
		strictEqual(longText.length > 50_000, true);
	});

feature
	.scenario("captures diagnostics for a quality regression detection")
	.given("a fixture that reports a score below the quality threshold", () => {
		const result = { score: 0.42, threshold: 0.8 };
		return { result };
	})
	.when("I record diagnostics before asserting", ({ result }) => {
		attach({
			name: "Inspector report",
			type: "markdown",
			data: [
				"## Quality regression",
				"",
				`- Observed score: **${result.score}**`,
				`- Threshold:      **${result.threshold}**`,
				"- Verdict:        below threshold",
			].join("\n"),
		});
		attach({ name: "Raw result", type: "json", data: result });
		log("score", result.score);
		log("threshold", result.threshold);
		log("delta", result.score - result.threshold);
	})
	.then("the regression detector flags the result as below threshold", ({ result }) => {
		strictEqual(result.score < result.threshold, true);
	});
