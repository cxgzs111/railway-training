import * as XLSX from 'xlsx';
import type { FieldDef, Violation, ExamRecord, Person, QuestionBank } from './types';

// ============================
// Field Definitions
// ============================
export const VIOLATION_FIELDS: FieldDef[] = [
  { key:'name', label:'责任人/姓名', kw:['责任人','姓名','名字','人员','职工','当事人','违章人','被考核人'] },
  { key:'fleet', label:'责任人部门', kw:[
    '责任人所属部门','责任人部门','责任人所属单位','责任人单位','责任人所属车间','责任人车间','责任人所属',
    '所属车队','车队','班组','部门','单位','车间','所属','所在单位','所在车队'
  ] },
  { key:'salaryNumber', label:'工资号', kw:['工资号','员工号','工号','职工号','编号','人员编号'] },
  { key:'date', label:'日期', kw:['发生日期','发生时间','检查日期','日期','时间','违章日期','两违日期'] },
  { key:'type', label:'问题类别/性质', kw:['问题类别','问题性质','类型','类别','违章类型','两违类型','性质','违规类型'] },
  { key:'description', label:'问题描述', kw:['问题描述','具体问题','描述','内容','违章内容','违章描述','事由','简要','摘要','问题'] },
  { key:'standard', label:'考核标准', kw:['考核标准','违反标准','标准','依据','规定','条款','考核依据','违反条款'] },
  { key:'level', label:'严重程度', kw:['程度','严重','等级','级别','严重程度'] },
  { key:'penalty', label:'处理结果', kw:['处理结果','考核结果','处理','处罚','结果','考核','扣分'] }
];

export const EXAM_FIELDS: FieldDef[] = [
  { key:'name', label:'姓名', kw:['姓名','名字','人员','职工','学员','司机','学员姓名'] },
  { key:'fleet', label:'车队/单位', kw:['所属车队','车队','班组','部门','单位','车间','所属'] },
  { key:'task', label:'任务/项目名称', kw:['任务名称','实训项目','培训项目','训练项目','项目名称','科目名称','任务','项目','科目'] },
  { key:'device', label:'设备类型', kw:['设备类型','设备名称','实训设备','演练装置','培训设备','设备','装置'] },
  { key:'score', label:'成绩/得分', kw:['成绩','得分','分数','分值','总分','考核成绩','总成绩','评分','考试成绩'] },
  { key:'result', label:'考核结果', kw:['考核结果','是否合格','合格','通过','评定','结果'] },
  { key:'date', label:'日期', kw:['日期','时间','考试日期','考试时间','实训日期','培训日期','培训时间'] }
];

// ============================
// Column Auto-Mapping
// ============================
export function autoMatch(headers: string[], fields: FieldDef[]): Record<string, number> {
  const map: Record<string, number> = {};
  const used = new Set<number>();

  // First pass: exact match
  fields.forEach(field => {
    headers.forEach((h, idx) => {
      if (used.has(idx) || map[field.key] !== undefined) return;
      const hl = (h || '').trim();
      if (field.kw.some(kw => kw === hl)) {
        map[field.key] = idx;
        used.add(idx);
      }
    });
  });

  // Second pass: contains match
  fields.forEach(field => {
    if (map[field.key] !== undefined) return;
    let bestIdx = -1, bestScore = 0;
    headers.forEach((h, idx) => {
      if (used.has(idx)) return;
      const hl = (h || '').toLowerCase();
      field.kw.forEach(kw => {
        if (hl.includes(kw.toLowerCase())) {
          const score = kw.length;
          if (score > bestScore) { bestScore = score; bestIdx = idx; }
        }
      });
    });
    if (bestIdx >= 0) { map[field.key] = bestIdx; used.add(bestIdx); }
  });

  // Assign -1 to unmatched
  fields.forEach(f => { if (map[f.key] === undefined) map[f.key] = -1; });
  return map;
}

/**
 * Post-match validation for violation columns.
 * Ensures we use 责任人's name/department, NOT 考核人's.
 */
