import type { Person, AnalysisResult } from './types';

const MOONSHOT_CONFIG = {
  apiBase: '/api/moonshot',
  apiKey: 'sk-FsuGU66zLdTd57CF6JEFk2RFJ4iIksAYab9en0D4amNhwdKA',
  model: 'moonshot-v1-8k',
};

const TEMPLATE_EXAMPLE = `
三、风险倾向 示例格式：
根据张宇的两违情况和培训成绩分析，该责任人存在以下不足之处：
1. 人身安全方面
机班出退勤、交接班时未严格执行机班同行制度，横越线路时未严格执行"一站、二看、三通过"规定，职场安全意识有待加强。
2. 出退勤管理方面
运行揭示相关内容填记不完整，存在漏项，手持运行揭示确认、签认程序执行不到位司机手册填记规范性需加强。
3. 应急处置能力方面
制动力弱故障处置掌握不熟练；严重晃车应急处置流程不熟悉；轴温报警处置措施掌握不到位；非正常行车（路票、引导等）操作需加强。

四、培训建议 示例格式：
1. 人身安全培训
加强《机运18》人身安全相关条款学习，重点学习出退勤、交接班安全规定。强化"一站、二看、三通过"横越线路标准作业培训。
2. 出退勤管理培训
加强运行揭示核对、确认、签认流程培训，规范司机手册填记标准，开展填记规范性练习，学习手持运行揭示使用管理规定。
3. 应急处置能力培训
针对制动力弱故障进行专项培训，重点掌握故障判断和处置流程，加强严重晃车应急处置演练，熟悉紧急制动、报告、记录等操作。开展轴温报警处置培训，掌握后部瞭望、停车检查等要点，强化非正常行车（路票、引导、绿色许可证等）操作培训。增加模架实作演练频次，重点练习低分项目。
`;

// ============================
// Single person AI generation
// ============================
export async function generateAIRiskAndSuggestions(
  person: Person,
  analysis: AnalysisResult
): Promise<{ riskAnalysis: string; suggestions: { title: string; content: string }[] }> {
  let personData = `责任人：${person.name}\n部门：${person.fleet}\n\n`;
  personData += `一、两违情况：\n${analysis.violationAnalysis}\n\n`;
  personData += `二、培训情况：\n${analysis.trainingAnalysis}\n\n`;

  const prompt = `你是一名铁路机务段安全教育培训专家。请根据以下责任人的两违情况和培训成绩，按照模版格式生成"三、风险倾向"和"四、培训建议"两个部分。

要求：
1. 风险倾向要根据责任人的具体两违问题类别和培训薄弱环节逐项分析，列出具体的不足之处
2. 培训建议要针对每个风险倾向给出具体、有针对性的培训方案
3. 每个编号对应一个方面，先写标题（如"人身安全方面"），换行后写具体内容
4. 语言要专业、简洁、准确，符合铁路安全管理规范
5. 风险倾向必须以"根据${person.name}的两违情况和培训成绩分析，该责任人存在以下不足之处："开头
6. 如果该人员没有两违问题且培训成绩良好，则风险倾向写"该责任人整体表现良好，安全意识较强，建议继续保持"
7. 严格按照以下模版示例的格式和风格书写

${TEMPLATE_EXAMPLE}

以下是该责任人的数据：
${personData}

请严格按照以下JSON格式返回结果（不要包含markdown代码块标记，不要包含\`\`\`json等）：
{
  "riskAnalysis": "风险倾向的完整文本内容（包含开头语和编号列表，编号之间用换行分隔）",
  "suggestions": [
    {"title": "培训建议标题（如：人身安全培训）", "content": "具体培训内容"}
  ]
}`;

  return callMoonshotAPI(prompt);
}

// ============================
// Group-based AI generation (batch optimization)
// For people with the same violation type combination,
// generate ONE template then personalize for each person
// ============================

interface ViolationGroup {
  key: string;
  violationTypes: string[];
  violationDescriptions: string[];
  violationStandards: string[];
  weakExams: string[];
  persons: { person: Person; analysis: AnalysisResult }[];
}

