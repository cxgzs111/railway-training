import type { Person, AnalysisResult } from './types';

// ============================
// Template-matching Analysis Engine
// Follows the exact structure of the Word template:
// 一、两违情况 / 二、培训情况 / 三、风险倾向 / 四、培训建议
// ============================
export function localAnalysis(person: Person): AnalysisResult {
  const result: AnalysisResult = { violationAnalysis: '', trainingAnalysis: '', riskAnalysis: '', suggestions: [] };

  // ===== 一、两违情况 =====
  if (person.violations.length > 0) {
    const lines: string[] = [];
    person.violations.forEach((v, i) => {
      const typeLabel = v.type ? `（${v.type}）` : '';
      lines.push(`问题${i + 1}${typeLabel}`);
      if (v.description) {
        lines.push(`问题描述：${v.date ? v.date + '，' : ''}${v.description}`);
      }
      if (v.standard) {
        lines.push(`违反考核标准：${v.standard}`);
      }
    });
    result.violationAnalysis = lines.join('\n');
  } else {
    result.violationAnalysis = `${person.name}在统计期间内未发生两违问题，安全意识较强，能够严格遵守各项规章制度和作业标准。`;
  }

  // ===== 二、培训情况 =====
  const moja = person.exams.filter(e => e.device === '模架');
  const zizhi = person.exams.filter(e => e.device === '自助机');
  const other = person.exams.filter(e => e.device !== '模架' && e.device !== '自助机');
  const tp: string[] = [];

  if (moja.length > 0) {
    tp.push('1. 实训风险演练装置（模架）成绩');
    const low = moja.filter(e => e.score < 80);
    const high = moja.filter(e => e.score >= 80);
    if (low.length > 0 || high.length > 0) {
      let desc = `${person.name}在模架培训中`;
      const avgScore = moja.reduce((s, e) => s + e.score, 0) / moja.length;
      if (avgScore >= 90) desc += '整体表现优秀';
      else if (avgScore >= 80) desc += '整体表现良好';
      else desc += '整体表现一般';
      if (low.length > 0) desc += '，存在以下薄弱环节：';
      else desc += '：';
      tp.push(desc);
      const items: string[] = [];
      moja.forEach(e => {
        const name = e.taskName || e.deviceRaw;
        if (e.score < 60) {
          items.push(`${name}：${e.score}分（不及格，需重点加强）`);
        } else if (e.score < 80) {
          items.push(`${name}：${e.score}分（不及格）`);
        } else if (e.score >= 90) {
          items.push(`${name}：${e.score}分（优秀）`);
        } else {
          items.push(`${name}：${e.score}分（良好）`);
        }
      });
      tp.push(items.join('；') + '。');
    }
  }

  if (zizhi.length > 0) {
    tp.push(`${moja.length > 0 ? '2' : '1'}. 自助培训演练设备（自助机）成绩`);
    const avgScore = zizhi.reduce((s, e) => s + e.score, 0) / zizhi.length;
    let desc = `${person.name}在自助机培训中`;
    if (avgScore >= 90) desc += '表现优秀：';
    else if (avgScore >= 80) desc += '表现良好：';
    else desc += '表现一般，存在薄弱环节：';
    tp.push(desc);
    const items = zizhi.map(e => `${e.taskName || e.deviceRaw}：${e.score}分`);
    tp.push(items.join('；'));
  }

  if (other.length > 0) {
    const idx = (moja.length > 0 ? 1 : 0) + (zizhi.length > 0 ? 1 : 0) + 1;
    tp.push(`${idx}. 其他培训成绩`);
    tp.push(other.map(e => `${e.taskName || e.deviceRaw}：${e.score}分`).join('；'));
  }

  if (tp.length === 0) {
    tp.push(`${person.name}暂无实训培训记录，建议尽快安排自助培训演练设备（自助机）和实训风险演练装置（模架）培训考核。`);
  }
  result.trainingAnalysis = tp.join('\n');

  // ===== 三、风险倾向 =====
  const risks: string[] = [];
  risks.push(`根据${person.name}的两违情况和培训成绩分析，该责任人存在以下不足之处：`);

  let riskIdx = 1;
  if (person.violations.length > 0) {
    // Group violations by type
    const typeMap: Record<string, { descriptions: string[]; standards: string[] }> = {};
    person.violations.forEach(v => {
      const t = v.type || '其他';
      if (!typeMap[t]) typeMap[t] = { descriptions: [], standards: [] };
      if (v.description) typeMap[t].descriptions.push(v.description);
      if (v.standard) typeMap[t].standards.push(v.standard);
    });
    Object.entries(typeMap).forEach(([type, data]) => {
      risks.push(`${riskIdx}. ${type}方面`);
      // Summarize the violations in this category
      const summaryParts: string[] = [];
      data.descriptions.forEach(d => {
        summaryParts.push(d);
      });
      risks.push(summaryParts.join('；') + '。');
      riskIdx++;
    });
  }

  // Training weakness risks
  const lowMoja = moja.filter(e => e.score < 80);
  if (lowMoja.length > 0) {
    risks.push(`${riskIdx}. 应急处置能力方面`);
    const items = lowMoja.map(e => `${e.taskName || e.deviceRaw}处置掌握不熟练`);
    risks.push(items.join('；') + '。');
    riskIdx++;
  }

  if (riskIdx === 1) {
    // No risks found
    risks.length = 0;
    risks.push(`根据${person.name}的两违情况和培训成绩分析，该责任人整体表现良好，安全意识较强，建议继续保持。`);
  }
  result.riskAnalysis = risks.join('\n');

  // ===== 四、培训建议 =====
  if (person.violations.length > 0) {
    const typeMap: Record<string, { descriptions: string[]; standards: string[] }> = {};
    person.violations.forEach(v => {
      const t = v.type || '其他';
      if (!typeMap[t]) typeMap[t] = { descriptions: [], standards: [] };
      if (v.description) typeMap[t].descriptions.push(v.description);
      if (v.standard) typeMap[t].standards.push(v.standard);
    });

    Object.entries(typeMap).forEach(([type]) => {
      result.suggestions.push({
        title: `${type}培训`,
        content: `加强与"${type}"相关的规章制度学习，重点学习相关规程和操作规范，强化标准作业培训。`
      });
    });
  }

  if (lowMoja.length > 0) {
    result.suggestions.push({
      title: '应急处置能力培训',
      content: `针对${lowMoja.map(e => `${e.taskName || e.deviceRaw}`).join('、')}进行专项培训，重点掌握故障判断和处置流程。增加模架实作演练频次，重点练习低分项目。`
    });
  }

  const lowZizhi = zizhi.filter(e => e.score < 80);
  if (lowZizhi.length > 0) {
    result.suggestions.push({
      title: '自助机操作技能提升',
      content: `针对${lowZizhi.map(e => `${e.taskName || e.deviceRaw}`).join('、')}加强操作培训，熟练掌握各项操作规程和技能要求。`
    });
  }

  if (result.suggestions.length === 0) {
    result.suggestions.push({
      title: '巩固提升业务素质',
      content: '该人员整体表现良好，建议继续保持良好的工作状态，积极参加各项安全教育和业务培训活动，持续提升业务技能水平。'
    });
  }

  return result;
}
