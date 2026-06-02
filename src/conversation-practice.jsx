import { useState, useRef, useEffect } from "react";

const LAYERS = [
  { key: "heard",   icon: "👂", label: "听到了什么",    sub: "对方字面上说了什么？" },
  { key: "unsaid",  icon: "🌊", label: "没有说的是什么", sub: "哪些信息被省略、模糊或回避了？" },
  { key: "why_say", icon: "🧠", label: "为什么这么说",   sub: "Ta 说这句话的动机或情绪是什么？" },
  { key: "why_me",  icon: "🪞", label: "为什么对我说",   sub: "Ta 选择对你说，背后有什么意义？" },
];

const SYSTEM_PROMPT = `你是一位对话分析与沟通教练，帮助用户练习深度倾听和人际洞察。

【生成场景】
用户请求场景时，返回JSON：
{
  "scenario": "场景描述（2-3句，有具体背景、关系、时间地点）",
  "line": "对白内容（耐人寻味、有多层解读空间，不要太极端）",
  "speaker": "说话的人（e.g. 你的同事小张）"
}

【四层分析反馈】
用户提交四层分析后，返回JSON：
{
  "heard_feedback": "对听到了什么的反馈",
  "unsaid_feedback": "对没有说的是什么的反馈",
  "why_say_feedback": "对为什么这么说的反馈",
  "why_me_feedback": "对为什么对我说的反馈",
  "synthesis": "综合洞察，把四层串起来"
}

【回应评价】
用户提交他打算怎么回应对方后，结合场景、对白、以及他之前的四层分析，评价他的回应。
返回JSON：
{
  "response_score": "优秀 / 良好 / 还可以 / 需改进（四选一）",
  "what_works": "这个回应做得好的地方（具体）",
  "what_misses": "这个回应可能忽略或踩雷的地方（如果没有明显问题就写没有明显问题）",
  "better_version": "一个更好的回应示例（自然口语，不要太完美显得不真实）",
  "why_better": "解释为什么那样回应更好"
}

通用要求：
- 所有回复都用中文
- 语气像有经验的朋友，不像老师批改作业
- 先肯定再补充
- 只返回JSON，不加任何前缀或解释文字`;