function buildGroupKey(person: Person): string {
  // Group by: sorted violation types + weak exam categories
  const vTypes = [...new Set(person.violations.map(v => v.type || '其他'))].sort();
  const weakExams = person.exams
    .filter(e => e.score < 80)
    .map(e => e.device || '其他')
    .sort();
  return `V:${vTypes.join(',')}|W:${weakExams.join(',')}`;
}

export function groupPersonsByViolationType(
  persons: { person: Person; analysis: AnalysisResult }[]
): ViolationGroup[] {
  const groups: Record<string, ViolationGroup> = {};

  persons.forEach(({ person, analysis }) => {
    const key = buildGroupKey(person);
    if (!groups[key]) {
      groups[key] = {
        key,
        violationTypes: [...new Set(person.violations.map(v => v.type || '其他'))],
        violationDescriptions: [],
        violationStandards: [],
        weakExams: [],
        persons: [],
      };
    }
    const g = groups[key];
    person.violations.forEach(v => {
      if (v.description && !g.violationDescriptions.includes(v.description)) {
        g.violationDescriptions.push(v.description);
      }
      if (v.standard && !g.violationStandards.includes(v.standard)) {
        g.violationStandards.push(v.standard);
      }
    });
    person.exams.filter(e => e.score < 80).forEach(e => {
      const name = e.taskName || e.deviceRaw || '';
      if (name && !g.weakExams.includes(name)) g.weakExams.push(name);
    });
    g.persons.push({ person, analysis });
  });

  return Object.values(groups);
}

async function generateGroupTemplate(
  group: ViolationGroup,
  signal?: AbortSignal
): Promise<{ riskAnalysis: string; suggestions: { title: string; content: string }[] }> {
  // Use group data (representative of all persons with same violation pattern)
  const vTypesStr = group.violationTypes.join('、') || '无';
  const vDescsStr = group.violationDescriptions.slice(0, 5).join('；') || '无';
  const vStdsStr = group.violationStandards.slice(0, 5).join('；') || '无';
  const weakStr = group.weakExams.slice(0, 5).join('、') || '无';

  const prompt = `你是一名铁路机务段安全教育培训专家。请根据以下两违类型和培训薄弱项的组合，生成通用的"三、风险倾向"和"四、培训建议"模版。

这是一组具有相同两违类型组合的责任人的共性数据：
- 两违类别：${vTypesStr}
- 典型问题描述：${vDescsStr}
- 违反考核标准：${vStdsStr}
- 培训薄弱项（模架/自助机低分科目）：${weakStr}

要求：
1. 风险倾向要根据两违问题类别和培训薄弱环节逐项分析
2. 培训建议要针对每个风险倾向给出具体培训方案
3. 每个编号对应一个方面，先写标题，换行后写具体内容
4. 语言专业、简洁、准确
5. 风险倾向以"根据{姓名}的两违情况和培训成绩分析，该责任人存在以下不足之处："开头（用{姓名}占位）
6. 如果没有两违且成绩良好，写"该责任人整体表现良好"
7. 严格按模版格式

${TEMPLATE_EXAMPLE}

请返回纯JSON格式（不要markdown代码块）：
{
  "riskAnalysis": "风险倾向完整文本（用{姓名}作为人名占位符）",
  "suggestions": [
    {"title": "培训建议标题", "content": "具体内容（用{姓名}作为占位符，用{薄弱项}代表具体低分科目）"}
  ]
}`;

  return callMoonshotAPI(prompt, 2, signal);
}

function personalizeTemplate(
  template: { riskAnalysis: string; suggestions: { title: string; content: string }[] },
  person: Person
): { riskAnalysis: string; suggestions: { title: string; content: string }[] } {
  const weakExams = person.exams
    .filter(e => e.score < 80)
    .map(e => e.taskName || e.deviceRaw || '')
    .filter(Boolean)
    .join('、') || '相关科目';

  const replace = (text: string) =>
    text.replace(/\{姓名\}/g, person.name).replace(/\{薄弱项\}/g, weakExams);

  return {
    riskAnalysis: replace(template.riskAnalysis),
    suggestions: template.suggestions.map(s => ({
      title: replace(s.title),
      content: replace(s.content),
    })),
  };
}