function validateViolationMap(headers: string[], map: Record<string, number>): void {
  const nameIdx = map['name'];
  const fleetIdx = map['fleet'];

  // 1. If matched name column header contains "考核人" but not "责任", find a better match
  if (nameIdx >= 0) {
    const nameHeader = headers[nameIdx] || '';
    if (nameHeader.includes('考核人') && !nameHeader.includes('责任')) {
      const betterIdx = headers.findIndex((h, i) => {
        if (i === fleetIdx || i === nameIdx) return false;
        return h.includes('责任人');
      });
      if (betterIdx >= 0) {
        console.log(`  [校正] name列从"${nameHeader}"(第${nameIdx+1}列) → "${headers[betterIdx]}"(第${betterIdx+1}列)`);
        map['name'] = betterIdx;
      }
    }
  }

  // 2. If matched fleet column header relates to 考核人, find 责任人's department
  if (fleetIdx >= 0) {
    const fleetHeader = headers[fleetIdx] || '';
    const isExaminerDept = fleetHeader.includes('考核') || fleetHeader.includes('检查人') || fleetHeader.includes('通知');
    const isResponsibleDept = fleetHeader.includes('责任');

    if (isExaminerDept && !isResponsibleDept) {
      // Try to find a better column that's the 责任人's department
      const betterIdx = findResponsibleDeptColumn(headers, map);
      if (betterIdx >= 0) {
        console.log(`  [校正] fleet列从"${fleetHeader}"(第${fleetIdx+1}列) → "${headers[betterIdx]}"(第${betterIdx+1}列)`);
        map['fleet'] = betterIdx;
      }
    }
  }

  // 3. Even if no "考核" detected, check if there exists a more specific "责任人部门" column
  if (fleetIdx >= 0) {
    const fleetHeader = headers[fleetIdx] || '';
    if (!fleetHeader.includes('责任')) {
      const betterIdx = findResponsibleDeptColumn(headers, map);
      if (betterIdx >= 0 && betterIdx !== fleetIdx) {
        console.log(`  [校正] fleet列从"${fleetHeader}"(第${fleetIdx+1}列) → "${headers[betterIdx]}"(第${betterIdx+1}列) (优先责任人部门)`);
        map['fleet'] = betterIdx;
      }
    }
  }
}

function findResponsibleDeptColumn(headers: string[], map: Record<string, number>): number {
  const usedIdxs = new Set(Object.values(map).filter(v => v >= 0));
  
  // Priority 1: column header contains both "责任" and a department keyword
  const deptKw = ['部门', '单位', '车间', '所属'];
  for (let i = 0; i < headers.length; i++) {
    if (usedIdxs.has(i)) continue;
    const h = headers[i] || '';
    if (h.includes('责任') && deptKw.some(kw => h.includes(kw))) {
      return i;
    }
  }

  // Priority 2: column header near the 责任人 column (usually the next column)
  const nameIdx = map['name'];
  if (nameIdx >= 0) {
    // Look at columns adjacent to the name column for department-like headers
    for (const offset of [1, -1, 2, -2]) {
      const checkIdx = nameIdx + offset;
      if (checkIdx >= 0 && checkIdx < headers.length && !usedIdxs.has(checkIdx)) {
        const h = headers[checkIdx] || '';
        if (deptKw.some(kw => h.includes(kw)) && !h.includes('考核')) {
          return checkIdx;
        }
      }
    }
  }

  return -1;
}

function getVal(row: string[], map: Record<string, number>, key: string): string {
  const idx = map[key];
  if (idx < 0 || idx === undefined || idx >= row.length) return '';
  const v = row[idx];
  return (v !== undefined && v !== null) ? String(v).trim() : '';
}

