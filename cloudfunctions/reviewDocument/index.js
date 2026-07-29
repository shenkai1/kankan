const cloud = require("wx-server-sdk");
const https = require("https");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const OPENAI_URL = "https://api.openai.com/v1/responses";

exports.main = async (event) => {
  const apiKey = process.env.OPENAI_API_KEY;

  if (process.env.MOCK_OPENAI === "1") {
    const payload = normalizePayload(event);
    return {
      ok: true,
      data: {
        summary: "Mock review completed.",
        issues: ["示例：统一标题标点", "示例：压缩过长句子", "示例：优化表达语气"],
        rewrittenText: payload.text || "这是一个用于本地测试的改写结果。真实云端运行时请配置 OPENAI_API_KEY。",
      },
    };
  }

  if (!apiKey) {
    return {
      ok: false,
      error: "OPENAI_API_KEY is not configured",
    };
  }

  const payload = normalizePayload(event);

  if (!payload.text.trim()) {
    return {
      ok: true,
      data: {
        summary: "已收到文件，但暂未收到可检查的正文内容。",
        issues: ["当前版本还没有接入 PDF/Word/TXT 正文解析。", "请先把正文粘贴到文本框，或后续接入云端文件解析模块。"],
        rewrittenText: "文件已上传，但云函数目前只收到文件名和格式信息，未收到文件正文。请粘贴正文后重新检查，或接入文件解析模块后再直接处理上传文件。",
      },
    };
  }

  try {
    const data = await postJson(OPENAI_URL, apiKey, {
      model: payload.model,
      max_output_tokens: 900,
      input: [
        {
          role: "system",
          content: "You are KanKan, a precise document grammar, translation, and tone rewriting assistant.",
        },
        {
          role: "user",
          content: buildUserPrompt(payload),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "document_review",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              summary: { type: "string" },
              issues: {
                type: "array",
                items: { type: "string" },
              },
              rewrittenText: { type: "string" },
            },
            required: ["summary", "issues", "rewrittenText"],
          },
        },
      },
    });

    if (data.statusCode < 200 || data.statusCode >= 300) {
      return {
        ok: false,
        error: (data.body.error && data.body.error.message) || `OpenAI request failed: ${data.statusCode}`,
        statusCode: data.statusCode,
      };
    }

    return {
      ok: true,
      data: parseStructuredOutput(data.body),
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message || "OpenAI request failed",
    };
  }
};

function normalizePayload(event) {
  return {
    model: process.env.OPENAI_MODEL || event.model || "gpt-5.6-sol",
    file: event.file || {},
    text: event.text || "",
    preferences: event.preferences || {},
    prompt: event.prompt || "",
  };
}

function postJson(url, apiKey, body) {
  return new Promise((resolve, reject) => {
    const timeoutMs = Number(process.env.OPENAI_TIMEOUT_MS || 45000);
    const request = https.request(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    }, (response) => {
      let raw = "";

      response.on("data", (chunk) => {
        raw += chunk;
      });

      response.on("end", () => {
        try {
          resolve({
            statusCode: response.statusCode,
            body: raw ? JSON.parse(raw) : {},
          });
        } catch (error) {
          reject(error);
        }
      });
    });

    request.on("error", reject);
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`OpenAI request timed out after ${timeoutMs / 1000} seconds`));
    });
    request.write(JSON.stringify(body));
    request.end();
  });
}

function buildUserPrompt(payload) {
  return [
    payload.prompt,
    "",
    "File information:",
    JSON.stringify(payload.file),
    "",
    "User preferences:",
    JSON.stringify(payload.preferences),
    "",
    "Text to review:",
    payload.text || "The user uploaded a file. If file text is empty, explain that text extraction must be added before full review.",
  ].join("\n");
}

function parseStructuredOutput(data) {
  const text = data.output_text || findOutputText(data);

  if (!text) {
    return {
      summary: "OpenAI returned no text output.",
      issues: [],
      rewrittenText: "",
    };
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    return {
      summary: "OpenAI returned plain text instead of JSON.",
      issues: [],
      rewrittenText: text,
    };
  }
}

function findOutputText(data) {
  const output = data.output || [];

  for (const item of output) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) {
        return content.text;
      }
    }
  }

  return "";
}
