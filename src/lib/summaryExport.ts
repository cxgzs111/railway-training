import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import type { Report } from './types';

/**
 * Export summary table as Excel (.xlsx) with FULL content (no truncation)
 * Columns: 序号, 责任人, 部门, 工资号, 两违情况, 培训实训情况, 考试题目
 */
export function exportSummaryTable(reports: Report[]): void {
  const header = ['序号', '责任人', '部门', '工资号', '两违情况', '培训实训情况', '风险倾向', '培训建议', '考试题目'];

  const rows = reports.map((r, i) => {
    // Full violation text (no truncation)
    let violationText = '-';
    if (r.person.violations.length > 0) {
      violationText = r.person.violations.map((v, idx) => {
        let line = `${idx + 1}.`;
        if (v.type) line += `[${v.type}]`;
        if (v.description) line += v.description;
        if (v.standard) line += ` 违反：${v.standard}`;
        return line;
      }).join('\n');
    }

    // Full training text (no truncation)
    let trainingText = '-';
    if (r.person.exams.length > 0) {
      trainingText = r.person.exams.map(ex => {
        const name = ex.taskName || ex.deviceRaw || ex.device;
        return `${name}：${ex.score}分`;
      }).join('\n');
    }

    // Risk analysis (full content)
    const riskText = r.analysis.riskAnalysis || '-';

    // Training suggestions (full content)
    let suggestionsText = '-';
    if (r.analysis.suggestions.length > 0) {
      suggestionsText = r.analysis.suggestions.map((s, si) => {
        return `${si + 1}.${s.title}\n${s.content}`;
      }).join('\n');
    }

    // Full questions text (no truncation)
    let questionsText = '-';
    if (r.questions.length > 0) {
      questionsText = r.questions.map((q, qi) => {
        let line = `${qi + 1}.${q.questionText}`;
        if (q.options.length > 0) {
          line += '\n  ' + q.options.join('; ');
        }
        line += `\n  答案：${q.answer}`;
        return line;
      }).join('\n');
    }

    return [i + 1, r.person.name, r.person.fleet, r.person.salaryNumber || '-', violationText, trainingText, riskText, suggestionsText, questionsText];
  });

  const wsData = [header, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Set column widths
  ws['!cols'] = [
    { wch: 6 },   // 序号
    { wch: 10 },  // 责任人
    { wch: 18 },  // 部门
    { wch: 12 },  // 工资号
    { wch: 60 },  // 两违情况
    { wch: 50 },  // 培训实训情况
    { wch: 60 },  // 风险倾向
    { wch: 60 },  // 培训建议
    { wch: 70 },  // 考试题目
  ];

  // Enable text wrapping for all data cells
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      if (ws[addr]) {
        if (!ws[addr].s) ws[addr].s = {};
        ws[addr].s.alignment = { wrapText: true, vertical: 'top' };
      }
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '培训分析汇总表');

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, '全部责任人培训分析汇总表.xlsx');
}