// ============================
// Excel File Reading
// ============================
export function readExcelFile(data: ArrayBuffer): { headers: string[]; rows: string[][] } {
  const wb = XLSX.read(data, { type: 'array', cellText: true, cellDates: true, raw: false, cellStyles: true });
  let allHeaders: string[] = [];
  let allRows: string[][] = [];

  wb.SheetNames.forEach((name, idx) => {
    const ws = wb.Sheets[name];
    const json: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
    if (json.length > 0) {
      const sheetHeaders = json[0].map((h: any) => String(h || '').trim());
      const sheetRows = json.slice(1).filter((r: any[]) => r.some(c => c !== undefined && String(c).trim() !== ''));
      const fullRows = sheetRows.map((row: any[]) => row.map(cell => {
        if (cell === null || cell === undefined) return '';
        return String(cell).trim();
      }));
      if (idx === 0) {
        allHeaders = sheetHeaders;
        allRows = fullRows;
      } else {
        if (sheetHeaders.length > 0) {
          const overlap = sheetHeaders.filter(h => allHeaders.includes(h)).length;
          if (overlap > sheetHeaders.length / 2) {
            fullRows.forEach(row => {
              const newRow = new Array(allHeaders.length).fill('');
              sheetHeaders.forEach((h, i) => {
                const tIdx = allHeaders.indexOf(h);
                if (tIdx >= 0) newRow[tIdx] = row[i] || '';
              });
              allRows.push(newRow);
            });
          }
        }
      }
    }
  });
  return { headers: allHeaders, rows: allRows };
}

