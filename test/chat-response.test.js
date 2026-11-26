import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createChatResponse, parseChatOutput } from "../lib/application/create-chat-response.js";
import {
  createConversationAnalysis,
  parseAnalysisOutput
} from "../lib/application/create-conversation-analysis.js";
import { generateWithFallback } from "../lib/infrastructure/llm-router.js";

const silentLogger = { warn() {} };

function fakeProvider(name, output) {
  return {
    name,
    model: `${name}-model`,
    configError: null,
    calls: 0,
    async generate() {
      this.calls += 1;
      if (output instanceof Error) throw output;
      return output;
    }
  };
}

function generatorWith(providers) {
  return (request, options) => generateWithFallback(request, { ...options, providers, logger: silentLogger });
}

describe("llm router", () => {
  it("falls back to the next provider when the first fails", async () => {
    const ollama = fakeProvider("ollama", new Error("Timeout after 25000 ms"));
    const groq = fakeProvider("groq", "hola");
    const result = await generateWithFallback({}, { providers: [ollama, groq], logger: silentLogger });
    assert.equal(result.provider, "groq");
    assert.equal(result.text, "hola");
  });

  it("falls back when the output cannot be parsed", async () => {
    const ollama = fakeProvider("ollama", "no es json");
    const groq = fakeProvider("groq", '{"reply":"Vale"}');
    const result = await generateWithFallback(
      {},
      { providers: [ollama, groq], parse: (raw) => (raw.startsWith("{") ? { raw } : null), logger: silentLogger }
    );
    assert.equal(result.provider, "groq");
  });

  it("skips unconfigured providers and fails clearly when none is usable", async () => {
    const unconfigured = { ...fakeProvider("groq", "x"), configError: "GROQ_API_KEY is not configured" };
    await assert.rejects(
      generateWithFallback({}, { providers: [unconfigured], logger: silentLogger }),
      (error) => error.code === "NO_PROVIDER"
    );
  });
});

describe("chat response", () => {
  it("parses counselor JSON and only alerts on urgent risk", async () => {
    const generate = generatorWith([
      fakeProvider("ollama", '{"reply":"Eso que cuentas es control, no amor. ¿Cómo te sientes?","risk":"concern"}')
    ]);
    const response = await createChatResponse(
      { messages: [{ role: "user", text: "Mi novio me revisa el móvil" }], language: "es", simulatorMode: "iris", difficulty: "moderada" },
      { generate, instituteContext: "" }
    );

    assert.match(response.response, /control/);
    assert.equal(response.riskLevel, "concern");
    assert.equal(response.safetyAlert, undefined);
    assert.equal(response.provider, "ollama");
  });

  it("raises the safety alert on high-risk user messages even if the model says none", async () => {
    const generate = generatorWith([fakeProvider("groq", '{"reply":"Estoy aquí contigo.","risk":"none"}')]);
    const response = await createChatResponse(
      { messages: [{ role: "user", text: "me quiero morir" }], language: "es", simulatorMode: "iris", difficulty: "moderada" },
      { generate, instituteContext: "" }
    );
    assert.equal(response.safetyAlert, true);
    assert.match(response.safetyMessage, /024/);
  });

  it("returns partner red flags with labels and never alerts on the partner's toxic text", async () => {
    const generate = generatorWith([
      fakeProvider(
        "ollama",
        JSON.stringify({
          reply: "¿Y con quién estabas? Mándame la ubicación ya.",
          redFlags: [
            { tactic: "vigilancia", explanation: "Te pide la ubicación para vigilarte." },
            { tactic: "inventada", explanation: "No existe" }
          ]
        })
      )
    ]);
    const response = await createChatResponse(
      { messages: [{ role: "user", text: "Estaba con mis amigos" }], language: "es", simulatorMode: "partner", difficulty: "moderada" },
      { generate, instituteContext: "" }
    );

    assert.equal(response.safetyAlert, undefined);
    assert.deepEqual(response.redFlags, [
      { tactic: "vigilancia", label: "Vigilancia del móvil o ubicación", explanation: "Te pide la ubicación para vigilarte." }
    ]);
  });

  it("steps out of character without calling the model when the user is in real danger", async () => {
    const provider = fakeProvider("ollama", '{"reply":"no debería usarse"}');
    const response = await createChatResponse(
      { messages: [{ role: "user", text: "mi pareja me pega de verdad" }], language: "es", simulatorMode: "partner", difficulty: "intensa" },
      { generate: generatorWith([provider]), instituteContext: "" }
    );
    assert.equal(provider.calls, 0);
    assert.equal(response.safetyAlert, true);
    assert.match(response.response, /Salgo de la simulación/);
  });

  it("recovers a plain reply when the model ignores the JSON format", async () => {
    const generate = generatorWith([fakeProvider("ollama", "Vale, ya hablamos luego.")]);
    const response = await createChatResponse(
      { messages: [{ role: "user", text: "Hola" }], language: "es", simulatorMode: "partner", difficulty: "sutil" },
      { generate, instituteContext: "" }
    );
    assert.equal(response.response, "Vale, ya hablamos luego.");
    assert.deepEqual(response.redFlags, []);
  });

  it("parses fenced JSON output", () => {
    const parsed = parseChatOutput('```json\n{"reply":"Hola","risk":"urgent"}\n```', { simulatorMode: "iris", language: "es" });
    assert.equal(parsed.riskLevel, "urgent");
  });
});

describe("conversation analysis", () => {
  it("normalizes the analysis report", async () => {
    const raw = JSON.stringify({
      score: 134,
      summary: "Has puesto límites claros.",
      strengths: ["No mandaste la ubicación", ""],
      improvements: ["No hace falta justificarte tanto"],
      tacticsDetected: [{ tactic: "culpa", example: "Después de todo lo que hago por ti" }, { tactic: "x", example: "y" }],
      betterResponses: [{ partnerMessage: "Mándame la ubicación", suggestion: "No, confía en mí." }]
    });
    const report = await createConversationAnalysis(
      {
        messages: [
          { role: "assistant", text: "Mándame la ubicación" },
          { role: "user", text: "No" }
        ],
        language: "es",
        difficulty: "moderada"
      },
      { generate: generatorWith([fakeProvider("groq", raw)]) }
    );

    assert.equal(report.score, 100);
    assert.deepEqual(report.strengths, ["No mandaste la ubicación"]);
    assert.equal(report.tacticsDetected.length, 1);
    assert.equal(report.tacticsDetected[0].label, "Hacerte sentir culpable");
    assert.equal(report.provider, "groq");
  });

  it("rejects analysis output without score or summary", () => {
    assert.equal(parseAnalysisOutput('{"summary":"x"}', { language: "es" }), null);
  });
});
