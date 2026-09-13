/**
 * useCaseDrafts —— 各用例的 Case Prompt / 断言草稿
 *
 * 关键点：草稿必须按 caseId 隔离，否则所有用例会共享同一份内容。
 * 首次访问某用例时惰性初始化为默认模板；仅在 JSON 校验通过后才落盘。
 */
import { reactive } from 'vue'
import { DEFAULT_CASE_ASSERT, DEFAULT_CASE_PROMPT } from '@/mock/config'

export function useCaseDrafts() {
  /** caseId -> { prompt, assert } */
  const drafts = reactive({})

  /** 取（或惰性初始化）某用例的草稿 */
  function getDraft(caseId) {
    if (!drafts[caseId]) {
      drafts[caseId] = { prompt: DEFAULT_CASE_PROMPT, assert: DEFAULT_CASE_ASSERT }
    }
    return drafts[caseId]
  }

  /**
   * 用后端用例的 input/expected 初始化草稿（已存在草稿时不覆盖，避免丢失用户编辑）。
   *
   * 断言内容由期望关键词生成，仅作编辑起点：后端 TestRunnerService 实际按 category
   * 内置策略判定通过与否，并不读取这份断言，故此处显式写入 note 避免误解。
   */
  function seedFromCase(meta) {
    if (!meta || drafts[meta.id]) return
    drafts[meta.id] = {
      prompt: meta.input || DEFAULT_CASE_PROMPT,
      assert: buildSeedAssert(meta),
    }
  }

  function buildSeedAssert(meta) {
    const assertions = meta.expected
      ? [{ type: 'contains', target: 'agent.final_answer', value: meta.expected }]
      : []
    return JSON.stringify(
      {
        assertions,
        note: '由用例期望关键词生成；后端按 category 内置策略判定，不读取本断言',
        timeoutMs: 30000,
      },
      null,
      2,
    )
  }

  /** 仅做格式校验，返回 { ok, error } */
  function validateAssert(text) {
    try {
      JSON.parse(text)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  }

  /**
   * 写入草稿。
   * 断言必须是合法 JSON，否则返回失败且不污染已有草稿。
   */
  function saveDraft(caseId, prompt, assert) {
    const check = validateAssert(assert)
    if (!check.ok) return check
    drafts[caseId] = { prompt, assert }
    return { ok: true }
  }

  /** 导出为纯对象（供报告序列化） */
  function snapshot() {
    return JSON.parse(JSON.stringify(drafts))
  }

  return { drafts, getDraft, seedFromCase, validateAssert, saveDraft, snapshot }
}