export function readQuestionBankFile(data: ArrayBuffer): QuestionBank | null {
  const wb = XLSX.read(data, { type: 'array', cellText: true, cellDates: true, raw: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const json: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
  if (json.length > 0) {
    return {
      headers: json[0].map((h: any) => String(h || '').trim()),
      rows: json.slice(1).filter((r: any[]) => r.some(c => c !== undefined && c !== ''))
        .map(r => r.map((c: any) => String(c || '').trim()))
    };
  }
  return null;
}

// ============================
// Data Parsing
// ============================
export function parseData(
  violationHeaders: string[], violationRaw: string[][],
  examHeaders: string[], examRaw: string[][]
): { persons: Person[]; fleets: Record<string, Person[]>; vMap: Record<string, number>; eMap: Record<string, number> } {
  const vMap = autoMatch(violationHeaders, VIOLATION_FIELDS);
  const eMap = autoMatch(examHeaders, EXAM_FIELDS);

  // Validate and correct violation column mappings (ensure 责任人, not 考核人)
  console.log('=== 两违表列映射（校正前） ===');
  VIOLATION_FIELDS.forEach(f => {
    const idx = vMap[f.key];
    console.log(`  ${f.label} -> ${idx >= 0 ? '第' + (idx + 1) + '列 "' + violationHeaders[idx] + '"' : '未匹配'}`);
  });

  validateViolationMap(violationHeaders, vMap);

  console.log('=== 两违表列映射（校正后） ===');
  VIOLATION_FIELDS.forEach(f => {
    const idx = vMap[f.key];
    console.log(`  ${f.label} -> ${idx >= 0 ? '第' + (idx + 1) + '列 "' + violationHeaders[idx] + '"' : '未匹配'}`);
  });
  console.log('=== 实训表列映射 ===');
  EXAM_FIELDS.forEach(f => {
    const idx = eMap[f.key];
    console.log(`  ${f.label} -> ${idx >= 0 ? '第' + (idx + 1) + '列 "' + examHeaders[idx] + '"' : '未匹配'}`);
  });

  // Parse violations - only 责任人 (not 考核人)
  const violationsByName: Record<string, { fleet: string; salaryNumber: string; violations: Violation[] }> = {};
  console.log(`=== 解析两违数据，共 ${violationRaw.length} 行 ===`);
  console.log(`  责任人字段映射到第 ${vMap['name'] + 1} 列: "${violationHeaders[vMap['name']] || '未匹配'}"`);
  console.log(`  责任人部门映射到第 ${vMap['fleet'] + 1} 列: "${violationHeaders[vMap['fleet']] || '未匹配'}"`);
  console.log(`  工资号映射到第 ${vMap['salaryNumber'] + 1} 列: "${violationHeaders[vMap['salaryNumber']] || '未匹配'}"`);
  
  violationRaw.forEach((row, rowIdx) => {
    const name = getVal(row, vMap, 'name');
    if (!name) {
      if (rowIdx < 5) console.log(`  第${rowIdx + 1}行: 责任人为空, 原始数据: [${row.slice(0, 6).join(', ')}]`);
      return;
    }
    if (!violationsByName[name]) violationsByName[name] = { fleet: '', salaryNumber: '', violations: [] };
    const fleet = getVal(row, vMap, 'fleet');
    if (fleet) violationsByName[name].fleet = fleet;
    const salaryNumber = getVal(row, vMap, 'salaryNumber');
    if (salaryNumber) violationsByName[name].salaryNumber = salaryNumber;
    const violation: Violation = {
      date: getVal(row, vMap, 'date'),
      type: getVal(row, vMap, 'type'),
      description: getVal(row, vMap, 'description'),
      standard: getVal(row, vMap, 'standard'),
      level: getVal(row, vMap, 'level'),
      penalty: getVal(row, vMap, 'penalty')
    };
    violationsByName[name].violations.push(violation);
    console.log(`  ✓ ${name}(${fleet}): ${violation.description?.substring(0, 40) || '(无描述)'}`);
  });
  
  console.log(`=== 两违数据汇总 ===`);
  Object.entries(violationsByName).forEach(([name, data]) => {
    console.log(`  ${name}(${data.fleet}): ${data.violations.length}次两违, 工资号:${data.salaryNumber || '无'}`);
  });

  // Parse exam scores
  const examsByName: Record<string, { fleet: string; exams: ExamRecord[] }> = {};
  examRaw.forEach(row => {
    const name = getVal(row, eMap, 'name');
    if (!name) return;
    if (!examsByName[name]) examsByName[name] = { fleet: '', exams: [] };
    const fleet = getVal(row, eMap, 'fleet');
    if (fleet) examsByName[name].fleet = fleet;

    const deviceRaw = getVal(row, eMap, 'device');
    let taskName = getVal(row, eMap, 'task');
    if (!taskName) taskName = deviceRaw;
    const combined = (deviceRaw + ' ' + taskName);
    let deviceType = deviceRaw || '其他';
    if (combined.includes('实训风险演练') || combined.includes('模架') || combined.includes('风险演练装置')) {
      deviceType = '模架';
    } else if (combined.includes('自助培训演练') || combined.includes('自助机') || combined.includes('自助培训') || combined.includes('自助')) {
      deviceType = '自助机';
    }

    const scoreStr = getVal(row, eMap, 'score');
    const score = parseFloat(scoreStr) || 0;

    examsByName[name].exams.push({
      device: deviceType, deviceRaw, taskName,
      score, scoreStr, result: getVal(row, eMap, 'result'),
      date: getVal(row, eMap, 'date')
    });
  });

  // Keep only highest score per task per person
  Object.values(examsByName).forEach(personData => {
    const taskBest: Record<string, ExamRecord> = {};
    personData.exams.forEach(exam => {
      const key = exam.taskName || exam.deviceRaw || exam.device;
      if (!taskBest[key] || exam.score > taskBest[key].score) {
        taskBest[key] = exam;
      }
    });
    personData.exams = Object.values(taskBest);
  });

  // Merge persons
  const allNames = new Set([...Object.keys(violationsByName), ...Object.keys(examsByName)]);
  const persons: Person[] = [];
  const fleets: Record<string, Person[]> = {};

  allNames.forEach(name => {
    const vData = violationsByName[name] || { fleet: '', salaryNumber: '', violations: [] };
    const eData = examsByName[name] || { fleet: '', exams: [] };
    // For department: prefer violation data's fleet (责任人部门), fallback to exam data
    const fleet = vData.fleet || eData.fleet || '未分类';
    const salaryNumber = vData.salaryNumber || '';
    const person: Person = { name, fleet, salaryNumber, violations: vData.violations, exams: eData.exams };
    persons.push(person);
    if (!fleets[fleet]) fleets[fleet] = [];
    fleets[fleet].push(person);
  });

  return { persons, fleets, vMap, eMap };
}