async function callAI(userMessage) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${import.meta.env.VITE_API_KEY}`,
    },
    body: JSON.stringify({
      model: "google/gemini-flash-1.5",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      max_tokens: 1200,
    }),
  });
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || "";
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON: " + text.slice(0, 120));
  return JSON.parse(text.slice(start, end + 1));
}

const SCORE_COLOR = {
  "优秀":   { bg: "#1a6b3a", color: "#e8f8ee" },
  "良好":   { bg: "#2d5a8e", color: "#e8f0fb" },
  "还可以": { bg: "#7a5c00", color: "#fdf4dc" },
  "需改进": { bg: "#8e2d2d", color: "#fde8e8" },
};

const STEP_ORDER = ["practice", "submitting", "feedback", "respond", "evaluating", "response_eval"];

export default function App() {
  const [phase, setPhase]               = useState("intro");
  const [scenario, setScenario]         = useState(null);
  const [answers, setAnswers]           = useState({ heard: "", unsaid: "", why_say: "", why_me: "" });
  const [feedback, setFeedback]         = useState(null);
  const [myResponse, setMyResponse]     = useState("");
  const [responseEval, setResponseEval] = useState(null);
  const [round, setRound]               = useState(1);
  const [activeLayer, setActiveLayer]   = useState(0);
  const [error, setError]               = useState(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    if ((phase === "practice" || phase === "respond") && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [phase, activeLayer]);

  async function startRound() {
    setPhase("loading");
    setError(null);
    setAnswers({ heard: "", unsaid: "", why_say: "", why_me: "" });
    setFeedback(null);
    setMyResponse("");
    setResponseEval(null);
    setActiveLayer(0);
    try {
      const data = await callAI("请给我一个对话练习场景。");
      setScenario(data);
      setPhase("practice");
    } catch (e) {
      setPhase("intro");
      setError("加载失败，请重试。");
    }
  }

  async function submitAnalysis() {
    setPhase("submitting");
    setError(null);
    try {
      const msg = `场景：${scenario.scenario}\n对白（${scenario.speaker}说）："${scenario.line}"\n\n我的四层分析：\n1. 听到了什么：${answers.heard}\n2. 没有说的是什么：${answers.unsaid}\n3. 为什么这么说：${answers.why_say}\n4. 为什么对我说：${answers.why_me}\n\n请给我四层分析的反馈。`;
      const data = await callAI(msg);
      setFeedback(data);
      setPhase("feedback");
    } catch (e) {
      setPhase("practice");
      setError("反馈获取失败，请再试一次。");
    }
  }

  async function submitResponse() {
    setPhase("evaluating");
    setError(null);
    try {
      const msg = `场景：${scenario.scenario}\n${scenario.speaker}说："${scenario.line}"\n\n我之前的四层分析：\n- 听到了什么：${answers.heard}\n- 没有说的：${answers.unsaid}\n- 为什么这么说：${answers.why_say}\n- 为什么对我说：${answers.why_me}\n\n我打算这样回应对方："${myResponse}"\n\n请评价我的回应。`;
      const data = await callAI(msg);
      setResponseEval(data);
      setPhase("response_eval");
    } catch (e) {
      setPhase("respond");
      setError("评价获取失败，请再试一次。");
    }
  }

  const canSubmitAnalysis = LAYERS.every(l => answers[l.key].trim().length > 10);
  const canSubmitResponse = myResponse.trim().length > 5;

  const loadingLabel = {
    loading:    { icon: "🌿", text: "生成场景中…" },
    submitting: { icon: "🔍", text: "分析反馈中…" },
    evaluating: { icon: "💬", text: "评价回应中…" },
  };

  const showProgress = !["intro", "loading", "submitting", "evaluating"].includes(phase);

  return (
    <div style={{
      minHeight: "100vh", background: "#f7f4ef",
      fontFamily: "'Georgia', 'STSong', serif",
      color: "#2a1f14", display: "flex", flexDirection: "column",
      alignItems: "center", padding: "20px 16px 60px",
    }}>
      <div style={{ textAlign: "center", marginBottom: "24px", marginTop: "8px" }}>
        <div style={{ fontSize: "28px", letterSpacing: "6px", fontWeight: "normal", color: "#3d2b1a" }}>听·懂</div>
        <div style={{ fontSize: "11px", color: "#9b7e65", letterSpacing: "3px", marginTop: "4px" }}>对话深度练习</div>
        {round > 1 && <div style={{ fontSize: "12px", color: "#b09070", marginTop: "5px" }}>第 {round} 轮</div>}
      </div>

      {showProgress && (
        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "22px" }}>
          {[
            { key: "practice",      label: "分析" },
            { key: "feedback",      label: "反馈" },
            { key: "respond",       label: "回应" },
            { key: "response_eval", label: "评价" },
          ].map(({ key, label }, i) => {
            const cur = STEP_ORDER.indexOf(phase);
            const pos = STEP_ORDER.indexOf(key);
            const done   = cur > pos;
            const active = cur === pos || (key === "respond" && phase === "evaluating");
            return (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                {i > 0 && <div style={{ width: "18px", height: "1px", background: done ? "#5a3522" : "#d4b89a" }} />}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "3px" }}>
                  <div style={{
                    width: "8px", height: "8px", borderRadius: "50%", transition: "all 0.3s",
                    background: done ? "#5a3522" : active ? "#c4956a" : "#d4b89a",
                  }} />
                  <div style={{ fontSize: "10px", color: done ? "#5a3522" : active ? "#8a5a3a" : "#b09070" }}>{label}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ width: "100%", maxWidth: "540px" }}>

        {phase === "intro" && (
          <div style={{ animation: "fadeIn 0.5s ease" }}>
            <div style={{
              background: "#fff9f3", border: "1px solid #e8d5c0",
              borderRadius: "12px", padding: "28px 24px", marginBottom: "20px",
            }}>
              <p style={{ fontSize: "14px", lineHeight: "2", color: "#5a3e28", margin: "0 0 18px" }}>每轮练习包含四步：</p>
              {[
                { n: "1", t: "四层分析", d: "从字面、潜台词、动机、关系四维拆解一句话" },
                { n: "2", t: "看反馈",   d: "AI 指出你分析到位的地方，补充你没想到的角度" },
                { n: "3", t: "写回应",   d: "基于你的理解，写出你会怎么回应对方" },
                { n: "4", t: "回应评价", d: "AI 评价你的回应，并给出参考版本做对比" },
              ].map(s => (
                <div key={s.n} style={{ display: "flex", gap: "12px", marginBottom: "14px" }}>
                  <div style={{
                    flex: "0 0 24px", height: "24px", borderRadius: "50%",
                    background: "#5a3522", color: "#fff9f3",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "12px", fontWeight: "bold", marginTop: "1px",
                  }}>{s.n}</div>
                  <div>
                    <div style={{ fontSize: "13px", fontWeight: "bold", color: "#3d2b1a" }}>{s.t}</div>
                    <div style={{ fontSize: "12px", color: "#9b7e65", marginTop: "2px" }}>{s.d}</div>
                  </div>
                </div>
              ))}
            </div>
            {error && <ErrorMsg msg={error} />}
            <Btn onClick={startRound}>开始练习 →</Btn>
          </div>
        )}

        {["loading", "submitting", "evaluating"].includes(phase) && (
          <div style={{ textAlign: "center", padding: "70px 0", color: "#9b7e65", fontSize: "14px", letterSpacing: "2px" }}>
            <div style={{ fontSize: "28px", marginBottom: "16px", animation: "pulse 1.5s infinite" }}>
              {loadingLabel[phase]?.icon}
            </div>
            {loadingLabel[phase]?.text}
          </div>
        )}

        {phase === "practice" && scenario && (
          <div style={{ animation: "fadeIn 0.4s ease" }}>
            <ScenarioBox scenario={scenario} />
            <div style={{ display: "flex", gap: "6px", marginBottom: "14px", overflowX: "auto", paddingBottom: "4px" }}>
              {LAYERS.map((l, i) => {
                const filled = answers[l.key].trim().length > 0;
                const active = i === activeLayer;
                return (
                  <button key={l.key} onClick={() => setActiveLayer(i)} style={{
                    flex: "0 0 auto", padding: "7px 12px", borderRadius: "20px",
                    border: active ? "2px solid #5a3522" : "1px solid #d4b89a",
                    background: active ? "#5a3522" : filled ? "#f0e8dc" : "#fff9f3",
                    color: active ? "#fff9f3" : filled ? "#3d2b1a" : "#9b7e65",
                    fontSize: "12px", cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.2s",
                  }}>
                    {l.icon} {l.label}{filled && !active ? " ✓" : ""}
                  </button>
                );
              })}
            </div>
            {LAYERS.map((l, i) => i === activeLayer && (
              <div key={l.key} style={{ animation: "fadeIn 0.3s ease" }}>
                <div style={{ fontSize: "12px", color: "#9b7e65", marginBottom: "8px" }}>{l.sub}</div>
                <textarea
                  ref={textareaRef}
                  value={answers[l.key]}
                  onChange={e => setAnswers(a => ({ ...a, [l.key]: e.target.value }))}
                  placeholder={`写下你对"${l.label}"的分析…`}
                  rows={4} style={taStyle}
                />
                {activeLayer < 3 && (
                  <div style={{ marginTop: "10px" }}>
                    <Btn onClick={() => setActiveLayer(activeLayer + 1)} outline>下一层 →</Btn>
                  </div>
                )}
              </div>
            ))}
            <Btn onClick={submitAnalysis} disabled={!canSubmitAnalysis} style={{ marginTop: "18px", opacity: canSubmitAnalysis ? 1 : 0.4 }}>
              提交分析，看反馈
            </Btn>
            {error && <ErrorMsg msg={error} />}
            {!canSubmitAnalysis && (
              <div style={{ textAlign: "center", fontSize: "12px", color: "#b09070", marginTop: "8px" }}>
                请完成全部四个层面（每层至少10个字）
              </div>
            )}
          </div>
        )}

        {phase === "feedback" && feedback && (
          <div style={{ animation: "fadeIn 0.5s ease" }}>
            <ScenarioBox scenario={scenario} compact />
            {LAYERS.map((l) => (
              <div key={l.key} style={{
                background: "#fff9f3", border: "1px solid #e8d5c0",
                borderRadius: "10px", padding: "16px 18px", marginBottom: "12px",
              }}>
                <div style={{ fontSize: "13px", fontWeight: "bold", color: "#5a3522", marginBottom: "8px" }}>
                  {l.icon} {l.label}
                </div>
                <div style={{ fontSize: "12px", color: "#9b7e65", background: "#f0e8dc", borderRadius: "6px", padding: "8px 10px", marginBottom: "10px" }}>
                  你写的：{answers[l.key]}
                </div>
                <div style={{ fontSize: "13px", lineHeight: "1.9", color: "#3d2b1a" }}>
                  {feedback[`${l.key}_feedback`]}
                </div>
              </div>
            ))}
            <div style={{ background: "#5a3522", borderRadius: "12px", padding: "20px", marginBottom: "20px" }}>
              <div style={{ fontSize: "11px", letterSpacing: "3px", color: "#c4956a", marginBottom: "10px" }}>综合洞察</div>
              <div style={{ fontSize: "14px", lineHeight: "2", color: "#f5e8d5" }}>{feedback.synthesis}</div>
            </div>
            <Btn onClick={() => setPhase("respond")}>写我的回应 →</Btn>
            <div style={{ marginTop: "10px" }}>
              <Btn outline onClick={() => { setRound(r => r + 1); startRound(); }}>跳过，换一个场景</Btn>
            </div>
          </div>
        )}

        {phase === "respond" && scenario && (
          <div style={{ animation: "fadeIn 0.4s ease" }}>
            <ScenarioBox scenario={scenario} compact />
            <div style={{
              background: "#fff9f3", border: "1px solid #e8d5c0",
              borderRadius: "10px", padding: "14px 18px", marginBottom: "18px",
            }}>
              <div style={{ fontSize: "11px", letterSpacing: "2px", color: "#9b7e65", marginBottom: "8px" }}>综合洞察（来自上一步）</div>
              <div style={{ fontSize: "13px", lineHeight: "1.9", color: "#5a3e28" }}>{feedback?.synthesis}</div>
            </div>
            <div style={{ fontSize: "13px", fontWeight: "bold", color: "#3d2b1a", marginBottom: "6px" }}>
              💬 你会怎么回应 {scenario.speaker}？
            </div>
            <div style={{ fontSize: "12px", color: "#9b7e65", marginBottom: "10px" }}>写你真实想说的话，不用追求完美答案</div>
            <textarea
              ref={textareaRef}
              value={myResponse}
              onChange={e => setMyResponse(e.target.value)}
              placeholder="写下你的回应…"
              rows={4} style={taStyle}
            />
            <Btn onClick={submitResponse} disabled={!canSubmitResponse} style={{ marginTop: "14px", opacity: canSubmitResponse ? 1 : 0.4 }}>
              提交回应，看评价
            </Btn>
            {error && <ErrorMsg msg={error} />}
          </div>
        )}

        {phase === "response_eval" && responseEval && (
          <div style={{ animation: "fadeIn 0.5s ease" }}>
            <ScenarioBox scenario={scenario} compact />
            <div style={{ textAlign: "center", marginBottom: "20px" }}>
              <div style={{ fontSize: "12px", color: "#9b7e65", marginBottom: "8px" }}>你的回应</div>
              <div style={{
                fontSize: "15px", fontStyle: "italic", color: "#3d2b1a",
                background: "#fff9f3", border: "1px solid #e8d5c0",
                borderRadius: "10px", padding: "12px 16px", marginBottom: "14px",
              }}>"{myResponse}"</div>
              <div style={{
                display: "inline-block",
                background: SCORE_COLOR[responseEval.response_score]?.bg || "#5a3522",
                color: SCORE_COLOR[responseEval.response_score]?.color || "#fff9f3",
                borderRadius: "20px", padding: "6px 22px",
                fontSize: "15px", letterSpacing: "2px",
              }}>
                {responseEval.response_score}
              </div>
            </div>
            <Card icon="✅" title="做得好的地方" content={responseEval.what_works} bg="#f0f7f0" border="#c8e6c9" />
            {responseEval.what_misses && responseEval.what_misses !== "没有明显问题" && (
              <Card icon="⚠️" title="可以留意的地方" content={responseEval.what_misses} bg="#fff8f0" border="#ffe0b2" />
            )}
            <div style={{ background: "#3d2b1a", borderRadius: "12px", padding: "20px", marginBottom: "20px" }}>
              <div style={{ fontSize: "11px", letterSpacing: "3px", color: "#c4956a", marginBottom: "10px" }}>参考回应</div>
              <div style={{ fontSize: "15px", lineHeight: "1.8", color: "#fff9f3", fontStyle: "italic", marginBottom: "14px" }}>
                "{responseEval.better_version}"
              </div>
              <div style={{ fontSize: "13px", lineHeight: "1.9", color: "#e0c9a8", borderTop: "1px solid #5a3e28", paddingTop: "12px" }}>
                {responseEval.why_better}
              </div>
            </div>
            <Btn onClick={() => { setRound(r => r + 1); startRound(); }}>再来一轮 →</Btn>
          </div>
        )}

      </div>

      <style>{`
        @keyframes fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse  { 0%,100%{ opacity:1; } 50%{ opacity:0.35; } }
        textarea:focus { border-color:#8a6a4a !important; box-shadow:0 0 0 3px rgba(90,53,34,0.08); }
        button:hover:not(:disabled) { transform:translateY(-1px); box-shadow:0 4px 12px rgba(90,53,34,0.15); }
        ::-webkit-scrollbar { width:4px; height:4px; }
        ::-webkit-scrollbar-thumb { background:#d4b89a; border-radius:4px; }
      `}</style>
    </div>
  );
}

function ScenarioBox({ scenario, compact }) {
  return (
    <div style={{ background: "#3d2b1a", borderRadius: "12px", padding: compact ? "14px 18px" : "20px", marginBottom: "20px" }}>
      <div style={{ fontSize: "11px", letterSpacing: "3px", color: "#9b7e65", marginBottom: "8px" }}>场景</div>
      {!compact && <p style={{ fontSize: "13px", lineHeight: "1.9", margin: "0 0 14px", color: "#e0c9a8" }}>{scenario.scenario}</p>}
      <div style={{ borderTop: compact ? "none" : "1px solid #5a3e28", paddingTop: compact ? 0 : "12px" }}>
        <div style={{ fontSize: "11px", color: "#9b7e65", marginBottom: "6px" }}>{scenario.speaker}说：</div>
        <div style={{ fontSize: compact ? "14px" : "16px", lineHeight: "1.7", color: "#fff9f3", fontStyle: "italic" }}>
          "{scenario.line}"
        </div>
      </div>
    </div>
  );
}

function Card({ icon, title, content, bg, border }) {
  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: "10px", padding: "16px 18px", marginBottom: "12px" }}>
      <div style={{ fontSize: "13px", fontWeight: "bold", color: "#3d2b1a", marginBottom: "8px" }}>{icon} {title}</div>
      <div style={{ fontSize: "13px", lineHeight: "1.9", color: "#3d2b1a" }}>{content}</div>
    </div>
  );
}

function ErrorMsg({ msg }) {
  return (
    <div style={{ fontSize: "13px", color: "#c0392b", marginTop: "10px", padding: "10px", background: "#fff0ee", borderRadius: "8px", border: "1px solid #f5c6c2", textAlign: "center" }}>
      ⚠️ {msg}
    </div>
  );
}

function Btn({ children, onClick, disabled, outline, style }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width: "100%", padding: "14px",
      background: outline ? "transparent" : "#5a3522",
      color: outline ? "#5a3522" : "#fff9f3",
      border: outline ? "1.5px solid #5a3522" : "none",
      borderRadius: "10px", fontSize: "14px", letterSpacing: "1px",
      cursor: disabled ? "default" : "pointer",
      transition: "all 0.2s", fontFamily: "'Georgia','STSong',serif",
      ...style,
    }}>{children}</button>
  );
}

const taStyle = {
  width: "100%", padding: "14px", borderRadius: "10px",
  border: "1px solid #d4b89a", background: "#fff9f3",
  fontSize: "14px", lineHeight: "1.8", color: "#2a1f14",
  resize: "vertical", outline: "none",
  fontFamily: "'Georgia','STSong',serif", boxSizing: "border-box",
};
