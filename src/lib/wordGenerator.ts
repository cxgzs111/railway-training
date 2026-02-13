import { saveAs } from 'file-saver';
import type { Report } from './types';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Generate Word report following the exact template format.
 * Pure text for sections 1-4, table with full question details for section 5.
 */
function generateWordHTML(report: Report): string {
  const { person, analysis, questions } = report;

  let html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset='utf-8'>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
@page{size:A4;margin:2.54cm 3.17cm}
body{font-family:宋体,SimSun;font-size:14pt;line-height:28pt;color:#000}
.title{text-align:center;font-family:方正小标宋简体,黑体,SimHei;font-size:22pt;font-weight:bold;line-height:40pt;margin:30pt 0 16pt}
.info{font-size:14pt;line-height:28pt;margin:0 0 10pt}
.section-title{font-family:黑体,SimHei;font-size:15pt;font-weight:bold;line-height:32pt;margin:16pt 0 6pt 0}
.sub-title{font-family:楷体,KaiTi;font-size:14pt;font-weight:bold;line-height:28pt;margin:8pt 0 4pt 0}
p{margin:0;text-indent:0;font-size:14pt;line-height:28pt}
.indent{text-indent:28pt}
.q-table{border-collapse:collapse;width:100%;margin:6pt 0}
.q-table td,.q-table th{border:1pt solid #000;padding:4pt 6pt;font-size:12pt;line-height:20pt;vertical-align:top}
.q-table th{background:#d9e2f3;font-weight:bold;text-align:center;font-family:黑体,SimHei}
.q-table .center{text-align:center}
</style></head><body>`;

  // ===== 标题 =====
  html += `<p class="title">${esc(person.name)}个人定向培训建议</p>`;

  // ===== 姓名/职名 =====
  html += `<p class="info">姓名：${esc(person.name)}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;职名：电力机车司机</p>`;

  // ===== 一、两违情况 =====
  html += `<p class="section-title">一、两违情况</p>`;
  if (person.violations.length > 0) {
    analysis.violationAnalysis.split('\n').forEach(line => {
      if (!line.trim()) return;
      if (line.startsWith('问题') && (line.includes('（') || line.match(/^问题\d/))) {
        html += `<p class="sub-title">${esc(line)}</p>`;
      } else {
        html += `<p>${esc(line)}</p>`;
      }
    });
  } else {
    html += `<p class="indent">${esc(analysis.violationAnalysis)}</p>`;
  }

  // ===== 二、培训情况 =====
  html += `<p class="section-title">二、培训情况</p>`;
  analysis.trainingAnalysis.split('\n').forEach(line => {
    if (!line.trim()) return;
    if (/^\d+\.\s/.test(line)) {
      html += `<p class="sub-title">${esc(line)}</p>`;
    } else {
      html += `<p>${esc(line)}</p>`;
    }
  });

  // ===== 三、风险倾向 =====
  html += `<p class="section-title">三、风险倾向</p>`;
  if (analysis.riskAnalysis) {
    analysis.riskAnalysis.split('\n').forEach(line => {
      if (!line.trim()) return;
      if (/^\d+\.\s/.test(line)) {
        html += `<p class="sub-title">${esc(line)}</p>`;
      } else if (line.startsWith('根据')) {
        html += `<p class="indent">${esc(line)}</p>`;
      } else {
        html += `<p>${esc(line)}</p>`;
      }
    });
  }

  // ===== 四、培训建议 =====
  html += `<p class="section-title">四、培训建议</p>`;
  analysis.suggestions.forEach((s, i) => {
    html += `<p class="sub-title">${i + 1}. ${esc(s.title)}</p>`;
    html += `<p class="indent">${esc(s.content)}</p>`;
  });

  // ===== 五、考试题目 =====
  html += `<p class="section-title">五、考试题目</p>`;
  if (questions.length > 0) {
    html += `<p class="indent">针对${esc(person.name)}的两违情况和培训薄弱环节，特制定以下定向考试题目：</p>`;
    html += `<table class="q-table">`;
    html += `<tr><th style="width:6%">序号</th><th style="width:50%">题目内容</th><th style="width:24%">答案</th><th style="width:20%">解析</th></tr>`;
    const qSlice = questions.slice(0, 10);
    qSlice.forEach((q, i) => {
      // Build full question content with options (no truncation)
      let qContent = esc(q.questionText);
      if (q.questionType) {
        qContent += `<br/>（${esc(q.questionType)}）`;
      }
      if (q.options.length > 0) {
        qContent += '<br/>' + q.options.map(o => esc(o)).join('<br/>');
      }

      html += `<tr>`;
      html += `<td class="center">${i + 1}</td>`;
      html += `<td>${qContent}</td>`;
      html += `<td>${esc(q.answer)}</td>`;
      html += `<td>${esc(q.explanation)}</td>`;
      html += `</tr>`;
    });
    html += `</table>`;
  } else {
    html += `<p class="indent">暂无匹配的考试题目，建议从题库中选取与两违情况和培训薄弱环节相关的题目进行定向考核。</p>`;
  }

  html += `</body></html>`;
  return html;
}

export function downloadWordReport(report: Report): void {
  const html = generateWordHTML(report);
  const blob = new Blob(['\ufeff' + html], { type: 'application/msword;charset=utf-8' });
  saveAs(blob, `${report.person.name}_个人定向培训建议.doc`);
}

export function downloadAllReports(reports: Report[]): void {
  reports.forEach((report, i) => {
    setTimeout(() => downloadWordReport(report), i * 600);
  });
}