// ============================
// Batch AI generation with concurrency + grouping
// ============================
export interface BatchProgress {
  total: number;
  completed: number;
  currentGroup: string;
  failed: number;
}

export async function generateAIBatch(
  personAnalysisPairs: { person: Person; analysis: AnalysisResult }[],
  onProgress: (progress: BatchProgress) => void,
  concurrency: number = 5,
  signal?: AbortSignal
): Promise<Map<string, { riskAnalysis: string; suggestions: { title: string; content: string }[] }>> {
  const groups = groupPersonsByViolationType(personAnalysisPairs);
  const results = new Map<string, { riskAnalysis: string; suggestions: { title: string; content: string }[] }>();
  const totalPersons = personAnalysisPairs.length;
  let completedPersons = 0;
  let failedCount = 0;

  onProgress({ total: totalPersons, completed: 0, currentGroup: `共${groups.length}个类型组`, failed: 0 });

  // Process groups with concurrency limit
  const groupQueue = [...groups];
  const activePromises: Promise<void>[] = [];

  const processGroup = async (group: ViolationGroup) => {
    if (signal?.aborted) return;

    try {
      const template = await generateGroupTemplate(group, signal);

      // Apply template to all persons in this group
      group.persons.forEach(({ person }) => {
        const personalized = personalizeTemplate(template, person);
        const key = `${person.name}__${person.fleet}`;
        results.set(key, personalized);
        completedPersons++;
      });
    } catch (err) {
      if (signal?.aborted) return;
      console.error(`Group "${group.key}" AI failed:`, err);
      failedCount += group.persons.length;
      completedPersons += group.persons.length;
      // Persons in failed groups will keep local analysis
    }

    onProgress({
      total: totalPersons,
      completed: completedPersons,
      currentGroup: `${groups.length}组中已完成${Math.min(completedPersons, totalPersons)}人`,
      failed: failedCount,
    });
  };

  // Parallel execution with concurrency control
  let idx = 0;
  while (idx < groupQueue.length) {
    if (signal?.aborted) break;

    const batch = groupQueue.slice(idx, idx + concurrency);
    await Promise.all(batch.map(g => processGroup(g)));
    idx += concurrency;
  }

  return results;
}

// ============================
// Core API call helper
// ============================
async function callMoonshotAPI(
  prompt: string,
  retries = 2,
  parentSignal?: AbortSignal
): Promise<{ riskAnalysis: string; suggestions: { title: string; content: string }[] }> {
  const TIMEOUT_MS = 30000; // 30 seconds per request

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (parentSignal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), TIMEOUT_MS);

    // If parent signal fires, also abort this request
    const onParentAbort = () => timeoutController.abort();
    parentSignal?.addEventListener('abort', onParentAbort, { once: true });

    try {
      const response = await fetch(`${MOONSHOT_CONFIG.apiBase}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${MOONSHOT_CONFIG.apiKey}`,
        },
        body: JSON.stringify({
          model: MOONSHOT_CONFIG.model,
          messages: [
            {
              role: 'system',
              content: '你是一名资深的铁路机务段安全教育培训专家，精通铁路安全管理规定（如《机运18》等），擅长分析两违问题和培训薄弱环节，提供专业的风险评估和培训建议。请直接返回纯JSON格式结果，不要使用markdown代码块包裹。'
            },
            { role: 'user', content: prompt }
          ],
          temperature: 0.7,
          max_tokens: 2000,
        }),
        signal: timeoutController.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 429 && attempt < retries) {
          await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
          continue;
        }
        throw new Error(`AI API error: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';

      let jsonStr = content;
      jsonStr = jsonStr.replace(/```json\s*/g, '').replace(/```\s*/g, '');
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (jsonMatch) jsonStr = jsonMatch[0];

      const parsed = JSON.parse(jsonStr);
      return {
        riskAnalysis: parsed.riskAnalysis || '',
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      };
    } catch (err) {
      if (parentSignal?.aborted) throw new DOMException('Aborted', 'AbortError');
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    } finally {
      clearTimeout(timeoutId);
      parentSignal?.removeEventListener('abort', onParentAbort);
    }
  }
  throw new Error('All retries failed');
}
